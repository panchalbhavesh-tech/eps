import os
import uuid
import logging
import requests
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.infrastructure.models import Company, DailyBhavcopy, BulkBlockDeal, SurveillanceWatchlist

logger = logging.getLogger(__name__)

class NseDataService:
    """
    Hybrid NSE Data Ingestion Service.
    Handles official NSE EOD Bhavcopy (for Delivery Percentage T+1), Bulk/Block deal disclosures,
    and ASM/GSM regulatory surveillance exclusion watchlists with polite headers and resilience.
    """

    def __init__(self, db: Session):
        self.db = db
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        }

    def sync_daily_bhavcopy(self, date_str: Optional[str] = None) -> Dict[str, Any]:
        """
        Downloads and parses the official NSE EOD Bhavcopy CSV archive to extract Delivery % and trade statistics.
        Stamps point-in-time known_at timestamps upon DB persistence.
        """
        if not date_str:
            target_date = datetime.utcnow() - timedelta(days=1) # T+1 lagging rule per spec
        else:
            try:
                target_date = pd.to_datetime(date_str).to_pydatetime()
            except Exception:
                target_date = datetime.utcnow() - timedelta(days=1)

        date_formatted = target_date.strftime("%d%m%Y")
        url = f"https://niftyindices.com/reports/bhavcopy_{date_formatted}.csv"

        count = 0
        try:
            resp = requests.get(url, headers=self.headers, timeout=8)
            if resp.status_code == 200 and len(resp.content) > 200:
                import io
                df = pd.read_csv(io.StringIO(resp.text))
                for _, row in df.iterrows():
                    ticker = str(row.get("SYMBOL", row.get("TICKER", ""))).strip().upper()
                    if not ticker or ticker == "NAN":
                        continue
                    
                    deliv = float(row.get("DELIVERABLE_PCT", row.get("DELV_PCT", 55.0)))
                    close_p = float(row.get("CLOSE", row.get("CLOSE_PRICE", 0.0)))
                    vol = float(row.get("TOTTRDQTY", row.get("VOLUME", 0.0)))

                    record = DailyBhavcopy(
                        id=uuid.uuid4(),
                        ticker=ticker,
                        trade_date=target_date,
                        close_price=close_p,
                        volume=vol,
                        delivery_pct=deliv,
                        known_at=datetime.utcnow()
                    )
                    self.db.merge(record)
                    count += 1
                self.db.commit()
                return {"status": "Success", "records_synced": count, "date": str(target_date.date())}
        except Exception as e:
            logger.warning(f"Live Bhavcopy scrape unavailable or rate-limited ({e}). Skipping synthetic fallback to prevent noise injection.")

        return {"status": "Bhavcopy sync attempted", "records_synced": count, "date": str(target_date.date())}

    def sync_surveillance_watchlists(self) -> Dict[str, Any]:
        """
        Synchronizes SEBI & NSE regulatory Additional Surveillance Measure (ASM) and Graded Surveillance Measure (GSM) lists.
        Equities on these watchlists are automatically barred from momentum BUY recommendations.
        """
        known_regulatory_flags = []
        try:
            from curl_cffi import requests as curl_requests
            session = curl_requests.Session(impersonate="chrome110")
            session.headers.update(self.headers)
            session.get("https://www.nseindia.com", timeout=10)
            
            # ASM
            asm_resp = session.get("https://www.nseindia.com/api/reportASM?json=true", timeout=10)
            if asm_resp.status_code == 200:
                for item in asm_resp.json().get("data", []):
                    if item.get("symbol"):
                        known_regulatory_flags.append({
                            "ticker": item["symbol"],
                            "list_type": "ASM",
                            "stage": item.get("stage", "Stage I")
                        })
            
            # GSM
            gsm_resp = session.get("https://www.nseindia.com/api/reportGSM?json=true", timeout=10)
            if gsm_resp.status_code == 200:
                for item in gsm_resp.json().get("data", []):
                    if item.get("symbol"):
                        known_regulatory_flags.append({
                            "ticker": item["symbol"],
                            "list_type": "GSM",
                            "stage": item.get("stage", "Stage I")
                        })
        except Exception as e:
            logger.warning(f"Failed to scrape real ASM/GSM lists: {e}. ")

        synced = 0
        for item in known_regulatory_flags:
            try:
                existing = self.db.query(SurveillanceWatchlist).filter_by(ticker=item["ticker"]).first()
                if not existing:
                    rec = SurveillanceWatchlist(
                        id=uuid.uuid4(),
                        ticker=item["ticker"],
                        list_type=item["list_type"],
                        stage=item["stage"],
                        date_added=datetime.utcnow(),
                        known_at=datetime.utcnow()
                    )
                    self.db.add(rec)
                    synced += 1
            except Exception:
                continue

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()

        return {"status": "Surveillance Watchlist Updated", "new_exclusions_added": synced}

    def sync_bulk_block_deals(self) -> Dict[str, Any]:
        """
        Ingests daily NSE institutional Bulk and Block trade disclosures to track large order flow directions.
        """
        count = 0
        try:
            from curl_cffi import requests as curl_requests
            session = curl_requests.Session(impersonate="chrome110")
            session.headers.update(self.headers)
            session.get("https://www.nseindia.com", timeout=10) # to get cookies
            
            resp = session.get("https://www.nseindia.com/api/block-deal", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("data", []):
                    ticker = item.get("symbol", "").strip()
                    if not ticker: continue
                    client_name = item.get("clientName", "")
                    direction = "BUY" if str(item.get("buySell", "")).upper() == "BUY" else "SELL"
                    quantity = float(item.get("quantity", 0))
                    price = float(item.get("tradePrice", 0))
                    date_str = item.get("date", "")
                    try:
                        deal_date = datetime.strptime(date_str, "%d-%b-%Y")
                    except Exception:
                        deal_date = datetime.utcnow()
                        
                    deal = BulkBlockDeal(
                        id=uuid.uuid4(),
                        ticker=ticker,
                        deal_date=deal_date,
                        deal_type="BLOCK",
                        client_name=client_name,
                        direction=direction,
                        quantity=quantity,
                        trade_price=price,
                        known_at=datetime.utcnow()
                    )
                    self.db.add(deal)
                    count += 1
            
            self.db.commit()
            return {"status": "Bulk/Block flows processed successfully", "records_synced": count}
        except Exception as e:
            self.db.rollback()
            logger.warning(f"Failed to fetch bulk/block deals: {e}")
            return {"status": f"Failed: {e}", "records_synced": count}

    def get_delivery_pct(self, ticker: str) -> float:
        """
        Retrieves the latest point-in-time T+1 delivery percentage for a ticker.
        """
        clean_ticker = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
        try:
            rec = self.db.query(DailyBhavcopy).filter(DailyBhavcopy.ticker == clean_ticker).order_by(DailyBhavcopy.trade_date.desc()).first()
            if rec and rec.delivery_pct is not None:
                return float(rec.delivery_pct)
        except Exception:
            pass
        return 58.5  # Institutional average default

    def is_under_surveillance(self, ticker: str) -> Dict[str, Any]:
        """
        Checks if a ticker is on active SEBI/NSE ASM or GSM regulatory watchlists.
        """
        clean_ticker = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
        try:
            rec = self.db.query(SurveillanceWatchlist).filter_by(ticker=clean_ticker).first()
            if rec:
                return {"is_restricted": True, "list_type": rec.list_type, "stage": rec.stage}
        except Exception:
            pass
        return {"is_restricted": False, "list_type": None, "stage": None}

    def fetch_latest_corporate_announcements(self) -> dict:
        """
        Fetches the latest corporate announcements from the NSE API.
        Uses a 3-day rolling window to ensure we don't miss weekend or after-hours filings.
        
        Returns a structured dict:
        {
            "source_status": "SUCCESS" | "API_ERROR" | "TIMEOUT" | "RATE_LIMITED" | "EMPTY",
            "http_status_code": int or None,
            "announcements": list,
            "error_message": str or None
        }
        """
        import random
        import time as _time
        
        USER_AGENTS = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        ]
        
        today = datetime.utcnow() + timedelta(hours=5, minutes=30)  # IST
        from_dt = (today - timedelta(days=2)).strftime("%d-%m-%Y")
        to_dt = today.strftime("%d-%m-%Y")
        api_url = f"https://www.nseindia.com/api/corporate-announcements?index=equities&from_date={from_dt}&to_date={to_dt}"
        
        max_retries = 3
        last_status_code = None
        last_error = None
        
        for attempt in range(max_retries):
            try:
                from curl_cffi import requests as curl_requests
                session = curl_requests.Session(impersonate="chrome110")
                ua = random.choice(USER_AGENTS)
                session.headers.update({
                    "User-Agent": ua,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Upgrade-Insecure-Requests": "1",
                })
                
                # Step 1: Hit homepage to establish cookies (critical for NSE anti-bot)
                home_resp = session.get("https://www.nseindia.com", timeout=12)
                if home_resp.status_code != 200:
                    logger.warning(f"NSE homepage returned {home_resp.status_code} on attempt {attempt + 1}")
                    last_status_code = home_resp.status_code
                    last_error = f"Homepage returned {home_resp.status_code}"
                    _time.sleep(2 ** attempt + random.uniform(0.5, 1.5))
                    continue
                
                # Step 2: Fetch the API with JSON accept header
                session.headers.update({
                    "Accept": "application/json, text/plain, */*",
                    "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
                })
                
                resp = session.get(api_url, timeout=15)
                last_status_code = resp.status_code
                
                if resp.status_code == 200:
                    data = resp.json()
                    items = data if isinstance(data, list) else data.get("data", [])
                    logger.info(f"NSE Announcements API: fetched {len(items)} announcements (attempt {attempt + 1})")
                    
                    if len(items) == 0:
                        return {
                            "source_status": "EMPTY",
                            "http_status_code": 200,
                            "announcements": [],
                            "error_message": None
                        }
                    
                    return {
                        "source_status": "SUCCESS",
                        "http_status_code": 200,
                        "announcements": items,
                        "error_message": None
                    }
                elif resp.status_code == 403 or resp.status_code == 429:
                    logger.warning(f"NSE API rate-limited/blocked ({resp.status_code}) on attempt {attempt + 1}")
                    last_error = f"HTTP {resp.status_code} - Rate limited or blocked"
                    _time.sleep(2 ** attempt + random.uniform(1, 3))
                    continue
                else:
                    logger.warning(f"NSE Announcements API returned {resp.status_code} on attempt {attempt + 1}")
                    last_error = f"HTTP {resp.status_code}"
                    _time.sleep(2 ** attempt + random.uniform(0.5, 1.5))
                    continue
                    
            except curl_requests.exceptions.Timeout:
                logger.warning(f"NSE API timeout on attempt {attempt + 1}/{max_retries}")
                last_error = "Connection timeout"
                _time.sleep(2 ** attempt + random.uniform(0.5, 1.5))
                continue
            except (curl_requests.exceptions.ConnectionError, curl_requests.exceptions.CurlError) as e:
                logger.warning(f"NSE API connection error on attempt {attempt + 1}: {e}")
                last_error = f"Connection error: {str(e)[:200]}"
                _time.sleep(2 ** attempt + random.uniform(0.5, 1.5))
                continue
            except Exception as e:
                logger.error(f"NSE API unexpected error on attempt {attempt + 1}: {e}")
                last_error = f"Unexpected: {str(e)[:200]}"
                _time.sleep(2 ** attempt + random.uniform(0.5, 1.5))
                continue
        
        # All retries exhausted
        source_status = "TIMEOUT" if "timeout" in (last_error or "").lower() else "RATE_LIMITED" if last_status_code in (403, 429) else "API_ERROR"
        logger.error(f"NSE Announcements API failed after {max_retries} attempts. Status: {source_status}, Last error: {last_error}")
        
        return {
            "source_status": source_status,
            "http_status_code": last_status_code,
            "announcements": [],
            "error_message": last_error
        }

