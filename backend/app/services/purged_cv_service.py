import pandas as pd
import numpy as np
from typing import List, Tuple, Generator
from sklearn.model_selection import KFold

class PurgedKFoldCV:
    """
    Implements true Purged K-Fold Cross Validation.
    Ensures that for each test set, all training samples whose prediction horizon
    overlaps with the test set are removed (purged), and applies an embargo
    after the test set to prevent leakage via serial correlation.
    """
    
    def __init__(self, n_splits: int = 5, embargo_pct: float = 0.01):
        self.n_splits = n_splits
        self.embargo_pct = embargo_pct
        
    def split(self, df: pd.DataFrame, time_col: str, horizon_days: int = 5) -> Generator[Tuple[np.ndarray, np.ndarray], None, None]:
        """
        Yields (train_indices, test_indices) just like sklearn KFold.
        """
        # Ensure sorted by time
        df = df.sort_values(by=time_col).reset_index(drop=True)
        times = df[time_col].values
        
        kf = KFold(n_splits=self.n_splits, shuffle=False)
        
        embargo_samples = max(1, int(len(df) * self.embargo_pct))
        
        for train_idx_raw, test_idx in kf.split(df):
            test_start_time = times[test_idx[0]]
            test_end_time = times[test_idx[-1]]
            
            train_idx = []
            
            for idx in train_idx_raw:
                train_time = times[idx]
                # End of this sample's horizon
                train_horizon_end = train_time + np.timedelta64(horizon_days, 'D')
                
                # Check for overlap: does train_horizon_end enter the test period?
                # Purge condition 1: Training sample label window overlaps with test start
                if train_time <= test_start_time and train_horizon_end >= test_start_time:
                    continue
                    
                # Embargo condition: Training sample is within the 5-day embargo period after test period
                if test_end_time < train_time <= (test_end_time + np.timedelta64(5, 'D')):
                    continue
                        
                train_idx.append(idx)
                
            yield np.array(train_idx), test_idx

    def cross_val_score(self, df: pd.DataFrame, feature_cols: List[str], target_col: str, time_col: str, model, metric_fn) -> List[float]:
        """
        Runs the full purged CV loop.
        """
        scores = []
        for train_idx, test_idx in self.split(df, time_col):
            if len(train_idx) < 10 or len(test_idx) < 5:
                scores.append(np.nan)
                continue
                
            X_train = df.iloc[train_idx][feature_cols].values
            y_train = df.iloc[train_idx][target_col].values
            X_test = df.iloc[test_idx][feature_cols].values
            y_test = df.iloc[test_idx][target_col].values
            
            model.fit(X_train, y_train)
            preds = model.predict_proba(X_test)[:, 1] if hasattr(model, 'predict_proba') else model.predict(X_test)
            score = metric_fn(y_test, preds)
            scores.append(score)
            
        return scores
