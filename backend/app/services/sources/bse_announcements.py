import logging
import requests
import time
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class BseAnnouncementsService:
    """
    Scraper for BSE Corporate Announcements API.
    BSE does not use aggressive WAF blocking for this public endpoint.
    """
    
    BASE_URL = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w"
    
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": "https://www.bseindia.com",
            "Referer": "https://www.bseindia.com/",
        }

    def fetch_latest_announcements(self, pages_to_fetch: int = 3) -> Dict[str, Any]:
        """
        Latest BSE corporate announcements (today and yesterday).
        BSE blocks plain HTTP clients (403), so a browser-impersonating session with a homepage warm-up is used.
        Keeps BSE's own category/sub-category and the PDF link so filings can be classified properly.
        """
        from datetime import datetime, timedelta
        from curl_cffi import requests as curl_requests
        all_announcements = []
        try:
            session = curl_requests.Session(impersonate="chrome110")
            session.get("https://www.bseindia.com/", timeout=20)
            ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
            # BSE only accepts single-day ranges: query today, then yesterday (covers overnight filings).
            for day in (ist, ist - timedelta(days=1)):
                d = day.strftime("%Y%m%d")
                for page in range(1, pages_to_fetch + 1):
                    url = (f"{self.BASE_URL}?pageno={page}&strCat=-1&strPrevDate={d}&strScrip=&strSearch=P"
                           f"&strToDate={d}&strType=C&subcategory=-1")
                    response = session.get(url, headers={k: v for k, v in self.headers.items() if k != "User-Agent"}, timeout=20)
                    if response.status_code != 200:
                        logger.error(f"BSE API returned status {response.status_code}")
                        break
                    rows = (response.json() or {}).get("Table") or []
                    all_announcements.extend(rows)
                    if len(rows) < 50:
                        break
                    time.sleep(1)
            if not all_announcements:
                return {"status": "source_error", "source": "BSE", "status_code": 0, "data": [], "error": "no rows"}

            normalized = []
            for ann in all_announcements:
                attachment = ann.get("ATTACHMENTNAME") or ""
                normalized.append({
                    "symbol": str(ann.get("SCRIP_CD", "")),
                    "companyName": ann.get("SLONGNAME", ""),
                    "desc": ann.get("SUBCATNAME") or ann.get("CATEGORYNAME") or "",
                    "subject": ann.get("NEWSSUB", ""),
                    "attchmntText": f"{ann.get('NEWSSUB', '')} {ann.get('HEADLINE', '')}".strip(),
                    "an_dt": ann.get("NEWS_DT", ""),
                    "attchmntFile": f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{attachment}" if attachment else "",
                    "source": "BSE",
                })
            return {"status": "success", "source": "BSE", "status_code": 200, "data": normalized}
        except Exception as e:
            logger.error(f"Exception fetching from BSE: {e}", exc_info=True)
            return {"status": "source_error", "source": "BSE", "status_code": 0, "data": [], "error": str(e)}
