import requests
import json
import logging
import uuid
import time
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Dict, Any

from app.infrastructure.models import Company, CatalystEvent, CatalystSource

logger = logging.getLogger(__name__)

class InsiderTradingService:
    def __init__(self, db: Session):
        self.db = db
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive"
        })
        self.base_url = "https://www.nseindia.com"

    def _ensure_session(self):
        try:
            self.session.get(self.base_url, timeout=10)
        except Exception as e:
            logger.warning(f"NSE homepage fetch failed (InsiderTradingService): {e}")

    def fetch_latest_insider_trades(self) -> dict:
        """
        P2.5: Fetches Prohibition of Insider Trading (PIT) disclosures from NSE.
        Filters for Promoters buying/selling massive blocks (> ₹5 Cr).
        """
        start_time = time.time()
        metrics = {
            "source": "NSE Insider Trading (PIT)",
            "status": "success",
            "raw_fetched": 0,
            "saved": 0,
            "skipped": 0,
            "execution_time_ms": 0
        }
        
        self._ensure_session()
        
        api_url = f"{self.base_url}/api/corporates-pit?index=equities"
        
        try:
            response = self.session.get(api_url, timeout=15)
            if response.status_code != 200:
                metrics["status"] = "error"
                metrics["error_message"] = f"NSE API returned {response.status_code}"
                return metrics
                
            data = response.json()
            records = data.get("data", [])
            metrics["raw_fetched"] = len(records)
            
            for item in records:
                person_category = item.get("personCategory", "").upper()
                if "PROMOTER" not in person_category:
                    metrics["skipped"] += 1
                    continue
                    
                try:
                    sec_acq = float(item.get("secAcq", 0) or 0)
                    sec_val = float(item.get("secVal", 0) or 0)
                except ValueError:
                    sec_acq = 0
                    sec_val = 0
                
                if sec_val < 50_000_000:
                    metrics["skipped"] += 1
                    continue
                    
                ticker = item.get("symbol")
                if not ticker:
                    continue
                    
                acq_mode = item.get("acqMode", "").upper()
                if "ESOP" in acq_mode or "GIFT" in acq_mode or "OFF MARKET" in acq_mode:
                    metrics["skipped"] += 1
                    continue
                    
                buy_or_sell = item.get("tdpTransactionType", "").upper()
                if "BUY" not in buy_or_sell and "SELL" not in buy_or_sell:
                    metrics["skipped"] += 1
                    continue
                    
                direction = "BUY" if "BUY" in buy_or_sell else "SELL"
                
                deal_val_cr = sec_val / 10_000_000
                event_title = f"PROMOTER {direction}: ₹{deal_val_cr:.1f} Cr Open Market"
                
                try:
                    b_date = item.get("anndate") or item.get("date")
                    dt = datetime.strptime(b_date, "%d-%b-%Y")
                except Exception:
                    dt = datetime.utcnow()
                
                existing = self.db.query(CatalystEvent).filter(
                    CatalystEvent.ticker == ticker,
                    CatalystEvent.category == "INSIDER_TRADING",
                    CatalystEvent.event_title == f"🚨 {event_title}" if direction == "BUY" else f"⚠️ {event_title}"
                ).first()
                
                if existing:
                    metrics["skipped"] += 1
                    continue
                    
                company = self.db.query(Company).filter(Company.ticker == ticker).first()
                if not company:
                    try:
                        company = Company(
                            id=uuid.uuid4(),
                            ticker=ticker,
                            name=item.get("company", ticker),
                            sector="NSE_AUTO"
                        )
                        self.db.add(company)
                        self.db.commit()
                        self.db.refresh(company)
                    except Exception:
                        self.db.rollback()
                        metrics["skipped"] += 1
                        continue
                
                impact_score = 60
                tier = "B-TIER"
                
                if company.market_cap and company.market_cap > 0:
                    pct_mcap = (sec_val / company.market_cap) * 100
                    if pct_mcap > 1.0:
                        impact_score = 85
                        tier = "A-TIER"
                        if direction == "BUY":
                            impact_score = 95
                            tier = "S-TIER"
                            
                person_name = item.get("acqName", "Promoter")
                emoji = "🚨" if direction == "BUY" else "⚠️"
                why = f"Promoter entity '{person_name}' executed an open market {direction} of {sec_acq:,.0f} shares worth ₹{deal_val_cr:.1f} Cr. Massive promoter {direction.lower()}ing is a highly reliable signal."
                
                event = CatalystEvent(
                    id=uuid.uuid4(),
                    ticker=ticker,
                    company_id=company.id,
                    event_title=f"{emoji} {event_title}",
                    event_type=f"PROMOTER_{direction}",
                    category="INSIDER_TRADING",
                    impact_score=impact_score,
                    early_score=80.0,
                    confidence="HIGH",
                    status="DEVELOPING",
                    tier=tier,
                    match_status="MATCHED",
                    why_it_matters=why,
                    relative_volume=1.0,
                    market_cap_at_event=company.market_cap,
                    sector_at_event=company.sector,
                    published_at=dt,
                    detected_at=datetime.utcnow()
                )
                
                source = CatalystSource(
                    id=uuid.uuid4(),
                    event_id=event.id,
                    source_name="NSE Insider Trading",
                    is_primary=True,
                    published_at=dt
                )
                
                self.db.add(event)
                self.db.add(source)
                self.db.commit()
                metrics["saved"] += 1
                
        except Exception as e:
            logger.error(f"Error fetching insider trades: {e}")
            metrics["status"] = "error"
            metrics["error_message"] = str(e)
            
        metrics["execution_time_ms"] = int((time.time() - start_time) * 1000)
        return metrics
