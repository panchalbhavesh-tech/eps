import pandas as pd
import numpy as np
from typing import List, Tuple, Generator
from sklearn.model_selection import KFold

class PurgedWalkForwardCV:
    """
    Implements Walk-Forward Cross Validation with an embargo.
    While extremely robust against lookahead bias (as it uses an expanding window),
    this is distinct from Combinatorial Purged K-Fold which samples future data relative to the test fold.
    """
    
    def __init__(self, n_splits: int = 5, embargo_pct: float = 0.01):
        self.n_splits = n_splits
        self.embargo_pct = embargo_pct
        
    def split(self, df: pd.DataFrame, time_col: str, horizon_days: int = 5) -> Generator[Tuple[np.ndarray, np.ndarray], None, None]:
        """
        Yields (train_indices, test_indices) using an expanding walk-forward split.
        Ensures that training sets only ever contain data chronologically prior to the test set,
        and applies an embargo before the test set to prevent leakage via serial correlation.
        """
        # Ensure sorted by time
        df = df.sort_values(by=time_col).reset_index(drop=True)
        n = len(df)
        min_train = max(50, n // 4)
        if self.n_splits <= 0 or n <= min_train:
            return
            
        fold_size = (n - min_train) // self.n_splits
        embargo = horizon_days * 2
        
        for i in range(self.n_splits):
            test_start = min_train + i * fold_size
            test_end = min(test_start + fold_size, n)
            train_end = test_start - horizon_days - embargo
            
            if train_end < 20:
                continue
            
            train_idx = np.arange(0, train_end)
            test_idx = np.arange(test_start, test_end)
            yield train_idx, test_idx

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
            
            if hasattr(model, 'predict_proba'):
                # Handle multi-class (e.g. -1, 0, 1) by finding index of class 1
                if hasattr(model, 'classes_') and 1 in model.classes_:
                    pos_idx = np.where(model.classes_ == 1)[0][0]
                    preds = model.predict_proba(X_test)[:, pos_idx]
                else:
                    preds = model.predict_proba(X_test)[:, -1] # Default to last class
            else:
                preds = model.predict(X_test)
                
            # If multi-class, convert y_test to binary (1 vs rest) for scoring (like ROC AUC)
            if len(np.unique(y_test)) > 2:
                y_test_bin = (y_test == 1).astype(int)
                score = metric_fn(y_test_bin, preds)
            else:
                score = metric_fn(y_test, preds)
                
            scores.append(score)
            
        return scores
