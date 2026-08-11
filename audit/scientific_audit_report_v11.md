# Institutional Scientific Audit Report (V11)

**Date:** 2026-08-11
**Mandate:** Continuous, adversarial, end-to-end scientific and code-level audit of the quantitative research platform.

---

## 1. Audit Delta (Changes Since V10)

### Fixes Successfully Verified
- **Portfolio Compounding Error:** The `risk_engine.py` kill switch was successfully rewritten to evaluate the *Average Trailing Trade Return* rather than sequentially compounding overlapping trades. This restores mathematical integrity to the portfolio risk module.
- **Statistical ML Gate:** The validation gate in `ml_service.py` was elevated to demand a ROC AUC > `0.55`, properly separating signal from random noise.

### New Vulnerabilities Discovered (Deep Dive)
- **Execution Unreality (Gap-Down Lookahead Bias):** The backtester assumes guaranteed stop-loss execution at the exact limit price, completely ignoring overnight gap-down risk.
- **Mathematical Deception in CV:** The `purged_cv_service.py` explicitly claims to execute Marcos Lopez de Prado's "Purged K-Fold CV", but strictly executes a basic expanding-window Walk-Forward CV. 

---

## 2. Subsystem Verification Status

### Backtesting Engine (`backtest_service.py`)
*   **Implementation Reality:** Simulates momentum trades with trailing ATR stop-losses.
*   **Fatal Flaws Found:** `backtest_service.py:L211`. The exit logic `raw_exit = stop_loss if cur_bar['Low'] <= stop_loss else cur_price` mathematically assumes that if the Low of the day pierces the stop loss, the fill is miraculously executed at the exact stop loss limit. If the stock *gaps down* at the Open past the stop loss, the system still pretends it was filled at the higher stop loss price. This is a severe form of execution lookahead bias that artificially suppresses tail risk.
*   **False Alpha Risk:** High. In bear regimes, overnight gaps are fatal. This flaw systematically hides left-tail risk, making the Sharpe ratio appear massively higher than it would be in live trading.

### Machine Learning Cross-Validation (`purged_cv_service.py`)
*   **Implementation Reality:** Performs Walk-Forward expanding window cross-validation.
*   **Fatal Flaws Found:** `purged_cv_service.py:L42`. The training sets (`np.arange(0, train_end)`) only grow forward in time. This is Walk-Forward CV. True "Purged K-Fold" (Combinatorial Purged CV) trains on both past *and future* data relative to the test fold to maximize data efficiency, utilizing purging and embargoing on both temporal boundaries. The docstring and class name are misleading.
*   **False Alpha Risk:** None directly (Walk-Forward is actually more conservative and entirely prevents lookahead bias), but it represents technical debt and documentation falsehood ("Documentation is Fiction").

---

## 3. Brutal Interrogation Questions for Engineering

1. **(Backtester)** In `backtest_service.py:L211`, you assume guaranteed fills at the exact trailing stop price. If the stock opens -10% down below your stop loss due to an overnight earnings miss, how do you justify the backtester magically filling you at the original stop limit? Are you simulating a time machine?
2. **(ML Pipeline)** Why is your `PurgedKFoldCV` class in `purged_cv_service.py` mathematically executing a standard Walk-Forward expanding window split? Do you understand the difference between Combinatorial Purged K-Fold and Walk-Forward CV, or was this blindly copied from a textbook?

---

## 4. Institutional Scoring (0-100)

*   **Overall Scientific Score:** 86
*   **Software Architecture Score:** 92
*   **Quantitative Research Score:** 80 
*   **Machine Learning Score:** 88 (Walk-Forward is valid, but docked for mislabeling)
*   **Statistical Methodology Score:** 90 
*   **Data Engineering Score:** 75 
*   **Risk Management Score:** 85 (Restored after V10 fix)
*   **Backtesting Credibility Score:** 70 (Downgraded heavily due to gap-down execution lookahead bias)
*   **Production Readiness Score:** 85

---

## 5. The "Kill List" (Critical Vulnerabilities)

1.  **CRITICAL:** Gap-Down Lookahead Bias in `backtest_service.py`. Overnight gap downs below the stop loss are ignored, falsely assigning the fill at the stop limit. This systematically hides left-tail risk.

---

## 6. Remediation Directives (Actionable Engineering Tasks)

### Fix 1: Gap-Down Execution Realism
**File:** `backtest_service.py`
**Action:** Update the stop-loss exit logic to check the Open price of the current bar. If the Open price is *already below* the stop loss, the `raw_exit` must be the Open price, not the stop loss price (plus slippage). 
*Pseudocode constraint:*
`raw_exit = cur_bar['Open'] if cur_bar['Open'] < stop_loss else stop_loss`

### Fix 2: Rename CV Class for Truthfulness
**File:** `purged_cv_service.py` (and references in `ml_service.py`)
**Action:** Rename `PurgedKFoldCV` to `PurgedWalkForwardCV` and update the docstring to accurately reflect that it is an expanding window split with an embargo period, NOT a Combinatorial Purged K-Fold. 

---

## 7. Modules to Scrap
- None.

***
