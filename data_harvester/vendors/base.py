from abc import ABC, abstractmethod
import pandas as pd
from typing import List, Dict, Any

class DataProvider(ABC):
    """
    Abstract contract for market data vendors.
    Decouples the Harvester from the specific vendor API.
    """
    
    @abstractmethod
    def fetch_historical_ohlcv(self, ticker: str, days: int = 365) -> pd.DataFrame:
        """
        Fetch historical daily OHLCV for a single ticker.
        Returns a DataFrame with columns: Date, Open, High, Low, Close, Volume.
        """
        pass
        
    @abstractmethod
    def fetch_bulk_market_quotes(self, tickers: List[str]) -> List[Dict[str, Any]]:
        """
        Fetch the latest live quotes (LTP, Volume) for a list of tickers.
        Returns a list of dictionaries.
        """
        pass
        
    @abstractmethod
    def fetch_derivatives_data(self, ticker: str) -> Dict[str, Any]:
        """
        Fetch derivatives data (OI, PCR, Max Pain) if available.
        """
        pass
