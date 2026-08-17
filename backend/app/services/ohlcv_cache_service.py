import logging
import pandas as pd
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.services.data_vendor_service import DataVendorService

logger = logging.getLogger(__name__)

class OHLCVCacheService:
    """
    Phase 2: Deprecated Postgres Caching Layer.
    Now acts as a simple proxy routing historical data requests to the Parquet Data Lake 
    via DataVendorService. 
    """

    def __init__(self, db: Session):
        self.db = db
        self.vendor_svc = DataVendorService(db)

    def sync_ticker(self, ticker: str, years: int = 2) -> int:
        """
        [DEPRECATED] Database sync is now handled externally by the Harvester daemon.
        """
        logger.info(f"sync_ticker called for {ticker} but is deprecated. Handled by Harvester.")
        return 0

    def get_ohlcv(self, ticker: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, as_of_date: Optional[datetime] = None) -> pd.DataFrame:
        """
        Retrieves historical OHLCV from the Parquet Data Lake.
        """
        try:
            df = self.vendor_svc.fetch_historical_ohlcv(ticker, years=5)
            
            if df.empty:
                return df
                
            if start_date:
                df = df[df.index >= pd.to_datetime(start_date).tz_localize(None)]
            if end_date:
                df = df[df.index <= pd.to_datetime(end_date).tz_localize(None)]
            if as_of_date:
                df = df[df.index <= pd.to_datetime(as_of_date).tz_localize(None)]
                
            return df
        except Exception as e:
            logger.error(f"Error reading OHLCV Data Lake for {ticker}: {e}")
            return pd.DataFrame()
