# Institutional Scientific Audit Report (V10)

**Date:** 2026-08-11
**Mandate:** Continuous, adversarial, end-to-end scientific and code-level audit of the quantitative research platform.

---

## 1. Audit Delta (Changes Since V9)

### Fixes Successfully Verified
- **Pre-Processing Leakage:** `weight_learning_service.py` correctly uses `GridSearchCV` and a `Pipeline` to scale inside cross-validation.
- **HRP Crash Risk:** `portfolio_construction_service.py` correctly floors variance to `1e-8`, averting divide-by-zero crashes.
- **Multiple Testing:** `validation_service.py` accurately implements the Bonferroni correction for FWER control.
- **Vectorization:** `backtest_service.py` correctly utilizes Pandas C-level structures (`min_periods=1`) for massive speedups.

### Superficial or Incomplete Fixes
- **Survivorship Bias:** Per user instruction, the platform is restricted to analysis-mode only. The dynamic liquidity floor was removed, meaning the system consciously accepts survivorship bias against the current NSE universe.

### New Vulnerabilities Discovered
- **Invalid Portfolio Compounding:** `risk_engine.py` calculates Maximum Drawdown by taking a sequential `.cumprod()` of individual, overlapping trade returns, mathematically hallucinating a completely invalid equity curve.
- **Weak Statistical Gate:** `ml_service.py` promotes models based on an AUC > 0.52, which is indistinguishable from random noise for small samples.

---

## 2. Subsystem Verification Status

### Risk Management (`risk_engine.py`)
*   **Implementation Reality:** Attempts to act as a portfolio kill-switch based on trailing 30-day max drawdown.
*   **Fatal Flaws Found:** `risk_engine.py:L43-45`. It extracts a flat list of `realized_5d_return` from overlapping individual trades and sequentially compounds them (`np.cumprod(1 + returns)`). This is mathematically disastrous. If you have 5 concurrent trades that each make 2%, your portfolio is up 2% (assuming equal weight). This code compounds them to 1.02^5 = 10.4%. Conversely, overlapping losses will violently overstate the drawdown, triggering false kill-switch activations.
*   **False Alpha Risk:** High operational risk of randomly terminating the system due to fabricated drawdowns.

### Machine Learning Pipeline (`ml_service.py`)
*   **Implementation Reality:** Uses purged walk-forward CV to evaluate a LightGBM classifier.
*   **Fatal Flaws Found:** `ml_service.py:L104`. `clears_gate = gbm_acc >= lr_acc or gbm_acc > 0.52`. The variable `gbm_acc` stores the ROC AUC score. Comparing AUC to 0.52 as a baseline for statistical edge is far too weak; 0.50 is a random coin flip. 
*   **False Alpha Risk:** High. Models that merely got lucky on noise will clear the gate and proceed to the rigorous FWER shadow test, burning valuable cycles.

### Factor Attribution (`factor_attribution_service.py`)
*   **Implementation Reality:** Approximates Fama-French using the Nifty 50 and Smallcap 100.
*   **Fatal Flaws Found:** `factor_attribution_service.py:L48`. `ff_df['HML'] = 0.0`. It explicitly zeroes out the Value factor. 
*   **False Alpha Risk:** Medium. By ignoring Value, any returns derived from the Value factor are incorrectly bucketed into the strategy's "unexplained Alpha", inflating the perceived skill of the model.

---

## 3. Brutal Interrogation Questions for Engineering

1. **(Risk Engine)** In `risk_engine.py:L45`, you compound a flat array of individual trade returns (`np.cumprod`) to build an "equity curve". Have you realized that compounding 10 simultaneous overlapping positions sequentially mathematically breaks the laws of portfolio return weighting? 
2. **(ML Pipeline)** In `ml_service.py:L104`, why is your hardcoded baseline for an acceptable ROC AUC score set to 0.52? Don't you agree this is statistically indistinguishable from a random walk in small financial datasets?
3. **(Factor Research)** By hardcoding the HML (Value) factor to `0.0` in `factor_attribution_service.py:L48`, are you aware that you are intentionally falsely attributing Value-driven returns to your proprietary Alpha?

---

## 4. Institutional Scoring (0-100)

*   **Overall Scientific Score:** 84 (Up significantly due to V9 remediation, but held back by Risk Engine logic flaw)
*   **Software Architecture Score:** 92
*   **Quantitative Research Score:** 80 (HML zeroed out)
*   **Machine Learning Score:** 85 (Weak AUC gate)
*   **Statistical Methodology Score:** 90 (FWER successfully applied)
*   **Data Engineering Score:** 75 (Survivorship bias accepted)
*   **Risk Management Score:** 40 (Fatal portfolio compounding error)
*   **Backtesting Credibility Score:** 90 (Vectorization & 10% caps verified)
*   **Production Readiness Score:** 85

---

## 5. The "Kill List" (Critical Vulnerabilities)

1.  **CRITICAL:** Invalid Portfolio Equity Curve in `risk_engine.py`. Individual overlapping trade returns are being sequentially compounded, rendering the Max Drawdown (MDD) kill switch mathematically meaningless and erratic.
2.  **HIGH:** Weak AUC Gate in `ml_service.py`. A ROC AUC of 0.52 is insufficient to prove predictive edge.

---

## 6. Remediation Directives (Actionable Engineering Tasks)

### Fix 1: Correct Portfolio Compounding
**File:** `risk_engine.py`
**Action:** Instead of sequentially compounding individual trades, assume the portfolio returns are the average of the individual trade returns over that period, or strictly evaluate the drawdown on a per-trade basis without compounding them sequentially. Since the DB logs don't easily yield daily portfolio equity, change the kill switch to track the **average realized return** or **win rate** dropping below a threshold, rather than calculating a hallucinated `.cumprod()` drawdown.

### Fix 2: Elevate Statistical Gate
**File:** `ml_service.py`
**Action:** Update `clears_gate = gbm_acc >= lr_acc or gbm_acc > 0.55` to demand a minimum 0.55 AUC for an edge.

---

## 7. Modules to Scrap
- None.

***
