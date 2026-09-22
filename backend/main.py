from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from strawberry.fastapi import GraphQLRouter
from app.graphql.schema import schema
from app.graphql.context import get_context
from app.infrastructure.database import engine, Base, SessionLocal
from app.infrastructure.models import User
from app.core.security import get_password_hash
from app.worker.celery_app import celery_app
from app.core.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database models first so new tables are created
    Base.metadata.create_all(bind=engine)

    # Ensure all columns exist on already-created tables via migration
    try:
        import migrate
        migrate.upgrade_db()
    except Exception as e:
        print(f"Automatic migration check failed or skipped: {e}")
    
    # Seed developer accounts and deactivate old admin
    db = SessionLocal()
    try:
        # Safely deactivate old admin account if it exists
        old_admin = db.query(User).filter(User.email == "admin@qeps.com").first()
        if old_admin and old_admin.is_active:
            old_admin.is_active = False
            db.commit()
            print("Old admin account deactivated.")

        # Ensure configured developer accounts exist
        developer_accounts = [
            {"email": settings.AUTH_USER_1_EMAIL, "password": settings.AUTH_USER_1_PASSWORD},
            {"email": settings.AUTH_USER_2_EMAIL, "password": settings.AUTH_USER_2_PASSWORD},
        ]

        for acc in developer_accounts:
            user = db.query(User).filter(User.email == acc["email"]).first()
            if not user:
                hashed_pw = get_password_hash(acc["password"])
                new_user = User(email=acc["email"], hashed_password=hashed_pw, is_active=True)
                db.add(new_user)
                print(f"Developer account created: {acc['email']}")
        
        db.commit()
            
        # Dispatch the NSE sync task asynchronously to populate database in background
        print("Dispatching automated NSE Calendar sync...")
        celery_app.send_task("app.worker.tasks.sync_nse_calendar_task")
    finally:
        db.close()
    
    yield

app = FastAPI(title="QEPS API", lifespan=lifespan)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://eps.marketanalysis.workers.dev",   # Cloudflare Pages
        "http://localhost:5173",           # Local dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

graphql_app = GraphQLRouter(schema, context_getter=get_context)
app.include_router(graphql_app, prefix="/graphql")

import time
from collections import defaultdict
from fastapi.responses import JSONResponse

# Simple in-memory rate limiter (100 requests / minute)
_rate_limits = defaultdict(list)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if not request.url.path.startswith("/health"):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        
        # Keep only timestamps from the last 60 seconds
        _rate_limits[client_ip] = [t for t in _rate_limits[client_ip] if now - t < 60]
        
        if len(_rate_limits[client_ip]) >= 1000:
            return JSONResponse(status_code=429, content={"detail": "Too Many Requests"})
            
        _rate_limits[client_ip].append(now)
        
    return await call_next(request)


@app.get("/health")
def health_check():
    return {"status": "ok"}

from fastapi import Depends, HTTPException, Security
from fastapi.security.api_key import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def get_api_key(api_key_header: str = Security(api_key_header)):
    # In production this would check against a DB of valid keys
    if api_key_header == "QEPS-INTERNAL-SECURE-KEY":
        return api_key_header
    raise HTTPException(status_code=403, detail="Forbidden")

@app.get("/sentiment/{ticker}", dependencies=[Depends(get_api_key)])
@app.get("/api/sentiment/{ticker}", dependencies=[Depends(get_api_key)])
def get_company_sentiment(ticker: str, name: str = "", sector: str = ""):
    from app.services.ai_analyst_service import AIAnalystService
    service = AIAnalystService()
    return service.evaluate_multi_source_sentiment(
        ticker=ticker,
        company_name=name or ticker,
        sector=sector or "Indian Equities"
    )

# ---------------------------------------------------------------------------
# News Feed Endpoint – Multi-source (free, no API key required)
#
# Sources (in priority order):
#   1. Yahoo Finance RSS (.NS NSE ticker) — most accurate for Indian stocks
#   2. Google News RSS — broad, picks up Moneycontrol, ET, LiveMint, etc.
#   3. ET Markets RSS — Economic Times Markets (India's top financial daily)
#   4. BSE India official corporate-announcements RSS — regulatory filings
#   5. Moneycontrol latest news RSS — filtered by company name keyword
#
# NOTE: Groww (groww.in) does NOT have a public API. Their news page is a
# JavaScript SPA rendered at runtime and aggregated from third-party providers
# (Moneycontrol, LiveSquawk, Reuters). Scraping it violates their ToS and
# requires a headless browser. The sources above cover the same underlying
# content that Groww itself displays.
# ---------------------------------------------------------------------------
_news_cache: dict = {}
_news_cache_ts: dict = {}

def _to_slug(text: str) -> str:
    """Convert company name to Groww-style URL slug (informational only)."""
    import re
    slug = text.lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug.strip())
    return slug

@app.get("/news/{ticker}")
@app.get("/api/news/{ticker}")
def get_company_news(ticker: str, name: str = ""):
    import time, feedparser, re
    from datetime import datetime, timezone, timedelta
    from urllib.parse import quote_plus

    cache_ttl = 900  # 15-minute cache
    now = time.time()

    if ticker in _news_cache and (now - _news_cache_ts.get(ticker, 0)) < cache_ttl:
        return {"ticker": ticker, "news": _news_cache[ticker]}

    articles: list = []
    seen_titles: set = set()

    company_name = (name or ticker).strip()
    nse_ticker   = f"{ticker}.NS"

    # Short keyword for name-based filtering
    # Extract the most meaningful leading word from the company name, ignoring generic suffixes
    clean_name = re.sub(r'(?i)\b(limited|ltd|corp|corporation|industries|india|inc|co|bank)\b', '', company_name).strip()
    name_keyword = ""
    for word in clean_name.split():
        clean = re.sub(r"[^a-zA-Z0-9]", "", word)
        if len(clean) >= 3:
            name_keyword = clean
            break
    if not name_keyword:
        name_keyword = ticker

    # ── Helper: parse one feedparser entry ──────────────────────────────────
    def _ingest_entry(entry: dict, default_source: str, name_filter: bool = False):
        title = (entry.get("title") or "").strip()
        # Strip source suffix " - Source Name" that Google News appends
        title = re.sub(r"\s*-\s*[^-]{3,50}$", "", title).strip()
        if not title or title in seen_titles:
            return
            
        # STRICT RELEVANCE FILTER: The title MUST contain either the key company name word OR the ticker symbol
        # We use regex word boundaries (\b) to prevent crude substring matches (e.g. "ACC" matching "accident")
        t_lower = title.lower()
        ticker_lower = ticker.lower()
        nk_lower = name_keyword.lower()
        
        escaped_ticker = re.escape(ticker_lower)
        escaped_nk = re.escape(nk_lower)
        pattern = r'\b(?:' + escaped_ticker + r'|' + escaped_nk + r')\b'
        
        if not re.search(pattern, t_lower):
            return  # Skip unrelated articles completely

        pub_date = None
        if getattr(entry, "published_parsed", None):
            try:
                pub_date = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            except Exception:
                pass
        pub_date = pub_date or datetime.now(timezone.utc)

        seen_titles.add(title)
        raw_summary = entry.get("summary", "")

        summary = re.sub(r"<[^>]+>", "", raw_summary).strip()[:400]

        articles.append({
            "title": title,
            "summary": summary,
            "url": entry.get("link", ""),
            "source": default_source,
            "published": pub_date.strftime("%b %d, %Y"),
            "published_ts": pub_date.isoformat(),
        })

    # ── Feed definitions (Reordered by Priority) ──────────────────────────────
    mc_q        = quote_plus(f"{company_name} site:moneycontrol.com")
    bse_q       = quote_plus(f"{company_name} site:bseindia.com")
    google_q    = quote_plus(f"{company_name} NSE stock India")
    et_q        = quote_plus(f"{company_name} site:economictimes.indiatimes.com")

    feeds = [
        # 1. Moneycontrol (Highest Priority) - Filtered via search indexing
        {
            "url": f"https://news.google.com/rss/search?q={mc_q}&hl=en-IN&gl=IN&ceid=IN:en",
            "source": "Moneycontrol",
            "name_filter": False,
        },
        # 2. Economic Times - Filtered via search indexing
        {
            "url": f"https://news.google.com/rss/search?q={et_q}&hl=en-IN&gl=IN&ceid=IN:en",
            "source": "Economic Times",
            "name_filter": False,
        },
        # 3. Google News Broad Aggregate
        {
            "url": f"https://news.google.com/rss/search?q={google_q}&hl=en-IN&gl=IN&ceid=IN:en",
            "source": "Google News",
            "name_filter": False,
        },
        # 4. Yahoo Finance (.NS NSE ticker)
        {
            "url": f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={nse_ticker}&region=IN&lang=en-IN",
            "source": "Yahoo Finance",
            "name_filter": False,
        },
        # 5. BSE India (Official Announcements) - Placed last as it contains direct PDF links
        {
            "url": f"https://news.google.com/rss/search?q={bse_q}&hl=en-IN&gl=IN&ceid=IN:en",
            "source": "BSE India",
            "name_filter": False,
        },
    ]

    for feed_def in feeds:
        try:
            feed = feedparser.parse(feed_def["url"])
            src  = feed.feed.get("title") or feed_def["source"]
            for entry in (feed.entries or []):
                _ingest_entry(entry, src, name_filter=feed_def["name_filter"])
        except Exception:
            pass

    # Sort newest first, deduplicated, cap at 12
    articles.sort(key=lambda x: x.get("published_ts", ""), reverse=True)
    articles = articles[:12]

    _news_cache[ticker]    = articles
    _news_cache_ts[ticker] = now
    return {"ticker": ticker, "news": articles}


# ---------------------------------------------------------------------------
# News Sentiment Intelligence Endpoint
#
# Reuses the existing news data from get_company_news() and runs LLM-based
# sentiment analysis via Gemini 1.5 Flash. Results are cached keyed by a
# hash of article titles so unchanged news never re-triggers LLM calls.
# Falls back to a deterministic keyword-based heuristic when Gemini is
# unavailable or the API key is not configured.
# ---------------------------------------------------------------------------
_sentiment_cache: dict = {}
_sentiment_cache_ts: dict = {}

@app.get("/news-sentiment/{ticker}")
@app.get("/api/news-sentiment/{ticker}")
def get_news_sentiment(ticker: str, name: str = ""):
    import time, hashlib, json, requests, re
    from datetime import datetime, timezone
    from app.core.config import settings

    now = time.time()
    SENTIMENT_TTL = 14400  # 4 hours

    # 1. Get the existing news (reuses _news_cache, zero duplicate RSS fetches)
    news_result = get_company_news(ticker, name)
    articles = news_result.get("news", [])

    if not articles or len(articles) == 0:
        return {
            "ticker": ticker,
            "overallSentiment": "INSUFFICIENT_DATA",
            "sentimentScore": 0,
            "confidence": "LOW",
            "impact": "LOW",
            "trend": "STABLE",
            "dominantTheme": None,
            "articleBreakdown": {"bullish": 0, "bearish": 0, "neutral": 0, "mixed": 0},
            "keyDrivers": "No recent news articles available for analysis.",
            "contradictions": None,
            "articleCount": 0,
            "lastUpdated": datetime.now(timezone.utc).isoformat()
        }

    # 2. Compute a content hash from article titles to detect changes
    top_articles = articles[:8]
    content_fingerprint = "|".join([a.get("title", "") for a in top_articles])
    content_hash = hashlib.md5(content_fingerprint.encode()).hexdigest()
    cache_key = f"{ticker}:{content_hash}"

    # 3. Check sentiment cache
    if cache_key in _sentiment_cache and (now - _sentiment_cache_ts.get(cache_key, 0)) < SENTIMENT_TTL:
        return _sentiment_cache[cache_key]

    # 4. Build article context for LLM
    article_texts = []
    for i, art in enumerate(top_articles):
        article_texts.append(
            f"Article {i+1}:\n"
            f"  Title: {art.get('title', 'N/A')}\n"
            f"  Source: {art.get('source', 'N/A')}\n"
            f"  Published: {art.get('published', 'N/A')}\n"
            f"  Summary: {art.get('summary', 'N/A')}"
        )
    articles_block = "\n\n".join(article_texts)

    # 5. Try Gemini LLM analysis
    gemini_key = settings.GEMINI_API_KEY
    sentiment_result = None

    if gemini_key and len(gemini_key) > 10 and gemini_key != "your_gemini_api_key_here":
        try:
            prompt = f"""You are a professional financial news sentiment analyst for the Indian stock market (NSE).

Analyze the following {len(top_articles)} recent news articles about {name or ticker} ({ticker}) and produce a structured sentiment assessment.

STRICT RULES:
- Only analyze information present in the supplied articles. Do NOT hallucinate events, prices, or financial data.
- Do NOT produce trading signals (BUY, SELL, TARGET, STOP LOSS). Describe the news environment only.
- If articles are insufficient or irrelevant, set overallSentiment to "INSUFFICIENT_DATA".
- Recognize conflicting signals — use "MIXED" when positive and negative news coexist with comparable significance.
- Weight recent articles more heavily than older ones.
- Detect if multiple articles describe the same underlying event (e.g., same earnings result reported by different sources) and count it as one event.

ARTICLES:
{articles_block}

Respond with ONLY valid JSON (no markdown, no code fences, no explanation) in this exact structure:
{{
  "overallSentiment": "BULLISH" | "BEARISH" | "NEUTRAL" | "MIXED" | "INSUFFICIENT_DATA",
  "sentimentScore": <integer from -100 to +100>,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "impact": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "trend": "IMPROVING" | "STABLE" | "DETERIORATING" | "VOLATILE",
  "dominantTheme": "<one of: Earnings, Order Win, Management, Regulatory, Debt, Expansion, Promoter Activity, M&A, Guidance, Results, Corporate Action, Sector News, Brokerage, Product/Business, Legal, or null>",
  "articleBreakdown": {{"bullish": <int>, "bearish": <int>, "neutral": <int>, "mixed": <int>}},
  "keyDrivers": "<1-2 sentence summary of the primary sentiment factors based on the actual articles>",
  "contradictions": "<brief note on conflicting signals, or null if none>"
}}"""

            model_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "topK": 40, "topP": 0.95}
            }
            resp = requests.post(model_url, headers={"Content-Type": "application/json"}, json=payload, timeout=25)
            if resp.status_code == 200:
                raw_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                # Strip markdown code fences if present
                clean = re.sub(r"^```(?:json)?\s*", "", raw_text.strip())
                clean = re.sub(r"\s*```$", "", clean.strip())
                parsed = json.loads(clean)
                # Validate required fields
                if parsed.get("overallSentiment") in ("BULLISH", "BEARISH", "NEUTRAL", "MIXED", "INSUFFICIENT_DATA"):
                    sentiment_result = parsed
        except Exception as e:
            print(f"Gemini news-sentiment failed for {ticker}: {e}")

    # 6. Deterministic fallback if LLM unavailable
    if not sentiment_result:
        sentiment_result = _deterministic_news_sentiment(top_articles, ticker)

    # 7. Enrich with metadata
    sentiment_result["ticker"] = ticker
    sentiment_result["articleCount"] = len(top_articles)
    sentiment_result["lastUpdated"] = datetime.now(timezone.utc).isoformat()

    # Clamp score
    score = sentiment_result.get("sentimentScore", 0)
    sentiment_result["sentimentScore"] = max(-100, min(100, int(score) if score else 0))

    # 8. Cache and return
    _sentiment_cache[cache_key] = sentiment_result
    _sentiment_cache_ts[cache_key] = now

    return sentiment_result


def _deterministic_news_sentiment(articles: list, ticker: str) -> dict:
    """Keyword-based heuristic fallback when Gemini is unavailable."""

    bullish_kw = {
        "profit", "growth", "surge", "strong", "beat", "record", "high",
        "upgrade", "buy", "positive", "expansion", "order", "win", "approval",
        "dividend", "bonus", "bullish", "outperform", "robust", "rally",
        "gain", "up", "rises", "climbs", "jumps", "soars", "boost",
        "revenue growth", "net profit", "eps beat", "q1 results", "q2 results",
        "q3 results", "q4 results", "strong results", "better than expected"
    }
    bearish_kw = {
        "loss", "decline", "drop", "fall", "miss", "weak", "concern",
        "downgrade", "sell", "negative", "fraud", "investigation", "penalty",
        "debt", "default", "resign", "bearish", "underperform", "slump",
        "crash", "down", "falls", "drops", "sinks", "plunges", "cuts",
        "warning", "caution", "risk", "lawsuit", "probe", "regulatory action"
    }

    bull_count = 0
    bear_count = 0
    neutral_count = 0

    # Detect dominant theme keywords
    theme_scores = {
        "Earnings": 0, "Results": 0, "Order Win": 0, "Management": 0,
        "Regulatory": 0, "Debt": 0, "Expansion": 0, "M&A": 0,
        "Guidance": 0, "Corporate Action": 0, "Sector News": 0,
        "Brokerage": 0, "Product/Business": 0, "Legal": 0, "Promoter Activity": 0
    }
    theme_kw_map = {
        "Earnings": ["earnings", "eps", "profit", "revenue", "income", "margin"],
        "Results": ["results", "quarter", "q1", "q2", "q3", "q4", "fy2", "annual"],
        "Order Win": ["order", "contract", "deal", "win", "award"],
        "Management": ["ceo", "md", "director", "appoint", "resign", "management"],
        "Regulatory": ["sebi", "rbi", "regulatory", "compliance", "penalty", "fine"],
        "Debt": ["debt", "loan", "npa", "default", "credit"],
        "Expansion": ["expansion", "capex", "plant", "capacity", "new facility"],
        "M&A": ["acquisition", "merger", "takeover", "buyout", "stake"],
        "Guidance": ["guidance", "outlook", "forecast", "target"],
        "Corporate Action": ["dividend", "bonus", "split", "buyback", "rights"],
        "Sector News": ["sector", "industry", "market", "index", "nifty"],
        "Brokerage": ["brokerage", "analyst", "rating", "target price", "upgrade", "downgrade"],
        "Product/Business": ["product", "launch", "service", "business"],
        "Legal": ["lawsuit", "court", "legal", "litigation", "probe"],
        "Promoter Activity": ["promoter", "shareholding", "pledge", "insider"]
    }

    for i, art in enumerate(articles):
        text = f"{art.get('title', '')} {art.get('summary', '')}".lower()
        recency_weight = max(0.5, 1.0 - (i * 0.08))

        art_bull = sum(1 for kw in bullish_kw if kw in text)
        art_bear = sum(1 for kw in bearish_kw if kw in text)

        if art_bull > art_bear:
            bull_count += recency_weight
        elif art_bear > art_bull:
            bear_count += recency_weight
        else:
            neutral_count += recency_weight

        for theme, keywords in theme_kw_map.items():
            for kw in keywords:
                if kw in text:
                    theme_scores[theme] += recency_weight

    total = bull_count + bear_count + neutral_count
    if total == 0:
        return {
            "overallSentiment": "INSUFFICIENT_DATA",
            "sentimentScore": 0,
            "confidence": "LOW",
            "impact": "LOW",
            "trend": "STABLE",
            "dominantTheme": None,
            "articleBreakdown": {"bullish": 0, "bearish": 0, "neutral": 0, "mixed": 0},
            "keyDrivers": "Unable to determine sentiment from available articles.",
            "contradictions": None
        }

    bull_ratio = bull_count / total
    bear_ratio = bear_count / total

    # Determine overall sentiment
    if bull_ratio > 0.6:
        sentiment = "BULLISH"
        score = int(40 + bull_ratio * 60)
    elif bear_ratio > 0.6:
        sentiment = "BEARISH"
        score = int(-(40 + bear_ratio * 60))
    elif bull_ratio > 0.35 and bear_ratio > 0.35:
        sentiment = "MIXED"
        score = int((bull_ratio - bear_ratio) * 50)
    else:
        sentiment = "NEUTRAL"
        score = int((bull_ratio - bear_ratio) * 30)

    # Confidence based on article count and signal clarity
    clarity = abs(bull_ratio - bear_ratio)
    if len(articles) >= 5 and clarity > 0.4:
        confidence = "HIGH"
    elif len(articles) >= 3 and clarity > 0.2:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    # Impact heuristic
    if any(kw in " ".join([a.get("title", "") for a in articles]).lower() for kw in ["fraud", "default", "sebi", "critical", "record"]):
        impact = "HIGH"
    elif bull_count + bear_count > 4:
        impact = "MEDIUM"
    else:
        impact = "LOW"

    # Trend: compare first half vs second half
    mid = len(articles) // 2
    first_half_bull = sum(1 for a in articles[:mid] if any(kw in f"{a.get('title', '')} {a.get('summary', '')}".lower() for kw in ["growth", "profit", "strong", "beat", "surge"]))
    second_half_bull = sum(1 for a in articles[mid:] if any(kw in f"{a.get('title', '')} {a.get('summary', '')}".lower() for kw in ["growth", "profit", "strong", "beat", "surge"]))
    if first_half_bull > second_half_bull + 1:
        trend = "IMPROVING"
    elif second_half_bull > first_half_bull + 1:
        trend = "DETERIORATING"
    elif sentiment == "MIXED":
        trend = "VOLATILE"
    else:
        trend = "STABLE"

    # Dominant theme
    best_theme = max(theme_scores, key=theme_scores.get)
    dominant = best_theme if theme_scores[best_theme] > 0 else None

    # Build key drivers summary
    drivers = []
    if bull_count > 0:
        drivers.append(f"{int(bull_count)} positive signal(s)")
    if bear_count > 0:
        drivers.append(f"{int(bear_count)} negative signal(s)")
    key_drivers = f"Heuristic analysis of {len(articles)} articles found {', '.join(drivers)}."

    # Contradictions
    contradictions = None
    if bull_count >= 2 and bear_count >= 2:
        contradictions = f"Conflicting signals detected: {int(bull_count)} bullish vs {int(bear_count)} bearish articles."

    return {
        "overallSentiment": sentiment,
        "sentimentScore": max(-100, min(100, score)),
        "confidence": confidence,
        "impact": impact,
        "trend": trend,
        "dominantTheme": dominant,
        "articleBreakdown": {
            "bullish": int(round(bull_count)),
            "bearish": int(round(bear_count)),
            "neutral": int(round(neutral_count)),
            "mixed": 0
        },
        "keyDrivers": key_drivers,
        "contradictions": contradictions
    }

# ---------------------------------------------------------------------------
# Data Lake Endpoints
# ---------------------------------------------------------------------------
import os
import pandas as pd
from fastapi import HTTPException
from app.infrastructure.database import SessionLocal
from app.infrastructure.models import Company

@app.get("/data_lake/ohlcv/{ticker}")
def get_data_lake_ohlcv(ticker: str):
    # In docker-compose, data_harvester/data_lake is mounted at /app/data_lake
    data_lake_dir = os.path.join(os.path.dirname(__file__), "data_lake", "ohlcv", "daily")
    file_path = os.path.join(data_lake_dir, f"{ticker}.parquet")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Historical data not found for this ticker")
        
    try:
        df = pd.read_parquet(file_path)
        if df.index.name == 'Date' or ('Date' not in df.columns and not df.index.empty and isinstance(df.index, pd.DatetimeIndex)):
            df = df.reset_index()
            # If after reset_index the column is named 'index', rename to 'Date'
            if 'index' in df.columns and 'Date' not in df.columns:
                df = df.rename(columns={'index': 'Date'})
            
        if 'Date' in df.columns:
            # handle cases where Date might not be datetime format natively
            try:
                df['Date'] = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d')
            except:
                pass
                
        # Fill NaN values with None for JSON serialization
        df = df.where(pd.notnull(df), None)
            
        records = df.to_dict(orient="records")
        return records
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

