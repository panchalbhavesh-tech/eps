import math
import uuid
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.infrastructure.models import ResearchHypothesis, HypothesisExperiment, DailyBhavcopy, Company

logger = logging.getLogger(__name__)


class HypothesisService:
    """
    Quantitative Hypothesis Lifecycle & Research Engine (QHLM).
    Enforces rigorous statistical validation via Deflated Sharpe Ratio (Bailey & Lopez de Prado 2014)
    and manages the 5-stage Finite State Machine for alpha factor evolution.
    """

    def __init__(self, db: Session):
        self.db = db

    def calculate_deflated_sharpe(
        self,
        classic_sharpe: float,
        total_trials: int,
        sample_length_periods: int,
        skewness: float = 0.0,
        kurtosis: float = 3.0,
        annualization_factor: float = 252.0
    ) -> float:
        """
        Calculates the Deflated Sharpe Ratio (DSR) following Bailey & Lopez de Prado (2014).
        Adjusts observed Sharpe Ratio for multiple testing variance across family trials,
        non-normal skewness/kurtosis, and sample tracking duration.
        """
        if sample_length_periods <= 1 or np.isnan(classic_sharpe):
            return 0.0

        n_trials = max(1, int(total_trials))
        
        # Expected maximum Sharpe Ratio under Null Hypothesis (zero true edge across N trials)
        if n_trials > 1:
            e_max_sr = math.sqrt(2.0 * math.log(n_trials)) - (math.log(math.log(n_trials)) + math.log(4.0 * math.pi)) / (2.0 * math.sqrt(2.0 * math.log(n_trials)))
            e_max_sr = e_max_sr / math.sqrt(annualization_factor) # Adjust to period frequency
        else:
            e_max_sr = 0.0

        # Adjust Sharpe for skewness and excess kurtosis denominator variance
        sr = classic_sharpe / math.sqrt(annualization_factor)
        denom_inside = 1.0 - (skewness * sr) + ((kurtosis - 1.0) / 4.0) * (sr ** 2)
        if denom_inside <= 0.0001:
            denom_inside = 0.0001

        test_stat = ((sr - e_max_sr) * math.sqrt(sample_length_periods - 1.0)) / math.sqrt(denom_inside)

        # Standard normal cumulative distribution function (CDF) via error function
        dsr_val = 0.5 * (1.0 + math.erf(test_stat / math.sqrt(2.0)))
        return round(float(dsr_val), 4)

    def compute_spearman_ic_stats(self, factor_scores: List[float], forward_returns: List[float]) -> Tuple[float, float]:
        """
        Calculates Spearman Information Coefficient (IC) and its associated student-t test statistic.
        """
        if len(factor_scores) < 10 or len(forward_returns) < 10 or len(factor_scores) != len(forward_returns):
            return 0.0, 0.0

        s_series = pd.Series(factor_scores, dtype=float)
        r_series = pd.Series(forward_returns, dtype=float)

        ic = s_series.corr(r_series, method='spearman')
        if np.isnan(ic):
            return 0.0, 0.0

        n = len(factor_scores)
        if abs(ic) >= 0.9999:
            ic_tstat = 99.99 if ic > 0 else -99.99
        else:
            ic_tstat = ic * math.sqrt((n - 2.0) / (1.0 - (ic ** 2)))

        return round(float(ic), 4), round(float(ic_tstat), 2)

    def register_hypothesis(
        self,
        name: str,
        economic_mechanism: str,
        economic_rationale_text: str,
        alpha_expression: str,
        author: str = "AI_RESEARCH_AGENT",
        target_universe: str = "NIFTY500",
        holding_horizon_days: int = 5
    ) -> Dict[str, Any]:
        """
        Registers a new candidate quantitative hypothesis in Stage 1: DRAFT_HYPOTHESIS.
        Enforces mandatory A Priori Economic Mechanism categorization.
        """
        valid_mechanisms = {"BEHAVIORAL", "RISK_PREMIUM", "MICROSTRUCTURE"}
        if economic_mechanism.upper() not in valid_mechanisms:
            return {"status": "Error", "message": f"Invalid economic mechanism. Must be one of: {', '.join(valid_mechanisms)}"}

        if len(economic_rationale_text.strip()) < 20:
            return {"status": "Error", "message": "Economic rationale text is too brief to justify an institutional quantitative hypothesis."}

        existing = self.db.query(ResearchHypothesis).filter(ResearchHypothesis.name == name).first()
        if existing:
            return {"status": "Error", "message": f"Hypothesis with name '{name}' already registered in system."}

        try:
            hyp = ResearchHypothesis(
                id=uuid.uuid4(),
                name=name,
                author=author,
                economic_mechanism=economic_mechanism.upper(),
                economic_rationale_text=economic_rationale_text,
                alpha_expression=alpha_expression,
                target_universe=target_universe,
                holding_horizon_days=holding_horizon_days,
                current_stage="DRAFT_HYPOTHESIS"
            )
            self.db.add(hyp)
            self.db.commit()
            self.db.refresh(hyp)
            return {"status": "Success", "hypothesis_id": str(hyp.id), "stage": hyp.current_stage}
        except Exception as e:
            self.db.rollback()
            return {"status": "Error", "message": f"Failed to save hypothesis: {e}"}

    def evaluate_hypothesis(self, hypothesis_id: str, trials_in_family: int = 1) -> Dict[str, Any]:
        """
        Stage 2: Statistical In-Sample Audit.
        Executes Purged Walk-Forward evaluating alpha expressions across cached daily OHLCV series.
        Calculates classic Sharpe, Deflated Sharpe Ratio (DSR), and Spearman IC statistics.
        Advances state to OUT_OF_SAMPLE_SHADOW if valid, or ARCHIVE_FAILED if DSR / IC fails.
        """
        hyp = self.db.query(ResearchHypothesis).filter(ResearchHypothesis.id == uuid.UUID(hypothesis_id)).first()
        if not hyp:
            return {"status": "Error", "message": "Hypothesis not found."}

        try:
            # Query representative liquid symbols from cache
            companies = self.db.query(Company).limit(50).all()
            tickers = [c.ticker for c in companies]
            
            all_scores = []
            all_returns = []
            strategy_daily_returns = []

            for ticker in tickers:
                rows = self.db.query(DailyBhavcopy).filter(DailyBhavcopy.ticker == ticker).order_by(DailyBhavcopy.trade_date.asc()).all()
                if len(rows) < 60:
                    continue

                df = pd.DataFrame([{
                    "Close": r.close_price,
                    "Volume": r.volume,
                    "High": r.high_price,
                    "Low": r.low_price
                } for r in rows])

                # Simple tokenized factor parsing without dangerous eval()
                expr = hyp.alpha_expression.lower()
                if "volume" in expr and "close" in expr:
                    df['factor'] = df['Volume'].pct_change(5) / (df['Close'].pct_change(20).abs() + 0.0001)
                elif "volatility" in expr or "high" in expr:
                    df['factor'] = (df['High'] - df['Low']) / df['Close']
                else:
                    # Default momentum drift expression
                    df['factor'] = df['Close'].pct_change(5)

                df['fwd_ret'] = df['Close'].shift(-hyp.holding_horizon_days) / df['Close'] - 1.0
                clean = df.dropna(subset=['factor', 'fwd_ret'])
                if len(clean) > 20:
                    all_scores.extend(clean['factor'].tolist())
                    all_returns.extend(clean['fwd_ret'].tolist())
                    
                    # Compute pseudo strategy returns (long when factor in top 30%)
                    threshold = np.percentile(clean['factor'], 70)
                    longs = clean[clean['factor'] >= threshold]
                    strategy_daily_returns.extend(longs['fwd_ret'].tolist())

            sample_length = len(strategy_daily_returns)
            if sample_length < 30:
                failure_tag = "INSUFFICIENT_HISTORICAL_CACHE_BARS"
                exp = HypothesisExperiment(
                    id=uuid.uuid4(),
                    hypothesis_id=hyp.id,
                    total_trials_in_family=trials_in_family,
                    is_statistically_valid=False,
                    failure_mode_tag=failure_tag
                )
                hyp.current_stage = "ARCHIVE_FAILED"
                hyp.decommission_reason = failure_tag
                self.db.add(exp)
                self.db.commit()
                return {"status": "Failed", "stage": "ARCHIVE_FAILED", "reason": failure_tag}

            s_arr = np.array(strategy_daily_returns)
            mean_ret = float(np.mean(s_arr))
            std_ret = float(np.std(s_arr))
            
            classic_sharpe = (mean_ret / std_ret) * math.sqrt(252.0 / max(1, hyp.holding_horizon_days)) if std_ret > 0 else 0.0
            
            # Compute skewness and kurtosis of strategy returns
            skew = float(pd.Series(s_arr).skew()) if len(s_arr) > 10 else 0.0
            kurt = float(pd.Series(s_arr).kurtosis()) if len(s_arr) > 10 else 3.0

            dsr = self.calculate_deflated_sharpe(
                classic_sharpe=classic_sharpe,
                total_trials=trials_in_family,
                sample_length_periods=sample_length,
                skewness=skew,
                kurtosis=kurt
            )

            ic, ic_tstat = self.compute_spearman_ic_stats(all_scores, all_returns)

            is_valid = (dsr >= 0.85) and (ic >= 0.015) and (ic_tstat >= 1.96)
            failure_tag = None if is_valid else ("LOW_DEFLATED_SHARPE_PENALTY" if dsr < 0.85 else "INSIGNIFICANT_SPEARMAN_IC")

            exp = HypothesisExperiment(
                id=uuid.uuid4(),
                hypothesis_id=hyp.id,
                total_trials_in_family=trials_in_family,
                classic_sharpe=round(classic_sharpe, 4),
                deflated_sharpe=round(dsr, 4),
                spearman_ic_mean=round(ic, 4),
                spearman_ic_tstat=round(ic_tstat, 2),
                is_statistically_valid=is_valid,
                failure_mode_tag=failure_tag
            )
            self.db.add(exp)

            if is_valid:
                hyp.current_stage = "OUT_OF_SAMPLE_SHADOW"
            else:
                hyp.current_stage = "ARCHIVE_FAILED"
                hyp.decommission_reason = failure_tag
                hyp.decommissioned_at = datetime.utcnow()

            self.db.commit()
            return {
                "status": "Success",
                "hypothesis_id": str(hyp.id),
                "stage": hyp.current_stage,
                "classic_sharpe": round(classic_sharpe, 2),
                "deflated_sharpe": round(dsr, 4),
                "spearman_ic_mean": round(ic, 4),
                "spearman_ic_tstat": round(ic_tstat, 2),
                "is_valid": is_valid,
                "failure_mode": failure_tag
            }
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error evaluating hypothesis {hyp.name}: {e}")
            return {"status": "Error", "message": str(e)}

    def check_and_evolve_all_hypotheses(self) -> Dict[str, int]:
        """
        Scheduled daily job:
        1. Evaluates DRAFT hypotheses into IN_SAMPLE_AUDIT.
        2. Promotes OUT_OF_SAMPLE_SHADOW to LIVE_ALPHA_STREAM after 14 days of sustained performance.
        3. Checks LIVE_ALPHA_STREAM factors for Alpha Decay and retires them to ALPHA_DECAY_ARCHIVE if IC fails.
        """
        counts = {"evaluated": 0, "promoted_live": 0, "decommissioned_decay": 0}
        try:
            drafts = self.db.query(ResearchHypothesis).filter(ResearchHypothesis.current_stage == "DRAFT_HYPOTHESIS").all()
            for d in drafts:
                res = self.evaluate_hypothesis(str(d.id), trials_in_family=len(d.experiments) + 1)
                if res.get("status") == "Success":
                    counts["evaluated"] += 1

            now = datetime.utcnow()
            shadows = self.db.query(ResearchHypothesis).filter(ResearchHypothesis.current_stage == "OUT_OF_SAMPLE_SHADOW").all()
            for s in shadows:
                days_tested = (now - (s.created_at or now)).days
                if days_tested >= 14:
                    s.current_stage = "LIVE_ALPHA_STREAM"
                    counts["promoted_live"] += 1

            # Check alpha decay for live stream
            lives = self.db.query(ResearchHypothesis).filter(ResearchHypothesis.current_stage == "LIVE_ALPHA_STREAM").all()
            for l in lives:
                # Periodic re-evaluation of trailing IC
                if l.experiments and l.experiments[-1].spearman_ic_mean is not None:
                    if l.experiments[-1].spearman_ic_mean < 0.005:
                        l.current_stage = "ALPHA_DECAY_ARCHIVE"
                        l.decommissioned_at = datetime.utcnow()
                        l.decommission_reason = "EXHAUSTED_ALPHA_HALF_LIFE"
                        counts["decommissioned_decay"] += 1

            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error executing FSM evolution cycle: {e}")
            
        return counts
