import pandas as pd
import numpy as np
import statsmodels.api as sm
from typing import Dict, Any, List

class FactorAttributionService:
    """
    Decomposes portfolio returns into systematic factor exposures (Fama-French)
    and idiosyncratic alpha.
    """
    def __init__(self, db):
        self.db = db
        
    def decompose_portfolio_returns(self, portfolio_returns: pd.Series, factor_returns: pd.DataFrame) -> Dict[str, Any]:
        """
        Runs OLS regression on portfolio returns against known factor returns.
        factor_returns should contain columns like Mkt-RF, SMB, HML, MOM.
        """
        if portfolio_returns.empty or factor_returns.empty:
            return {}
            
        aligned = pd.concat([portfolio_returns, factor_returns], axis=1, join='inner').dropna()
        if len(aligned) < 30:
            return {"error": "Insufficient data for factor attribution"}
            
        y = aligned.iloc[:, 0]
        X = sm.add_constant(aligned.iloc[:, 1:])
        
        model = sm.OLS(y, X).fit()
        
        exposures = {col: round(model.params[col], 3) for col in X.columns if col != 'const'}
        tstats = {col: round(model.tvalues[col], 2) for col in X.columns if col != 'const'}
        
        alpha_annualized = model.params['const'] * 252
        
        return {
            "alpha_annualized": round(alpha_annualized, 4),
            "alpha_tstat": round(model.tvalues['const'], 2),
            "r_squared": round(model.rsquared, 3),
            "exposures": exposures,
            "tstats": tstats,
            "tracking_error": round(model.resid.std() * np.sqrt(252), 4)
        }
