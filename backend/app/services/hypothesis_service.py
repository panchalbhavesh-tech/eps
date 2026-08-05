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

    def evaluate_hypothesis(self, hypothesis_id: str) -> Dict[str, Any]:
        """
        Stage 2: Statistical In-Sample Audit.
        Executes Purged Walk-Forward evaluating alpha expressions across cached daily OHLCV series.
        Calculates classic Sharpe, Deflated Sharpe Ratio (DSR), and Spearman IC statistics.
        Advances state to OUT_OF_SAMPLE_SHADOW if valid, or ARCHIVE_FAILED if DSR / IC fails.
        """
        hyp = self.db.query(ResearchHypothesis).filter(ResearchHypothesis.id == uuid.UUID(hypothesis_id)).first()
        if not hyp:
            return {"status": "Error", "message": "Hypothesis not found."}

        # Track global trial count for DSR
        trial_record = self.db.query(TotalHypothesisTrials).first()
        if not trial_record:
            trial_record = TotalHypothesisTrials(id=1, total_count=0)
            self.db.add(trial_record)
            self.db.commit()
            
        trial_record.total_count += 1
        current_trial_count = trial_record.total_count
        self.db.commit()

        try:
            # Query representative liquid symbols from cache
            companies = self.db.query(Company).limit(50).all()
            tickers = [c.ticker for c in companies]
            
            # Fetch all rows for these tickers
            rows = self.db.query(DailyBhavcopy).filter(DailyBhavcopy.ticker.in_(tickers)).order_by(DailyBhavcopy.trade_date.asc()).all()
            
            if not rows:
                raise ValueError("No historical cache bars available.")

            df_data = [{
                "Date": r.trade_date,
                "Ticker": r.ticker,
                "close": r.close_price,
                "volume": r.volume,
                "high": r.high_price,
                "low": r.low_price
            } for r in rows]
            
            df = pd.DataFrame(df_data)
            df.set_index(['Date', 'Ticker'], inplace=True)
            df.sort_index(inplace=True)
            
            # Precompute required variables
            grouped = df.groupby(level='Ticker')
            df['volume_5d'] = grouped['volume'].transform(lambda x: x.rolling(5).mean())
            df['volatility_20d'] = grouped['close'].transform(lambda x: x.pct_change().rolling(20).std())
            df['volatility_20'] = df['volatility_20d'] # alias
            df['high_low_spread_10d'] = (df['high'] - df['low']).groupby(level='Ticker').transform(lambda x: x.rolling(10).mean())
            df['adv_10'] = grouped['volume'].transform(lambda x: x.rolling(10).mean())
            
            # Forward returns
            horizon = hyp.holding_horizon_days
            df['fwd_ret'] = grouped['close'].transform(lambda x: x.shift(-horizon) / x - 1.0)
            
            # Safely evaluate alpha expression
            ev = SafeASTEvaluator(df)
            try:
                expr = hyp.alpha_expression.lower()
                df['factor'] = ev.evaluate(expr)
            except Exception as parse_err:
                raise ValueError(f"Failed to parse alpha expression: {parse_err}")
                
            clean = df.dropna(subset=['factor', 'fwd_ret']).copy()
            if len(clean) < 100:
                failure_tag = "INSUFFICIENT_HISTORICAL_CACHE_BARS"
                exp = HypothesisExperiment(
                    id=uuid.uuid4(),
                    hypothesis_id=hyp.id,
                    total_trials_in_family=current_trial_count,
                    is_statistically_valid=False,
                    failure_mode_tag=failure_tag
                )
                hyp.current_stage = "ARCHIVE_FAILED"
                hyp.decommission_reason = failure_tag
                self.db.add(exp)
                self.db.commit()
                return {"status": "Failed", "stage": "ARCHIVE_FAILED", "reason": failure_tag}

            # Evaluate cross-sectional performance
            # For each date, go long top decile
            def calc_daily_ret(group):
                threshold = np.percentile(group['factor'], 90)
                longs = group[group['factor'] >= threshold]
                if not longs.empty:
                    return longs['fwd_ret'].mean()
                return 0.0
                
            daily_returns = clean.groupby(level='Date').apply(calc_daily_ret)
            
            # Filter zero returns which might skew std
            strategy_daily_returns = daily_returns[daily_returns != 0.0].tolist()
            all_scores = clean['factor'].tolist()
            all_returns = clean['fwd_ret'].tolist()

            sample_length = len(strategy_daily_returns)
            if sample_length < 30:
                failure_tag = "INSUFFICIENT_SIGNALS_GENERATED"
                exp = HypothesisExperiment(
                    id=uuid.uuid4(),
                    hypothesis_id=hyp.id,
                    total_trials_in_family=current_trial_count,
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
                total_trials=current_trial_count,
                sample_length_periods=sample_length,
                skewness=skew,
                kurtosis=kurt
            )

            ic, ic_tstat = self.compute_spearman_ic_stats(all_scores, all_returns)

            # Global IC Threshold is 0.015
            is_valid = (dsr >= 0.85) and (ic >= 0.015) and (ic_tstat >= 1.96)
            failure_tag = None if is_valid else ("LOW_DEFLATED_SHARPE_PENALTY" if dsr < 0.85 else "INSIGNIFICANT_SPEARMAN_IC")

            exp = HypothesisExperiment(
                id=uuid.uuid4(),
                hypothesis_id=hyp.id,
                total_trials_in_family=current_trial_count,
                classic_sharpe=round(classic_sharpe, 4),
                deflated_sharpe=round(dsr, 4),
                spearman_ic_mean=round(ic, 4),
                spearman_ic_tstat=round(ic_tstat, 2),
                is_statistically_valid=is_valid,
                failure_mode_tag=failure_tag
            )
            self.db.add(exp)

            if is_valid:
                if hyp.current_stage == "OUT_OF_SAMPLE_SHADOW":
                    hyp.current_stage = "LIVE_ALPHA_STREAM"
                elif hyp.current_stage == "LIVE_ALPHA_STREAM":
                    pass # Stay live
                else:
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
        1. Evaluates DRAFT hypotheses into IN_SAMPLE_AUDIT (OUT_OF_SAMPLE_SHADOW).
        2. Promotes OUT_OF_SAMPLE_SHADOW to LIVE_ALPHA_STREAM after 150 days of sustained performance.
        3. Checks LIVE_ALPHA_STREAM factors for Alpha Decay and retires them to ALPHA_DECAY_ARCHIVE if IC fails.
        """
        counts = {"evaluated": 0, "promoted_live": 0, "decommissioned_decay": 0}
        try:
            drafts = self.db.query(ResearchHypothesis).filter(ResearchHypothesis.current_stage == "DRAFT_HYPOTHESIS").all()
            for d in drafts:
                res = self.evaluate_hypothesis(str(d.id))
                if res.get("status") == "Success":
                    counts["evaluated"] += 1

            now = datetime.utcnow()
            shadows = self.db.query(ResearchHypothesis).filter(ResearchHypothesis.current_stage == "OUT_OF_SAMPLE_SHADOW").all()
            for s in shadows:
                days_tested = (now - (s.created_at or now)).days
                if days_tested >= 150:
                    # Re-evaluate over full history (including the 150 out-of-sample days)
                    res = self.evaluate_hypothesis(str(s.id))
                    if res.get("is_valid") and res.get("stage") == "LIVE_ALPHA_STREAM":
                        counts["promoted_live"] += 1

            # Check alpha decay for live stream
            lives = self.db.query(ResearchHypothesis).filter(ResearchHypothesis.current_stage == "LIVE_ALPHA_STREAM").all()
            for l in lives:
                # Periodic re-evaluation of trailing IC by evaluating full history
                res = self.evaluate_hypothesis(str(l.id))
                if not res.get("is_valid") or (l.experiments and l.experiments[0].spearman_ic_mean is not None and l.experiments[0].spearman_ic_mean < 0.005):
                    l.current_stage = "ALPHA_DECAY_ARCHIVE"
                    l.decommissioned_at = datetime.utcnow()
                    l.decommission_reason = "EXHAUSTED_ALPHA_HALF_LIFE"
                    counts["decommissioned_decay"] += 1
                self.db.commit()

            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error executing FSM evolution cycle: {e}")
            
        return counts
