# Continuous Institutional Scientific Audit Report

### Active Code Investigation Log
*   **Target Scope:** `backend/app/services/`
*   **Files Interrogated:** `universe_service.py`, `momentum_service.py`, `ml_service.py`, `weight_learning_service.py`, `backtest_service.py`, `purged_cv_service.py`.

---

## 1. Audit Delta (Changes Since Last Audit)
*As this is the inaugural continuous audit run, there is no prior baseline to compare against. All identified flaws are treated as newly discovered zero-day quantitative vulnerabilities.*

---

## 2. Subsystem Verification Status

### A. Universe Definition (`universe_service.py`)
*   **Implementation Reality:** Successfully implements Point-in-Time (PIT) survivorship bias mitigation. It uses a `HistoricalConstituent` table with `added_date` and `removed_date` to reconstruct historical indexes, correctly returning only active tickers for a given historical date.
*   **Fatal Flaws Found:** None. This module adheres to institutional standards.
*   **False Alpha Risk:** Low. Survivorship bias is appropriately mitigated.

### B. Feature Engineering & Selection (`ml_service.py`)
*   **Implementation Reality:** Uses SHAP values via a LightGBM pass to rank and select features. 
*   **Fatal Flaws Found:** `ml_service.py:74`. **[CRITICAL LOOKAHEAD BIAS]**
    ```python
    X = df[surviving_cols].fillna(df[surviving_cols].median())
    ```
    The system calculates the median of the *entire* historical dataframe to fill NaNs *before* cross-validation splits. This leaks future distributional data (the global median) into past training folds, artificially improving SHAP rankings and model performance.
*   **False Alpha Risk:** High. The feature selector is evaluating features based on future information.

### C. Factor Weight Optimization (`weight_learning_service.py`)
*   **Implementation Reality:** Uses ElasticNet regression with Cross-Validation to learn dynamic weights for technical, fundamental, and smart money scores.
*   **Fatal Flaws Found:** `weight_learning_service.py:42-43`. **[CRITICAL LOOKAHEAD BIAS]**
    ```python
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    enet = ElasticNetCV(..., cv=5)
    ```
    The `StandardScaler` is fitted and transformed on the entire dataset (`X`) *prior* to passing it into `ElasticNetCV`. This calculates the mean and variance using the entire temporal horizon and normalizes the data, completely destroying the integrity of the K-Fold CV. 
*   **False Alpha Risk:** Extreme. The model is learning weights based on normalized data that contains future lookahead leakage.

### D. Purged Cross-Validation (`purged_cv_service.py`)
*   **Implementation Reality:** Implements a custom `PurgedKFoldCV` class that drops overlapping training horizons and applies a post-test embargo.
*   **Fatal Flaws Found:** `purged_cv_service.py:28` & `47`. **[LOGICAL FLAW]**
    The class accepts an `embargo_pct` parameter (default 0.01) and calculates `embargo_samples = max(1, int(len(df) * self.embargo_pct))`. However, this variable is entirely ignored. The actual embargo logic hardcodes a 5-day window: `(test_end_time + np.timedelta64(5, 'D'))`. This means the class behaves completely differently than its API contract suggests, breaking flexibility for higher-frequency or lower-frequency models.
*   **False Alpha Risk:** Moderate. The hardcoded 5-day embargo might be insufficient for the 10-day prediction horizon (`prob_10d`), leading to serial correlation leakage.

### E. Backtesting & Execution (`backtest_service.py`)
*   **Implementation Reality:** The intensive backtest engine simulates historical trades with dynamic entry/exit logic and trailing ATR stop losses.
*   **Fatal Flaws Found:** None critical, but exhibits **Execution Unreality**. The system applies a static 0.1% entry/exit slippage + 0.20% friction (total 0.40%). It does not factor in the Average Daily Volume (ADV) relative to the `position_size_pct`. A 20% portfolio weight in a low-volume stock will incur massive market impact, which is currently ignored.
*   **False Alpha Risk:** Moderate to High. Historical returns will be overstated for low-liquidity micro-caps.

---

## 3. Institutional Scoring (0-100)
| Metric | Score | Justification |
| :--- | :--- | :--- |
| **Overall Scientific Score** | **58 / 100** | Fatal lookahead leakage in ML and weight optimization invalidates backtests. |
| Software Architecture Score | 82 / 100 | Clean service-oriented design; good separation of concerns. |
| Quantitative Research Score | 65 / 100 | Strong foundational concepts, but flawed execution in scaling/imputing. |
| Machine Learning Score | 40 / 100 | CV leakage due to global scaling and global median imputation. |
| Statistical Methodology Score | 70 / 100 | Correct use of IC, Deflated Sharpe, and ROC AUC, but KFold leakage ruins inputs. |
| Data Engineering Score | 85 / 100 | Excellent PIT survivorship bias handling. |
| Risk Management Score | 75 / 100 | Solid HRP implementation and trailing ATR stops. |
| Backtesting Credibility | 55 / 100 | Static slippage and leaked model weights create false confidence. |
| Production Readiness | 60 / 100 | Architecture is ready, but the algorithms need immediate remediation. |

---

## 4. The "Kill List" (Critical Vulnerabilities)
1.  **Global StandardScaler Leakage (Critical):** `weight_learning_service.py` scales the entire historical dataset before cross-validation. This mathematically invalidates all learned composite weights.
2.  **Global Median Imputation (Critical):** `ml_service.py` fills missing feature values using the global median across all time before the SHAP feature selection process, leaking future data into past decisions.
3.  **Hardcoded CV Embargo (High):** `purged_cv_service.py` ignores its `embargo_pct` initialization parameter and hardcodes a 5-day embargo, which is insufficient for the 10-day prediction horizon models, causing serial correlation leakage.
4.  **Static Execution Assumptions (Medium):** `backtest_service.py` assumes infinite liquidity at 0.1% slippage.

---

## 5. Remediation Directives (Actionable Engineering Tasks)

### Fix 1: Resolve Leakage in `weight_learning_service.py`
Wrap the `StandardScaler` and `ElasticNet` inside a `scikit-learn` Pipeline so that scaling is calculated strictly *per fold* inside the CV loop.
```python
# In weight_learning_service.py, replace lines 41-54 with:
from sklearn.pipeline import Pipeline
from sklearn.model_selection import KFold

X = factor_scores_df[features].fillna(50.0).values
y = forward_returns

pipeline = Pipeline([
    ('scaler', StandardScaler()),
    ('enet', ElasticNetCV(l1_ratio=[0.1, 0.5, 0.7, 0.9, 0.95, 0.99, 1.0], 
                          cv=KFold(n_splits=5, shuffle=False), # Must not shuffle time-series!
                          positive=True, n_jobs=-1, random_state=42))
])

pipeline.fit(X, y)
coefs = pipeline.named_steps['enet'].coef_
```

### Fix 2: Resolve Leakage in `ml_service.py` Feature Selection
Do not use `fillna` with the global median. Use `SimpleImputer` fit only on the expanding window or train split, or utilize LightGBM's native missing value handling.
```python
# In ml_service.py:74, replace:
# X = df[surviving_cols].fillna(df[surviving_cols].median())
# With:
X = df[surviving_cols] # Let LGBM natively handle NaNs during split logic
```

### Fix 3: Fix `purged_cv_service.py` Embargo Logic
Make the embargo dynamic based on the actual prediction horizon being tested, rather than a hardcoded 5 days.
```python
# In purged_cv_service.py:47, replace:
# if test_end_time < train_time <= (test_end_time + np.timedelta64(5, 'D')):
# With:
embargo_days = max(5, horizon_days) # Dynamically use the longest horizon
if test_end_time < train_time <= (test_end_time + np.timedelta64(embargo_days, 'D')):
```

---

## 6. Modules to Scrap
*   **None currently.** All modules serve a legitimate institutional purpose, provided the critical leakage flaws in Phase 3 (ML) are patched.

***

### 5 Brutal Questions for the Engineering Team:
1. In `weight_learning_service.py:42`, you execute `scaler.fit_transform(X)` on the *entire historical array* before passing it to `ElasticNetCV`. Are you aware this calculates variance using future price data, meaning your "learned" factor weights are mathematically cheating?
2. In `purged_cv_service.py:47`, you explicitly calculate `embargo_samples` based on percentage, but then abandon it to hardcode `np.timedelta64(5, 'D')`. Since you train models on a 10-day horizon (`target_10d`), how do you justify an embargo that is 5 days shorter than your prediction horizon, guaranteeing overlapping returns and serial correlation leakage?
3. In `ml_service.py:74`, you run `.fillna(df[...].median())` across the entire dataframe *before* SHAP evaluation. Why are you passing future distributional knowledge to your feature selector? 
4. In `backtest_service.py:173`, your algorithm buys at `Open * 1.001` regardless of the company's Average Daily Volume (ADV) or the position size. How can you defend a $5B AUM deployment when a 20% portfolio allocation in an illiquid stock will face exponentially higher market impact than your static 0.1% assumption?
5. You use `KFold(n_splits=5, shuffle=False)` in `purged_cv_service.py:26`. While you manually purge the training indices later in the generator, the base `KFold` splits the dataset sequentially. Have you verified that an expanding-window (Walk-Forward) approach wouldn't be vastly superior for preventing regime-specific lookahead bias compared to K-Fold?
