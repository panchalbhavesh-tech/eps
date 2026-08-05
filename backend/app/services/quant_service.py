import pandas as pd
import pandas_ta as ta
import yfinance as yf
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta

class QuantService:
    def __init__(self):
        pass

    def fetch_historical_ohlcv(self, ticker: str, years: int = 5) -> pd.DataFrame:
        symbols_to_try = []
        if ticker.startswith("^") or ticker.endswith(".NS") or ticker.endswith(".BO"):
            symbols_to_try.append(ticker)
        else:
            symbols_to_try.extend([f"{ticker}.NS", f"{ticker}.BO", ticker])
            
        for yf_ticker in symbols_to_try:
            df = pd.DataFrame()
            try:
                ticker_obj = yf.Ticker(yf_ticker)
                df = ticker_obj.history(period=f"{years}y")
            except Exception as e:
                print(f"Ticker history error for {yf_ticker}: {e}")
                
            if df.empty or len(df) < 5:
                try:
                    df = yf.download(yf_ticker, period=f"{years}y", progress=False)
                except Exception as e:
                    print(f"Download error for {yf_ticker}: {e}")
                    
            if not df.empty and len(df) > 5:
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                if 'Date' not in df.columns and not isinstance(df.index, pd.DatetimeIndex):
                    continue
                df = df.reset_index()
                date_col = 'Date' if 'Date' in df.columns else df.columns[0]
                df[date_col] = pd.to_datetime(df[date_col]).dt.tz_localize(None)
                df.set_index(date_col, inplace=True)
                return df
                
        return pd.DataFrame()

    def fetch_from_cache(self, ticker: str, db: Any, years: int = 5) -> pd.DataFrame:
        """
        Attempts to fetch OHLCV from Postgres OHLCV cache first.
        Falls back to direct yfinance call only on cache miss.
        """
        try:
            from app.services.ohlcv_cache_service import OHLCVCacheService
            cache_svc = OHLCVCacheService(db)
            df = cache_svc.get_ohlcv(ticker)
            if not df.empty and len(df) >= 20:
                return df
        except Exception as e:
            print(f"OHLCV cache fallback for {ticker}: {e}")
            
        return self.fetch_historical_ohlcv(ticker, years=years)

    def calculate_technicals(self, df: pd.DataFrame) -> Dict[str, Any]:
        if df.empty or len(df) < 20:
            return {}
        
        # Calculate Indicators
        df['SMA_50'] = ta.sma(df['Close'], length=50)
        df['SMA_100'] = ta.sma(df['Close'], length=100)
        df['SMA_200'] = ta.sma(df['Close'], length=200)
        df['RSI'] = ta.rsi(df['Close'], length=14)
        
        macd = ta.macd(df['Close'])
        df['MACD'] = macd['MACD_12_26_9'] if macd is not None and not macd.empty else None
        
        adx = ta.adx(df['High'], df['Low'], df['Close'])
        df['ADX'] = adx['ADX_14'] if adx is not None and not adx.empty else None
        
        # Pivot Points for Support/Resistance
        last_high = df['High'].iloc[-2]
        last_low = df['Low'].iloc[-2]
        last_close = df['Close'].iloc[-2]
        pivot = (last_high + last_low + last_close) / 3
        imm_support = (2 * pivot) - last_high
        maj_support = pivot - (last_high - last_low)
        imm_resistance = (2 * pivot) - last_low
        maj_resistance = pivot + (last_high - last_low)
        
        latest = df.iloc[-1]
        
        # Golden Cross / Death Cross
        cross_status = "Neutral"
        if not pd.isna(latest['SMA_50']) and not pd.isna(latest['SMA_200']):
            if latest['SMA_50'] > latest['SMA_200'] and df['SMA_50'].iloc[-2] <= df['SMA_200'].iloc[-2]:
                cross_status = "Golden Cross"
            elif latest['SMA_50'] < latest['SMA_200'] and df['SMA_50'].iloc[-2] >= df['SMA_200'].iloc[-2]:
                cross_status = "Death Cross"
            
        ref_sma = latest['SMA_200'] if not pd.isna(latest['SMA_200']) else (latest['SMA_50'] if not pd.isna(latest['SMA_50']) else df['Close'].rolling(10).mean().iloc[-1])
        trend = "Bullish" if not pd.isna(ref_sma) and latest['Close'] > ref_sma else "Bearish"
        vol_trend = "Increasing" if latest['Volume'] > df['Volume'].rolling(20).mean().iloc[-1] else "Decreasing"
        trend_strength = "Strong" if latest['ADX'] and latest['ADX'] > 25 else "Weak"
        
        return {
            "imm_support": float(imm_support),
            "maj_support": float(maj_support),
            "imm_resistance": float(imm_resistance),
            "maj_resistance": float(maj_resistance),
            "trend": trend,
            "dma_50": float(latest['SMA_50']) if not pd.isna(latest['SMA_50']) else None,
            "dma_100": float(latest['SMA_100']) if not pd.isna(latest['SMA_100']) else None,
            "dma_200": float(latest['SMA_200']) if not pd.isna(latest['SMA_200']) else None,
            "cross_status": cross_status,
            "rsi": float(latest['RSI']) if not pd.isna(latest['RSI']) else None,
            "macd": float(latest['MACD']) if not pd.isna(latest['MACD']) else None,
            "adx": float(latest['ADX']) if not pd.isna(latest['ADX']) else None,
            "volume_trend": vol_trend,
            "vwap_position": "N/A", # Intraday VWAP needs intraday data
            "trend_strength": trend_strength
        }

    def calculate_event_study(self, df: pd.DataFrame, report_date: str) -> Dict[str, Any]:
        # Simple string matching for date, or convert report_date to dt
        rd = pd.to_datetime(report_date).tz_localize(None)
        
        # Find the closest trading day >= report_date
        future_df = df[df.index >= rd]
        if future_df.empty:
            return {}
            
        result_day_idx = future_df.index[0]
        iloc_idx = df.index.get_loc(result_day_idx)
        
        if iloc_idx == 0:
            return {} # No previous day
            
        prev_day = df.iloc[iloc_idx - 1]
        res_day = df.iloc[iloc_idx]
        
        gap_pct = ((res_day['Open'] - prev_day['Close']) / prev_day['Close']) * 100
        intraday_pct = ((res_day['Close'] - res_day['Open']) / res_day['Open']) * 100
        vol_change = ((res_day['Volume'] - prev_day['Volume']) / prev_day['Volume']) * 100 if prev_day['Volume'] > 0 else 0
        
        def get_return(days: int):
            if iloc_idx + days < len(df):
                future_day = df.iloc[iloc_idx + days]
                return float(((future_day['Close'] - res_day['Close']) / res_day['Close']) * 100)
            return None
            
        def get_max_excursion(days: int, type_='gain'):
            if iloc_idx + 1 >= len(df): return None
            end_idx = min(iloc_idx + days + 1, len(df))
            window = df.iloc[iloc_idx+1 : end_idx]
            if window.empty: return None
            if type_ == 'gain':
                return float(((window['High'].max() - res_day['Close']) / res_day['Close']) * 100)
            else:
                return float(((window['Low'].min() - res_day['Close']) / res_day['Close']) * 100)
        
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
            "max_gain": get_max_excursion(30, 'gain'),
            "max_drawdown": get_max_excursion(30, 'loss')
        }

    def run_strategy_backtests(self, df: pd.DataFrame, ticker: str) -> List[Dict[str, Any]]:
        if df.empty:
            return []
            
        # Fetch historical earnings dates from yfinance
        yf_ticker = f"{ticker}.NS" if not ticker.endswith(".NS") else ticker
        try:
            stock = yf.Ticker(yf_ticker)
            ed = stock.earnings_dates
            if ed is None or ed.empty:
                return []
            
            # Extract dates, convert to tz-naive to match df
            historical_dates = pd.to_datetime(ed.index).tz_localize(None).sort_values()
        except Exception as e:
            print(f"Failed to fetch earnings dates for backtest: {e}")
            return []
            
        # Initialize strategy trackers
        strategies = {
            'A': {"trades": [], "win": 0, "loss": 0},
            'B': {"trades": [], "win": 0, "loss": 0},
            'C': {"trades": [], "win": 0, "loss": 0},
            'D': {"trades": [], "win": 0, "loss": 0},
            'E': {"trades": [], "win": 0, "loss": 0},
            'F': {"trades": [], "win": 0, "loss": 0},
        }
        
        # Calculate some rolling metrics for the whole dataframe for quick access
        df['Vol_20d_avg'] = df['Volume'].rolling(20).mean()
        
        for e_date in historical_dates:
            # Find closest trading day >= earnings date
            future = df[df.index >= e_date]
            if future.empty: continue
            
            e_day_idx = future.index[0]
            iloc_idx = df.index.get_loc(e_day_idx)
            
            if iloc_idx == 0 or iloc_idx >= len(df) - 10:
                continue # Not enough data before or after
                
            prev_day = df.iloc[iloc_idx - 1]
            e_day = df.iloc[iloc_idx]
            
            # gap percentage
            gap_pct = ((e_day['Open'] - prev_day['Close']) / prev_day['Close']) * 100
            
            # STRATEGY A (PEAD): Buy if gap > 2%, hold 20 days
            if gap_pct > 2:
                if iloc_idx + 20 < len(df):
                    entry = e_day['Close']
                    exit_val = df.iloc[iloc_idx + 20]['Close']
                    ret = (((exit_val - entry) / entry) * 100.0) - 0.20 # Net of 0.20% Indian STT/brokerage friction
                    strategies['A']['trades'].append(ret)
                    if ret > 0: strategies['A']['win'] += 1
                    else: strategies['A']['loss'] += 1
                    
            # STRATEGY B (Mean Reversion Fade): Short if gap > 5%, hold 3 days
            if gap_pct > 5:
                if iloc_idx + 3 < len(df):
                    entry = e_day['Close']
                    exit_val = df.iloc[iloc_idx + 3]['Close']
                    ret = (((entry - exit_val) / entry) * 100.0) - 0.20 # Short position net of friction
                    strategies['B']['trades'].append(ret)
                    if ret > 0: strategies['B']['win'] += 1
                    else: strategies['B']['loss'] += 1
                    
            # STRATEGY C (Volatility Breakout): Buy if e_day volume > 2x 20d avg, hold 10 days
            if e_day['Volume'] > (e_day['Vol_20d_avg'] * 2):
                if iloc_idx + 10 < len(df):
                    entry = e_day['Close']
                    exit_val = df.iloc[iloc_idx + 10]['Close']
                    ret = (((exit_val - entry) / entry) * 100.0) - 0.20
                    strategies['C']['trades'].append(ret)
                    if ret > 0: strategies['C']['win'] += 1
                    else: strategies['C']['loss'] += 1
                    
            # STRATEGY D (Gap and Go): Buy next day open if gap > 2% and e_day closed near high (top 20% of range)
            range_len = e_day['High'] - e_day['Low']
            if range_len > 0:
                close_pos = (e_day['Close'] - e_day['Low']) / range_len
                if gap_pct > 2 and close_pos > 0.8:
                    if iloc_idx + 6 < len(df): # next day + 5 days
                        next_day = df.iloc[iloc_idx + 1]
                        entry = next_day['Open']
                        exit_val = df.iloc[iloc_idx + 6]['Close']
                        ret = (((exit_val - entry) / entry) * 100.0) - 0.20
                        strategies['D']['trades'].append(ret)
                        if ret > 0: strategies['D']['win'] += 1
                        else: strategies['D']['loss'] += 1
                        
            # STRATEGY E (Pre-Earnings Run-Up): Buy 10 days before, sell 1 day before
            if iloc_idx >= 10:
                entry_day = df.iloc[iloc_idx - 10]
                entry = entry_day['Close']
                exit_val = prev_day['Close']
                ret = (((exit_val - entry) / entry) * 100.0) - 0.20
                strategies['E']['trades'].append(ret)
                if ret > 0: strategies['E']['win'] += 1
                else: strategies['E']['loss'] += 1
                
            # STRATEGY F (Earnings Trap): Gap down < -2%, but closes green (Close > Open). Buy close, hold 5 days.
            if gap_pct < -2 and e_day['Close'] > e_day['Open']:
                if iloc_idx + 5 < len(df):
                    entry = e_day['Close']
                    exit_val = df.iloc[iloc_idx + 5]['Close']
                    ret = (((exit_val - entry) / entry) * 100.0) - 0.20
                    strategies['F']['trades'].append(ret)
                    if ret > 0: strategies['F']['win'] += 1
                    else: strategies['F']['loss'] += 1

        # Format results with precision financial metrics
        results = []
        for s_name, data in strategies.items():
            total_trades = len(data['trades'])
            if total_trades == 0:
                continue
                
            win_rate = (data['win'] / total_trades) * 100.0
            winning_trades = [r for r in data['trades'] if r > 0]
            losing_trades = [r for r in data['trades'] if r <= 0]
            
            avg_gain = sum(winning_trades) / len(winning_trades) if winning_trades else 0.0
            avg_loss = sum(losing_trades) / len(losing_trades) if losing_trades else 0.0
            max_gain = max(data['trades']) if data['trades'] else 0.0
            max_drawdown = min(data['trades']) if data['trades'] else 0.0
            
            # Expected Value (EV) per trade in %
            ev = ((win_rate / 100.0) * avg_gain) + ((1.0 - (win_rate / 100.0)) * avg_loss)
            
            # Profit Factor (Total Gains / Total Losses)
            sum_win = sum(winning_trades)
            sum_loss = abs(sum(losing_trades))
            pf = sum_win / sum_loss if sum_loss > 0.0001 else (99.0 if sum_win > 0 else 0.0)
            
            results.append({
                "strategy_name": s_name,
                "total_trades": total_trades,
                "winning_trades": data['win'],
                "losing_trades": data['loss'],
                "win_rate": round(float(win_rate), 2),
                "avg_gain": round(float(avg_gain), 2),
                "avg_loss": round(float(avg_loss), 2),
                "max_gain": round(float(max_gain), 2),
                "max_drawdown": round(float(max_drawdown), 2),
                "expected_value": round(float(ev), 2),
                "profit_factor": round(float(pf), 2)
            })
            
        return results

    def calculate_post_earnings_momentum_stats(self, ticker: str, q_dates: List[str] = None, df: pd.DataFrame = None) -> tuple:
        """
        Calculates real historical Post-Release Momentum Probability (% of positive quarters)
        and Average Post-Earnings Momentum over a 7-day window following quarterly release dates,
        matching the exact methodology used in Frontend QuarterlyMarketImpact timeline.
        """
        if df is None or df.empty:
            df = self.fetch_historical_ohlcv(ticker, years=2)
            
        if df.empty:
            return None, None

        if not q_dates or len(q_dates) < 4:
            return None, None

        mon_map = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
            'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        }

        momentums = []
        df_sorted = df.sort_index()

        for d_str in q_dates:
            if not d_str:
                continue
            norm_date = None
            d_clean = str(d_str).strip()
            for m_name, m_num in mon_map.items():
                if m_name in d_clean:
                    year = "2025"
                    import re
                    y_match = re.findall(r"\d{4}", d_clean)
                    if y_match:
                        year = y_match[0]
                    norm_date = f"{year}-{m_num}-15"
                    break
            if not norm_date:
                try:
                    dt = pd.to_datetime(d_clean)
                    norm_date = dt.strftime("%Y-%m-%d")
                except Exception:
                    norm_date = "2025-06-15"

            post_df = df_sorted[df_sorted.index >= norm_date]
            if len(post_df) >= 7:
                start_p = float(post_df['Close'].iloc[0])
                end_p = float(post_df['Close'].iloc[6])
                if start_p > 0:
                    ret = ((end_p - start_p) / start_p) * 100.0
                    momentums.append(round(ret, 2))
            elif len(post_df) >= 2:
                start_p = float(post_df['Close'].iloc[0])
                end_p = float(post_df['Close'].iloc[-1])
                if start_p > 0:
                    ret = ((end_p - start_p) / start_p) * 100.0
                    momentums.append(round(ret, 2))

        if not momentums:
            return None, None

        last_n = momentums[-4:]
        pos_count = sum(1 for m in last_n if m >= 0)
        prob = round((pos_count / len(last_n)) * 100.0, 1)
        avg_mom = round(sum(last_n) / len(last_n), 2)
        return float(prob), float(avg_mom)

    def calculate_latest_post_release_return(self, ticker: str, release_date_str: str, df: pd.DataFrame = None) -> Optional[float]:
        """
        Calculates the actual share price return immediately following a recent earnings release date
        (e.g. comparing pre-release T-1/T-0 close with current trading session close) for empirical validation.
        """
        if not release_date_str:
            return None
        if df is None or df.empty:
            df = self.fetch_historical_ohlcv(ticker, years=1)
        if df.empty:
            return None
            
        try:
            dt_str = str(release_date_str).strip()
            rel_dt = pd.to_datetime(dt_str)
            
            # If the release date is in the future, do not calculate post-release return yet
            if rel_dt.date() > datetime.utcnow().date():
                return None
                
            norm_date = rel_dt.strftime('%Y-%m-%d')
            
            df_sorted = df.sort_index()
            t_minus_df = df_sorted[df_sorted.index >= (rel_dt - timedelta(days=2)).strftime('%Y-%m-%d')]
            if len(t_minus_df) >= 2:
                start_p = float(t_minus_df['Close'].iloc[0])
                end_p = float(t_minus_df['Close'].iloc[-1])
                if start_p > 0:
                    ret = ((end_p - start_p) / start_p) * 100.0
                    return round(float(ret), 2)
        except Exception as e:
            print(f"Error computing latest post-release return for {ticker}: {e}")
        return None
