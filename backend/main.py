from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from strawberry.fastapi import GraphQLRouter
from app.graphql.schema import schema
from app.graphql.context import get_context
from app.infrastructure.database import engine, Base, SessionLocal
from app.infrastructure.models import User
from app.core.security import get_password_hash
from app.worker.celery_app import celery_app

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
    
    # Seed default admin user and Trigger Automated NSE Sync
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@qeps.com").first()
        if not admin:
            hashed_pw = get_password_hash("adminpassword")
            admin = User(email="admin@qeps.com", hashed_password=hashed_pw)
            db.add(admin)
            db.commit()
            print("Default admin user created.")
            
        # Dispatch the NSE sync task asynchronously to populate database in background
        print("Dispatching automated NSE Calendar sync...")
        celery_app.send_task("app.worker.tasks.sync_nse_calendar_task")
    finally:
        db.close()
    
    yield

app = FastAPI(title="QEPS API", lifespan=lifespan)

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
        
        if len(_rate_limits[client_ip]) >= 100:
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

    # Short keyword for name-based filtering (first meaningful word ≥ 4 chars)
    name_keyword = ""
    for word in company_name.split():
        clean = re.sub(r"[^a-zA-Z]", "", word)
        if len(clean) >= 4 and clean.lower() not in {"limited", "india", "industries", "corp"}:
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
        t_lower = title.lower()
        if name_keyword.lower() not in t_lower and ticker.lower() not in t_lower:
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

