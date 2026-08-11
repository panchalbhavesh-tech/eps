# Institutional Scientific Audit Report (V14)

**Date:** 2026-08-11
**Mandate:** Continuous, adversarial, end-to-end scientific and code-level audit of the quantitative research platform.

---

## 1. Audit Delta (Changes Since V13)

### Fixes Successfully Verified
- **ML Inference Realism:** The catastrophic mismatch in `momentum_service.py` was neutralized. The production scanner now correctly maps live percentile arrays back to their raw fundamental components (`raw_roe`, `raw_pe`), feeding accurate schema to LightGBM and successfully reactivating dynamic real-time probabilities across the universe.

### New Vulnerabilities Discovered (Deep Dive)
- **Close-to-Close Leakage in ML Labeling (`labeling_service.py`):** The Triple-Barrier method used to construct the target dataset for LightGBM training computes barrier hits relative to the exact Close price of the signal generation day.
- **Close-to-Close Leakage in ML Evaluation (`backtest_service.py`):** The post-hoc vectorization pass that computes the Brier Score and ML Hit Rate in the Intensive Backtest compares future Close prices against the Close price of the signal generation day, rather than the tradable Next-Day Open.

---

## 2. Subsystem Verification Status

### Machine Learning Labeling Engine (`labeling_service.py`)
*   **Implementation Reality:** Employs Marcos Lopez de Prado's Triple Barrier Method to classify signals into +1 (Profit Target), -1 (Stop Loss), and 0 (Time Stop).
*   **Fatal Flaws Found:** `labeling_service.py:L28` defines `entry_price = df['Close'].iloc[idx]`. This means the training targets (`target_5d`) assume zero-latency execution exactly at the moment the signal is computed. The model is inadvertently being trained to predict overnight gaps, not tradable momentum.
*   **False Alpha Risk:** High. The ML models are learning patterns that rely on impossible execution conditions.

### Backtest ML Evaluation (`backtest_service.py`)
*   **Implementation Reality:** Evaluates the calibration (Brier Score) and directional hit rate of the ML predictions independent of the trading rules.
*   **Fatal Flaws Found:** `backtest_service.py:L247` calculates `actual_gain = 1 if future_price_5d > price else 0`, where `price` is recorded as `cur_price` (the signal day's Close). This inflates the reported ML Hit Rate in the backtest summaries.

---

## 3. Brutal Interrogation Questions for Engineering

1. **(Machine Learning)** In `labeling_service.py`, you are calculating profit target barrier breaches using `Close_t` as the entry price. If a stock closes at ₹100, you generate a signal, and it opens the next day at ₹105 (hitting the profit target instantly), your labeler records a win. But in reality, you bought at ₹105. Why are your ML targets assuming time-travel execution?
2. **(Quantitative Evaluation)** In `backtest_service.py:L245`, why are you scoring ML predictions against `Close_t` when you already correctly enforce MOO (`Open_{t+1}`) for actual trade execution in the same file? Why the disconnect between trade realism and metric evaluation?

---

## 4. Institutional Scoring (0-100)

*   **Overall Scientific Score:** 92 (Production logic is solidifying; resolving systemic lookahead artifacts)
*   **Software Architecture Score:** 85 
*   **Quantitative Research Score:** 88 
*   **Machine Learning Score:** 80 (Recovered from V13's 60, but penalized for training label leakage)
*   **Statistical Methodology Score:** 90 
*   **Data Engineering Score:** 75 
*   **Risk Management Score:** 85 
*   **Backtesting Credibility Score:** 92 
*   **Production Readiness Score:** 90 (Massive jump after V13's inference schema fix)

---

## 5. The "Kill List" (Critical Vulnerabilities)

1.  **HIGH:** Close-to-Close Leakage in `TripleBarrierLabeler` (`labeling_service.py`).
2.  **HIGH:** Close-to-Close Leakage in Backtest ML Ledger (`backtest_service.py`).

---

## 6. Remediation Directives (Actionable Engineering Tasks)

### Fix 1: MOO execution for ML Target Labeling
**File:** `labeling_service.py`
**Action:** Change `entry_price = df['Close'].iloc[idx]` to `entry_price = df['Open'].iloc[idx + 1]`.

### Fix 2: MOO execution for Backtest ML Hit Rate
**File:** `backtest_service.py`
**Action:** Change `prediction_ledger.append((i, prob_gain, cur_price))` to record `df.iloc[i + 1]['Open']` as the execution baseline.

---

## 7. Modules to Scrap
- None.

***
