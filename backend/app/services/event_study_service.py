import pandas as pd
import yfinance as yf
from typing import Dict, Any
from datetime import datetime, timedelta

class EventStudyService:
    def __init__(self):
        pass

    def calculate_event_study(self, df: pd.DataFrame, report_date: str, ticker: str = None) -> Dict[str, Any]:
        rd = pd.to_datetime(report_date).tz_localize(None)
        
        future_df = df[df.index >= rd]
        if future_df.empty:
            return {}
            
        result_day_idx = future_df.index[0]
        iloc_idx = df.index.get_loc(result_day_idx)
        
        if iloc_idx == 0:
            return {}
            
        prev_day = df.iloc[iloc_idx - 1]
        res_day = df.iloc[iloc_idx]
        
        gap_pct = ((res_day['Open'] - prev_day['Close']) / prev_day['Close']) * 100
        intraday_pct = ((res_day['Close'] - res_day['Open']) / res_day['Open']) * 100
        vol_change = ((res_day['Volume'] - prev_day['Volume']) / prev_day['Volume']) * 100 if prev_day['Volume'] > 0 else 0
        
        # Simple Raw Returns
        def get_return(days: int):
            if iloc_idx + days < len(df):
                future_day = df.iloc[iloc_idx + days]
                return float(((future_day['Close'] - res_day['Close']) / res_day['Close']) * 100)
            return None
            
        # Get historical window for Beta estimation (1 year)
        est_start = max(0, iloc_idx - 252)
        est_window = df.iloc[est_start:iloc_idx]
        
        # We fetch FF3 Factors directly for a true Fama-French 3-Factor (FF3) Market Model
        try:
            from app.services.factor_attribution_service import FactorAttributionService
            ff_svc = FactorAttributionService()
            # We add 30 days buffer for the estimation window
            ff_data = ff_svc.get_factors(start_date=est_window.index[0], end_date=df.index[-1])
            
            nifty = yf.download("^NSEI", start=est_window.index[0], end=df.index[-1], progress=False)
            
            if not ff_data.empty and not nifty.empty:
                # Merge ticker returns with FF3
                ticker_rets = est_window['Close'].pct_change().dropna() * 100
                nifty_rets = nifty['Close'].pct_change().dropna() * 100
                
                # If FF3 is present, calculate full regression
                aligned = pd.concat([ticker_rets, nifty_rets, ff_data['SMB'], ff_data['HML']], axis=1).dropna()
                aligned.columns = ['ticker', 'mkt', 'smb', 'hml']
                
                if len(aligned) > 30:
                    import statsmodels.api as sm
                    X = aligned[['mkt', 'smb', 'hml']]
                    X = sm.add_constant(X)
                    y = aligned['ticker']
                    model = sm.OLS(y, X).fit()
                    beta = model.params['mkt']
                    beta_smb = model.params['smb']
                    beta_hml = model.params['hml']
                else:
                    beta, beta_smb, beta_hml = 1.0, 0.0, 0.0
                    
                def get_ar(days: int):
                    if iloc_idx + days < len(df):
                        act_ret = get_return(days)
                        mkt_end = df.index[iloc_idx + days]
                        mkt_start = res_day.name
                        if mkt_start in nifty.index and mkt_end in nifty.index:
                            mkt_ret = ((float(nifty.loc[mkt_end, 'Close']) - float(nifty.loc[mkt_start, 'Close'])) / float(nifty.loc[mkt_start, 'Close'])) * 100
                            exp_ret = beta * mkt_ret
                            return act_ret - exp_ret
                    return None
            elif not nifty.empty:
                # CAPM Fallback
                nifty_rets = nifty['Close'].pct_change().dropna() * 100
                ticker_rets = est_window['Close'].pct_change().dropna() * 100
                aligned = pd.concat([ticker_rets, nifty_rets], axis=1).dropna()
                aligned.columns = ['ticker', 'mkt']
                if len(aligned) > 30:
                    cov = aligned.cov().iloc[0,1]
                    var = aligned['mkt'].var()
                    beta = cov / var if var > 0 else 1.0
                else:
                    beta = 1.0
                    
                def get_ar(days: int):
                    if iloc_idx + days < len(df):
                        act_ret = get_return(days)
                        mkt_end = df.index[iloc_idx + days]
                        mkt_start = res_day.name
                        if mkt_start in nifty.index and mkt_end in nifty.index:
                            mkt_ret = ((float(nifty.loc[mkt_end, 'Close']) - float(nifty.loc[mkt_start, 'Close'])) / float(nifty.loc[mkt_start, 'Close'])) * 100
                            return act_ret - (beta * mkt_ret)
                    return None
            else:
                get_ar = get_return
        except Exception as e:
            get_ar = get_return

        # Patell Z-test approximation for CAR (30-day)
        car_30 = get_ar(30)
        car_pvalue = 1.0
        if car_30 is not None and est_window is not None and len(est_window) > 30:
            if 'beta' in locals() and 'nifty' in locals() and not nifty.empty:
                est_mkt_rets = nifty.loc[est_window.index[0]:est_window.index[-1]]['Close'].pct_change().dropna() * 100
                est_ticker_rets = est_window['Close'].pct_change().dropna() * 100
                aligned_est = pd.concat([est_ticker_rets, est_mkt_rets], axis=1).dropna()
                ar_std = (aligned_est.iloc[:,0] - (beta * aligned_est.iloc[:,1])).std()
                
                from app.services.statistical_testing_service import StatisticalTestingService
                
                # Patell prediction error adjustment (C_it)
                mkt_mean_est = aligned_est.iloc[:,1].mean()
                mkt_var_sum = ((aligned_est.iloc[:,1] - mkt_mean_est) ** 2).sum()
                n_est = len(aligned_est)
                
                mkt_event = None
                if (iloc_idx + 30) < len(df):
                    mkt_start = res_day.name
                    mkt_end = df.index[iloc_idx + 30]
                    if mkt_start in nifty.index and mkt_end in nifty.index:
                        mkt_event = nifty.loc[mkt_start:mkt_end, 'Close'].pct_change().dropna().values * 100
                
                res = StatisticalTestingService.patell_z(car_30, ar_std, 30, n_est, mkt_event, mkt_mean_est, mkt_var_sum)
                car_pvalue = res["p_value"]
            else:
                ar_std = (est_window['Close'].pct_change().dropna() * 100).std()
                from app.services.statistical_testing_service import StatisticalTestingService
                res = StatisticalTestingService.patell_z(car_30, ar_std, 30, len(est_window))
                car_pvalue = res["p_value"]

        return {
            "prev_close": float(prev_day['Close']),
            "open_price": float(res_day['Open']),
            "high_price": float(res_day['High']),
            "low_price": float(res_day['Low']),
            "close_price": float(res_day['Close']),
            "gap_pct": float(gap_pct),
            "intraday_pct": float(intraday_pct),
            "volume_change_pct": float(vol_change),
            "ret_1d": get_return(1),
            "ret_3d": get_return(3),
            "ret_5d": get_return(5),
            "ret_10d": get_return(10),
            "ret_20d": get_return(20),
            "ret_30d": get_return(30),
            "ar_1d": get_ar(1) if car_30 is not None else get_return(1),
            "ar_5d": get_ar(5) if car_30 is not None else get_return(5),
            "ar_10d": get_ar(10) if car_30 is not None else get_return(10),
            "ar_30d": get_ar(30) if car_30 is not None else get_return(30),
            "car_30d": car_30 if car_30 is not None else get_return(30),
            "car_pvalue": float(car_pvalue) if car_30 is not None else None,
            "max_gain": float(((df.iloc[iloc_idx+1:min(iloc_idx+31, len(df))]['High'].max() - res_day['Close']) / res_day['Close']) * 100) if iloc_idx + 1 < len(df) else None,
            "max_drawdown": float(((df.iloc[iloc_idx+1:min(iloc_idx+31, len(df))]['Low'].min() - res_day['Close']) / res_day['Close']) * 100) if iloc_idx + 1 < len(df) else None
        }
