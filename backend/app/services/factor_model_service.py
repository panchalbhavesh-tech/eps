import pandas as pd
import numpy as np
import statsmodels.api as sm
from typing import Dict, Any, List

class FamaFrenchService:
    def __init__(self):
        pass
        
    def self_compute_ff3_factors(self, nifty_df: pd.DataFrame, smallcap_df: pd.DataFrame, value_df: pd.DataFrame, growth_df: pd.DataFrame, tbill_yield: float = 0.065) -> pd.DataFrame:
        """
        Computes Fama-French 3-Factor Model daily returns for the Indian Market.
        nifty_df: Nifty 50 (Proxy for Market)
        smallcap_df: Nifty Smallcap 250 (Proxy for Small)
        value_df: Nifty500 Value 50
        growth_df: Nifty500 Momentum/Growth
        tbill_yield: 91-day T-bill annualized yield (default ~6.5%)
        """
        # Align dates
        dfs = [nifty_df, smallcap_df, value_df, growth_df]
        for df in dfs:
            if 'Close' not in df.columns:
                raise ValueError("DataFrames must contain 'Close' price column.")
        
        # Calculate daily returns
        mkt_ret = nifty_df['Close'].pct_change()
        smc_ret = smallcap_df['Close'].pct_change()
        val_ret = value_df['Close'].pct_change()
        gro_ret = growth_df['Close'].pct_change()
        
        # Daily Risk-Free Rate
        rf_daily = tbill_yield / 252.0
        
        # MKT-RF
        mkt_rf = mkt_ret - rf_daily
        
        # SMB (Small Minus Big) - Proxy using Smallcap vs Nifty 50
        smb = smc_ret - mkt_ret
        
        # HML (High Minus Low) - Proxy using Value vs Growth
        hml = val_ret - gro_ret
        
        factors = pd.DataFrame({
            'mkt_rf': mkt_rf,
            'smb': smb,
            'hml': hml,
            'rf': rf_daily
        }).dropna()
        
        return factors

    def estimate_betas(self, ticker_returns: pd.Series, ff3_factors: pd.DataFrame, window: int = 252) -> Dict[str, float]:
        """
        Estimates the Fama-French 3-Factor betas (beta_mkt, beta_smb, beta_hml) and alpha using OLS.
        """
        # Align series
        aligned = pd.concat([ticker_returns, ff3_factors], axis=1).dropna()
        if len(aligned) < 30:
            return {"alpha": 0.0, "beta_mkt": 1.0, "beta_smb": 0.0, "beta_hml": 0.0, "r_squared": 0.0}
            
        y = aligned.iloc[:, 0] - aligned['rf'] # Excess return of ticker
        X = aligned[['mkt_rf', 'smb', 'hml']]
        X = sm.add_constant(X)
        
        model = sm.OLS(y, X).fit()
        
        return {
            "alpha": model.params.get('const', 0.0),
            "beta_mkt": model.params.get('mkt_rf', 1.0),
            "beta_smb": model.params.get('smb', 0.0),
            "beta_hml": model.params.get('hml', 0.0),
            "r_squared": model.rsquared
        }
        
    def compute_abnormal_return(self, actual_ret: float, rf_daily: float, mkt_rf: float, smb: float, hml: float, betas: Dict[str, float]) -> float:
        """
        Computes Abnormal Return (AR) = Actual Return - Expected Return
        Expected Return = RF + (Beta_MKT * MKT_RF) + (Beta_SMB * SMB) + (Beta_HML * HML)
        """
        expected_ret = rf_daily + (betas.get('beta_mkt', 1.0) * mkt_rf) + (betas.get('beta_smb', 0.0) * smb) + (betas.get('beta_hml', 0.0) * hml)
        return actual_ret - expected_ret

    def compute_car(self, abnormal_returns_series: pd.Series, estimation_window_std: float, pre_window: int = 7, post_window: int = 30) -> Dict[str, float]:
        """
        Computes Cumulative Abnormal Return (CAR) and Patell Z-test p-value.
        abnormal_returns_series should be aligned such that index 0 is the event date.
        """
        if abnormal_returns_series.empty:
            return {"car": 0.0, "pvalue": 1.0}
            
        car = abnormal_returns_series.sum()
        
        # Patell Z-test simplification (assume ARs are roughly normal and independent)
        # Z = CAR / sqrt(N * variance(AR_estimation_window))
        n_days = len(abnormal_returns_series)
        ar_std = estimation_window_std
        
        if ar_std > 0 and n_days > 0:
            z_stat = car / (np.sqrt(n_days) * ar_std)
            from scipy.stats import norm
            p_val = 2 * (1 - norm.cdf(abs(z_stat)))
        else:
            p_val = 1.0
            
        return {
            "car": car,
            "pvalue": p_val
        }
