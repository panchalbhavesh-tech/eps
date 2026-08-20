from abc import ABC, abstractmethod
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any

class BaseDataProvider(ABC):
    """
    Abstract contract for market data vendors.
    """
    @abstractmethod
    def get_ohlcv(self, ticker: str, start_date: datetime = None, end_date: datetime = None, days: int = 365) -> pd.DataFrame:
        """
        Fetch historical daily OHLCV.
        Must return DataFrame indexed by tz-naive Date with columns: [open, high, low, close, volume]
        """
        pass

    @abstractmethod
    def get_company_info(self, ticker: str) -> Dict[str, Any]:
        """
        Fetch company metadata (sector, industry, market_cap, name, current_price, etc.)
        """
        pass

    @abstractmethod
    def get_earnings_calendar(self, ticker: str) -> List[datetime]:
        """
        Fetch sorted list of historical earnings dates.
        """
        pass

    @abstractmethod
    def get_financials(self, ticker: str) -> pd.DataFrame:
        """
        Fetch quarterly financials.
        """
        pass

    @abstractmethod
    def get_annual_financials(self, ticker: str) -> pd.DataFrame:
        """
        Fetch annual financials.
        """
        pass

    @abstractmethod
    def get_balance_sheet(self, ticker: str) -> pd.DataFrame:
        """
        Fetch annual balance sheet.
        """
        pass
