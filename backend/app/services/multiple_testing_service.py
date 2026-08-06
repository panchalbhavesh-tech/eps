import numpy as np
import pandas as pd
from typing import List, Dict, Tuple
from scipy.stats import norm

class MultipleTestingService:
    """
    Implements advanced Multiple Testing Corrections (MTC) to prevent
    false positive strategy discoveries (Type I errors) due to data mining.
    """
    
    @staticmethod
    def benjamini_hochberg_fdr(p_values: np.ndarray, alpha: float = 0.05) -> np.ndarray:
        """
        Benjamini-Hochberg False Discovery Rate control.
        Returns boolean array where True means the null hypothesis is rejected (significant).
        """
        m = len(p_values)
        if m == 0:
            return np.array([], dtype=bool)
            
        sorted_indices = np.argsort(p_values)
        sorted_p = p_values[sorted_indices]
        
        # BH critical values: (i / m) * alpha
        bh_critical = (np.arange(1, m + 1) / m) * alpha
        
        # Find largest k such that p(k) <= critical(k)
        significant = sorted_p <= bh_critical
        if not np.any(significant):
            return np.zeros(m, dtype=bool)
            
        k = np.max(np.where(significant)[0])
        
        # All p-values smaller than or equal to the k-th p-value are rejected
        reject = np.zeros(m, dtype=bool)
        reject[sorted_indices[:k+1]] = True
        return reject

    @staticmethod
    def whites_reality_check(base_returns: np.ndarray, benchmark_returns: np.ndarray, n_boot: int = 1000) -> float:
        """
        White's Reality Check for data snooping bias (simplified).
        Tests if the best model is significantly better than a benchmark.
        Returns the p-value.
        """
        if len(base_returns) < 10 or len(benchmark_returns) < 10:
            return 1.0
            
        actual_diff = np.mean(base_returns) - np.mean(benchmark_returns)
        if actual_diff <= 0:
            return 1.0
            
        # Combine and center for null hypothesis
        centered_base = base_returns - np.mean(base_returns) + np.mean(benchmark_returns)
        
        count_exceed = 0
        n = len(base_returns)
        block_size = max(5, int(n ** (1/3)))
        
        for _ in range(n_boot):
            # Implement block bootstrap to preserve autocorrelation
            idx = []
            while len(idx) < n:
                start = np.random.randint(0, max(1, n - block_size + 1))
                idx.extend(range(start, start + block_size))
            idx = np.array(idx[:n])
            
            boot_diff = np.mean(centered_base[idx]) - np.mean(benchmark_returns[idx])
            if boot_diff >= actual_diff:
                count_exceed += 1
                
        return count_exceed / n_boot

    @staticmethod
    def superior_predictive_ability(returns_matrix: np.ndarray, benchmark_returns: np.ndarray, n_boot: int = 1000) -> float:
        """
        Hansen's Superior Predictive Ability (SPA) Test.
        returns_matrix: shape (N_models, T_periods)
        benchmark_returns: shape (T_periods,)
        Returns p-value for the null hypothesis that the benchmark is not inferior to any model.
        """
        if len(returns_matrix) == 0:
            return 1.0
            
        N_models, T = returns_matrix.shape
        if T < 10 or len(benchmark_returns) != T:
            return 1.0
            
        d_k = returns_matrix - benchmark_returns # shape (N_models, T)
        mean_d = np.mean(d_k, axis=1) # shape (N_models,)
        d_std = np.std(d_k, axis=1, ddof=1)
        d_std[d_std == 0] = 1e-8
        
        actual_t_stat = np.max(np.sqrt(T) * mean_d / d_std)
        
        if actual_t_stat <= 0:
            return 1.0
            
        # Center the differentials to enforce null hypothesis
        # SPA uses a threshold logic for centering. We use the conservative approach:
        centered_d = d_k - mean_d[:, np.newaxis] * (mean_d > 0)[:, np.newaxis]
        
        count_exceed = 0
        block_size = max(5, int(T ** (1/3)))
        
        for _ in range(n_boot):
            idx = []
            while len(idx) < T:
                start = np.random.randint(0, max(1, T - block_size + 1))
                idx.extend(range(start, start + block_size))
            idx = np.array(idx[:T])
            
            boot_d = centered_d[:, idx]
            boot_mean_d = np.mean(boot_d, axis=1)
            boot_d_std = np.std(boot_d, axis=1, ddof=1)
            boot_d_std[boot_d_std == 0] = 1e-8
            
            boot_t_stat = np.max(np.sqrt(T) * boot_mean_d / boot_d_std)
            
            if boot_t_stat >= actual_t_stat:
                count_exceed += 1
                
        return count_exceed / n_boot
