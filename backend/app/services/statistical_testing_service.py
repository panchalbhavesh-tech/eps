import numpy as np
from typing import Dict, Any, Callable

class StatisticalTestingService:
    
    @staticmethod
    def bootstrap_ci(data: np.ndarray, metric_fn: Callable, n_boot: int = 1000, ci: float = 0.95) -> Dict[str, float]:
        """
        Generic bootstrap confidence interval for any metric function.
        Returns point estimate, lower CI, and upper CI.
        """
        if len(data) < 2:
            point = metric_fn(data)
            return {"point": point, "ci_lower": point, "ci_upper": point}
            
        point_estimate = metric_fn(data)
        boot_stats = []
        
        # Simple random sampling with replacement
        for _ in range(n_boot):
            sample = np.random.choice(data, size=len(data), replace=True)
            boot_stats.append(metric_fn(sample))
            
        alpha = 1.0 - ci
        lower_bound = float(np.percentile(boot_stats, (alpha / 2.0) * 100))
        upper_bound = float(np.percentile(boot_stats, (1.0 - (alpha / 2.0)) * 100))
        
        return {
            "point": point_estimate,
            "ci_lower": lower_bound,
            "ci_upper": upper_bound
        }

    @staticmethod
    def sharpe_ci(returns: np.ndarray, n_boot: int = 1000, periods_per_year: float = 252.0) -> Dict[str, float]:
        """
        Bootstrap CI specifically for Annualized Sharpe Ratio.
        Assumes returns are already excess returns (Returns - RF).
        """
        def _sharpe_calc(ret_array):
            std = np.std(ret_array)
            if std < 1e-6:
                return 0.0
            return (np.mean(ret_array) / std) * np.sqrt(periods_per_year)
            
        res = StatisticalTestingService.bootstrap_ci(returns, _sharpe_calc, n_boot=n_boot)
        
        # Calculate naive p-value (H0: Sharpe <= 0)
        # Proportion of bootstrap samples <= 0
        if len(returns) < 2:
            res["pvalue"] = 1.0
        else:
            boot_samples = []
            for _ in range(n_boot):
                s = np.random.choice(returns, size=len(returns), replace=True)
                boot_samples.append(_sharpe_calc(s))
            p_val = np.mean(np.array(boot_samples) <= 0.0)
            res["pvalue"] = float(p_val)
            
        return res

    @staticmethod
    def patell_z(abnormal_returns: np.ndarray, estimation_variances: np.ndarray) -> float:
        """
        For event study CAR significance (simplified).
        """
        pass
        
    @staticmethod
    def pbo(sharpe_is_matrix: np.ndarray, n_combinations: int = 16) -> float:
        """
        Probability of Backtest Overfitting (Bailey et al. 2014) - Placeholder.
        """
        pass
