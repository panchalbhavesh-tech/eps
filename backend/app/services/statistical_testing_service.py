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
        
        # Block bootstrap to preserve autocorrelation
        for _ in range(n_boot):
            idx = []
            while len(idx) < n:
                start = np.random.randint(0, max(1, n - block_size + 1))
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
        
    @staticmethod
    def pbo(returns_matrix: np.ndarray, S: int = 4) -> float:
        """
        Probability of Backtest Overfitting (PBO) via Combinatorial Symmetric Cross-Validation (CSCV).
        returns_matrix: (T, N) numpy array where T is time periods and N is number of trials/strategies.
        S: Number of partitions (must be even, typically 4 or 16).
        """
        import numpy as np
        from itertools import combinations
        import math
        
        if len(returns_matrix.shape) != 2:
            return 0.5
            
        T, N = returns_matrix.shape
        if N < 2 or T < S:
            return 0.5
            
        # 1. Partition the T rows into S submatrices
        chunk_size = T // S
        submatrices = [returns_matrix[i*chunk_size:(i+1)*chunk_size] for i in range(S)]
        
        # 2. Form Combinations of S/2 blocks for the Train set (IS)
        indices = list(range(S))
        combos = list(combinations(indices, S // 2))
        
        rank_violations = 0
        total_evals = 0
        
        for train_idx in combos:
            test_idx = [i for i in indices if i not in train_idx]
            
            # Reconstruct Train (IS) and Test (OOS) matrices
            train_returns = np.vstack([submatrices[i] for i in train_idx])
            test_returns = np.vstack([submatrices[i] for i in test_idx])
            
            # Compute Sharpe Ratios
            train_mean = np.mean(train_returns, axis=0)
            train_std = np.std(train_returns, axis=0) + 1e-8
            train_sharpe = train_mean / train_std
            
            test_mean = np.mean(test_returns, axis=0)
            test_std = np.std(test_returns, axis=0) + 1e-8
            test_sharpe = test_mean / test_std
            
            # Find the best strategy IS
            best_idx = np.argmax(train_sharpe)
            
            # Compute the rank of the IS best strategy in OOS
            oos_rank = np.argsort(test_sharpe)
            best_oos_rank_pct = np.where(oos_rank == best_idx)[0][0] / max(1, N - 1)
            
            # Logit rank
            with np.errstate(divide='ignore', invalid='ignore'):
                if best_oos_rank_pct <= 0:
                    logit = -np.inf
                elif best_oos_rank_pct >= 1:
                    logit = np.inf
                else:
                    logit = math.log(best_oos_rank_pct / (1.0 - best_oos_rank_pct))
                    
            if logit < 0:
                rank_violations += 1
            total_evals += 1
            
        if total_evals == 0:
            return 0.5
            
        return float(rank_violations / total_evals)
