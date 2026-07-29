import math
import uuid
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.infrastructure.models import Company, StrategyBacktest
from app.services.quant_service import QuantService
from app.services.ml_service import MomentumMLService

class IntensiveBacktestEngine:
    """
    Intensive Multi-Year Strategy and Momentum Backtesting Engine.
    Evaluates historical Event Strategies (A-F) and Multi-Factor ML Momentum algorithms,
    incorporating precision Indian market transaction cost friction (0.20% round-trip) and risk analytics.
    """

    def __init__(self, db: Session):
        self.db = db
        self.quant = QuantService()
        self.ml_service = MomentumMLService(db)

    def run_intensive_backtest(self, ticker: str, years: int = 3) -> Dict[str, Any]:
        """
        Executes intensive multi-year historical backtest for a given stock ticker and stores results.
        """
        print(f"[{ticker}] Starting Intensive {years}-Year Backtest Simulation...")
        company = self.db.query(Company).filter(Company.ticker == ticker).first()

        # 1. Fetch historical stock OHLCV data
        df = self.quant.fetch_historical_ohlcv(ticker, years=years)
        if df.empty or len(df) < 60:
            return {
                "ticker": ticker,
                "status": f"Insufficient historical OHLCV rows ({len(df)} bars found)",
                "event_strategies": [],
                "momentum_performance": {}
            }

        # 2. Fetch Nifty 50 Benchmark (^NSEI) for exact Alpha & Beta comparisons
        benchmark_df = self.quant.fetch_historical_ohlcv("^NSEI", years=years)
        nifty_ret_total = 0.0
        if not benchmark_df.empty and len(benchmark_df) > 10:
            nifty_ret_total = ((benchmark_df['Close'].iloc[-1] - benchmark_df['Close'].iloc[0]) / benchmark_df['Close'].iloc[0]) * 100.0

        # 3. Run Event Strategies A-F with Net 0.20% Friction & EV/Profit Factor Formulas
        event_results = self.quant.run_strategy_backtests(df, ticker)
        
        # Save or update StrategyBacktest records in database
        if company and event_results:
            try:
                self.db.query(StrategyBacktest).filter(StrategyBacktest.company_id == company.id).delete()
                for b in event_results:
                    record = StrategyBacktest(
                        id=uuid.uuid4(),
                        company_id=company.id,
                        strategy_name=b['strategy_name'],
                        total_trades=b['total_trades'],
                        winning_trades=b['winning_trades'],
                        losing_trades=b['losing_trades'],
                        win_rate=b['win_rate'],
                        avg_gain=b['avg_gain'],
                        avg_loss=b['avg_loss'],
                        max_gain=b['max_gain'],
                        max_drawdown=b['max_drawdown'],
                        expected_value=b.get('expected_value', 0.0),
                        profit_factor=b.get('profit_factor', 0.0)
                    )
                    self.db.add(record)
                self.db.commit()
            except Exception as e:
                self.db.rollback()
                print(f"Error persisting event strategy backtest records for {ticker}: {e}")

        # 4. Perform Rolling Multi-Factor & ML Momentum Walk-Forward Simulation
        momentum_perf = self._simulate_momentum_ml_strategy(df, nifty_ret_total)

        return {
            "ticker": ticker,
            "status": "Success",
            "years_tested": years,
            "total_trading_bars": len(df),
            "event_strategies": event_results,
            "momentum_performance": momentum_perf,
            "benchmark_nifty_return_pct": round(float(nifty_ret_total), 2)
        }

    def _simulate_momentum_ml_strategy(self, df: pd.DataFrame, nifty_ret_total: float) -> Dict[str, Any]:
        """
        Simulates historical momentum composite ranking and ML gain probability classification.
        Applies a trailing ATR volatility stop-loss and calculates Sharpe, Sortino, and net equity curve.
        """
        df = df.copy()
        
        # Calculate trailing moving averages & RSI for historical evaluation
        df['SMA50'] = df['Close'].rolling(50).mean()
        df['SMA200'] = df['Close'].rolling(200).mean()
        df['Vol_Avg'] = df['Volume'].rolling(20).mean()
        
        # ATR Proxy for Volatility Stop Loss
        high_low = df['High'] - df['Low']
        df['ATR'] = high_low.rolling(14).mean()

        trades = []
        in_position = False
        entry_price = 0.0
        stop_loss = 0.0
        entry_date = None
        
        # Track ML classification accuracy over 5-day horizon
        ml_correct_predictions = 0
        ml_total_predictions = 0
        brier_sum = 0.0

        # Step through historical bars after warm-up window
        for i in range(50, len(df) - 5):
            cur_bar = df.iloc[i]
            cur_price = cur_bar['Close']
            sma50 = cur_bar['SMA50']
            sma200 = cur_bar['SMA200']
            vol_avg = cur_bar['Vol_Avg']
            atr = cur_bar['ATR'] if not pd.isna(cur_bar['ATR']) and cur_bar['ATR'] > 0 else cur_price * 0.02
            
            # Historical factor proxy calculation
            tech_score = min(99.0, max(10.0, ((cur_price - sma200) / (sma200 if sma200 > 0 else cur_price)) * 300.0 + 50.0)) if not pd.isna(sma200) else 50.0
            rel_vol = cur_bar['Volume'] / vol_avg if vol_avg and vol_avg > 0 else 1.0
            
            # Predict 5-day calibrated gain probability via Phase 3 ML Service
            prob_gain = self.ml_service.predict_gain_probability({
                "technical_score": tech_score,
                "fundamental_score": 70.0,  # Proxy institutional benchmark
                "regime_score": 65.0 if cur_price >= sma50 else 35.0,
                "smart_money_score": 75.0 if rel_vol > 1.2 else 50.0,
                "derivatives_score": 70.0 if rel_vol > 1.5 else 50.0
            })

            # Check actual 5-day forward return for ML calibration hit rate
            future_price_5d = df.iloc[i + 5]['Close']
            actual_gain = 1 if future_price_5d > cur_price else 0
            
            if abs(prob_gain - 0.50) >= 0.05:  # Confident predictions only
                ml_total_predictions += 1
                if (prob_gain > 0.50 and actual_gain == 1) or (prob_gain < 0.50 and actual_gain == 0):
                    ml_correct_predictions += 1
                brier_sum += (prob_gain - actual_gain) ** 2

            # Trading rules: BUY on bullish alignment & probability >= 0.53
            if not in_position and cur_price > sma50 and (prob_gain >= 0.53 or rel_vol >= 1.05):
                in_position = True
                entry_price = cur_price
                stop_loss = entry_price - (2.0 * atr)
                entry_date = df.index[i]
            elif in_position:
                # Update trailing stop loss if price advances
                new_stop = cur_price - (2.0 * atr)
                if new_stop > stop_loss:
                    stop_loss = new_stop
                
                # EXIT on trailing stop triggered or bearish momentum reversal
                if cur_bar['Low'] <= stop_loss or cur_price < sma50:
                    exit_price = stop_loss if cur_bar['Low'] <= stop_loss else cur_price
                    # Calculate net trade return minus 0.20% round-trip Indian market friction
                    trade_ret = (((exit_price - entry_price) / entry_price) * 100.0) - 0.20
                    holding_days = max(1, (df.index[i] - entry_date).days if entry_date else (i - 5))
                    trades.append({
                        "entry_date": str(entry_date),
                        "exit_date": str(df.index[i]),
                        "holding_days": holding_days,
                        "net_return_pct": trade_ret
                    })
                    in_position = False

        # Compile portfolio risk & accuracy statistics
        total_trades = len(trades)
        if total_trades == 0:
            return {
                "total_trades": 0,
                "win_rate_pct": 0.0,
                "net_total_return_pct": 0.0,
                "sharpe_ratio": 0.0,
                "sortino_ratio": 0.0,
                "max_drawdown_pct": 0.0,
                "ml_hit_rate_pct": 0.0,
                "brier_score": 0.25,
                "alpha_vs_nifty_pct": round(-nifty_ret_total, 2)
            }

        wins = [t['net_return_pct'] for t in trades if t['net_return_pct'] > 0]
        losses = [t['net_return_pct'] for t in trades if t['net_return_pct'] <= 0]
        win_rate = (len(wins) / total_trades) * 100.0

        # Equity Curve and Maximum Drawdown (MDD) calculation
        equity_curve = [100.0] # Start with 100 base index
        for t in trades:
            equity_curve.append(equity_curve[-1] * (1.0 + (t['net_return_pct'] / 100.0)))
        
        eq_array = np.array(equity_curve)
        peak = np.maximum.accumulate(eq_array)
        drawdown_pct = ((eq_array - peak) / peak) * 100.0
        max_drawdown = float(np.min(drawdown_pct)) if len(drawdown_pct) > 0 else 0.0

        net_total_return = float(((eq_array[-1] - eq_array[0]) / eq_array[0]) * 100.0)

        # Sharpe & Sortino Ratio estimation (assuming risk-free yield = 6.5% p.a.)
        returns_series = np.array([t['net_return_pct'] / 100.0 for t in trades])
        mean_ret = np.mean(returns_series)
        std_ret = np.std(returns_series) if len(returns_series) > 1 else 0.001
        rf_per_trade = 0.065 / (252.0 / 15.0) # Assuming ~15 day avg holding duration

        sharpe = round(float((mean_ret - rf_per_trade) / std_ret * math.sqrt(252.0 / 15.0)), 2) if std_ret > 0.0001 else 0.0
        
        downside_returns = returns_series[returns_series < 0]
        downside_std = np.std(downside_returns) if len(downside_returns) > 1 else 0.001
        sortino = round(float((mean_ret - rf_per_trade) / downside_std * math.sqrt(252.0 / 15.0)), 2) if downside_std > 0.0001 else sharpe

        ml_hit_rate = round((ml_correct_predictions / ml_total_predictions) * 100.0, 2) if ml_total_predictions > 0 else 50.0
        brier = round(brier_sum / ml_total_predictions, 4) if ml_total_predictions > 0 else 0.25

        alpha = round(net_total_return - nifty_ret_total, 2)

        return {
            "total_trades": total_trades,
            "win_rate_pct": round(float(win_rate), 2),
            "net_total_return_pct": round(net_total_return, 2),
            "sharpe_ratio": sharpe,
            "sortino_ratio": sortino,
            "max_drawdown_pct": round(max_drawdown, 2),
            "ml_hit_rate_pct": ml_hit_rate,
            "brier_score": brier,
            "alpha_vs_nifty_pct": alpha,
            "avg_trade_return_pct": round(float(mean_ret * 100.0), 2),
            "profit_factor": round(sum(wins) / abs(sum(losses)), 2) if len(losses) > 0 and sum(losses) != 0 else (99.0 if len(wins) > 0 else 0.0)
        }
