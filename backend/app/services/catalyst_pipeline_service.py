import re
import uuid
import time
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.infrastructure.models import Company, CatalystEvent, CatalystSource, CatalystPipelineRun
from app.services.nse_data_service import NseDataService
from app.services.ai_analyst_service import AIAnalystService
from app.services.quant_service import QuantService

from app.services.sources.bse_announcements import BseAnnouncementsService

logger = logging.getLogger(__name__)

class CatalystPipelineService:
    def __init__(self, db: Session):
        self.db = db
        self.nse_service = NseDataService(db)
        self.bse_service = BseAnnouncementsService()
        self.ai_service = AIAnalystService()
        self.quant_service = QuantService()
        
        # P1.1: Massively expanded keyword whitelist
        # Covers all material event categories identified in the deep audit
        self.keyword_filters = re.compile(
            r"("
            # Orders & Contracts
            r"order|contract|award"
            # M&A & Corporate Restructuring
            r"|acquisition|acquire|merger|amalgamation|demerger|divestiture|disinvestment|takeover"
            # Management & Governance
            r"|resign|appoint|ceo|cfo|managing director|key managerial|whole.?time director"
            # Regulatory & FDA
            r"|fda|usfda|approval|clearance|regulatory"
            # Defaults & Fraud
            r"|default|fraud|scam|warning|suspension|delisting"
            # Guidance & Ratings
            r"|guidance|downgrade|upgrade|credit.?rating|crisil|icra|care.?rating|india.?rating"
            # Ownership & Stake
            r"|stake|buyback|buy.?back|dividend|bonus|split|qip|allotment|open.?offer"
            # Fundraising & Capital
            r"|fundrais|fund.?raising|rights.?issue|preferential|warrant|ncd|debenture"
            # Capex & Operations
            r"|capex|capacity|commissioning|launch|expansion|plant|production"
            # Partnerships & JVs
            r"|joint.?venture|partnership|collaboration|mou|memorandum"
            # Legal & Regulatory
            r"|litigation|sebi|rbi|nclt|insolvency|bankruptcy|winding.?up|resolution.?plan"
            # Financial Results & Profit Warnings
            r"|financial.?result|quarterly.?result|profit|loss.?after|write.?off|impairment|provisions?"
            # Pledging & Promoter
            r"|pledge|encumbrance|promoter.?holding|promoter.?sell|promoter.?buy"
            # Restructuring
            r"|restructur|scheme.?of.?arrangement|slump.?sale"
            r")",
            re.IGNORECASE
        )
        
        # Expanded noise filter
        self.ignore_filters = re.compile(
            r"("
            r"loss of share certificate|closure of trading|newspaper publication"
            r"|schedule of analyst|investor presentation|secretarial compliance"
            r"|transcript|audio recording|book closure|record date"
            r"|trading window|code of conduct|annual report|agm notice"
            r"|compliance certificate|listing fees|corporate governance"
            r"|stock exchange intimation regarding"
            r")",
            re.IGNORECASE
        )

    def run_pipeline(self) -> dict:
        start_time = time.time()
        logger.info("Starting Catalyst Pipeline run (Primary: BSE, Fallback: NSE)...")
        
        # Metrics
        metrics = {
            "status": "success",
            "source": "BSE Corporate Announcements API",
            "source_status": "UNKNOWN",
            "http_status_code": None,
            "raw_fetched": 0,
            "missing_fields": 0,
            "duplicates": 0,
            "ignore_filtered": 0,
            "keyword_failed": 0,
            "symbol_unresolved": 0,
            "auto_created": 0,
            "ai_rejected": 0,
            "saved": 0,
            "execution_time_ms": 0,
            "error_message": None,
            "rejected": {
                "invalid_format": 0,
                "duplicate": 0,
                "noise": 0,
                "missing_keywords": 0,
                "unknown_symbol": 0,
                "non_material": 0
            }
        }
        
        # Phase 1: NSE first (standard filing categories + direct PDF links); BSE as the fallback.
        metrics["source"] = "NSE Corporate Announcements API"
        nse_result = self.nse_service.fetch_latest_corporate_announcements()
        metrics["source_status"] = nse_result.get("source_status", "UNKNOWN")
        metrics["http_status_code"] = nse_result.get("http_status_code")
        metrics["error_message"] = nse_result.get("error_message")
        announcements = nse_result.get("announcements", []) or []
        if not announcements:
            logger.warning(f"NSE returned no announcements ({metrics['source_status']}). Falling back to BSE.")
            bse_result = self.bse_service.fetch_latest_announcements()
            if bse_result["status"] == "success" and bse_result["data"]:
                announcements = bse_result["data"]
                metrics.update(source="BSE Corporate Announcements API", source_status="SUCCESS", http_status_code=200)

        if not announcements:
            metrics["status"] = "success" if metrics["source_status"] in ("SUCCESS", "EMPTY") else "source_error"
            metrics["message"] = f"No announcements fetched. Source status: {metrics['source_status']}"
            metrics["execution_time_ms"] = int((time.time() - start_time) * 1000)
            self._persist_pipeline_run(metrics)
            return metrics
            
        metrics["raw_fetched"] = len(announcements)
        
        # Pass 1: classify on the exchange's own filing category (+ text), resolve the company
        from app.services.catalyst_classifier import classify, refine_with_pdf, pdf_text, size_bucket, LABELS
        from app.services.catalyst_intel_service import (cached_evidence, evidence_for, grade, market_context,
                                                          trade_plan, build_embed)
        from app.services.catalyst_evidence_service import annual_revenue_cr, market_cap_cr
        evidence = cached_evidence(self.db)
        metrics["instant_alerts"] = 0
        metrics["digest_items"] = 0

        for item in announcements:
            symbol = item.get("symbol")
            category = item.get("desc") or item.get("category") or item.get("subject", "")
            text = item.get("attchmntText") or item.get("details", "") or ""
            broadcast_date = item.get("an_dt") or item.get("anndate", "")
            attachment_url = item.get("attchmntFile") or item.get("attachment_url") or ""
            if attachment_url and not attachment_url.startswith("http"):
                attachment_url = f"https://nsearchives.nseindia.com/corporate/{attachment_url}"

            if not symbol or not category:
                metrics["missing_fields"] += 1
                metrics["rejected"]["invalid_format"] += 1
                continue

            is_bse = item.get("source") == "BSE"
            company = (self.db.query(Company).filter(Company.bse_scrip_code == symbol).first() if is_bse
                       else self.db.query(Company).filter(Company.ticker == symbol).first())
            resolved_ticker = company.ticker if company else (f"{symbol}.BO" if is_bse else symbol)

            dt = None
            for fmt in ("%d-%b-%Y %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
                try:
                    dt = datetime.strptime(str(broadcast_date).split(".")[0], fmt)
                    break
                except Exception:
                    continue
            dt = dt or datetime.utcnow()

            if self._is_duplicate(resolved_ticker, category, text, dt):
                metrics["duplicates"] += 1
                metrics["rejected"]["duplicate"] += 1
                continue

            cls = classify(category, text)
            if cls is None:
                metrics["keyword_failed"] += 1
                metrics["rejected"]["noise"] += 1
                continue

            if not company:
                try:
                    company = Company(id=uuid.uuid4(), ticker=resolved_ticker, bse_scrip_code=symbol if is_bse else None,
                                      name=item.get("companyName") or item.get("sm_name") or resolved_ticker,
                                      sector="BSE_AUTO" if is_bse else "NSE_AUTO")
                    self.db.add(company)
                    self.db.commit()
                    self.db.refresh(company)
                    metrics["auto_created"] += 1
                except Exception:
                    self.db.rollback()
                    company = self.db.query(Company).filter(Company.ticker == resolved_ticker).first()
                    if not company:
                        metrics["symbol_unresolved"] += 1
                        metrics["rejected"]["unknown_symbol"] += 1
                        continue

            try:
                self._evaluate_and_save(item, company, category, text, dt, attachment_url, cls, evidence, metrics)
            except Exception as e:
                self.db.rollback()
                logger.error(f"Catalyst evaluation failed for {resolved_ticker}: {e}")

        metrics["execution_time_ms"] = int((time.time() - start_time) * 1000)
        
        # P0.3: Persist pipeline run log
        self._persist_pipeline_run(metrics)
        
        return metrics

    def run_bulk_deal_catalyst_pipeline(self) -> dict:
        """
        P1.2: Generates catalyst events from bulk/block deals that exceed a materiality threshold.
        This gives Catalyst Radar visibility into large institutional position changes
        which are often precursors or confirmations of corporate events.
        """
        from app.infrastructure.models import BulkBlockDeal
        
        start_time = time.time()
        metrics = {"source": "BULK_BLOCK_DEALS", "processed": 0, "saved": 0, "skipped": 0}
        
        # Look at deals from the last 3 days
        cutoff = datetime.utcnow() - timedelta(days=3)
        deals = self.db.query(BulkBlockDeal).filter(
            BulkBlockDeal.deal_date >= cutoff
        ).all()
        
        for deal in deals:
            metrics["processed"] += 1
            
            # Skip if deal value is trivially small (< ₹5 Cr notional)
            deal_value = (deal.quantity or 0) * (deal.trade_price or 0)
            if deal_value < 50_000_000:  # ₹5 Cr threshold
                metrics["skipped"] += 1
                continue
            
            # Check for duplicates
            existing = self.db.query(CatalystEvent).filter(
                CatalystEvent.ticker == deal.ticker,
                CatalystEvent.category == "BULK_BLOCK_DEAL",
                CatalystEvent.created_at >= deal.deal_date.replace(hour=0, minute=0, second=0)
            ).first()
            
            if existing:
                metrics["skipped"] += 1
                continue
            
            # Entity resolution with auto-create
            company = self.db.query(Company).filter(Company.ticker == deal.ticker).first()
            if not company:
                try:
                    company = Company(id=uuid.uuid4(), ticker=deal.ticker, name=deal.ticker, sector="NSE_AUTO")
                    self.db.add(company)
                    self.db.commit()
                    self.db.refresh(company)
                except IntegrityError:
                    self.db.rollback()
                    company = self.db.query(Company).filter(Company.ticker == deal.ticker).first()
                    if not company:
                        continue
            
            # Determine materiality based on deal value relative to market cap
            deal_value_cr = deal_value / 10_000_000  # Convert to Cr
            impact_score = 50  # Base for bulk/block deals
            tier = "C-TIER"
            
            if company.market_cap and company.market_cap > 0:
                pct_of_mcap = (deal_value / company.market_cap) * 100
                if pct_of_mcap > 5:
                    impact_score = 90
                    tier = "S-TIER"
                elif pct_of_mcap > 2:
                    impact_score = 80
                    tier = "A-TIER"
                elif pct_of_mcap > 0.5:
                    impact_score = 65
                    tier = "B-TIER"
            elif deal_value_cr > 100:
                impact_score = 75
                tier = "A-TIER"
            
            direction_emoji = "📈" if deal.direction == "BUY" else "📉"
            event_title = f"{deal.deal_type} Deal: {deal.client_name or 'Unknown'} {deal.direction} ₹{deal_value_cr:.0f} Cr {direction_emoji}"
            why = f"{deal.deal_type} deal by {deal.client_name or 'institutional entity'} — {deal.direction} {deal.quantity:,.0f} shares at ₹{deal.trade_price:,.2f} (₹{deal_value_cr:.1f} Cr notional)."
            
            event = CatalystEvent(
                id=uuid.uuid4(),
                ticker=deal.ticker,
                company_id=company.id,
                event_title=event_title,
                event_type="INSTITUTIONAL_FLOW",
                category="BULK_BLOCK_DEAL",
                impact_score=impact_score,
                early_score=75.0,  # Deals are same-day disclosure, relatively early
                confidence="HIGH",
                status="DEVELOPING",
                tier=tier,
                match_status="MATCHED",
                why_it_matters=why,
                market_cap_at_event=company.market_cap,
                sector_at_event=company.sector,
                published_at=deal.deal_date,
                detected_at=datetime.utcnow()
            )
            
            source = CatalystSource(
                id=uuid.uuid4(),
                event_id=event.id,
                source_name="NSE Bulk/Block Deals",
                is_primary=True,
                published_at=deal.deal_date
            )
            
            self.db.add(event)
            self.db.add(source)
            self.db.commit()
            metrics["saved"] += 1

            event.subtype = "BULK_BLOCK_DEAL"
            event.direction = "BULLISH" if deal.direction == "BUY" else "BEARISH"
            event.alert_grade = "INSTANT" if impact_score >= 90 else ("DIGEST" if impact_score >= 65 else "NONE")
            self.db.commit()
            # Only very large deals (>5% of market cap) ping instantly; others are summarised in the pre-market digest.
            if impact_score >= 90:
                try:
                    from app.services.notifier import DiscordNotifier
                    notifier = DiscordNotifier()
                    pct = (deal_value / company.market_cap * 100) if company.market_cap else None
                    embed = {
                        "title": f"{'BULLISH' if deal.direction == 'BUY' else 'BEARISH'} · {deal.deal_type.title()} deal · {deal.ticker}",
                        "description": (f"{deal.client_name or 'Institution'} {'bought' if deal.direction == 'BUY' else 'sold'} "
                                        f"{deal.quantity:,.0f} shares at ₹{deal.trade_price:,.2f} = **₹{deal_value_cr:,.0f} Cr**"
                                        + (f" ({pct:.1f}% of market cap)" if pct else "")),
                        "color": 0x20C997 if deal.direction == "BUY" else 0xF05A67,
                        "footer": {"text": f"{company.name or deal.ticker} · {deal.deal_date:%d %b %Y}"},
                    }
                    if notifier.send_embed(embed):
                        event.alerted_at = datetime.utcnow()
                        self.db.commit()
                except Exception as alert_ex:
                    logger.error(f"Failed to dispatch Discord bulk deal alert: {alert_ex}")
        
        metrics["execution_time_ms"] = int((time.time() - start_time) * 1000)
        return metrics

    def _evaluate_and_save(self, item, company, category, text, dt, url, cls, evidence, metrics):
        import json
        from app.services.catalyst_classifier import refine_with_pdf, pdf_text, size_bucket, LABELS
        from app.services.catalyst_intel_service import evidence_for, grade, market_context, trade_plan, build_embed
        from app.services.catalyst_evidence_service import annual_revenue_cr, market_cap_cr
        from app.services.data.data_manager import UnifiedDataManager
        from app.services.earnings_events_service import normalize_ohlcv

        money_event = cls["subtype"] in ("ORDER_WIN", "ACQUISITION", "CAPACITY_ADDITION", "BUYBACK", "FUNDRAISE")
        pdf_txt = ""
        if url and (cls.get("needs_pdf") or (money_event and not cls.get("amount_cr"))):
            try:
                from curl_cffi import requests as curl_requests
                r = curl_requests.get(url, impersonate="chrome110", timeout=30)
                if r.status_code == 200 and r.content[:4] == b"%PDF":
                    pdf_txt = pdf_text(r.content)
                    cls = refine_with_pdf(cls, pdf_txt)
            except Exception as e:
                logger.debug(f"PDF fetch failed for {company.ticker}: {e}")

        dm = UnifiedDataManager(self.db)
        prices = normalize_ohlcv(dm.get_ohlcv(company.ticker, days=730))  # "2y": a period the Yahoo fallback supports
        for attempt in range(2):  # fill only when missing, so order size can be judged against the company
            if company.market_cap:
                break
            try:
                mc = dm.get_company_info(company.ticker).get("market_cap")
                if mc and mc > 0:
                    company.market_cap = float(mc)
            except Exception:
                time.sleep(1)
        live = None
        try:
            from app.services.pre_release_edge_service import live_price
            live = live_price(self.db, company.ticker)
        except Exception:
            pass
        ctx = market_context(prices, dt, live) if not prices.empty else {}
        from app.services.ai_analyst_service import summarize_catalyst
        rev_cr, mcap_now = annual_revenue_cr(company), market_cap_cr(company)
        ai = None
        amount_is_estimate = False
        if money_event and not cls.get("amount_cr"):
            # Filing states capacity/units (e.g. "400 MW") instead of money: let the AI estimate the value.
            ai = summarize_catalyst(company.ticker, company.name or company.ticker, category, text, pdf_txt, rev_cr, mcap_now)
            if ai and ai.get("estimated_value_cr"):
                cls = {**cls, "amount_cr": ai["estimated_value_cr"]}
                amount_is_estimate = bool(ai.get("value_is_estimate"))
        size = size_bucket(cls.get("amount_cr"), rev_cr, mcap_now)
        ev, ev_key = evidence_for(evidence, cls["subtype"], size["size_bucket"])
        g = grade(cls["subtype"], ev, ctx.get("turnover_cr"), ctx.get("move_since_pct"))
        ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
        if g["grade"] == "INSTANT" and (ist_now - dt) > timedelta(hours=20):
            # Only fresh news pings; older filings (e.g. picked up on a first run) go to the digest.
            g = {**g, "grade": "DIGEST", "reasons": g["reasons"] + [f"older news (filed {dt:%d %b})"]}
        if g["grade"] == "NONE":
            metrics["ai_rejected"] += 1
            metrics["rejected"]["non_material"] += 1
            return
        if ai is None:  # only items that will be alerted/digested get an AI "why" line
            ai = summarize_catalyst(company.ticker, company.name or company.ticker, category, text, pdf_txt, rev_cr, mcap_now)

        plan = {}
        if ev and ctx.get("price") and len(prices) > 80:
            try:
                plan = trade_plan(prices, ctx["price"], ev[3]["mean"], g["direction"])
            except Exception as e:
                logger.warning(f"Catalyst trade plan failed for {company.ticker}: {e}")

        reaction_data = self.quant_service.get_recent_price_reaction(company.ticker, published_at=dt)
        if isinstance(reaction_data, dict):
            reaction_pct = float(reaction_data.get("reaction_pct", 0.0) or 0.0)
            rel_vol = float(reaction_data.get("relative_volume", 1.0) or 1.0)
        else:
            reaction_data, reaction_pct, rel_vol = {}, float(ctx.get("move_since_pct") or 0.0), float(ctx.get("rel_volume") or 1.0)

        strength = abs(ev[3]["t"]) if ev else 2.0
        impact_score = round(min(99.0, 50.0 + strength * 5.0), 1)
        early_score = float(self._compute_early_score(impact_score, reaction_pct, rel_vol, published_at=dt))
        e3 = ev[3] if ev else None
        evidence_line = (f"Past {LABELS.get(cls['subtype'], cls['subtype'])} filings moved {e3['mean']:+.1f}% vs Nifty in 3 days "
                         f"({round(e3['hit'] * 100)}% rose, {e3['n']} cases)." if e3 else "Serious red flag; too few past cases to measure.")
        why = f"{ai['why']} {evidence_line}" if ai and ai.get("why") else evidence_line
        details = {"evidence": ev, "evidence_key": ev_key, "context": ctx, "plan": plan, "size": size,
                   "amount_cr": cls.get("amount_cr"), "amount_is_estimate": amount_is_estimate,
                   "ai_why": (ai or {}).get("why"), "rating_action": cls.get("rating_action"), "reasons": g["reasons"],
                   "nse_category": category, "text": re.sub(r"[^a-z0-9 ]", "", (text or "").lower())[:600]}

        event = CatalystEvent(
            id=uuid.uuid4(), ticker=company.ticker, company_id=company.id, event_title=category[:250],
            event_type=cls["subtype"], category=cls["subtype"], impact_score=impact_score, early_score=early_score,
            confidence="HIGH" if g["grade"] == "INSTANT" else "MEDIUM",
            status="EXTENDED" if g.get("late") else ("EARLY" if early_score >= 70 else "DEVELOPING"),
            tier="A-TIER" if g["grade"] == "INSTANT" else "B-TIER", match_status="MATCHED", why_it_matters=why,
            reaction_pct=reaction_pct, relative_volume=rel_vol,
            gap_reaction_pct=reaction_data.get("gap_reaction_pct"), session_reaction_pct=reaction_data.get("session_reaction_pct"),
            reaction_1d=reaction_data.get("reaction_1d"), reaction_3d=reaction_data.get("reaction_3d"), reaction_5d=reaction_data.get("reaction_5d"),
            pre_event_price=ctx.get("pre_event_price") or reaction_data.get("pre_event_price"),
            market_cap_at_event=company.market_cap, sector_at_event=company.sector,
            published_at=dt, detected_at=datetime.utcnow(), verified_at=datetime.utcnow(),
            subtype=cls["subtype"], direction=g["direction"], alert_grade=g["grade"],
            details_json=json.dumps(details, default=str),
        )
        self.db.add(event)
        self.db.add(CatalystSource(id=uuid.uuid4(), event_id=event.id, source_name="NSE Corporate Announcements",
                                   url=url, is_primary=True, published_at=dt))
        self.db.commit()
        metrics["saved"] += 1

        if g["grade"] == "INSTANT":
            try:
                from app.services.notifier import DiscordNotifier
                embed = build_embed(company.ticker, company.name or company.ticker, cls["subtype"], text or category, url, g, ev,
                                    ctx, plan, size, cls.get("amount_cr"), market_cap_cr(company), dt,
                                    why=(ai or {}).get("why"), amount_is_estimate=amount_is_estimate)
                if DiscordNotifier().send_embed(embed):
                    event.alerted_at = datetime.utcnow()
                    self.db.commit()
                metrics["instant_alerts"] += 1
            except Exception as alert_ex:
                logger.error(f"Failed to dispatch Discord catalyst alert: {alert_ex}")
        else:
            metrics["digest_items"] += 1

    def _is_duplicate(self, ticker: str, category: str, text: str, event_date: datetime) -> bool:
        """
        Same filing seen again (same ticker, category and broadcast time), or a near-identical text
        within 3 days. Different filings of the same category (e.g. two separate order wins) are NOT duplicates.
        """
        import difflib
        recent = self.db.query(CatalystEvent).filter(
            CatalystEvent.ticker == ticker,
            CatalystEvent.created_at >= event_date - timedelta(days=3),
        ).all()
        norm = re.sub(r"[^a-z0-9 ]", "", (text or "").lower())
        for ev in recent:
            if ev.published_at and abs((ev.published_at - event_date).total_seconds()) < 120 and (ev.event_title or "")[:250] == category[:250]:
                return True
            try:
                import json as _json
                prev_text = (_json.loads(ev.details_json or "{}") or {}).get("text", "")
            except Exception:
                prev_text = ""
            if norm and prev_text and difflib.SequenceMatcher(None, norm, prev_text).ratio() > 0.95:
                return True
        return False

    def _compute_early_score(self, impact: float, reaction_pct: float, rel_vol: float, published_at: datetime = None) -> float:
        """
        Calculates how "early" a catalyst opportunity is.
        
        P1.4: Now includes TIME DECAY — catalysts older than 48 hours
        progressively lose "early" points regardless of reaction.
        
        High impact + low reaction + low vol + recent = Highly Early (95)
        High impact + high reaction + massive vol + old = Priced In (20)
        """
        # Base score is the impact score (0-100)
        base = impact
        
        # Penalize for large price moves (absolute value)
        # E.g. a 5% move subtracts 25 points, capped at 50
        price_penalty = min(abs(reaction_pct) * 5, 50)
        
        # Penalize for huge volume
        # E.g. 2x volume subtracts 10 points. 5x volume subtracts 40 points.
        vol_penalty = min(max(rel_vol - 1, 0) * 10, 40)
        
        # P1.4: Time decay penalty
        # Catalysts older than 48 hours are stale — the market has had time to absorb
        time_penalty = 0.0
        if published_at:
            hours_since = (datetime.utcnow() - published_at).total_seconds() / 3600.0
            # Linear decay: lose up to 30 points over 48 hours
            time_penalty = min(max(hours_since, 0) / 48.0 * 30.0, 30.0)
        
        score = base - price_penalty - vol_penalty - time_penalty
        return max(0.0, min(100.0, score))

    def _persist_pipeline_run(self, metrics: dict):
        """P0.3: Persist a PipelineRunLog for observability."""
        try:
            run_log = CatalystPipelineRun(
                id=uuid.uuid4(),
                source_name="NSE",
                source_status=metrics.get("source_status", "UNKNOWN"),
                http_status_code=metrics.get("http_status_code"),
                raw_fetched=metrics.get("raw_fetched", 0),
                keyword_filtered=metrics.get("keyword_failed", 0),
                symbol_unresolved=metrics.get("symbol_unresolved", 0),
                auto_created_companies=metrics.get("auto_created", 0),
                ai_classified=metrics.get("raw_fetched", 0) - metrics.get("missing_fields", 0) - metrics.get("duplicates", 0) - metrics.get("ignore_filtered", 0) - metrics.get("keyword_failed", 0) - metrics.get("symbol_unresolved", 0),
                ai_rejected=metrics.get("ai_rejected", 0),
                duplicates=metrics.get("duplicates", 0),
                noise_filtered=metrics.get("ignore_filtered", 0),
                saved=metrics.get("saved", 0),
                execution_time_ms=metrics.get("execution_time_ms", 0),
                error_message=metrics.get("error_message")
            )
            self.db.add(run_log)
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to persist CatalystPipelineRun log: {e}")

    def _is_fuzzy_duplicate(self, ticker: str, subject: str, event_date: datetime) -> bool:
        """
        P2.4: Fuzzy deduplication using difflib.
        Checks if a very similar announcement for the same ticker occurred within a 7-day rolling window.
        """
        import difflib
        
        # 7-day lookback window
        lookback_date = event_date - timedelta(days=7)
        
        recent_events = self.db.query(CatalystEvent).filter(
            CatalystEvent.ticker == ticker,
            CatalystEvent.created_at >= lookback_date
        ).all()
        
        normalized_subject = re.sub(r'[^a-zA-Z0-9\s]', '', subject.lower())
        
        for event in recent_events:
            if not event.event_title:
                continue
            
            existing_subject = re.sub(r'[^a-zA-Z0-9\s]', '', event.event_title.lower())
            
            # Use SequenceMatcher to find similarity ratio
            similarity = difflib.SequenceMatcher(None, normalized_subject, existing_subject).ratio()
            
            # If text is > 85% similar, consider it a duplicate
            if similarity > 0.85:
                return True
                
        return False
