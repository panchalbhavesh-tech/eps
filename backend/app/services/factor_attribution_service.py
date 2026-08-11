import os
import pandas as pd
import yfinance as yf
from datetime import datetime
from typing import Optional

class FactorAttributionService:
    """
    Constructs an India-specific Fama-French proxy using NSE indices:
    Mkt-RF: Nifty 50 (^NSEI) minus Risk Free Rate (6.5% annual approx)
    SMB: Nifty Smallcap 100 (^CNXSC) minus Nifty 50 (^NSEI)
    
    IMPORTANT LIMITATION (HML - Value Factor):
    This system is currently constrained to a 2-factor model (Market + SMB). 
    HML is approximated as 0.0 due to the unavailability of a reliable daily Value (HML) 
    index for the Indian equities market via free data sources (like yfinance).
    True 3-factor or 5-factor attribution requires a premium institutional data feed.
    """
    def __init__(self):
        self.cache_dir = "/tmp/ff3_cache"
        os.makedirs(self.cache_dir, exist_ok=True)
        self.cache_file = os.path.join(self.cache_dir, "nse_factors.csv")

    def _build_nse_factors(self, start_date, end_date) -> Optional[pd.DataFrame]:
        try:
            print("Constructing India-specific Fama-French proxy factors...")
            tickers = ["^NSEI", "^CNXSC"]
            df_prices = yf.download(tickers, start=start_date, end=end_date, progress=False)['Close']
            
            if df_prices.empty or "^NSEI" not in df_prices.columns:
                return None
                
            returns = df_prices.pct_change().dropna() * 100.0 # Convert to percentage
            
            ff_df = pd.DataFrame(index=returns.index)
            # Risk free rate proxy ~ 6.5% annual -> daily is ~ 0.025%
            rf_daily = 6.5 / 252.0
            
            ff_df['Mkt_RF'] = returns['^NSEI'] - rf_daily
            
            if "^CNXSC" in returns.columns:
                ff_df['SMB'] = returns['^CNXSC'] - returns['^NSEI']
            else:
                ff_df['SMB'] = 0.0
                
            # HML is hard to proxy without a dedicated Value index on yf.
            # We will return 0.0 for HML for now, as Mkt and SMB capture most of the variance.
            ff_df['HML'] = 0.0
            ff_df['RF'] = rf_daily
            
            ff_df.index.name = 'Date'
            ff_df.to_csv(self.cache_file)
            return ff_df
        except Exception as e:
            print(f"Error building NSE factors: {e}")
            return None

    def get_factors(self, start_date: datetime, end_date: datetime) -> pd.DataFrame:
        """
        Retrieves the FF factors (Mkt_RF, SMB, HML, RF) for the specified date range.
        Returns a DataFrame indexed by Date with daily percentage returns.
        """
        df = pd.DataFrame()
        if os.path.exists(self.cache_file):
            mod_time = datetime.fromtimestamp(os.path.getmtime(self.cache_file))
            if (datetime.now() - mod_time).days < 1:
                try:
                    df = pd.read_csv(self.cache_file, parse_dates=['Date'], index_col='Date')
                except Exception:
                    pass
                    
        if df.empty:
            pad_start = pd.to_datetime(start_date) - pd.Timedelta(days=10)
            df = self._build_nse_factors(pad_start, pd.to_datetime(end_date) + pd.Timedelta(days=1))
            
        if df is not None and not df.empty:
            mask = (df.index >= pd.to_datetime(start_date)) & (df.index <= pd.to_datetime(end_date))
            result = df.loc[mask]
            return result
            
        return pd.DataFrame()
