import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from app.services.purged_cv_service import PurgedKFoldCV

def test_purged_kfold_cv_temporal_bounding():
    """
    Test that PurgedKFoldCV correctly applies temporal bounding (embargo)
    using pandas.DatetimeIndex and drops overlapping labels.
    """
    dates = pd.date_range(start="2023-01-01", periods=100, freq="D")
    df = pd.DataFrame({
        "date_calculated": dates,
        "feature1": np.random.randn(100),
        "target": np.random.randint(0, 2, 100)
    })
    
    cv = PurgedKFoldCV(n_splits=5)
    
    for train_idx, test_idx in cv.split(df, time_col="date_calculated", horizon_days=5):
        train_dates = df.iloc[train_idx]["date_calculated"].values
        test_dates = df.iloc[test_idx]["date_calculated"].values
        
        test_start = test_dates.min()
        test_end = test_dates.max()
        
        # 1. Purging check: No training sample's label window (train_time + 5 days) should overlap with the test start
        for t_date in train_dates:
            t_horizon_end = t_date + np.timedelta64(5, 'D')
            if t_date <= test_start:
                assert t_horizon_end < test_start, "Purging failed: Training horizon overlaps with test set."
        
        # 2. Embargo check: No training sample should exist within 5 days after the test end
        embargo_end = test_end + np.timedelta64(5, 'D')
        for t_date in train_dates:
            if t_date > test_end:
                assert t_date > embargo_end, "Embargo failed: Training sample falls within the 5-day embargo period."
