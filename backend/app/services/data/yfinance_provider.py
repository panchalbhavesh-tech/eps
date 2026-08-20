import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any
import yfinance as yf
from app.services.data.base_provider import BaseDataProvider

class YahooFinanceProvider(BaseDataProvider):
    def _format_ticker(self, ticker: str) -> str:
        if ticker.startswith("^") or ticker.endswith((".NS", ".BO", ".US", ".L")):
            return ticker
        return f"{ticker}.NS"

    def get_ohlcv(self, ticker: str, start_date: datetime = None, end_date: datetime = None, days: int = 365) -> pd.DataFrame:
        yf_ticker = self._format_ticker(ticker)
        try:
            stock = yf.Ticker(yf_ticker)
            if start_date and end_date:
                df = stock.history(start=start_date.strftime("%Y-%m-%d"), end=end_date.strftime("%Y-%m-%d"))
            else:
                period = f"{days}d" if days < 730 else f"{int(days/365)}y"
                df = stock.history(period=period)
                
            if not df.empty:
                df.index = pd.to_datetime(df.index).tz_localize(None)
                # Standardize columns to lowercase
                df.columns = [str(c).lower() for c in df.columns]
                # Fix Yahoo finance volume column
                if 'volume' in df.columns:
                    df['volume'] = df['volume'].astype(float)
            return df
        except Exception as e:
            print(f"[YF Provider] Error fetching OHLCV for {ticker}: {e}")
            return pd.DataFrame()
            
    def get_company_info(self, ticker: str) -> Dict[str, Any]:
        yf_ticker = self._format_ticker(ticker)
        try:
            stock = yf.Ticker(yf_ticker)
            info = stock.info or {}
            
            # Normalize common keys
            return {
                "name": info.get("longName", info.get("shortName", ticker)),
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "market_cap": info.get("marketCap", getattr(stock.fast_info, "market_cap", 0.0)),
                "current_price": info.get("currentPrice", info.get("regularMarketPrice", getattr(stock.fast_info, "last_price", 0.0)))
            }
        except Exception as e:
            print(f"[YF Provider] Error fetching Info for {ticker}: {e}")
            return {}

    def get_earnings_calendar(self, ticker: str) -> List[datetime]:
        yf_ticker = self._format_ticker(ticker)
        try:
            stock = yf.Ticker(yf_ticker)
            ed = stock.earnings_dates
            if ed is not None and not ed.empty:
                return pd.to_datetime(ed.index).tz_localize(None).sort_values().tolist()
        except Exception as e:
            print(f"[YF Provider] Error fetching earnings dates for {ticker}: {e}")
        return []

    def get_financials(self, ticker: str) -> pd.DataFrame:
        yf_ticker = self._format_ticker(ticker)
        try:
            stock = yf.Ticker(yf_ticker)
            inc = stock.quarterly_income_stmt
            if inc is None or inc.empty:
                inc = getattr(stock, "quarterly_financials", pd.DataFrame())
            return inc
        except Exception as e:
            print(f"[YF Provider] Error fetching financials for {ticker}: {e}")
            return pd.DataFrame()

    def get_annual_financials(self, ticker: str) -> pd.DataFrame:
        yf_ticker = self._format_ticker(ticker)
        try:
            stock = yf.Ticker(yf_ticker)
            return stock.financials
        except Exception as e:
            print(f"[YF Provider] Error fetching annual financials for {ticker}: {e}")
            return pd.DataFrame()

    def get_balance_sheet(self, ticker: str) -> pd.DataFrame:
        yf_ticker = self._format_ticker(ticker)
        try:
            stock = yf.Ticker(yf_ticker)
            return stock.balance_sheet
        except Exception as e:
            print(f"[YF Provider] Error fetching balance sheet for {ticker}: {e}")
            return pd.DataFrame()
