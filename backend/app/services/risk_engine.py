import math
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.infrastructure.models import Company, MomentumSignal, StrategyBacktest

def portfolio_drawdown(buy_returns, min_days: int = 5):
    """
    Maximum drawdown of an equal-weight book of BUY recommendations.

    Each day's BUY picks are averaged into one portfolio return; a 5-day return held in a rolling book
    contributes ~1/5 per day. (Chaining every stock's overlapping 5-day return as if they were sequential
    trades - the old method - drives any equity curve to ~0 and always read "-100%".)
    Returns (mdd_pct, win_rate_pct) or (None, None) when there are fewer than `min_days` days of history.
    """
    by_day = {}
    for when, ret in buy_returns:
        if when is None or ret is None:
            continue
        by_day.setdefault(when.date() if hasattr(when, "date") else when, []).append(float(ret))
    if len(by_day) < min_days:
        return None, None
    days = sorted(by_day)
    daily = np.array([np.mean(by_day[d]) / 100.0 / 5.0 for d in days])
    equity = np.cumprod(1 + daily)
    peak = np.maximum.accumulate(np.concatenate([[1.0], equity]))[1:]
    mdd = float(np.min((equity - peak) / peak) * 100.0)
    all_rets = np.array([r for d in days for r in by_day[d]])
    return round(min(0.0, mdd), 2), round(float(np.mean(all_rets > 0) * 100.0), 1)


class RiskEngine:
    """
    Portfolio-Level Risk Management & Emergency Kill Switch Engine.
    Enforces concurrency caps (max positions), sector concentration limits (30%),
    correlation gating, event-risk blackouts, and maximum drawdown safety cutoffs (-15%).
    """

    def __init__(self, db: Session):
        self.db = db
        self.max_concurrent_positions = 15
        self.max_sector_weight = 0.30  # 30% per sector
        self.max_single_stock_weight = 0.20  # 20% max position
        self.max_gross_leverage = 1.0        # No margin allowed (100% max)
        self.mdd_kill_switch_threshold = -15.0  # -15% drawdown limit
        self._kill_switch_active = None
        self.last_drawdown = (None, None)

    def is_kill_switch_active(self) -> Tuple[bool, str]:
        """
        Evaluates portfolio trailing maximum drawdown.
        If trailing loss exceeds -15%, the Emergency Kill Switch automatically trips to preserve capital.
        """
        if self._kill_switch_active is not None:
            return self._kill_switch_active

        try:
            # Evaluate trailing performance of live recommendations
            from app.infrastructure.models import ScorePredictionLog
            cutoff = datetime.utcnow() - timedelta(days=30)
            logs = self.db.query(ScorePredictionLog.date_evaluated, ScorePredictionLog.realized_5d_return).filter(
                ScorePredictionLog.is_shadow == False,
                ScorePredictionLog.signal_emitted == "BUY",
                ScorePredictionLog.date_evaluated >= cutoff,
                ScorePredictionLog.realized_5d_return != None
            ).all()
            mdd, win_rate = portfolio_drawdown([(d, r) for d, r in logs])
            self.last_drawdown = (mdd, win_rate)
            if mdd is not None:
                # Determine dynamic threshold using regime
                from app.services.momentum_service import MomentumService
                ml_svc = MomentumService(self.db)
                regime = ml_svc.get_market_regime()
                regime_status = regime.get("status", "Neutral")
                
                dynamic_threshold = self.mdd_kill_switch_threshold
                if regime_status == "Bearish":
                    # Tighten stop loss
                    dynamic_threshold = -10.0
                    
                # If MDD is worse than dynamic threshold, kill switch
                if mdd < dynamic_threshold:
                    self._kill_switch_active = (True, f"Emergency Kill Switch Tripped: Maximum Drawdown ({mdd:.1f}%) breached dynamic safety boundary ({dynamic_threshold}%). Win rate: {win_rate:.1f}%.")
                    return self._kill_switch_active
        except Exception as e:
            import logging
            logging.getLogger(__name__).critical(f"Kill switch DB unreachable: {e}. FAILING CLOSED.")
            self._kill_switch_active = (True, f"⚠️ Emergency Kill Switch ACTIVE: Database unreachable ({e}). Failing closed to preserve capital.")
            return self._kill_switch_active

        self._kill_switch_active = (False, "Normal operation. Capital safety boundaries intact.")
        return self._kill_switch_active

    def check_sector_exposure_cap(self, sector: str, current_active_signals: List[Dict[str, Any]]) -> bool:
        """
        Returns True if adding another position in this sector would breach the 30% concentration cap.
        """
        if not current_active_signals or not sector:
            return False
            
        total_buys = len([s for s in current_active_signals if s.get("signal") == "BUY"])
        if total_buys == 0:
            return False

        same_sector_buys = len([
            s for s in current_active_signals 
            if s.get("signal") == "BUY" and s.get("sector", "").lower() == sector.lower()
        ])
        
        projected_weight = (same_sector_buys + 1.0) / (total_buys + 1.0)
        return projected_weight > self.max_sector_weight and total_buys >= 4

    def check_event_risk_blackout(self, company: Company) -> Tuple[bool, str]:
        """
        Enforces a protective trading blackout if an earnings event or macroeconomic announcement is within <= 3 trading days.
        """
        if not company.upcoming_date:
            return False, ""

        try:
            # Parse upcoming date if available
            evt_dt = pd.to_datetime(company.upcoming_date).to_pydatetime()
            now_dt = datetime.utcnow()
            days_to_event = (evt_dt - now_dt).days
            
            if 0 <= days_to_event <= 3:
                return True, f"⏳ Event Risk Blackout: Quarterly announcement scheduled in {days_to_event} day(s). Directional entry suppressed."
        except Exception:
            pass
            
        return False, ""

    def check_correlation_gate(self, ticker: str, candidate_returns: Optional[List[float]], existing_buy_tickers: List[str]) -> Tuple[bool, str]:
        """
        Rejects new BUY recommendations if Pearson correlation against existing recommended long positions exceeds 0.78.
        """
        if not existing_buy_tickers:
            return False, ""

        try:
            from app.services.ohlcv_cache_service import OHLCVCacheService
            cache_svc = OHLCVCacheService(self.db)
            cand_df = cache_svc.get_ohlcv(ticker)
            if cand_df.empty or len(cand_df) < 30 or 'Close' not in cand_df:
                return False, ""
            
            cand_rets = cand_df['Close'].pct_change().dropna().tail(60)
            if len(cand_rets) < 20:
                return False, ""

            for ex_ticker in existing_buy_tickers:
                if not ex_ticker or ex_ticker == ticker:
                    continue
                ex_df = cache_svc.get_ohlcv(ex_ticker)
                if ex_df.empty or 'Close' not in ex_df:
                    continue
                ex_rets = ex_df['Close'].pct_change().dropna().tail(60)
                
                # Align dates to calculate accurate correlation
                combined = pd.concat([cand_rets, ex_rets], axis=1, join='inner')
                if len(combined) >= 20:
                    corr = combined.iloc[:, 0].corr(combined.iloc[:, 1], method='spearman')
                    if corr > 0.78:
                        return True, f"🔗 Correlation Gate Rejected: Spearman correlation ({corr:.2f}) with existing holding {ex_ticker} exceeds 0.78 diversity cap."
        except Exception as e:
            print(f"Error executing correlation gate check for {ticker}: {e}")

        return False, ""

    def evaluate_signal_risk(self, company: Company, raw_signal: str, candidate_score: float, current_active_signals: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Main routing function called by MomentumService during scanning.
        Modifies signal state and injects protective risk reasons if institutional boundaries are crossed.
        """
        reasons = []
        final_signal = raw_signal

        # 1. Emergency Kill Switch Gate
        is_killed, kill_msg = self.is_kill_switch_active()
        if is_killed:
            if final_signal == "BUY":
                final_signal = "WATCHLIST"
            reasons.append(f"🛡️ {kill_msg}")
            return {"signal": final_signal, "risk_reasons": reasons, "kill_switch_active": True}

        # If it wasn't going to be a BUY, we don't need to apply position entry caps
        if final_signal != "BUY":
            return {"signal": final_signal, "risk_reasons": reasons, "kill_switch_active": False}

        # 2. Concurrency Cap
        active_buys = [s for s in current_active_signals if s.get("signal") == "BUY"]
        if len(active_buys) >= self.max_concurrent_positions:
            final_signal = "WATCHLIST"
            reasons.append(f"📦 Portfolio Concurrency Cap Reached ({self.max_concurrent_positions} active longs). Signal downgraded to WATCHLIST.")
        # 2b. Leverage Constraint
        # Assuming each active buy has an average allocation based on max_concurrent_positions
        current_gross_leverage = len(active_buys) * (1.0 / self.max_concurrent_positions)
        if current_gross_leverage >= self.max_gross_leverage:
            final_signal = "WATCHLIST"
            reasons.append(f"⚖️ Maximum Gross Leverage Reached (>{self.max_gross_leverage}x). Signal downgraded to WATCHLIST.")
        # 3. Sector Concentration Gate
        if self.check_sector_exposure_cap(company.sector, current_active_signals):
            final_signal = "WATCHLIST"
            reasons.append(f"⚖️ Sector Concentration Limit Reached (>{int(self.max_sector_weight*100)}% active exposure in {company.sector}).")

        # 4. Event-Risk Blackout
        is_blackout, blackout_reason = self.check_event_risk_blackout(company)
        if is_blackout:
            final_signal = "WATCHLIST"
            reasons.append(blackout_reason)

        # 5. Correlation Diversity Gate
        existing_buy_tickers = [s.get("ticker") for s in active_buys if s.get("ticker")]
        is_correl, correl_reason = self.check_correlation_gate(company.ticker, None, existing_buy_tickers)
        if is_correl:
            final_signal = "WATCHLIST"
            reasons.append(correl_reason)

        return {
            "signal": final_signal,
            "risk_reasons": reasons,
            "kill_switch_active": False
        }
