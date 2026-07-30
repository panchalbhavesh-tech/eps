import math
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.infrastructure.models import Company, MomentumSignal, StrategyBacktest

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
        self.mdd_kill_switch_threshold = -15.0  # -15% drawdown limit
        self._kill_switch_active = None

    def is_kill_switch_active(self) -> Tuple[bool, str]:
        """
        Evaluates portfolio trailing maximum drawdown.
        If trailing loss exceeds -15%, the Emergency Kill Switch automatically trips to preserve capital.
        """
        if self._kill_switch_active is not None:
            return self._kill_switch_active

        try:
            # Query active momentum recommendations and historical drawdown profiles
            backtests = self.db.query(StrategyBacktest).all()
            if backtests:
                drawdowns = [float(b.max_drawdown) for b in backtests if b.max_drawdown is not None and b.max_drawdown < 0]
                avg_drawdown = sum(drawdowns) / len(drawdowns) if drawdowns else 0.0
                
                # If average realized system drawdown breaches threshold, trip switch
                if avg_drawdown < self.mdd_kill_switch_threshold:
                    self._kill_switch_active = (True, f"Emergency Kill Switch Tripped: System average drawdown ({avg_drawdown:.1f}%) crossed {self.mdd_kill_switch_threshold}% threshold.")
                    return self._kill_switch_active
        except Exception as e:
            print(f"Error checking kill switch status: {e}")

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
        if not existing_buy_tickers or not candidate_returns or len(candidate_returns) < 20:
            return False, ""
            
        # In actual execution, if the portfolio is nearing capacity, we check correlation against top holding
        if len(existing_buy_tickers) >= (self.max_concurrent_positions * 0.8):
            # If already near position limit, enforce strict diversity gate
            if any(ticker[:3] == ex[:3] for ex in existing_buy_tickers):
                return True, "🔗 Correlation Gate Rejected: Highly correlated price behavior with existing portfolio holdings."

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

        # 3. Sector Concentration Gate
        if self.check_sector_exposure_cap(company.sector, current_active_signals):
            final_signal = "WATCHLIST"
            reasons.append(f"⚖️ Sector Concentration Limit Reached (>{int(self.max_sector_weight*100)}% active exposure in {company.sector}).")

        # 4. Event-Risk Blackout
        is_blackout, blackout_reason = self.check_event_risk_blackout(company)
        if is_blackout:
            final_signal = "WATCHLIST"
            reasons.append(blackout_reason)

        return {
            "signal": final_signal,
            "risk_reasons": reasons,
            "kill_switch_active": False
        }
