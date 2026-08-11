# Institutional Scientific Audit Report (V12)

**Date:** 2026-08-11
**Mandate:** Continuous, adversarial, end-to-end scientific and code-level audit of the quantitative research platform.

---

## 1. Audit Delta (Changes Since V11)

### Fixes Successfully Verified
- **Execution Realism:** The backtester in `backtest_service.py` successfully implemented gap-down check logic, absorbing overnight gap risk correctly instead of hallucinating fills at the stop-loss limit.
- **Statistical Nomenclature:** The CV class was renamed to `PurgedWalkForwardCV` across the ML services, properly reflecting its expanding window mechanics.

### New Vulnerabilities Discovered (Deep Dive)
- **Close-to-Close Lookahead Leakage:** The `hypothesis_service.py` research environment computes alpha factor performance assuming immediate execution at the current day's Close price, despite the signal only being generated *at* the Close.
- **Sharpe Ratio Inflation via Data Dropping:** The research cross-sectional backtester arbitrarily filters out 0.0% return days from the time series, mathematically inflating the Sharpe Ratio by ignoring uninvested capital drag.

---

## 2. Subsystem Verification Status

### Hypothesis Research Alpha Stream (`hypothesis_service.py`)
*   **Implementation Reality:** Evaluates generated alpha expressions (e.g., `(close - rolling_mean(close, 50))`) cross-sectionally to calculate Information Coefficients and Sharpe ratios before promoting them.
*   **Fatal Flaws Found:** 
    1.  `hypothesis_service.py:L240`: `df['fwd_ret'] = grouped['close'].transform(lambda x: x.shift(-horizon) / x - 1.0)`. It assumes the entry price is the Close of day $t$. Because the factor is calculated on day $t$ (requiring the Close of day $t$ to exist), it is impossible to execute the trade at Close of day $t$. This is classic Close-to-Close lookahead leakage. The entry must be the *Open* of day $t+1$.
    2.  `hypothesis_service.py:L287`: `strategy_daily_returns = daily_returns[daily_returns != 0.0].tolist()`. It filters out any day where the strategy didn't fire (returned 0.0). By removing 0% return days, the sample size (N) artificially shrinks, and the drag of uninvested capital is ignored, massively inflating the annualized Sharpe Ratio.
*   **False Alpha Risk:** Critical. Evaluating alpha factors with Close-to-Close returns is the most common cause of "paper millionaires" in quant finance. Any mean-reversion signal will look incredibly profitable if you can magically buy it at the exact Close it mean-reverted from.

---

## 3. Brutal Interrogation Questions for Engineering

1. **(Alpha Research)** In `hypothesis_service.py:L240`, how exactly do you plan to buy a stock at the 3:30 PM Close price if your signal requires the 3:30 PM Close price to calculate? Are you assuming zero latency and a time machine? Why aren't you entering on the next day's Open?
2. **(Statistics)** In `hypothesis_service.py:L287`, why do you drop all 0.0% return days from your strategy returns array? If a fund has no signals on a Tuesday, does Tuesday cease to exist in the calendar year? Do you realize you are systematically inflating the Sharpe Ratio by ignoring cash drag?

---

## 4. Institutional Scoring (0-100)

*   **Overall Scientific Score:** 88
*   **Software Architecture Score:** 92
*   **Quantitative Research Score:** 65 (Severely downgraded due to Close-to-Close leakage and Sharpe inflation)
*   **Machine Learning Score:** 90 
*   **Statistical Methodology Score:** 90 
*   **Data Engineering Score:** 75 
*   **Risk Management Score:** 85 
*   **Backtesting Credibility Score:** 90 (Restored via gap-down realism)
*   **Production Readiness Score:** 85

---

## 5. The "Kill List" (Critical Vulnerabilities)

1.  **CRITICAL:** Close-to-Close Lookahead Bias in `hypothesis_service.py`. The research environment assumes instantaneous execution at the Close price used to generate the signal.
2.  **HIGH:** Sharpe Ratio inflation via dropping 0.0 return days.

---

## 6. Remediation Directives (Actionable Engineering Tasks)

### Fix 1: Next-Day Open Execution
**File:** `hypothesis_service.py`
**Action:** Update the `fwd_ret` calculation to calculate the return from the *Open* of the next day (`t+1`) to the *Close* of the target horizon (`t+horizon`). This simulates a realistic market-on-open (MOO) execution.
*Formula:* `Close[t+horizon] / Open[t+1] - 1.0`

### Fix 2: Retain Uninvested Cash Drag
**File:** `hypothesis_service.py`
**Action:** Do not drop `0.0` from `daily_returns`. Remove the filtering logic on L287. All days in the sample must be included in the standard deviation and mean calculations to accurately reflect the true Sharpe Ratio.

---

## 7. Modules to Scrap
- None.

***
