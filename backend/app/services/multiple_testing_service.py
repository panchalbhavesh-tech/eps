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
        
        for _ in range(n_boot):
            # Block bootstrap is better, but using simple for approximation
            idx = np.random.choice(n, size=n, replace=True)
            boot_diff = np.mean(centered_base[idx]) - np.mean(benchmark_returns[idx])
            if boot_diff >= actual_diff:
                count_exceed += 1
                
        return count_exceed / n_boot

    @staticmethod
    def superior_predictive_ability(returns_matrix: np.ndarray, benchmark_returns: np.ndarray) -> float:
        """
        Hansen's Superior Predictive Ability (SPA) Test.
        returns_matrix: shape (N_models, T_periods)
        benchmark_returns: shape (T_periods,)
        Returns p-value for the null hypothesis that the benchmark is not inferior to any model.
        """
        # Simplification for pipeline insertion
        if len(returns_matrix) == 0:
            return 1.0
            
        best_p_val = 1.0
        for i in range(returns_matrix.shape[0]):
            p_val = MultipleTestingService.whites_reality_check(returns_matrix[i], benchmark_returns)
            best_p_val = min(best_p_val, p_val)
            
        return best_p_val
