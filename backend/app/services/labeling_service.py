import pandas as pd
import numpy as np

class TripleBarrierLabeler:
    """
    Implements Marcos Lopez de Prado's Triple-Barrier Method for labeling financial data.
    Provides +1 (profit target hit), -1 (stop loss hit), or 0 (timeout / vertical barrier hit).
    """
    
    def __init__(self, pt_pct: float = 2.0, sl_pct: float = -2.0, max_days: int = 10):
        self.pt_pct = pt_pct / 100.0
        self.sl_pct = sl_pct / 100.0
        self.max_days = max_days
        
    def label(self, df: pd.DataFrame, entry_indices: list) -> pd.Series:
        """
        Computes the barrier hits for a list of entry indices (row numbers).
        df must contain 'Close', 'High', 'Low' columns.
        Returns a Series of labels indexed by the entry_indices.
        """
        labels = pd.Series(index=entry_indices, dtype=int)
        
        for idx in entry_indices:
            if idx >= len(df) - 1:
                labels.loc[idx] = 0
                continue
                
            # Neutralize Close-to-Close lookahead leakage by using Next-Day MOO execution
            if idx + 1 >= len(df):
                labels.loc[idx] = 0
                continue
                
            entry_price = df['open'].iloc[idx + 1]
            if pd.isna(entry_price) or entry_price <= 0:
                labels.loc[idx] = 0
                continue
                
            # Vertical barrier (max_days)
            end_idx = min(idx + self.max_days, len(df) - 1)
            window = df.iloc[idx + 1: end_idx + 1]
            
            label = 0 # Default timeout
            
            for i in range(len(window)):
                high = window['high'].iloc[i]
                low = window['low'].iloc[i]
                close = window['close'].iloc[i]
                
                # Check Stop Loss (Lower Barrier)
                if (low - entry_price) / entry_price <= self.sl_pct:
                    label = -1
                    break
                    
                # Check Profit Target (Upper Barrier)
                if (high - entry_price) / entry_price >= self.pt_pct:
                    label = 1 # 1 for success
                    break
                    
                # If neither hit, continue to next day. If we reach end of window, label remains 0
                
            labels.loc[idx] = label
            
        return labels
