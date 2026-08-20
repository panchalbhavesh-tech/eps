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


