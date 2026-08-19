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
        
        # Phase 1: Try BSE First (No WAF Blocking)
        bse_result = self.bse_service.fetch_latest_announcements(pages_to_fetch=1)
        
        announcements = []
        if bse_result["status"] == "success" and bse_result["data"]:
            announcements = bse_result["data"]
            metrics["source_status"] = "SUCCESS"
            metrics["http_status_code"] = 200
        else:
            # Fallback to NSE
            logger.warning(f"BSE Failed ({bse_result.get('error')}). Falling back to NSE.")
            metrics["source"] = "NSE Corporate Announcements API"
            nse_result = self.nse_service.fetch_latest_corporate_announcements()
            metrics["source_status"] = nse_result.get("source_status", "UNKNOWN")
            metrics["http_status_code"] = nse_result.get("http_status_code")
            metrics["error_message"] = nse_result.get("error_message")
            announcements = nse_result.get("announcements", [])
        
        if not announcements:
            metrics["status"] = "success" if metrics["source_status"] in ("SUCCESS", "EMPTY") else "source_error"
            metrics["message"] = f"No announcements fetched. Source status: {metrics['source_status']}"
            metrics["execution_time_ms"] = int((time.time() - start_time) * 1000)
            self._persist_pipeline_run(metrics)
            return metrics
            
        metrics["raw_fetched"] = len(announcements)
        
        # Pass 1: Filtering and Entity Resolution
        valid_announcements = []
        for item in announcements:
            symbol = item.get("symbol")
            subject = item.get("desc") or item.get("subject", "")
            details = item.get("attchmntText") or item.get("details", "")
            broadcast_date = item.get("an_dt") or item.get("anndate", "") 
            attachment_url = f"https://www.nseindia.com/corporate/{item.get('attchmntFile')}" if item.get('attchmntFile') else ""
            
            if not symbol or not subject:
                metrics["missing_fields"] += 1
                metrics["rejected"]["invalid_format"] += 1
                continue
                
            is_bse = item.get("source") == "BSE"
            resolved_ticker = symbol
            company = None
            
            if is_bse:
                company = self.db.query(Company).filter(Company.bse_scrip_code == symbol).first()
                if company:
                    resolved_ticker = company.ticker
                else:
                    resolved_ticker = f"{symbol}.BO"
            else:
                company = self.db.query(Company).filter(Company.ticker == symbol).first()
                
            try:
                dt = datetime.strptime(broadcast_date, "%d-%b-%Y %H:%M:%S")
            except Exception:
                try:
                    dt = datetime.fromisoformat(broadcast_date.split(".")[0])
                except Exception:
                    dt = datetime.utcnow()
                
            # Fuzzy Deduplication
            if self._is_fuzzy_duplicate(resolved_ticker, subject, dt):
                metrics["duplicates"] += 1
                metrics["rejected"]["duplicate"] += 1
                continue
                
            if self.ignore_filters.search(subject):
                metrics["ignore_filtered"] += 1
                metrics["rejected"]["noise"] += 1
                continue
                
            if not self.keyword_filters.search(subject) and not self.keyword_filters.search(details):
                metrics["keyword_failed"] += 1
                metrics["rejected"]["missing_keywords"] += 1
                continue
                
            if not company:
                try:
                    company_name = item.get("companyName", symbol)
                    new_company = Company(
                        id=uuid.uuid4(),
                        ticker=resolved_ticker,
                        bse_scrip_code=symbol if is_bse else None,
                        name=company_name if company_name else resolved_ticker,
                        sector="BSE_AUTO" if is_bse else "NSE_AUTO"
                    )
                    self.db.add(new_company)
                    self.db.commit()
                    self.db.refresh(new_company)
                    company = new_company
                    metrics["auto_created"] += 1
                except IntegrityError:
                    self.db.rollback()
                    company = self.db.query(Company).filter(Company.ticker == resolved_ticker).first()
                    if not company:
                        metrics["symbol_unresolved"] += 1
                        metrics["rejected"]["unknown_symbol"] += 1
                        continue
                except Exception as e:
                    self.db.rollback()
                    metrics["symbol_unresolved"] += 1
                    metrics["rejected"]["unknown_symbol"] += 1
                    continue
                    
            valid_announcements.append({
                "ticker": resolved_ticker,
                "subject": subject,
                "details": details,
                "dt": dt,
                "url": attachment_url,
                "company": company,
                "context": {
                    "market_cap": company.market_cap,
                    "sector": company.sector,
                    "revenue": company.q0_revenue,
                }
            })

        # Pass 2: Batch AI Evaluation
        if valid_announcements:
            ai_results = self.ai_service.evaluate_catalyst_batch(valid_announcements)
        else:
            ai_results = []

        # Pass 3: Process Results and Save
        for ann, ai_result in zip(valid_announcements, ai_results):
            if not ai_result or not ai_result.get("is_material"):
                metrics["ai_rejected"] += 1
                metrics["rejected"]["non_material"] += 1
                continue
                
            impact_score = ai_result.get("impact_score", 0)
            category = ai_result.get("category", "CORPORATE")
            event_type = ai_result.get("event_type", "ANNOUNCEMENT")
            tier = ai_result.get("tier", "C-TIER")
            why = ai_result.get("why_it_matters", "")
            
            reaction_data = self.quant_service.get_recent_price_reaction(ann["ticker"], published_at=ann["dt"])
            
            if isinstance(reaction_data, dict):
                reaction_pct = float(reaction_data.get("reaction_pct", 0.0) or 0.0)
                rel_vol = float(reaction_data.get("relative_volume", 1.0) or 1.0)
                gap_reaction = reaction_data.get("gap_reaction_pct")
                session_reaction = reaction_data.get("session_reaction_pct")
                reaction_1d = reaction_data.get("reaction_1d")
                reaction_3d = reaction_data.get("reaction_3d")
                reaction_5d = reaction_data.get("reaction_5d")
                pre_event_price = reaction_data.get("pre_event_price")
            else:
                current_p, prev_c, reaction_pct, rel_vol = reaction_data
                reaction_pct = float(reaction_pct) if reaction_pct is not None else 0.0
                rel_vol = float(rel_vol) if rel_vol is not None else 1.0
                gap_reaction = None
                session_reaction = None
                reaction_1d = None
                reaction_3d = None
                reaction_5d = None
                pre_event_price = float(prev_c) if prev_c else None
            
            early_score = float(self._compute_early_score(impact_score, reaction_pct, rel_vol, published_at=ann["dt"]))
            
            status = "EARLY"
            if early_score < 40:
                status = "EXTENDED"
            elif early_score < 70:
                status = "DEVELOPING"
                
            event = CatalystEvent(
                id=uuid.uuid4(),
                ticker=ann["ticker"],
                company_id=ann["company"].id,
                event_title=ann["subject"],
                event_type=event_type,
                category=category,
                impact_score=impact_score,
                early_score=early_score,
                confidence="HIGH",
                status=status,
                tier=tier,
                match_status="MATCHED",
                why_it_matters=why,
                reaction_pct=reaction_pct,
                relative_volume=rel_vol,
                gap_reaction_pct=gap_reaction,
                session_reaction_pct=session_reaction,
                reaction_1d=reaction_1d,
                reaction_3d=reaction_3d,
                reaction_5d=reaction_5d,
                pre_event_price=pre_event_price,
                market_cap_at_event=ann["company"].market_cap,
                sector_at_event=ann["company"].sector,
                published_at=ann["dt"],
                detected_at=datetime.utcnow(),
                verified_at=datetime.utcnow()
            )
            
            source = CatalystSource(
                id=uuid.uuid4(),
                event_id=event.id,
                source_name="NSE Corporate Announcements",
                url=ann["url"],
                is_primary=True,
                published_at=ann["dt"]
            )
            
            self.db.add(event)
            self.db.add(source)
            self.db.commit()
            metrics["saved"] += 1
            
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
        
        metrics["execution_time_ms"] = int((time.time() - start_time) * 1000)
        return metrics

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
