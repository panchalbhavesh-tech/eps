import pandas as pd
import numpy as np
from typing import Dict, Any

class StressTestService:
    """
    Applies historical macro-economic stress scenarios to the current portfolio.
    """
    def __init__(self, db=None):
        self.db = db
        self.scenarios = {
            "COVID_Crash": ("2020-02-19", "2020-03-23"),
            "GFC_Lehman": ("2008-09-15", "2009-03-09"),
            "Taper_Tantrum": ("2013-05-22", "2013-08-30"),
            "Demonetization_India": ("2016-11-08", "2016-12-26"),
            "ILFS_Crisis": ("2018-08-28", "2018-10-31"),
            "Adani_Hindenburg": ("2023-01-24", "2023-02-28")
        }

    def run_stress_test(self, current_portfolio_weights: Dict[str, float], historical_data: pd.DataFrame) -> Dict[str, Any]:
        """
        historical_data: DataFrame with dates as index and tickers as columns.
        """
        results = {}
        for scenario_name, (start_dt, end_dt) in self.scenarios.items():
            mask = (historical_data.index >= start_dt) & (historical_data.index <= end_dt)
            scenario_data = historical_data.loc[mask]
            
            if len(scenario_data) < 5:
                results[scenario_name] = {"status": "Insufficient Data"}
                continue
                
            rets = scenario_data.pct_change().dropna()
            if rets.empty:
                results[scenario_name] = {"status": "Insufficient Data"}
                continue
                
            # Compute portfolio returns for this scenario
            port_ret = 0.0
            for ticker, weight in current_portfolio_weights.items():
                if ticker in rets.columns:
                    ticker_cum_ret = (1 + rets[ticker]).prod() - 1
                    port_ret += ticker_cum_ret * weight
                    
            results[scenario_name] = {
                "status": "Success",
                "estimated_drawdown_pct": round(port_ret * 100.0, 2)
            }
            
        return results
