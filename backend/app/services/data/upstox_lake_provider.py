import os
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any
from app.services.data.base_provider import BaseDataProvider

class UpstoxLakeProvider(BaseDataProvider):
    """
    Reads natively from the high-speed Parquet Data Lake harvested by Upstox.
    Does not interact directly with the Upstox API.
    """
    def __init__(self):
        self.data_lake_path = os.environ.get("DATA_LAKE_PATH", "/app/data_lake")
        
    def get_ohlcv(self, ticker: str, start_date: datetime = None, end_date: datetime = None, days: int = 365) -> pd.DataFrame:
        clean_ticker = ticker.replace('.NS', '').replace('.BO', '')
        parquet_path = os.path.join(self.data_lake_path, f"ohlcv/daily/{clean_ticker}.parquet")
        
        try:
            df = pd.read_parquet(parquet_path)
            
            # Standardize column names to lower case to match expected schema
            df.columns = [str(c).lower() for c in df.columns]
            
            # Time filtering
            if start_date:
                df = df[df.index >= pd.to_datetime(start_date).tz_localize(None)]
            if end_date:
                df = df[df.index <= pd.to_datetime(end_date).tz_localize(None)]
            elif days and not start_date and not end_date:
                start_dt = datetime.now() - timedelta(days=days)
                df = df[df.index >= start_dt]
                
            return df
        except (FileNotFoundError, OSError):
            return pd.DataFrame()
            
    def get_company_info(self, ticker: str) -> Dict[str, Any]:
        # Data lake doesn't store rich fundamentals natively yet.
        return {}
        
    def get_earnings_calendar(self, ticker: str) -> List[datetime]:
        # Upstox doesn't provide earnings dates natively yet.
        return []

    def get_financials(self, ticker: str) -> pd.DataFrame:
        return pd.DataFrame()

    def get_annual_financials(self, ticker: str) -> pd.DataFrame:
        return pd.DataFrame()

    def get_balance_sheet(self, ticker: str) -> pd.DataFrame:
        return pd.DataFrame()
