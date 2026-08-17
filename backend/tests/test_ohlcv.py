import pytest
from app.services.ohlcv_cache_service import OHLCVCacheService
from unittest.mock import MagicMock
import pandas as pd
from datetime import datetime

def test_ohlcv_no_lookahead_bias():
    """
    Ensures OHLCVCacheService never returns future data for a given point-in-time request.
    This guarantees zero lookahead bias during Machine Learning cross-validation.
    """
    mock_db = MagicMock()
    service = OHLCVCacheService(mock_db)
    
    # Mock data vendor fetching (which now hits the Parquet Data Lake)
    mock_vendor = MagicMock()
    service.vendor_svc = mock_vendor
    
    # Create fake OHLCV data extending into the future
    dates = pd.date_range(start="2024-01-01", end="2024-01-10", freq="B")
    mock_data = pd.DataFrame({
        "Open": [100 + i for i in range(len(dates))],
        "High": [105 + i for i in range(len(dates))],
        "Low": [95 + i for i in range(len(dates))],
        "Close": [102 + i for i in range(len(dates))],
        "Volume": [1000 * i for i in range(len(dates))]
    }, index=dates)
    
    mock_vendor.fetch_historical_ohlcv.return_value = mock_data
    
    # Request data as of 2024-01-05
    as_of = pd.to_datetime("2024-01-05")
    df_filtered = service.get_ohlcv("RELIANCE", as_of_date=as_of)
    
    # Ensure no dates after 2024-01-05 are returned
    assert not df_filtered.empty
    assert df_filtered.index.max() <= as_of
    assert len(df_filtered) == 5  # Jan 1 to Jan 5 (5 business days)
