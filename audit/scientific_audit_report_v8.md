# Scientific Audit Report v8 — Continuous Institutional Audit

**Audit Date:** 2026-08-11
**Auditor Role:** Independent Institutional Quantitative Researcher
**Codebase Scope:** Full `backend/app/services/` layer (27 service files), `infrastructure/models.py`, `worker/celery_app.py`

---

## Phase 1: Codebase Interrogation — Evidence of Anti-Patterns

### 1.1 CRITICAL: Feature Selection SHAP Leakage
**File:** [ml_service.py:L72-L92](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L72-L92)

The `feature_selection()` method fits a LightGBM model on the **entire DataFrame** (including test data) to compute SHAP importances, then uses those importances to select features for the real model.

```python
# Line 74-77: THE ENTIRE DATASET IS USED
X = df[surviving_cols].fillna(df[surviving_cols].median())  # Median includes future data
y = df[target_col].values
model = lgb.LGBMClassifier(n_estimators=30, random_state=42, verbose=-1)
model.fit(X, y)  # FIT ON ALL DATA — MASSIVE LEAKAGE
```

> [!CAUTION]
> **Severity: FATAL.** Feature selection done on the full dataset guarantees lookahead bias. The model "knows" which features matter because it has already seen the future. Any reported accuracy or Sharpe is inflated.

**Fix:** Feature selection must happen **inside each CV fold's training split only**. Move the SHAP pass inside `purged_walk_forward_cv()`.

---

### 1.2 CRITICAL: ML Feature Imputation Leaks Future Data
**File:** [ml_service.py:L74](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L74)

```python
X = df[surviving_cols].fillna(df[surviving_cols].median())
```

The `.median()` is computed over the **entire DataFrame**, including test-period rows. This is a textbook data leakage vector in time-series ML.

> [!WARNING]
> **Severity: HIGH.** Imputation statistics must be computed from the training set only and then applied to the test set. Use a `Pipeline` with `SimpleImputer` fitted inside CV folds (which *is* done correctly in `purged_walk_forward_cv` at L123, but not here in `feature_selection`).

---

### 1.3 CRITICAL: Purged CV Uses sklearn KFold Internally
**File:** [purged_cv_service.py:L26](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/purged_cv_service.py#L26)

```python
kf = KFold(n_splits=self.n_splits, shuffle=False)
```

The purging logic wraps sklearn's `KFold`, which splits data into **equal-sized contiguous blocks**. While the subsequent purging (L36-51) removes overlapping samples, the fundamental issue is:

1. **Non-expanding training sets:** In fold 1, the model is trained on rows AFTER the test set (future data), violating temporal causality. Standard KFold allows training on data that comes chronologically *after* the test period.
2. **Embargo is hardcoded to 5 days** (L47) regardless of the `embargo_pct` parameter passed at initialization (L14). The `embargo_pct` is never actually used in `split()`.

> [!CAUTION]
> **Severity: FATAL.** A true Walk-Forward CV should only train on data **before** the test period (expanding or sliding window). The current KFold-based purging still allows training on chronologically future data for folds 1 through N-1.

**Fix:** Replace with a true expanding-window Walk-Forward split where training data always precedes test data temporally:
```python
def split(self, df, time_col, horizon_days=5):
    n = len(df)
    min_train = max(50, n // 5)
    fold_size = (n - min_train) // self.n_splits
    for i in range(self.n_splits):
        test_start = min_train + i * fold_size
        test_end = test_start + fold_size
        train_end = test_start - horizon_days  # purge buffer
        yield np.arange(0, train_end), np.arange(test_start, min(test_end, n))
```

---

### 1.4 HIGH: Backtest Assumes Execution at Close Price
**File:** [backtest_service.py:L172-L173](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/backtest_service.py#L172-L173)

```python
entry_price = df.iloc[i + 1]['Open'] * 1.001  # 0.1% entry slippage
```

While entry uses next-day Open (good), the fixed 0.1% slippage is unrealistically low for Indian mid/small-cap equities. Real slippage depends on:
- **Average Daily Volume (ADV):** Not factored in.
- **Market Impact:** For positions > 1% of ADV, slippage can be 0.5-2%.
- **Bid-Ask Spread:** Not modeled.

The flat 0.20% round-trip friction (L188) also ignores:
- **STT** (0.025% on sell for delivery)
- **Brokerage** (varies, can be 0.01-0.05%)
- **GST** (18% on brokerage)
- **SEBI Turnover Charges**
- **Stamp Duty** (varies by state, 0.003-0.015%)

> [!WARNING]
> **Severity: HIGH.** Static slippage and friction models produce optimistic backtest returns.

---

### 1.5 HIGH: Universe Service — Toy Seed Data
**File:** [universe_service.py:L40-L51](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/universe_service.py#L40-L51)

The `sync_historical_constituents()` method seeds **only 9 stocks** (4 active, 5 removed). The NIFTY 500 index has ~500 constituents that change quarterly.

```python
seed_data = [
    ("NIFTY500", "RELIANCE", "2010-01-01", None),
    ("NIFTY500", "HDFCBANK", "2010-01-01", None),
    # ... only 9 entries total
]
```

If the `HistoricalConstituent` table is empty (which it will be on first deployment), the `get_pit_universe()` method returns an empty list, meaning `scan_and_rank_universe()` in `momentum_service.py` scans **zero stocks**. The entire scanning pipeline silently produces nothing.

> [!IMPORTANT]
> **Severity: HIGH.** The survivorship-bias-free universe system exists in name only. In production, you need to source full historical NIFTY 500 reconstitution data from NSE's official index history files.

---

### 1.6 HIGH: PCA Sequence Embeddings — Pseudoscience Risk
**File:** [ml_service.py:L367-L396](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L367-L396)

The `generate_sequence_embeddings()` method:
1. Fits PCA on a **30-day window** of 2-column data (returns + volume changes). With only 29 rows and 2 columns, PCA produces exactly 2 components that are trivially the original series rotated.
2. The embeddings are then applied as a **linear bonus** to the probability (L355-358):

```python
emb_bonus = (sequence_embeddings[0] * 0.02 + sequence_embeddings[1] * 0.015)
prob_5d = round(min(0.98, max(0.02, prob_5d + emb_bonus)), 3)
```

This is adding an arbitrary, unvalidated linear adjustment to a calibrated probability, **destroying the calibration**.

> [!WARNING]
> **Severity: HIGH.** The PCA embeddings on a 2-column matrix are mathematically trivial (just a rotation). The hardcoded 0.02/0.015 multipliers are not learned or validated. This feature should be removed until properly validated through the hypothesis testing pipeline.

---

### 1.7 HIGH: Composite Score Weights — Fallback to Hardcoded Heuristics
**File:** [weight_learning_service.py:L17-L23](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/weight_learning_service.py#L17-L23)

The default weights (35% technical, 25% fundamental, 15% smart money, 15% regime, 10% derivatives) are used whenever the learned weights file doesn't exist or the training sample is < 50 rows. These are arbitrary.

Additionally, the `learn_weights()` method (L28-L72) uses `ElasticNetCV` with **standard 5-fold CV** (not time-series CV), which allows the regularization parameter to be selected using future data.

---

### 1.8 MEDIUM: Event Study — Fama-French HML Factor is Always Zero
**File:** [factor_attribution_service.py:L42-L43](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/factor_attribution_service.py#L42-L43)

```python
# HML is hard to proxy without a dedicated Value index on yf.
ff_df['HML'] = 0.0
```

The Fama-French 3-factor model is reduced to a 2-factor model (Market + SMB). HML (Value minus Growth) is a significant factor that captures 10-20% of cross-sectional return variation. Setting it to zero means:
- Abnormal returns computed in event studies are biased.
- Stocks with value tilts will show spurious alpha.

---

### 1.9 MEDIUM: Validation Service Docstring vs. Code Mismatch
**File:** [validation_service.py:L16](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/validation_service.py#L16)

The docstring says **"14-day shadow probation period"** but the code uses `self.probation_days = int(os.environ.get("SHADOW_PROBATION_DAYS", 252))` (L22), which defaults to **252 trading days (1 year)**.

This is a documentation-code disconnect. If a developer reads the docstring and expects 14 days, they will be confused by the actual 252-day behavior.

---

### 1.10 MEDIUM: Risk Engine CVaR Calculation — Insufficient Sample
**File:** [risk_engine.py:L62-L67](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/risk_engine.py#L62-L67)

```python
var_95_idx = int(0.05 * len(sorted_rets))
if len(sorted_rets) >= 30 and var_95_idx > 0:
    cvar_95 = np.mean(sorted_rets[:var_95_idx]) * 100.0
```

With 30 observations, `var_95_idx = int(0.05 * 30) = 1`. The CVaR (Expected Shortfall) is then the mean of **a single observation**, which is not statistically meaningful.

---

### 1.11 MEDIUM: Triple-Barrier Labeler — Asymmetric Label Encoding
**File:** [labeling_service.py:L46](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/labeling_service.py#L46)

```python
# Check Stop Loss (Lower Barrier)
if (low - entry_price) / entry_price <= self.sl_pct:
    label = 0  # 0 or -1 depending on classification scheme
    break
```

Both stop-loss hits AND vertical barrier timeouts produce `label = 0`. This conflates two very different outcomes (active loss vs. no signal). A 3-class scheme (1, 0, -1) or at minimum distinguishing stop-loss exits would give the ML model more information.

---

### 1.12 LOW: `yfinance` Missing Import in `momentum_service.py`
**File:** [momentum_service.py:L32](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/momentum_service.py#L32)

```python
nifty_df = yf.download('^NSEI', period='1y', progress=False)
```

`yf` (yfinance) is used at L32 but is **not imported** at the top of the file. It is only imported inside `_apply_hrp_post_processing()` at L467. The `get_market_regime()` method will raise a `NameError` at runtime.

---

## Phase 2: Brutal Interrogation Questions

1. **In [ml_service.py:L74](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L74), you compute `fillna(df[surviving_cols].median())` on the entire dataset before any train/test split. How do you justify this future-data leakage?**

2. **In [purged_cv_service.py:L26](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/purged_cv_service.py#L26), your "purged" CV wraps sklearn `KFold`, which places future data in the training set for folds 1 through N-1. How is this not direct lookahead bias?**

3. **In [backtest_service.py:L188](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/backtest_service.py#L188), you use a flat 0.20% round-trip friction. Can you prove this is realistic for mid-cap Indian equities with ADV < 5 Cr, where the bid-ask spread alone can be 0.3-0.5%?**

4. **In [ml_service.py:L355](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L355), you add `emb_bonus = (sequence_embeddings[0] * 0.02 + sequence_embeddings[1] * 0.015)` to the calibrated probability. Where is the statistical evidence that these hardcoded multipliers improve predictive power, and how do you justify destroying the isotonic calibration?**

5. **In [universe_service.py:L40-L51](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/universe_service.py#L40-L51), you seed only 9 stocks for a "NIFTY500" universe. How does a 9-stock universe produce cross-sectionally valid percentile ranks when the real index has 500 constituents?**

6. **In [hypothesis_service.py:L287](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/hypothesis_service.py#L287), you filter out zero-return days before computing Sharpe. This biases the Sharpe upward by removing "no-action" periods. Why isn't zero return a valid observation?**

7. **In [factor_attribution_service.py:L43](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/factor_attribution_service.py#L43), HML is hardcoded to 0.0. This makes your "Fama-French 3-factor model" a 2-factor model. How do you account for value factor exposure in your abnormal return calculations?**

8. **In [weight_learning_service.py:L53](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/weight_learning_service.py#L53), `ElasticNetCV` uses standard 5-fold CV (not time-series aware). Why isn't this a leakage vector for the regularization parameter selection?**

9. **In [momentum_service.py:L141](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/momentum_service.py#L141), `smart_money_val = (promoter * 0.3) + (inst_holding * 0.5) + (deliv_pct * 0.2)`. Where is the empirical justification for these weights? Were they learned or are they arbitrary?**

10. **In [backtest_service.py:L142](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/backtest_service.py#L142), `clears_gate = gbm_acc >= lr_acc or gbm_acc > 0.52`. A 52% AUC threshold is trivially close to random chance (50%). Why is this gate so permissive?**

---

## Phase 3: The Institutional Audit Report

### 1. Audit Delta (Changes Since Last Audit)

Based on comparison with prior audit reports (v5, v6, v7):

| Area | Status | Evidence |
|------|--------|----------|
| PIT Fundamentals | ✅ **Genuinely Fixed** | `FundamentalSnapshot` model exists, `merge_asof(direction='backward')` used in backtest_service.py:L62 |
| Purged CV | ⚠️ **Partially Fixed** | `PurgedKFoldCV` exists but wraps `KFold`, allowing future data in training for non-final folds |
| Triple-Barrier Labeling | ✅ **Genuinely Fixed** | `TripleBarrierLabeler` correctly implemented |
| Deflated Sharpe Ratio | ✅ **Genuinely Fixed** | `calculate_deflated_sharpe()` follows Bailey & Lopez de Prado (2014) formula |
| HRP Portfolio Construction | ✅ **Genuinely Fixed** | Ledoit-Wolf shrinkage + proper HRP algorithm |
| Probability Calibration | ⚠️ **Partially Fixed** | `CalibratedClassifierCV(method='isotonic')` used but then destroyed by PCA embedding bonus |
| Survivorship Bias | ⚠️ **Partially Fixed** | `UniverseService` + `HistoricalConstituent` model exists but seed data is 9 stocks |
| Feature Selection Leakage | ❌ **NOT Fixed** | SHAP computed on full dataset in `feature_selection()` |
| White's Reality Check | ✅ **Genuinely Fixed** | Block bootstrap implementation in `multiple_testing_service.py` |
| BH-FDR Control | ✅ **Genuinely Fixed** | Applied across all active hypotheses in `hypothesis_service.py:L427-L453` |
| PBO (Probability of Backtest Overfitting) | ✅ **Genuinely Fixed** | CSCV implementation in `statistical_testing_service.py:L91-L158` |

**New Vulnerabilities Introduced:**
- PCA Sequence Embedding bonus destroys calibrated probabilities
- `yfinance` import missing in `momentum_service.py`

---

### 2. Subsystem Verification Status

#### Signals & Features
| Aspect | Code Reality | Fatal Flaws |
|--------|-------------|-------------|
| Technical Score | Cross-sectional percentile rank of 5 indicators | **None critical** — correctly ranked |
| Fundamental Score | PIT snapshots via `FundamentalSnapshot` + `merge_asof` | **Medium:** Falls back to `Company` table (lookahead) when snapshot missing |
| Smart Money Score | `(promoter * 0.3) + (inst_holding * 0.5) + (deliv_pct * 0.2)` | **Arbitrary weights**, not learned or empirically justified |
| Derivatives Score | `((rel_vol * 40) + (deliv_pct * 0.6)) / distance_to_200DMA` | **Nonsensical formula** — dividing by price distance is dimensionally incoherent |

#### Machine Learning Pipeline
| Aspect | Code Reality | Fatal Flaws |
|--------|-------------|-------------|
| Feature Selection | SHAP on full dataset | **FATAL: Future data leakage** |
| Cross-Validation | KFold with purging overlay | **FATAL: Non-temporal fold structure** |
| Calibration | Isotonic + PCA bonus override | **HIGH: Calibration destroyed** |
| Feature Engineering | 5 raw features only | **LOW: Insufficient feature space** |
| Drift Detection | PSI implementation exists | **OK** |

#### Hypothesis Research Engine (QHLM)
| Aspect | Code Reality | Fatal Flaws |
|--------|-------------|-------------|
| DSR Calculation | Correct formula from Bailey & LdP 2014 | **None** |
| Multiple Testing | BH-FDR + White's RC + trial counting | **Good** |
| Alpha Expression Safety | Safe AST evaluator (whitelist approach) | **Good** |
| Factor Orthogonalization | Cross-sectional demeaning | **OK but single-factor** |
| Stage Transitions | 5-stage FSM with 150-day shadow | **Good design** |
| IS/OOS Separation | Cutoff by `created_at` timestamp | **Good** |

#### Portfolio Construction
| Aspect | Code Reality | Fatal Flaws |
|--------|-------------|-------------|
| HRP Algorithm | Correct Lopez de Prado implementation | **None** |
| Covariance Shrinkage | Ledoit-Wolf | **Good** |
| Sector Constraints | Iterative capping with redistribution | **OK** |
| Capacity Modeling | **MISSING** | **HIGH: No ADV-based capacity limits** |

#### Risk Management
| Aspect | Code Reality | Fatal Flaws |
|--------|-------------|-------------|
| Kill Switch | MDD-based with CVaR auxiliary | **OK but CVaR unreliable with small N** |
| Correlation Gate | Spearman > 0.78 rejection | **Good** |
| Event Blackout | 3-day pre-earnings suppression | **Good** |
| Sector Cap | 30% max with dynamic checking | **Good** |
| VaR/ES Limits | CVaR computed but threshold logic weak | **Medium** |

#### Data Engineering
| Aspect | Code Reality | Fatal Flaws |
|--------|-------------|-------------|
| OHLCV Source | yfinance with retry + corporate action detection | **MEDIUM: yfinance can return adjusted/unadjusted inconsistently** |
| PIT Discipline | `known_at` timestamps on all models | **Good** |
| Survivorship Bias | `HistoricalConstituent` table with PIT queries | **HIGH: Only 9 seed stocks** |
| Symbol Mapping | `.NS` / `.BO` suffix logic | **OK** |
| Timezone Handling | Explicit `Asia/Kolkata` conversion | **Good** |

---

### 3. Institutional Scoring (0-100)

| Category | Score | Justification |
|----------|-------|---------------|
| **Overall Scientific** | **42** | Feature selection leakage and non-temporal CV invalidate reported ML metrics |
| Software Architecture | **62** | Clean service separation, proper ORM models, Celery scheduling. Lacks CI/CD, testing |
| Quantitative Research | **58** | Strong QHLM design with DSR/FDR. Undermined by HML=0 and arbitrary signal weights |
| Machine Learning | **30** | Feature selection leakage, non-temporal CV, destroyed calibration, only 5 features |
| Statistical Methodology | **65** | DSR, BH-FDR, White's RC, PBO, Patell Z, block bootstrap all present and mostly correct |
| Data Engineering | **48** | PIT framework exists but universe is 9 stocks, yfinance dependency fragile |
| Risk Management | **60** | Kill switch, correlation gate, sector caps, event blackout all present. CVaR unreliable |
| Backtesting Credibility | **38** | Unrealistic slippage, no ADV-based market impact, no capacity modeling |
| Production Readiness | **35** | Missing import (`yf` in momentum_service), no integration tests, no monitoring |

---

### 4. The "Kill List" (Critical Vulnerabilities)

#### Critical Statistical Risks

| # | Vulnerability | File | Line(s) | Severity |
|---|-------------|------|---------|----------|
| 1 | SHAP feature selection on full dataset (lookahead) | ml_service.py | L72-92 | **FATAL** |
| 2 | Purged CV wraps KFold (trains on future data) | purged_cv_service.py | L26 | **FATAL** |
| 3 | Median imputation on full dataset (leakage) | ml_service.py | L74 | **HIGH** |
| 4 | PCA embedding bonus destroys isotonic calibration | ml_service.py | L355-358 | **HIGH** |
| 5 | Filtering zero-return days biases Sharpe upward | hypothesis_service.py | L287 | **MEDIUM** |
| 6 | HML = 0 makes FF3 a 2-factor model | factor_attribution_service.py | L43 | **MEDIUM** |
| 7 | ElasticNet weight learning uses non-temporal CV | weight_learning_service.py | L53 | **MEDIUM** |

#### Critical Implementation Risks

| # | Vulnerability | File | Line(s) | Severity |
|---|-------------|------|---------|----------|
| 8 | Missing `yfinance` import causes NameError | momentum_service.py | L32 | **HIGH** |
| 9 | Universe seed data = 9 stocks (empty scans) | universe_service.py | L40-51 | **HIGH** |
| 10 | CVaR on single observation (N=30, 5th percentile = 1 obs) | risk_engine.py | L62-67 | **MEDIUM** |
| 11 | Static 0.20% slippage ignores ADV/market impact | backtest_service.py | L188 | **MEDIUM** |
| 12 | `embargo_pct` parameter is unused in split() | purged_cv_service.py | L14 vs L47 | **LOW** |

#### Hidden Mathematical Assumptions

| # | Assumption | Location |
|---|-----------|----------|
| 13 | Smart money weights (0.3/0.5/0.2) are optimal | momentum_service.py:L141 |
| 14 | 0.52 AUC is sufficient to deploy a model | ml_service.py:L142 |
| 15 | Risk-free rate is exactly 6.5% p.a. | backtest_service.py:L251, factor_attribution_service.py:L32 |
| 16 | Derivatives formula is dimensionally coherent | momentum_service.py:L142 |
| 17 | 252-day probation is sufficient for model validation | validation_service.py:L22 |
| 18 | Nifty 50 (^NSEI) is an adequate market benchmark for all NSE stocks | Multiple files |

---

### 5. Remediation Directives

#### [MUST FIX #1] Replace Feature Selection with In-Fold SHAP

**File:** [ml_service.py](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py)

Move feature selection inside the purged CV loop. On each fold's training set only:
```python
def purged_walk_forward_cv(self, df, feature_cols, target_col, embargo_days=10):
    for train_idx, test_idx in cv.split(df, time_col):
        X_train = df.iloc[train_idx][feature_cols]
        y_train = df.iloc[train_idx][target_col]
        
        # Feature selection on TRAINING SET ONLY
        imputer = SimpleImputer(strategy='median')
        X_train_imp = imputer.fit_transform(X_train)
        
        selector_model = lgb.LGBMClassifier(n_estimators=30, verbose=-1)
        selector_model.fit(X_train_imp, y_train)
        importances = selector_model.feature_importances_
        top_k = np.argsort(importances)[-20:]
        selected_features = [feature_cols[i] for i in top_k]
        
        # Now train real model on selected features only
        ...
```

#### [MUST FIX #2] Replace KFold with True Walk-Forward Split

**File:** [purged_cv_service.py](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/purged_cv_service.py)

```python
def split(self, df, time_col, horizon_days=5):
    df = df.sort_values(by=time_col).reset_index(drop=True)
    n = len(df)
    min_train = max(100, n // 4)
    fold_size = (n - min_train) // self.n_splits
    embargo = max(1, int(n * self.embargo_pct))
    
    for i in range(self.n_splits):
        test_start = min_train + i * fold_size
        test_end = min(test_start + fold_size, n)
        train_end = test_start - horizon_days - embargo
        
        if train_end < 20:
            continue
        
        train_idx = np.arange(0, train_end)
        test_idx = np.arange(test_start, test_end)
        yield train_idx, test_idx
```

#### [MUST FIX #3] Remove PCA Embedding Bonus

**File:** [ml_service.py:L352-L359](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L352-L359)

Delete lines 352-359 entirely. If PCA embeddings are to be used, they must be included as features in the LightGBM model and validated through the standard CV pipeline, not as ad-hoc post-prediction adjustments.

#### [MUST FIX #4] Add Missing yfinance Import

**File:** [momentum_service.py](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/momentum_service.py)

Add `import yfinance as yf` to the top-level imports.

#### [REDESIGN] Universe Service

**File:** [universe_service.py](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/universe_service.py)

The 9-stock seed must be replaced with a proper data ingestion pipeline that loads full NIFTY 500 historical reconstitution data. Consider sourcing from:
- NSE's official index methodology documents
- nsearchives.nseindia.com for historical constituent lists
- A third-party data vendor (e.g., Economatic, Bloomberg)

#### [ELEVATE] Add ADV-Based Slippage Model

**File:** [backtest_service.py](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/backtest_service.py)

```python
def estimate_slippage(self, trade_value, adv_20d):
    """Market impact model: slippage = 0.1% + 0.5% * sqrt(trade_value / adv_20d)"""
    if adv_20d <= 0:
        return 0.005  # 50 bps default for illiquid
    participation_rate = trade_value / adv_20d
    return 0.001 + 0.005 * np.sqrt(participation_rate)
```

---

### 6. Modules to Scrap

| Module | Reason | Recommendation |
|--------|--------|----------------|
| PCA Sequence Embeddings (`generate_sequence_embeddings` + `emb_bonus` logic) | Mathematically trivial on 2-column data, destroys calibration, no statistical validation | **DELETE** until validated through QHLM pipeline |
| Derivatives Score formula (`momentum_service.py:L142`) | Dimensionally incoherent (dividing a dollar-volume by a percentage distance) | **REDESIGN** with proper options OI/PCR data or **DELETE** |

---

### Summary

The platform has made **meaningful architectural progress** since earlier audits — the QHLM hypothesis engine with DSR/FDR/White's RC is genuinely institutional-grade in design, and the PIT framework with `FundamentalSnapshot` + `known_at` timestamps shows serious intent. However, the ML pipeline contains **two fatal leakage vectors** (full-dataset feature selection and non-temporal KFold) that invalidate any reported model accuracy. The universe service seed data makes the cross-sectional ranking system non-functional in production. These 4 must-fix items should be the immediate priority before any further feature development.
