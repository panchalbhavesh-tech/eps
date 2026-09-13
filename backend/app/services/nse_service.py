import requests
import csv
from typing import List, Dict, Any

class NSEService:
    def __init__(self):
        self.base_url = "https://www.nseindia.com"
        self.api_url = "https://www.nseindia.com/api/event-calendar?index=equities"
        from curl_cffi import requests as curl_requests
        self.session = curl_requests.Session(impersonate="chrome110")

    def get_upcoming_results(self) -> List[Dict[str, Any]]:
        """
        Fetches the upcoming earnings calendar from NSE and parses it.
        Returns a list of dicts: {"ticker": str, "company_name": str, "date": str, "purpose": str}
        """
        # NSE requires some headers and an active session to bypass basic bot-blocking
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
        })
        
        try:
            # Hit the homepage first to get valid cookies
            self.session.get("https://www.nseindia.com", timeout=15)
        except Exception as e:
            print(f"Failed to fetch NSE cookies: {e}")
            return []
            
        try:
            response = self.session.get(self.api_url, timeout=15)
            # The API returns a JSON list of events
            data = response.json()
            
            results = []
            for item in data:
                symbol = item.get("symbol", "").strip()
                company = item.get("company", "").strip()
                purpose = item.get("purpose", "").strip().lower()
                date_str = item.get("date", "").strip()
                
                if "financial results" in purpose or "quarterly results" in purpose:
                    if symbol and company and date_str:
                        results.append({
                            "ticker": symbol,
                            "company_name": company,
                            "date": date_str,
                            "purpose": purpose
                        })
            return results
        except Exception as e:
            print(f"Error fetching NSE calendar JSON: {e}")
            return []
