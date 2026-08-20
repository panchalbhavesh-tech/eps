import pandas as pd
import numpy as np
from typing import Dict, Any
from sklearn.linear_model import ElasticNetCV
from sklearn.preprocessing import StandardScaler
import json
import os

WEIGHTS_FILE = os.path.join(os.path.dirname(__file__), "learned_weights.json")

class WeightLearningService:
    """
    Learns dynamic factor weights using Elastic Net regression
    instead of relying on hardcoded heuristics.
    """
    
    DEFAULT_WEIGHTS = {
        'technical_score': 0.35,
        'fundamental_score': 0.25,
        'smart_money_score': 0.15,
        'regime_score': 0.15,
        'derivatives_score': 0.10
    }
    
    def __init__(self, db=None):
        self.db = db
        
    def learn_weights(self, factor_scores_df: pd.DataFrame, forward_returns: np.ndarray) -> Dict[str, float]:
        """
        Learns non-negative weights that sum to 1 using Elastic Net with CV.
        factor_scores_df: DataFrame of the 5 factor scores.
        forward_returns: 1D array of forward realized returns.
        """
        if factor_scores_df.empty or len(factor_scores_df) < 50:
            return self.DEFAULT_WEIGHTS
            
        features = list(self.DEFAULT_WEIGHTS.keys())
        X = factor_scores_df[features].fillna(50.0).values
        y = forward_returns
        
        from sklearn.pipeline import Pipeline
        from sklearn.model_selection import KFold
        from sklearn.linear_model import ElasticNetCV
        
        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('enet', ElasticNetCV(l1_ratio=[0.1, 0.5, 0.7, 0.9, 0.95, 0.99, 1.0], 
                                  cv=KFold(n_splits=5, shuffle=False),
                                  positive=True, n_jobs=-1, random_state=42))
        ])
        
        pipeline.fit(X, y)
        coefs = pipeline.named_steps['enet'].coef_
        sum_coef = np.sum(coefs)
        
        if sum_coef > 0:
            normalized_weights = coefs / sum_coef
            learned = {features[i]: float(normalized_weights[i]) for i in range(len(features))}
            
            # Save to disk
            try:
                with open(WEIGHTS_FILE, 'w') as f:
                    json.dump(learned, f)
            except Exception as e:
                print(f"Error saving learned weights: {e}")
                
            return learned
        else:
            return self.DEFAULT_WEIGHTS
            
    def load_weights(self) -> Dict[str, float]:
        """
        Loads the latest learned weights from disk, or returns default if not found.
        """
        if os.path.exists(WEIGHTS_FILE):
            try:
                with open(WEIGHTS_FILE, 'r') as f:
                    weights = json.load(f)
                    # Verify all keys exist
                    for k in self.DEFAULT_WEIGHTS.keys():
                        if k not in weights:
                            return self.DEFAULT_WEIGHTS
                    return weights
            except:
                return self.DEFAULT_WEIGHTS
        return self.DEFAULT_WEIGHTS
