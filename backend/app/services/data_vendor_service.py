import yfinance as yf
import pandas as pd
import os
from typing import Optional
from sqlalchemy import text
from app.core.config import settings

class DataVendorService:
    """
    Abstracts market data fetching.
    Phase 2: Reads passively from the Harvester Data Lake (Parquet) and Postgres.
    """
    def __init__(self, db=None, fmp_api_key: str = None):
        self.db = db
        self.fmp_api_key = fmp_api_key
        self.data_lake_path = os.environ.get("DATA_LAKE_PATH", "/app/data_lake")
        
    def fetch_historical_ohlcv(self, ticker: str, years: int = 5) -> pd.DataFrame:
        """
        Primary interface for fetching daily OHLCV. 
        Reads from high-speed Parquet files. Falls back to yfinance only in development.
        """
        parquet_path = os.path.join(self.data_lake_path, f"ohlcv/daily/{ticker}.parquet")
        
        try:
            # 1. Try lightning-fast read from Harvester's Parquet file
            return pd.read_parquet(parquet_path)
            
        except (FileNotFoundError, OSError):
            # 2. Handle missing Parquet file based on environment
            if settings.ENVIRONMENT == "production":
                # In production, we MUST use Upstox/Harvester data.
                # If it's missing, the Harvester hasn't run yet. Fail loud.
                raise RuntimeError(f"Missing production Parquet data for {ticker}. Ensure Harvester is running.")
                
            print(f"[DEV FALLBACK] Parquet missing for {ticker}. Fetching from yfinance...")
            return self._fetch_from_yfinance_fallback(ticker, years)

    def _fetch_from_yfinance_fallback(self, ticker: str, years: int) -> pd.DataFrame:
        """Slow, rate-limited yfinance fallback for local development only."""
        symbols_to_try = []
        if ticker.startswith("^") or ticker.endswith(".NS") or ticker.endswith(".BO"):
            symbols_to_try.append(ticker)
        else:
            symbols_to_try.extend([f"{ticker}.NS", f"{ticker}.BO", ticker])
            
        for yf_ticker in symbols_to_try:
            df = pd.DataFrame()
            try:
                ticker_obj = yf.Ticker(yf_ticker)
                df = ticker_obj.history(period=f"{years}y")
            except Exception:
                pass
                
            if not df.empty and len(df) > 10:
                df.index = df.index.tz_localize(None)
                return df
        return pd.DataFrame()

    def get_latest_prices(self) -> dict:
        """
        Reads the 15-minute intraday snapshots directly from the Postgres database.
        Returns a dict of {ticker: price}.
        """
        if not self.db:
            return {}
            
        try:
            result = self.db.execute(text("SELECT ticker, price FROM live_quotes")).fetchall()
            return {row[0]: row[1] for row in result}
        except Exception as e:
            print(f"Error reading live_quotes: {e}")
            return {}

    def fetch_financial_metrics(self, ticker: str) -> dict:
        """
        Fetches fundamental metrics.
        """
        yf_ticker = f"{ticker}.NS" if not (ticker.endswith(".NS") or ticker.endswith(".BO")) else ticker
        try:
            t = yf.Ticker(yf_ticker)
            return t.info
        except:
            return {}
