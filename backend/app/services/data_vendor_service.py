import yfinance as yf
import pandas as pd
from typing import Optional

class DataVendorService:
    """
    Abstracts market data fetching to allow swapping underlying vendors (e.g. yfinance, FMP, Bloomberg, FactSet).
    """
    def __init__(self, db=None, fmp_api_key: str = None):
        self.db = db
        self.fmp_api_key = fmp_api_key
        
    def fetch_historical_ohlcv(self, ticker: str, years: int = 5) -> pd.DataFrame:
        """
        Primary interface for fetching daily OHLCV. 
        Defaults to yfinance but architected for enterprise integration.
        """
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
            except Exception as e:
                pass
                
            if not df.empty and len(df) > 10:
                df.index = df.index.tz_localize(None)
                return df
                
        return pd.DataFrame()
        
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
