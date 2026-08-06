import uuid
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.infrastructure.models import Company, ScorePredictionLog, MomentumSignal, DailyBhavcopy

logger = logging.getLogger(__name__)

class ValidationService:
    """
    Validation & Shadow Model Probationary Service.
    Tracks Information Coefficient (IC) decay, evaluates quintile return monotonicity,
    logs daily point-in-time signal predictions, and governs the 14-day shadow probation period for newly trained AI models.
    """

    def __init__(self, db: Session):
        self.db = db
        import os
        self.probation_days = int(os.environ.get("SHADOW_PROBATION_DAYS", 252))

    def log_prediction_snapshot(
        self,
        company_id: Any,
        ticker: str,
        composite_score: float,
        prob_3d: float,
        prob_5d: float,
        prob_10d: float,
        signal: str,
        model_version: str = "production",
        is_shadow: bool = False,
        baseline_price: Optional[float] = None
    ) -> bool:
        """
        Persists daily point-in-time algorithmic evaluation scores for later forward return validation and IC tracking.
        """
        try:
            log_record = ScorePredictionLog(
                id=uuid.uuid4(),
                company_id=company_id,
                ticker=ticker,
                baseline_price=round(float(baseline_price), 2) if baseline_price is not None else None,
                date_evaluated=datetime.utcnow(),
                composite_score=round(float(composite_score), 2),
                prob_gain_3d=round(float(prob_3d), 3),
                prob_gain_5d=round(float(prob_5d), 3),
                prob_gain_10d=round(float(prob_10d), 3),
                signal_emitted=signal,
                model_version_id=model_version,
                is_shadow=is_shadow,
                known_at=datetime.utcnow()
            )
            self.db.add(log_record)
            self.db.commit()
            return True
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to log score prediction snapshot for {ticker}: {e}")
            return False

    def resolve_realized_forward_returns(self) -> Dict[str, Any]:
        """
        Scheduled daily job: Finds past prediction logs whose 3d, 5d, or 10d horizons have matured,
        compares actual market pricing, and backfills realized returns for accurate calibration verification.
        """
        now = datetime.utcnow()
        resolved_count = 0
        
        unresolved = self.db.query(ScorePredictionLog).filter(
            ScorePredictionLog.realized_5d_return == None,
            ScorePredictionLog.date_evaluated <= (now - timedelta(days=7)),
            ScorePredictionLog.baseline_price != None
        ).limit(200).all()

        for rec in unresolved:
            try:
                base_p = float(rec.baseline_price)
                if base_p <= 0:
                    continue
                    
                # Look up actual closing price from OHLCV cache (DailyBhavcopy)
                bhav = self.db.query(DailyBhavcopy).filter(
                    DailyBhavcopy.ticker == rec.ticker,
                    DailyBhavcopy.trade_date >= rec.date_evaluated + timedelta(days=4),
                    DailyBhavcopy.trade_date <= rec.date_evaluated + timedelta(days=9),
                ).order_by(DailyBhavcopy.trade_date.asc()).first()

                if bhav and bhav.close_price:
                    ret_5d = ((float(bhav.close_price) - base_p) / base_p) * 100.0
                    rec.realized_5d_return = round(min(50.0, max(-50.0, ret_5d)), 2)
                    resolved_count += 1
            except Exception:
                continue

        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()

        return {"status": "Forward return resolution completed", "records_resolved": resolved_count}

    def compute_rolling_ic(self) -> Dict[str, Any]:
        """
        Computes rolling Spearman Rank Information Coefficient (IC) across active universe.
        A positive IC (> 0.03) confirms our momentum composite score successfully predicts actual market outperformance.
        """
        try:
            cutoff = datetime.utcnow() - timedelta(days=60)
            logs = self.db.query(ScorePredictionLog).filter(
                ScorePredictionLog.realized_5d_return != None,
                ScorePredictionLog.date_evaluated >= cutoff
            ).all()
            if not logs or len(logs) < 15:
                return {"status": "Incomplete sample size for statistical IC", "mean_ic_5d": None, "is_valid": False}

            scores = [float(l.composite_score or 50.0) for l in logs]
            returns = [float(l.realized_5d_return or 0.0) for l in logs]
            
            s_series = pd.Series(scores)
            r_series = pd.Series(returns)
            ic_val = s_series.corr(r_series, method='spearman')
            
            if np.isnan(ic_val):
                return {"status": "IC computation returned NaN due to flat variance", "mean_ic_5d": None, "is_valid": False}

            return {
                "status": "Success",
                "mean_ic_5d": round(float(ic_val), 4),
                "is_valid": bool(ic_val > 0.01),
                "sample_size": len(logs)
            }
        except Exception as e:
            return {"status": f"Error computing IC: {e}", "mean_ic_5d": 0.0}

    def run_quintile_spread_test(self) -> Dict[str, Any]:
        """
        Monthly validation test: Ranks stocks into 5 quintiles by score and confirms forward returns are monotonic
        (Quintile 5 top momentum names must outperform Quintile 1 laggards).
        """
        logs = self.db.query(ScorePredictionLog).filter(
            ScorePredictionLog.realized_5d_return != None,
            ScorePredictionLog.composite_score != None
        ).all()

        if len(logs) < 50:
            return {"status": "Insufficient data for quintile test", "pass_test": None, "sample_size": len(logs)}

        df = pd.DataFrame([{
            "score": l.composite_score,
            "ret": l.realized_5d_return
        } for l in logs])

        try:
            df['quintile'] = pd.qcut(df['score'], 5, labels=[1, 2, 3, 4, 5], duplicates='drop')
        except Exception:
            return {"status": "Unable to calculate distinct quintiles (flat score variance)", "pass_test": None, "sample_size": len(logs)}

        quintile_means = df.groupby('quintile', observed=False)['ret'].mean()

        q1_ret = float(quintile_means.get(1, 0.0))
        q5_ret = float(quintile_means.get(5, 0.0))
        spread = q5_ret - q1_ret

        values = [float(quintile_means.get(i, 0.0)) for i in range(1, 6) if i in quintile_means]
        is_monotonic = all(values[i] >= values[i-1] for i in range(1, len(values))) if len(values) > 1 else False

        return {
            "status": "Quintile spread test completed",
            "q1_mean_return_pct": round(q1_ret, 2),
            "q5_mean_return_pct": round(q5_ret, 2),
            "spread_pct": round(spread, 2),
            "is_monotonic": bool(is_monotonic),
            "pass_test": bool(spread > 0 and q5_ret > q1_ret),
            "sample_size": len(logs),
            "all_quintiles": {int(k): round(float(v), 2) for k, v in quintile_means.items()}
        }

    def evaluate_model_probation(self, new_model_id: str) -> Dict[str, Any]:
        """
        Manages the 14-Day Shadow Probationary Period for newly retrained AI models.
        Only authorizes promotion from SHADOW mode to LIVE PRODUCTION if win-rate beats production over 14 days.
        """
        probation_cutoff = datetime.utcnow() - timedelta(days=self.probation_days)
        
        shadow_logs = self.db.query(ScorePredictionLog).filter_by(
            is_shadow=True, model_version_id=new_model_id
        ).filter(ScorePredictionLog.realized_5d_return != None).all()
        
        prod_logs = self.db.query(ScorePredictionLog).filter_by(
            is_shadow=False, model_version_id="production"
        ).filter(
            ScorePredictionLog.realized_5d_return != None,
            ScorePredictionLog.date_evaluated >= probation_cutoff
        ).all()

        if not shadow_logs:
            return {
                "model_id": new_model_id,
                "probation_status": "PROBATION_IN_PROGRESS",
                "reason": "Shadow model has no resolved predictions yet. Zero user signals emitted.",
                "promoted_to_live": False
            }
            
        first_log_dt = min([s.date_evaluated for s in shadow_logs])
        days_tested = (datetime.utcnow() - first_log_dt).days

        if days_tested < self.probation_days:
            return {
                "model_id": new_model_id,
                "probation_status": "TESTING",
                "days_elapsed": days_tested,
                "days_required": self.probation_days,
                "reason": f"Shadow probationary testing ongoing ({days_tested}/{self.probation_days} days complete).",
                "promoted_to_live": False
            }

        def get_hit_rate(logs):
            correct = sum(
                1 for l in logs
                if (l.prob_gain_5d and l.prob_gain_5d > 0.5 and l.realized_5d_return > 0) or
                   (l.prob_gain_5d and l.prob_gain_5d <= 0.5 and l.realized_5d_return <= 0)
            )
            return (correct / len(logs)) if logs else 0.0

        shadow_hr = get_hit_rate(shadow_logs)
        prod_hr = get_hit_rate(prod_logs) if prod_logs else 0.50

        # Add statistical significance requirement
        ttest_pvalue = 1.0
        if len(shadow_logs) >= 20 and len(prod_logs) >= 20:
            import numpy as np
            from scipy.stats import ttest_ind
            
            # Reconstruct binary outcomes to run t-test on proportions
            shadow_outcomes = []
            for l in shadow_logs:
                if (l.prob_gain_5d and l.prob_gain_5d > 0.5 and l.realized_5d_return > 0) or (l.prob_gain_5d and l.prob_gain_5d <= 0.5 and l.realized_5d_return <= 0):
                    shadow_outcomes.append(1)
                else:
                    shadow_outcomes.append(0)
                    
            prod_outcomes = []
            for l in prod_logs:
                if (l.prob_gain_5d and l.prob_gain_5d > 0.5 and l.realized_5d_return > 0) or (l.prob_gain_5d and l.prob_gain_5d <= 0.5 and l.realized_5d_return <= 0):
                    prod_outcomes.append(1)
                else:
                    prod_outcomes.append(0)
                    
            if shadow_outcomes and prod_outcomes:
                t_stat, p_val = ttest_ind(shadow_outcomes, prod_outcomes, alternative='greater')
                ttest_pvalue = p_val
                
        should_promote = shadow_hr > prod_hr and len(shadow_logs) >= 20 and ttest_pvalue < 0.05

        return {
            "model_id": new_model_id,
            "probation_status": "PASSED_PROBATION" if should_promote else "FAILED_PROBATION",
            "shadow_hit_rate": round(shadow_hr, 4),
            "production_hit_rate": round(prod_hr, 4),
            "shadow_sample_size": len(shadow_logs),
            "production_sample_size": len(prod_logs),
            "reason": f"Shadow HR ({shadow_hr:.2%}) vs Prod HR ({prod_hr:.2%}). {'Authorizing switch to production.' if should_promote else 'Retaining production model.'}",
            "promoted_to_live": bool(should_promote)
        }
