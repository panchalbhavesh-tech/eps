import pandas as pd
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy import text
from app.core.config import settings

from app.services.data.upstox_lake_provider import UpstoxLakeProvider
from app.services.data.yfinance_provider import YahooFinanceProvider

class UnifiedDataManager:
    def __init__(self, db=None):
        self.db = db
        self.primary_provider = UpstoxLakeProvider()
        self.fallback_provider = YahooFinanceProvider()
        self._cache = {}

    def get_ohlcv(self, ticker: str, start_date: datetime = None, end_date: datetime = None, days: int = 365, use_cache: bool = False) -> pd.DataFrame:
        cache_key = f"{ticker}_{start_date}_{end_date}_{days}"
        if use_cache and cache_key in self._cache:
            return self._cache[cache_key].copy()
            
        # Benchmarks always go to fallback since Upstox Parquet may not have them natively under "^NSEI"
        if ticker.startswith("^"):
            df = self.fallback_provider.get_ohlcv(ticker, start_date, end_date, days)
            if use_cache and not df.empty:
                self._cache[cache_key] = df
            return df
            
        # 1. Try Primary Data Lake (Parquet)
        df = self.primary_provider.get_ohlcv(ticker, start_date, end_date, days)
        
        # 2. Fallback
        if df.empty:
            if settings.ENVIRONMENT == "production":
                # In strict production, warn if Data Lake is missing
                print(f"WARNING: Missing production Parquet data for {ticker}. Falling back to Yahoo Finance.")
            df = self.fallback_provider.get_ohlcv(ticker, start_date, end_date, days)
            
        if use_cache and not df.empty:
            self._cache[cache_key] = df
            
        return df

    def get_company_info(self, ticker: str) -> Dict[str, Any]:
        info = self.primary_provider.get_company_info(ticker)
        if not info:
            info = self.fallback_provider.get_company_info(ticker)
        return info

    def get_earnings_calendar(self, ticker: str) -> List[datetime]:
        dates = self.primary_provider.get_earnings_calendar(ticker)
        if not dates:
            dates = self.fallback_provider.get_earnings_calendar(ticker)
        return dates

    def get_financials(self, ticker: str) -> pd.DataFrame:
        df = self.primary_provider.get_financials(ticker)
        if df.empty:
            df = self.fallback_provider.get_financials(ticker)
        return df

    def get_annual_financials(self, ticker: str) -> pd.DataFrame:
        df = self.primary_provider.get_annual_financials(ticker)
        if df.empty:
            df = self.fallback_provider.get_annual_financials(ticker)
        return df

    def get_balance_sheet(self, ticker: str) -> pd.DataFrame:
        df = self.primary_provider.get_balance_sheet(ticker)
        if df.empty:
            df = self.fallback_provider.get_balance_sheet(ticker)
        return df

    def get_latest_prices_from_db(self) -> dict:
        """Reads 15-minute intraday snapshots directly from Postgres live_quotes."""
        if not self.db:
            return {}
        try:
            result = self.db.execute(text("SELECT ticker, price FROM live_quotes")).fetchall()
            return {row[0]: row[1] for row in result}
        except Exception as e:
            print(f"Error reading live_quotes: {e}")
            return {}
