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
        
        n = len(data)
        block_size = max(5, int(n ** (1/3)))
        rng = np.random.RandomState(42)
        
        # Block bootstrap to preserve autocorrelation
        for _ in range(n_boot):
            idx = []
            while len(idx) < n:
                start = rng.randint(0, max(1, n - block_size + 1))
                idx.extend(range(start, start + block_size))
            sample = data[np.array(idx[:n])]
            boot_stats.append(metric_fn(sample))
            
        alpha = 1.0 - ci
        lower_bound = float(np.percentile(boot_stats, (alpha / 2.0) * 100))
        upper_bound = float(np.percentile(boot_stats, (1.0 - (alpha / 2.0)) * 100))
        
        return {
            "point": point_estimate,
            "ci_lower": lower_bound,
            "ci_upper": upper_bound,
            "boot_stats": boot_stats
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
        # Proportion of block bootstrap samples <= 0
        if len(returns) < 2:
            res["pvalue"] = 1.0
        else:
            boot_samples = res.get("boot_stats", [])
            p_val = np.mean(np.array(boot_samples) <= 0.0) if boot_samples else 1.0
            res["pvalue"] = float(p_val)
            
        # Clean up boot_stats from result
        res.pop("boot_stats", None)
            
        return res

    @staticmethod
    def patell_z(car: float, ar_std: float, window_len: int, n_est: int, mkt_event: np.ndarray = None, mkt_mean_est: float = 0.0, mkt_var_sum: float = 1.0) -> Dict[str, float]:
        """
        Computes the Patell Z-statistic and p-value for cumulative abnormal returns.
        """
        import numpy as np
        from scipy.stats import norm
        
        event_adj = 0.0
        if mkt_event is not None and mkt_var_sum > 0:
            event_adj = sum((rm - mkt_mean_est)**2 / mkt_var_sum for rm in mkt_event)
            
        adj_factor = np.sqrt(window_len * (1 + 1/max(1, n_est)) + event_adj)
        
        if ar_std > 0 and adj_factor > 0:
            z_stat = car / (adj_factor * ar_std)
            p_val = 2 * (1 - norm.cdf(abs(z_stat)))
            return {"z_stat": float(z_stat), "p_value": float(p_val)}
        return {"z_stat": 0.0, "p_value": 1.0}

