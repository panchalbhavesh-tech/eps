# Institutional Scientific Audit Report (V13)

**Date:** 2026-08-11
**Mandate:** Continuous, adversarial, end-to-end scientific and code-level audit of the quantitative research platform.

---

## 1. Audit Delta (Changes Since V12)

### Fixes Successfully Verified
- **Lookahead Bias:** The `hypothesis_service.py` successfully updated `fwd_ret` to utilize Next-Day Market-on-Open (MOO) execution (`Open_{t+1}`), neutralizing the previous Close-to-Close leakage.
- **Sharpe Ratio Math:** The research engine no longer drops `0.0%` return days, restoring mathematical sanity to the annualized Sharpe by properly incorporating cash drag.

### New Vulnerabilities Discovered (Deep Dive)
- **Catastrophic Inference Mismatch:** The live production scanning engine (`momentum_service.py`) passes the wrong dictionary of features into the Machine Learning prediction pipeline. The ML models are trained on *raw* fundamental and technical features (e.g., `raw_roe`, `raw_pe`), but the live scanner passes pre-aggregated percentile ranks (e.g., `fundamental_score`, `technical_score`). 

---

## 2. Subsystem Verification Status

### Live Production Scanner (`momentum_service.py`)
*   **Implementation Reality:** Runs daily cross-sectional momentum scans and computes ML gain probabilities using the LightGBM models trained in `ml_service.py`.
*   **Fatal Flaws Found:** `momentum_service.py:L287`. The `predict_multi_horizon` function expects `{"raw_roe": x, "raw_de": y, ...}`, but the scanner passes `{"fundamental_score": x, "technical_score": y}`. Because `ml_service.py` uses `.get(feature_name, 0.0)`, this silent failure causes the inference vector to evaluate as `[0.0, 0.0, 0.0, 0.0, 0.0]` for every single stock in the live universe.
*   **False Alpha Risk:** Severe Operational Risk. The backtester uses the correct features, meaning the simulated performance looks incredible. However, the live production scanner generates completely static, meaningless probabilities, causing massive divergence between simulated alpha and live trading execution.

---

## 3. Brutal Interrogation Questions for Engineering

1. **(Production Engineering)** In `momentum_service.py:L287`, why are you passing percentile rank scores (`fundamental_score`) into an ML model that was explicitly trained on raw unscaled features (`raw_roe`)? Are you aware that `predict_multi_horizon` defaults missing keys to `0.0`, meaning your live model is predicting probabilities based on an array of pure zeroes? How did this pass your integration tests?

---

## 4. Institutional Scoring (0-100)

*   **Overall Scientific Score:** 90 (Scientific theory is sound, but operational execution is failing)
*   **Software Architecture Score:** 80 (Downgraded due to silent failure / lack of strict schema validation in ML inference)
*   **Quantitative Research Score:** 85 (Restored after V12 fix)
*   **Machine Learning Score:** 60 (Live inference is completely broken)
*   **Statistical Methodology Score:** 90 
*   **Data Engineering Score:** 75 
*   **Risk Management Score:** 85 
*   **Backtesting Credibility Score:** 90 
*   **Production Readiness Score:** 40 (Live system is trading on zeroed-out features)

---

## 5. The "Kill List" (Critical Vulnerabilities)

1.  **CRITICAL:** Feature Dictionary Mismatch in `momentum_service.py`. The live scanner feeds the wrong keys to `ml_service.py`, resulting in inference executing on arrays of `0.0`.

---

## 6. Remediation Directives (Actionable Engineering Tasks)

### Fix 1: Align Inference Schema
**File:** `momentum_service.py`
**Action:** Update the dictionary passed into `predict_multi_horizon` at L287 to include the exact raw features expected by the model (`raw_roe`, `raw_de`, `raw_pe`, `raw_rel_vol`, `raw_dma200_dist`). Extract these from the `row` object. Note that `de_score` and `pe_score` were negated during metric evaluation, so they must be negated again to restore `raw_de` and `raw_pe`.

---

## 7. Modules to Scrap
- None.

***
