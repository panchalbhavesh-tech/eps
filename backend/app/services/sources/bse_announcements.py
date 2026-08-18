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

    def fetch_latest_announcements(self, pages_to_fetch: int = 1) -> Dict[str, Any]:
        """
        Fetches corporate announcements from BSE.
        Since BSE data often serves dual-listed NSE companies, this is a highly reliable fallback.
        """
        all_announcements = []
        
        try:
            for page in range(1, pages_to_fetch + 1):
                # BSE requires specific URL parameters.
                # strCat=-1 (All Categories)
                # strType=C (Corporate)
                url = f"{self.BASE_URL}?pageno={page}&strCat=-1&strPrevDate=&strScrip=&strSearch=P&strToDate=&strType=C"
                
                logger.info(f"Fetching BSE announcements page {page} via {url}")
                
                response = requests.get(
                    url, 
                    headers=self.headers, 
                    timeout=15
                )
                
                if response.status_code != 200:
                    logger.error(f"BSE API returned status {response.status_code}. Response: {response.text[:200]}")
                    return {
                        "status": "source_error",
                        "source": "BSE",
                        "status_code": response.status_code,
                        "data": [],
                        "error": f"HTTP {response.status_code}"
                    }
                
                data = response.json()
                
                if "Table" in data and isinstance(data["Table"], list):
                    all_announcements.extend(data["Table"])
                else:
                    logger.warning(f"Unexpected JSON structure from BSE: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
                
                time.sleep(1) # Be polite
                
            logger.info(f"Successfully fetched {len(all_announcements)} announcements from BSE")
            
            # Normalize to match NSE structure as much as possible
            normalized_announcements = []
            for ann in all_announcements:
                normalized = {
                    "symbol": str(ann.get("SCRIP_CD", "")), # BSE uses Scrip Code as the primary identifier in this feed
                    "companyName": ann.get("SLONGNAME", ""),
                    "subject": ann.get("NEWSSUB", ""),
                    "details": ann.get("HEADLINE", ""),
                    "anndate": ann.get("NEWS_DT", ""),
                    "attchmntText": ann.get("ATTACHMENTNAME", ""),
                    "source": "BSE"
                }
                normalized_announcements.append(normalized)
                
            return {
                "status": "success",
                "source": "BSE",
                "status_code": 200,
                "data": normalized_announcements
            }
                
        except Exception as e:
            logger.error(f"Exception fetching from BSE: {e}", exc_info=True)
            return {
                "status": "source_error",
                "source": "BSE",
                "status_code": 0,
                "data": [],
                "error": str(e)
            }
