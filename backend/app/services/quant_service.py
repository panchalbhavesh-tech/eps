import pandas as pd
import pandas_ta as ta
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from app.services.data.data_manager import UnifiedDataManager

class QuantService:
    def __init__(self, data_manager: Optional[UnifiedDataManager] = None):
        self.data_manager = data_manager or UnifiedDataManager()

    def get_recent_price_reaction(self, ticker: str, published_at: Optional[datetime] = None) -> dict:
        """
        P1.5: Multi-horizon price reaction and relative volume calculation.
        
        Returns a dict with:
        - reaction_pct: cumulative return from baseline to latest close (backward compat)
        - gap_reaction_pct: (Open on event day - Previous Close) / Previous Close
        - session_reaction_pct: (Close on event day - Previous Close) / Previous Close
        - reaction_1d, reaction_3d, reaction_5d: forward returns from event-day close
        - relative_volume: current session volume / 20-day avg
        - pre_event_price: close price strictly before the catalyst
        """
        result = {
            "current_price": 0.0,
            "pre_event_price": None,
            "reaction_pct": 0.0,
            "gap_reaction_pct": None,
            "session_reaction_pct": None,
            "reaction_1d": None,
            "reaction_3d": None,
            "reaction_5d": None,
            "relative_volume": 1.0,
        }
        try:
            # Fetch daily data for multi-horizon metrics
            df = self.data_manager.get_ohlcv(ticker, days=30)
            
            # Since UnifiedDataManager currently doesn't natively fetch 1m intraday data, 
            # we'll use empty or a fallback if necessary, but this avoids yf.download blocking
            df_1m = pd.DataFrame()
            
            if df.empty or len(df) < 2:
                return result
                
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
                
            df.index = pd.to_datetime(df.index).tz_localize(None)
            
            if published_at is None:
                published_at = datetime.utcnow()
                
            pub_date = published_at.date()
            before_df = df[df.index.date < pub_date]
            after_df = df[df.index.date >= pub_date]
            
            if before_df.empty:
                before_df = df.iloc[:-1]
                after_df = df.iloc[-1:]
            
            if before_df.empty:
                return result
            
            # Daily baseline fallback
            baseline_row = before_df.iloc[-1]
            last_row = df.iloc[-1]
            
            baseline_close = float(baseline_row['Close'])
            current_price = float(last_row['Close'])
            
            # Intraday Precision Override
            if not df_1m.empty:
                # Add 5.5 hours to published_at if it's UTC to convert to IST
                # Assuming published_at is stored in UTC but yfinance 1m is local to NSE
                pub_ist = published_at
                # Find the 1-minute bar strictly before publication
                before_1m = df_1m[df_1m.index < pub_ist]
                if not before_1m.empty:
                    baseline_close = float(before_1m.iloc[-1]['Close'])
                    current_price = float(df_1m.iloc[-1]['Close'])
            
            result["pre_event_price"] = baseline_close
            result["current_price"] = current_price
            
            if baseline_close == 0:
                return result
                
            # Cumulative reaction (backward compatible)
            result["reaction_pct"] = ((current_price - baseline_close) / baseline_close) * 100
            
            # Gap and session reactions (event day)
            if not after_df.empty:
                event_day = after_df.iloc[0]
                result["gap_reaction_pct"] = ((float(event_day['Open']) - baseline_close) / baseline_close) * 100
                result["session_reaction_pct"] = ((float(event_day['Close']) - baseline_close) / baseline_close) * 100
                
                event_close = float(event_day['Close'])
                
                # Multi-day forward returns from event-day close
                for n_days, key in [(1, "reaction_1d"), (3, "reaction_3d"), (5, "reaction_5d")]:
                    if len(after_df) > n_days:
                        future_close = float(after_df.iloc[n_days]['Close'])
                        result[key] = ((future_close - event_close) / event_close) * 100
            
            # Relative volume
            avg_vol_before = before_df['Volume'].tail(20).mean()
            if after_df.empty:
                current_vol = float(last_row['Volume'])
            else:
                # Use first-day volume for most accurate RVOL
                current_vol = float(after_df.iloc[0]['Volume'])
            
            result["relative_volume"] = current_vol / avg_vol_before if avg_vol_before > 0 else 1.0
            
            return result
        except Exception as e:
            print(f"Error fetching recent reaction for {ticker}: {e}")
            return result

    def fetch_historical_ohlcv(self, ticker: str, years: int = 5) -> pd.DataFrame:
        df = self.data_manager.get_ohlcv(ticker, days=years*365)
        
        if df.empty or len(df) < 5:
            return pd.DataFrame()
            
        # Ensure correct column names expected by pandas_ta and other quant functions
        # We know DataManager returns lowercase (open, high, low, close, volume)
        # So we map them to Title Case for backward compatibility with the rest of the quant pipeline
        rename_map = {'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}
        df.rename(columns=rename_map, inplace=True)
        
        required_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
        for col in required_cols:
            if col not in df.columns:
                return pd.DataFrame()
                
        # Drop rows with NaN in critical columns
        df.dropna(subset=['Close', 'Volume'], inplace=True)
        return df

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

    # Removed calculate_technicals (moved to technical_indicator_service.py)
    # Removed calculate_event_study (moved to event_study_service.py)

    def run_strategy_backtests(self, df: pd.DataFrame, ticker: str) -> List[Dict[str, Any]]:
        if df.empty:
            return []
            
        # Fetch historical earnings dates from UnifiedDataManager
        try:
            historical_dates = self.data_manager.get_earnings_calendar(ticker)
            if not historical_dates:
                return []
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
                    ret = (((exit_val - entry) / entry) * 100.0) - 0.40 # Net of 0.20% Indian STT/brokerage friction
                    strategies['A']['trades'].append(ret)
                    if ret > 0: strategies['A']['win'] += 1
                    else: strategies['A']['loss'] += 1
                    
            # STRATEGY B (Mean Reversion Fade): Short if gap > 5%, hold 3 days
            if gap_pct > 5:
                if iloc_idx + 3 < len(df):
                    entry = e_day['Close']
                    exit_val = df.iloc[iloc_idx + 3]['Close']
                    ret = (((entry - exit_val) / entry) * 100.0) - 0.40 # Short position net of friction
                    strategies['B']['trades'].append(ret)
                    if ret > 0: strategies['B']['win'] += 1
                    else: strategies['B']['loss'] += 1
                    
            # STRATEGY C (Volatility Breakout): Buy if e_day volume > 2x 20d avg, hold 10 days
            if e_day['Volume'] > (e_day['Vol_20d_avg'] * 2):
                if iloc_idx + 10 < len(df):
                    entry = e_day['Close']
                    exit_val = df.iloc[iloc_idx + 10]['Close']
                    ret = (((exit_val - entry) / entry) * 100.0) - 0.40
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
                        ret = (((exit_val - entry) / entry) * 100.0) - 0.40
                        strategies['D']['trades'].append(ret)
                        if ret > 0: strategies['D']['win'] += 1
                        else: strategies['D']['loss'] += 1
                        
            # STRATEGY E (Pre-Earnings Run-Up): Buy 10 days before, sell 1 day before
            if iloc_idx >= 10:
                entry_day = df.iloc[iloc_idx - 10]
                entry = entry_day['Close']
                exit_val = prev_day['Close']
                ret = (((exit_val - entry) / entry) * 100.0) - 0.40
                strategies['E']['trades'].append(ret)
                if ret > 0: strategies['E']['win'] += 1
                else: strategies['E']['loss'] += 1
                
            # STRATEGY F (Earnings Trap): Gap down < -2%, but closes green (Close > Open). Buy close, hold 5 days.
            if gap_pct < -2 and e_day['Close'] > e_day['Open']:
                if iloc_idx + 5 < len(df):
                    entry = e_day['Close']
                    exit_val = df.iloc[iloc_idx + 5]['Close']
                    ret = (((exit_val - entry) / entry) * 100.0) - 0.40
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
                    year = str(datetime.utcnow().year)
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
                    norm_date = f"{datetime.utcnow().year}-06-15"

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

    def scan_for_volume_anomalies(self, db: Any) -> dict:
        """
        P3.3: Pre-Catalyst Signals.
        Scans for stocks with unusual volume (>2.5x average) but no recent news.
        This signals potential smart money accumulation prior to a material catalyst.
        """
        import uuid
        import time
        from app.infrastructure.models import Company, CatalystEvent, CatalystSource
        
        metrics = {"scanned": 0, "anomalies_detected": 0, "signals_saved": 0}
        
        # 1. Get Top 200 companies by Market Cap
        companies = db.query(Company).order_by(Company.market_cap.desc().nulls_last()).limit(200).all()
        
        if not companies:
            return metrics
            
        tickers = [c.ticker for c in companies]
        
        try:
            # Fetch peer sector data using UnifiedDataManager
            data = pd.DataFrame()
            # In a real scenario you would loop over tickers to get their OHLCV and combine
            # Here we just fetch one by one to avoid rate limits and standardize format
            combined = []
            for tk in tickers:
                d = self.data_manager.get_ohlcv(tk, days=30)
                if not d.empty:
                    d['Ticker'] = tk
                    combined.append(d)
            
            if combined:
                data = pd.concat(combined)
            else:
                return metrics
        except Exception as e:
            print(f"Error bulk downloading volume data: {e}")
            return metrics
            
        lookback_date = datetime.utcnow() - timedelta(days=7)
        
        # 3. Process each ticker
        for company in companies:
            metrics["scanned"] += 1
            ticker = company.ticker
            yf_ticker = f"{ticker}.NS" if not ticker.endswith((".NS", ".BO")) else ticker
            
            try:
                # Handle single vs multi ticker yfinance output
                if len(tickers) == 1:
                    df = data
                else:
                    if yf_ticker not in data.columns.levels[0]:
                        continue
                    df = data[yf_ticker]
                    
                if df.empty or len(df) < 20:
                    continue
                    
                # Drop NAs in volume
                vol_series = df['Volume'].dropna()
                if len(vol_series) < 20:
                    continue
                    
                # Calculate 20-day average volume (baseline)
                avg_vol_20d = vol_series.tail(20).mean()
                if avg_vol_20d < 10000: # Ignore totally illiquid stocks
                    continue
                    
                # Calculate 3-day recent average volume
                recent_vol_3d = vol_series.tail(3).mean()
                
                # Check for anomaly (> 2.5x)
                if recent_vol_3d > (avg_vol_20d * 2.5):
                    metrics["anomalies_detected"] += 1
                    
                    # 4. Check if there's already a catalyst in the last 7 days
                    recent_catalyst = db.query(CatalystEvent).filter(
                        CatalystEvent.ticker == ticker,
                        CatalystEvent.created_at >= lookback_date,
                        CatalystEvent.category != "PRE_CATALYST_SIGNAL"
                    ).first()
                    
                    if not recent_catalyst:
                        # Ensure we haven't already saved this signal today
                        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0)
                        existing_signal = db.query(CatalystEvent).filter(
                            CatalystEvent.ticker == ticker,
                            CatalystEvent.category == "PRE_CATALYST_SIGNAL",
                            CatalystEvent.created_at >= today_start
                        ).first()
                        
                        if not existing_signal:
                            rvol = float(round(recent_vol_3d / avg_vol_20d, 1))
                            event = CatalystEvent(
                                id=uuid.uuid4(),
                                ticker=ticker,
                                company_id=company.id,
                                event_title=f"🚨 Unusual Vol: {rvol}x (No News)",
                                event_type="VOLUME_BREAKOUT",
                                category="PRE_CATALYST_SIGNAL",
                                impact_score=65,  # Moderate predictive impact
                                early_score=100,  # Highly early (pre-news)
                                confidence="MEDIUM",
                                status="EARLY",
                                tier="B-TIER",
                                match_status="MATCHED",
                                why_it_matters=f"Stock is trading at {rvol}x its 20-day average volume over the last 3 days with no public announcements. This strongly suggests institutional accumulation ahead of an impending catalyst.",
                                relative_volume=rvol,
                                market_cap_at_event=company.market_cap,
                                sector_at_event=company.sector,
                                published_at=datetime.utcnow(),
                                detected_at=datetime.utcnow()
                            )
                            
                            source = CatalystSource(
                                id=uuid.uuid4(),
                                event_id=event.id,
                                source_name="Quantitative Signal Engine",
                                is_primary=True,
                                published_at=datetime.utcnow()
                            )
                            
                            db.add(event)
                            db.add(source)
                            db.commit()
                            metrics["signals_saved"] += 1
                            
            except Exception as e:
                print(f"Error processing anomaly for {ticker}: {e}")
                
        return metrics

    def calculate_event_analog_stats(self, db: Any, category: str, event_type: str = None) -> dict:
        """
        P3.1: Historical Analog Engine.
        Scans past events matching the category (and optionally event_type)
        to compute the expected value (EV) of the market reaction.
        """
        from app.infrastructure.models import CatalystEvent
        from sqlalchemy import and_
        
        filters = [CatalystEvent.category == category]
        if event_type:
            filters.append(CatalystEvent.event_type == event_type)
            
        events = db.query(CatalystEvent).filter(and_(*filters)).all()
        
        if not events:
            return None
            
        valid_1d = [e.reaction_1d for e in events if e.reaction_1d is not None]
        valid_3d = [e.reaction_3d for e in events if e.reaction_3d is not None]
        valid_5d = [e.reaction_5d for e in events if e.reaction_5d is not None]
        valid_gap = [e.gap_reaction_pct for e in events if e.gap_reaction_pct is not None]
        valid_session = [e.session_reaction_pct for e in events if e.session_reaction_pct is not None]
        
        def safe_mean(lst):
            return sum(lst) / len(lst) if lst else 0.0
            
        def win_rate(lst):
            return (sum(1 for x in lst if x > 0) / len(lst) * 100) if lst else 0.0
            
        return {
            "total_events_analyzed": len(events),
            "avg_gap_reaction": round(safe_mean(valid_gap), 2),
            "avg_session_reaction": round(safe_mean(valid_session), 2),
            "avg_1d_return": round(safe_mean(valid_1d), 2),
            "avg_3d_return": round(safe_mean(valid_3d), 2),
            "avg_5d_return": round(safe_mean(valid_5d), 2),
            "win_rate_5d": round(win_rate(valid_5d), 2)
        }
