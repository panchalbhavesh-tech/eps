import pandas as pd
import numpy as np
from scipy.cluster.hierarchy import linkage
from scipy.spatial.distance import squareform
from typing import List, Dict, Any

class PortfolioConstructionService:
    """
    Implements advanced portfolio construction methodologies like
    Hierarchical Risk Parity (HRP) and dynamic sector constraints.
    """
    
    def __init__(self, db=None):
        self.db = db

    def get_hrp_weights(self, cov_matrix: pd.DataFrame) -> pd.Series:
        """
        Calculates Hierarchical Risk Parity (HRP) weights from a covariance matrix.
        Using Marcos Lopez de Prado's algorithm.
        """
        corr = self._cov_to_corr(cov_matrix)
        dist = np.sqrt(0.5 * (1 - corr).clip(0, 2))
        link = linkage(squareform(dist.values), method='single')
        sort_ix = self._get_quasi_diag(link)
        sort_ix = corr.index[sort_ix].tolist()
        df0 = corr.loc[sort_ix, sort_ix]
        
        hrp_weights = self._get_rec_bipart(cov_matrix, sort_ix)
        return hrp_weights

    def apply_sector_constraints(self, weights: pd.Series, sector_mapping: Dict[str, str], max_sector_weight: float = 0.25) -> pd.Series:
        """
        Dynamically bounds weights so no sector exceeds max_sector_weight.
        Redistributes excess weight proportionally to non-capped sectors.
        """
        if weights.empty:
            return weights
            
        w = weights.copy()
        sectors = pd.Series(sector_mapping)
        
        while True:
            sector_weights = w.groupby(sectors).sum()
            violating_sectors = sector_weights[sector_weights > max_sector_weight + 1e-5].index
            
            if len(violating_sectors) == 0:
                break
                
            for s in violating_sectors:
                # Cap the stocks in this sector
                stocks_in_sector = w.index[sectors == s].intersection(w.index)
                if len(stocks_in_sector) > 0:
                    w[stocks_in_sector] = w[stocks_in_sector] * (max_sector_weight / sector_weights[s])
                    
            # Normalize the rest
            non_violating_stocks = w.index[~sectors.isin(violating_sectors)].intersection(w.index)
            if len(non_violating_stocks) == 0:
                break # Can't redistribute if everything is violating (unlikely unless few sectors)
                
            current_sum = w.sum()
            if current_sum < 1.0:
                shortfall = 1.0 - current_sum
                w[non_violating_stocks] += (w[non_violating_stocks] / w[non_violating_stocks].sum()) * shortfall
                
        return w

    # --- HRP Helper Methods ---
    def _cov_to_corr(self, cov: pd.DataFrame) -> pd.DataFrame:
        v = np.sqrt(np.diag(cov))
        outer_v = np.outer(v, v)
        corr = cov / outer_v
        corr[cov == 0] = 0
        return corr
        
    def _get_quasi_diag(self, link: np.ndarray) -> List[int]:
        link = link.astype(int)
        sort_ix = pd.Series([link[-1, 0], link[-1, 1]])
        num_items = link[-1, 3]
        while sort_ix.max() >= num_items:
            sort_ix.index = range(0, sort_ix.shape[0] * 2, 2)
            df0 = sort_ix[sort_ix >= num_items]
            i = df0.index
            j = df0.values - num_items
            sort_ix[i] = link[j, 0]
            df0 = pd.Series(link[j, 1], index=i + 1)
            sort_ix = pd.concat([sort_ix, df0])
            sort_ix = sort_ix.sort_index()
            sort_ix.index = range(sort_ix.shape[0])
        return sort_ix.tolist()
        
    def _get_rec_bipart(self, cov: pd.DataFrame, sort_ix: List[str]) -> pd.Series:
        w = pd.Series(1, index=sort_ix)
        c_items = [sort_ix]
        while len(c_items) > 0:
            c_items = [i[j:k] for i in c_items for j, k in ((0, len(i) // 2), (len(i) // 2, len(i))) if len(i) > 1]
            for i in range(0, len(c_items), 2):
                c_items0 = c_items[i]
                c_items1 = c_items[i + 1]
                c_var0 = self._get_cluster_var(cov, c_items0)
                c_var1 = self._get_cluster_var(cov, c_items1)
                alpha = 1 - c_var0 / (c_var0 + c_var1)
                w[c_items0] *= alpha
                w[c_items1] *= 1 - alpha
        return w
        
    def _get_cluster_var(self, cov: pd.DataFrame, c_items: List[str]) -> float:
        cov_ = cov.loc[c_items, c_items]
        w_ = self._get_ivp(cov_).reshape(-1, 1)
        c_var = np.dot(np.dot(w_.T, cov_), w_)[0, 0]
        return c_var
        
    def _get_ivp(self, cov: pd.DataFrame) -> np.ndarray:
        ivp = 1. / np.diag(cov)
        ivp /= ivp.sum()
        return ivp
