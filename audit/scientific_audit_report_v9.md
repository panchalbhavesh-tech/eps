# Institutional Scientific Audit Report (V9)

**Date:** 2026-08-11
**Mandate:** Continuous, adversarial, end-to-end scientific and code-level audit of the quantitative research platform.

---

## 1. Audit Delta (Changes Since V8)

### Fixes Successfully Verified
- **Eradicated CV Leakage:** `purged_cv_service.py` has been completely rewritten to use a mathematically sound expanding-window walk-forward split.
- **Eradicated Feature Selection Leakage:** `ml_service.py` now correctly applies `SelectFromModel` strictly inside the cross-validation pipelines.
- **Removed Pseudoscience:** The PCA sequence embedding logic (which broke isotonic calibration) has been successfully deleted.
- **Execution Realism:** `backtest_service.py` successfully implemented a dynamic ADV-based market impact (slippage) model.
- **Labeling Asymmetry:** `labeling_service.py` correctly maps stop-loss hits to `-1`, allowing the classifier to learn downside risk.

### Superficial or Incomplete Fixes
- **Survivorship Bias:** `universe_service.py` was updated to pull the current `EQUITY_L.csv` from the NSE. While this broadens the universe significantly, it completely ignores historically delisted equities. **The system is still fundamentally backtesting on a survivor-biased universe.** (Note: Acknowledged as a limitation due to lack of a premium data feed, but scientifically, this remains a severe handicap).

### New Vulnerabilities Discovered
- **Leakage in Weight Learning:** A severe lookahead bias was discovered in `weight_learning_service.py` regarding the preprocessing of the covariance/factor matrix.
- **HRP Numerical Instability:** The `portfolio_construction_service.py` contains a fatal numerical bug that will crash the allocator if any asset has zero variance (e.g., stale pricing).

---

## 2. Subsystem Verification Status

### Machine Learning Pipeline (`ml_service.py`, `purged_cv_service.py`)
*   **Implementation Reality:** Structurally sound. Walk-forward CV and pipeline scaling/imputing are strictly point-in-time.
*   **Fatal Flaws Found:** None.
*   **False Alpha Risk:** Low.

### Factor & Weight Learning (`weight_learning_service.py`)
*   **Implementation Reality:** Uses ElasticNet with `TimeSeriesSplit` to learn factor weights, but pre-processes data across the entire timeline first.
*   **Fatal Flaws Found:** `weight_learning_service.py:L42-43`. `scaler = StandardScaler()` followed by `X_scaled = scaler.fit_transform(X)` scales the entire dataset *before* the `TimeSeriesSplit` CV. This leaks future test set variance and mean into the training folds.
*   **False Alpha Risk:** High. The ElasticNet model is tuning its L1 ratio using hyperparameters optimized on future data distributions.

### Portfolio Construction (`portfolio_construction_service.py`)
*   **Implementation Reality:** Attempts Hierarchical Risk Parity (HRP) but lacks robust numerical safeguards.
*   **Fatal Flaws Found:** `portfolio_construction_service.py:L131`. `ivp = 1. / np.diag(cov)`. If any asset has zero variance (common in Indian small-caps with stale pricing), this triggers a divide-by-zero (`inf`). The subsequent normalization `ivp /= ivp.sum()` divides by `inf`, broadcasting `NaN` across the entire portfolio weight vector.
*   **False Alpha Risk:** Critical execution failure risk (portfolio generation crash).

### Backtesting Engine (`backtest_service.py`)
*   **Implementation Reality:** Uses a square-root ADV market impact model for slippage.
*   **Fatal Flaws Found:** `backtest_service.py:L174`. The slippage model calculates `participation_rate = trade_value / adv_inr`. However, there is no hard cap on volume participation. The engine will blindly execute a 10M INR order on a stock trading 1M INR a day, assuming it just pays high slippage, whereas in reality, that order would never fill in a single auction.
*   **False Alpha Risk:** Medium. Backtests on illiquid micro-caps may assume fills that are physically impossible.

### Validation & Shadow Testing (`validation_service.py`)
*   **Implementation Reality:** Tracks IC and quintile monotonicity correctly. Conducts t-tests for shadow model promotion.
*   **Fatal Flaws Found:** No Multiple Testing Control (e.g., Deflated Sharpe Ratio or Bonferroni correction). If you train 50 shadow models, one will pass the t-test (p < 0.05) purely by random chance.
*   **False Alpha Risk:** Medium. High risk of promoting overfitted models if iteration velocity is high.

---

## 3. Brutal Interrogation Questions for Engineering

1. **(Weight Learning)** In `weight_learning_service.py:L43`, you scale the entire dataset using `StandardScaler.fit_transform(X)` before the `TimeSeriesSplit` loop. How can you justify evaluating out-of-sample regularizations when your training folds already possess the mean and variance of the 2026 test data?
2. **(HRP Instability)** In `portfolio_construction_service.py:L131`, your Inverse Variance Portfolio (IVP) does `1. / np.diag(cov)`. Have you ever tested this on an illiquid NSE stock with a flatline price history (variance = 0.0)? Are you aware this silently destroys the entire weight array with `NaN`s?
3. **(Execution Reality)** Your backtester calculates slippage dynamically, but where is your volume participation limit? Why does the system allow entering a position that constitutes 500% of a stock's Average Daily Volume in a single trade?
4. **(Survivorship Bias)** The new `universe_service.py` fetches `EQUITY_L.csv` from the NSE. Since this list only contains *currently* trading equities, how do you mathematically defend the resulting historical backtests from the fact that you are pre-selecting the winners?
5. **(Statistical Significance)** Your shadow probation uses a standard 0.05 p-value t-test. Given that you can spin up endless permutations of ML models, where is your Family-Wise Error Rate (FWER) adjustment to prevent promoting a model that simply got lucky?

---

## 4. Institutional Scoring (0-100)

*   **Overall Scientific Score:** 68 (Up from V8, but held back by pre-processing leakage and survivorship bias)
*   **Software Architecture Score:** 85 (Solid decoupling and service patterns)
*   **Quantitative Research Score:** 65 (HRP and factors are theoretically sound but practically flawed)
*   **Machine Learning Score:** 80 (Walk-forward CV and pipelines are now robust)
*   **Statistical Methodology Score:** 55 (Pre-scaling leakage, lack of multiple testing control)
*   **Data Engineering Score:** 45 (Unresolved survivorship bias, lack of point-in-time fundamentals)
*   **Risk Management Score:** 75 (CVaR sample sizes fixed, but HRP numerical risks remain)
*   **Backtesting Credibility Score:** 60 (Market impact model added, but missing volume caps)
*   **Production Readiness Score:** 50 (Portfolio construction will crash on illiquid names)

---

## 5. The "Kill List" (Critical Vulnerabilities)

1.  **CRITICAL:** Pre-processing Leakage in `weight_learning_service.py`. Scaling the entire dataset prior to CV breaks the temporal barrier for hyperparameter tuning.
2.  **CRITICAL:** Divide-by-Zero in Hierarchical Risk Parity (`portfolio_construction_service.py`). Stale prices will broadcast `NaN`s and crash the daily portfolio generation.
3.  **HIGH:** Uncapped Volume Participation in `backtest_service.py`. Allows physically impossible fills in illiquid equities.

---

## 6. Remediation Directives (Actionable Engineering Tasks)

### Fix 1: Wrap Scaler in Pipeline for Weight Learning
**File:** `weight_learning_service.py`
**Action:** Remove `scaler.fit_transform(X)` at line 43. Since `ElasticNetCV` doesn't natively accept a pipeline for its internal CV, you must either scale manually inside a custom CV loop, or switch to using `GridSearchCV` wrapped around a `Pipeline([('scaler', StandardScaler()), ('enet', ElasticNet())])` with `TimeSeriesSplit`.

### Fix 2: Add Numerical Safeguards to HRP
**File:** `portfolio_construction_service.py`
**Action:** Update `_get_ivp`:
```python
def _get_ivp(self, cov: pd.DataFrame) -> np.ndarray:
    var = np.diag(cov)
    # Safeguard against zero variance
    var = np.where(var < 1e-8, 1e-8, var)
    ivp = 1. / var
    ivp /= ivp.sum()
    return ivp
```

### Fix 3: Implement Max Participation Caps
**File:** `backtest_service.py`
**Action:** In `_simulate_momentum_ml_strategy`, if `participation_rate > 0.10` (10% of ADV), either reject the trade entirely, or cap the executed trade value at 10% of ADV and compute returns on that reduced capital.

---

## 7. Modules to Scrap
- None at this stage. The core architectural modules are all necessary; they simply require rigorous numerical and statistical hardening.
