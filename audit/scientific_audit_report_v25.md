# QEPS Institutional Scientific Audit Report
## Continuous Adversarial Code-Level Verification — Cycle 25
**Audit Date:** 2026-08-27 | **Auditor Role:** Independent Institutional Quantitative Researcher
**Prior Audit:** Cycle 24 (2026-08-21)
**Audit Protocol:** `strict_audit.md` v6 (Anti-Regression)
**Branch:** `unified_data_provider`

---

## Phase 0: Audit Persistence Ledger (Kill List Re-Verification)

**ENFORCEMENT RULE:** If any Critical from Cycle 24 is still UNRESOLVED, the Overall Scientific Score is hard-capped at 20/100.

### Cycle 24 Kill List — Re-Verification

Cycle 24 closed with **zero Critical or High vulnerabilities** and a single LOW finding:

---

### Prior Issue #1: NSE_ALL Expansion — DELISTED_MASTER.csv Accuracy (LOW)
**Prior Citation:** `universe_service.py:L70`
**Current Code at `universe_service.py:L70-L76`:**
```python
            delisted_path = "data/DELISTED_MASTER.csv"
            if os.path.exists(delisted_path):
                delisted_df = pd.read_csv(delisted_path)
                if 'SYMBOL' in delisted_df.columns:
                    df = pd.concat([df, delisted_df], ignore_index=True)
                    logger.info("Loaded historical delisted master dataset to prevent survivorship bias.")
```
**Status: UNRESOLVED (LOW — remains LOW)**
The code path still depends on a static CSV file whose completeness is unverifiable from the codebase. If this CSV is empty/missing, `NSE_ALL` degrades to current-day-only listings. However, this was LOW severity and does not trigger the enforcement cap.

---

### Standing Item: Point-in-Time Fundamental Data Lookahead Bias

> **strict_audit.md** mandates: *"The point-in-time fundamental data lookahead bias has been flagged repeatedly. This round, you must either (a) locate the exact code path where fundamentals are joined to price/date and show it now uses an as-of/reporting-lag join, or (b) confirm it is still broken."*

**Investigation — Three Code Paths:**

#### Path A: Backtest Service (RESOLVED)
`backtest_service.py:L49-L73`:
```python
        from app.infrastructure.models import FundamentalSnapshot
        query_results = self.db.query(FundamentalSnapshot).filter(FundamentalSnapshot.ticker == ticker).all()
        ...
        snapshots = snapshots.sort_values('trade_date')
        snapshots['trade_date_dt'] = pd.to_datetime(snapshots['trade_date']).dt.tz_localize(None)
        df = pd.merge_asof(
            df.sort_values(date_col),
            snapshots[['trade_date_dt', 'roe', 'debt_to_equity', 'pe_ratio']],
            left_on=date_col,
            right_on='trade_date_dt',
            direction='backward'
        )
```
Uses `pd.merge_asof(direction='backward')` keyed on the `FundamentalSnapshot.trade_date` field. The model docstring (`models.py:L430-L431`) confirms:
```python
    # trade_date represents the date this information became publicly actionable
    # (e.g. filing/announcement date), NOT the fiscal period end date.
```
**Verdict: Correctly implemented.**

#### Path B: ML Service Training (RESOLVED)
`ml_service.py:L187-L190`:
```python
                    f_snap = self.db.query(FundamentalSnapshot).filter(
                        FundamentalSnapshot.ticker == ticker,
                        FundamentalSnapshot.trade_date <= signal.date_calculated
                    ).order_by(FundamentalSnapshot.trade_date.desc()).first()
```
Correctly uses `trade_date <= signal.date_calculated` with `desc()` ordering — a point-in-time backward lookup. **No forward leakage.**

#### Path C: Momentum Scanner Live (PARTIALLY RESOLVED)
`momentum_service.py:L111-L125`:
```python
        snapshot = self.db.query(FundamentalSnapshot).filter(
            FundamentalSnapshot.ticker == company.ticker
        ).order_by(FundamentalSnapshot.trade_date.desc()).first()
        if snapshot:
            roe = float(snapshot.roe or 0.0)
            ...
        else:
            print(f"WARNING: No PIT FundamentalSnapshot found for {company.ticker}. Falling back to safe neutral values...")
            roe = float(company.roe or 0.0)
```
The primary path uses PIT snapshots correctly. **However**, the fallback path at L122 reads `company.roe` directly from the Company table. The Company table's `roe` field (`models.py:L83`) is populated by `generate_deep_research_report_task` (`tasks.py:L335`) which pulls the *current* `yfinance` `returnOnEquity` — a static snapshot with no date association. For live scanning this is acceptable (it's today's data for today's signal), but if this fallback ever fires during a historical backtest simulation it would inject current-day fundamentals into historical dates.

**Risk Level:** LOW for live scanning (correct by construction). MEDIUM if `evaluate_stock_raw_metrics` were ever called in a historical loop, which it currently isn't.

#### Path D: FundamentalSnapshot Ingestion — Reporting Lag (NEW FINDING)
`tasks.py:L802-L858`:
```python
def capture_fundamental_snapshots_task():
    ...
    trade_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    ...
    snap = FundamentalSnapshot(
        ticker=comp.ticker,
        trade_date=trade_date,  # today's date, not filing date
        roe=roe, debt_to_equity=de_ratio, pe_ratio=pe_ratio, ...
    )
```
The `trade_date` is set to `datetime.utcnow()` — the date the nightly capture job runs — NOT the actual filing or announcement date. This is a reasonable approximation for daily capture but not precise SEC/SEBI filing-date aware.

**Net assessment:** The structural machinery (merge_asof, trade_date keying) is sound. The ingestion pipeline uses "capture date" as proxy for "known_at date," which is a reasonable approximation but not precise. This is a residual gap, not a critical flaw.

---

**ENFORCEMENT CAP STATUS: NOT TRIGGERED.** Cycle 24 had zero Critical or High issues. The standing PIT fundamental item is structurally resolved.

### Persistence Ledger Summary

| Prior Issue | File:Line | Status | Evidence |
|:---|:---|:---|:---|
| DELISTED_MASTER.csv accuracy | `universe_service.py:L70` | **UNRESOLVED (LOW)** | Still depends on static CSV completeness |
| PIT Fundamental Lookahead (Backtest) | `backtest_service.py:L65` | **RESOLVED** | `merge_asof(direction='backward')` on `trade_date` |
| PIT Fundamental Lookahead (ML Training) | `ml_service.py:L187` | **RESOLVED** | `trade_date <= signal.date_calculated` backward lookup |
| PIT Fundamental Lookahead (Live Scanner) | `momentum_service.py:L111` | **RESOLVED** (primary path) | PIT snapshot lookup; fallback is safe for live use |

---

## Phase 1: Codebase Interrogation and Evidence Gathering

### 1.1 Lookahead / Leakage

#### Feature Scaling Inside CV Folds — PASS
`ml_service.py:L82-L87`:
```python
        lr_pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler()),
            ('feature_selection', SelectFromModel(lgb.LGBMClassifier(...))),
            ('lr', LogisticRegression(...))
        ])
```
`StandardScaler` is inside the sklearn `Pipeline`, ensuring it is fit only on training fold data. Feature selection also inside the pipeline. **No leakage.**

#### Label Window Separation — PASS
`hypothesis_service.py:L304-L308`:
```python
            df['next_open'] = grouped['open'].shift(-1)
            df['future_close'] = grouped['close'].shift(-horizon)
            df['fwd_ret'] = df['future_close'] / df['next_open'] - 1.0
```
Forward returns use next-day open for entry and shifted close for exit. The hypothesis evaluator segregates in-sample vs out-of-sample data using `created_at` cutoff (L295-L302). **Sound.**

#### Benchmark Returns in Hypothesis Evaluation — FINDING
`hypothesis_service.py:L380-L391`:
```python
                nifty_rows = self.db.query(DailyBhavcopy).filter(
                    DailyBhavcopy.ticker == "^NSEI"
                ).order_by(DailyBhavcopy.trade_date.asc()).all()
                ...
            except Exception:
                benchmark_ret = 0.0
```
White's Reality Check uses `^NSEI` from `DailyBhavcopy`. If the ^NSEI benchmark ticker is missing (DailyBhavcopy stores NSE equities, not indices), the `except Exception` silently defaults `benchmark_ret = 0.0`, degrading the Reality Check to a simple positive-return check. This is a silent degradation.

---

### 1.2 Survivorship and Universe Integrity

#### NSE_ALL Global Default — PASS
`models.py:L344`: `target_universe = Column(String, default="NSE_ALL")`. All hypothesis evaluations default to `NSE_ALL`.

#### NIFTY500 Graceful Fallback — PASS
`universe_service.py:L25-L27`: Falls back to `NSE_ALL` with a warning log.

#### Index Reconstitution PIT Correctness — PASS (Structurally)
`HistoricalConstituent` model tracks `added_date` and `removed_date` per ticker (`models.py:L402-L410`), and `get_pit_universe` correctly filters by these dates (`universe_service.py:L16-L20`). **However**, the `sync_historical_constituents` method (L34-L135) is a one-shot seeder that never incrementally updates after initial run.

#### Corporate Actions — INCOMPLETE
No explicit split/bonus adjustment code found. The system relies on yfinance's `auto_adjust=True` default and Upstox Parquet Data Lake. If Parquet stores unadjusted prices, this creates a silent inconsistency when falling back between providers.

---

### 1.3 ML Pipeline

#### Purged Walk-Forward CV with Embargo — PASS
`purged_cv_service.py:L17-L43`: Expands walk-forward window with embargo gap. Training data is strictly chronologically prior to test data. **No temporal leakage.**

#### Calibrated Probabilities — PASS
`ml_service.py:L245-L247`: `CalibratedClassifierCV(base_pipeline, method='isotonic', cv=splits)` uses purged splits. **Correct.**

#### Triple-Barrier Labeling — PASS
`labeling_service.py:L28-L33`: Entry price uses Next-Day Open. **No close-to-close lookahead in labels.**

#### Random Seeds Fixed — PASS
All ML models use `random_state=42`. Block bootstrap uses `np.random.RandomState(42)`.

#### PSI Drift Monitoring — DEAD CODE
`ml_service.py:L258-L280`: `calculate_psi_drift` method exists but is never called anywhere in the codebase. Feature drift detection is implemented but not operational.

---

### 1.4 Statistical Validity

#### Deflated Sharpe Ratio — PASS
`hypothesis_service.py:L72-L108`: Bailey and Lopez de Prado formula correctly implemented.

#### True CSCV PBO — PASS
`hypothesis_service.py:L110-L170`: S=16 blocks, 12,870 combinations, empirical degradation probability.

#### Benjamini-Hochberg FDR Control — PASS
`hypothesis_service.py:L508-L533` and `multiple_testing_service.py`: Applied across all active hypotheses.

#### Bootstrap Sharpe Confidence Intervals — PASS
`statistical_testing_service.py:L6-L69`: Block bootstrap preserving autocorrelation.

#### Bonferroni FWER Control — PASS
`validation_service.py:L258-L264`: Prevents promotion of lucky shadow models.

---

### 1.5 LLM-Generated Alpha Factors (QHLM)

#### Parse Failure Handling — PASS
`hypothesis_service.py:L312-L316`: Parse failures raise `ValueError`, NOT silently defaulting to zero. **Correct.**

#### Deterministic Re-Execution Check — NOT IMPLEMENTED
No sandboxed re-execution to verify LLM formulas produce identical output. Low practical risk since `SafeASTEvaluator` is deterministic, but becomes a risk if stochastic operators are added.

---

### 1.6 Execution Realism

#### Square-Root Market Impact Model — PASS
`backtest_service.py:L117-L125`: Almgren-Chriss style. Applied on both entry and exit.

#### ADV Participation Cap — PASS
`backtest_service.py:L192-L199`: 10% ADV cap and minimum trade value of 10,000 INR. Cash drag via `executed_fraction`.

#### Gap-Down Execution Realism — PASS
`backtest_service.py:L216-L219`: Correctly uses Open price when gap-through-stop occurs.

#### Event Strategy Flat Friction — FINDING
`quant_service.py:L209`: Strategies A-F apply flat `0.40%` round-trip friction instead of ADV-scaled market impact model. This makes event strategy backtest results overly optimistic for illiquid names.

---

### 1.7 Numerical Instability / Silent Failures

#### Broad Exception Handlers in Worker Tasks — FINDING
**50+ `except Exception` blocks** in `tasks.py`. Dangerous patterns include:
- `tasks.py:L36-L37`: OHLCV cache pre-warm silently swallows ALL errors with `pass`.
- `tasks.py:L121-L122`: Date parsing errors silently pass.
- `tasks.py:L325`: `except Exception: continue` in populate task.

#### Bare `except:` in Weight Learning Service — FINDING
`weight_learning_service.py:L101`: `except:` (bare) catches `SystemExit`, `KeyboardInterrupt`, etc.

#### Kill Switch Fails Closed — PASS
`risk_engine.py:L66-L70`: Correctly preserves capital on failure.

#### Division-by-Zero Guards — PASS
Present in HRP, DSR, PBO, IVP calculations.

---

### 1.8 Reproducibility and Determinism

#### Fixed Random Seeds — PASS
All ML models, bootstrap, and weight learning use `random_state=42`.

#### No Global Numpy/Python Seed — LOW RISK
No `np.random.seed()` global initialization. Low practical risk with current codebase.

---

### 1.9 New Findings (Not in Prior Audits)

#### NEW FINDING #1 (CRITICAL): Hypothesis Evaluation Uses Only 50 Stocks
`hypothesis_service.py:L263`:
```python
            companies = self.db.query(Company).limit(50).all()
```
Despite the universe being `NSE_ALL` (thousands of stocks), hypothesis evaluation hard-limits to the first 50 companies returned by an **unordered** query. This means:
1. The 50 stocks are database insertion-order dependent, not liquidity/market-cap filtered.
2. Cross-sectional alpha factors (like `rank(volatility_20)`) computed over 50 random names will produce different results than the intended full-universe ranking.
3. A hypothesis valid on 50 stocks may be meaningless on the real universe, and vice versa.

**This undermines the scientific validity of every hypothesis experiment in the system.**

#### NEW FINDING #2 (HIGH): `run_historical_portfolio_simulation` Is a Stub
`backtest_service.py:L351-L371`:
```python
    def run_historical_portfolio_simulation(self) -> Dict[str, Any]:
        ...
        return {
            "status": "Not yet implemented",
            "portfolio_sharpe": None,
        }
```
The full cross-sectional portfolio backtest is a stub. All per-ticker backtest results are single-stock and do not reflect actual portfolio-level dynamics.

#### NEW FINDING #3 (LOW): PSI Drift Monitoring Is Dead Code
`ml_service.py:L258-L280` is never called. No automated drift detection.

#### NEW FINDING #4 (LOW): Event Strategy Friction Mismatch
Strategies A-F use flat 0.40% friction while momentum backtest uses ADV-scaled impact model.

---

## Phase 2: Continuous Challenge and Questioning

1. **`hypothesis_service.py:L263`** — Why is hypothesis evaluation limited to `.limit(50)` with no ordering clause? A cross-sectional `rank()` alpha computed over 50 arbitrary stocks is scientifically meaningless. The entire QHLM pipeline's statistical rigor (DSR, PBO, IC) is invalidated if the underlying universe sample is this unrepresentative. Was this an intentional performance optimization that was never revisited?

2. **`backtest_service.py:L365-L371`** — The cross-sectional portfolio simulation returns `"Not yet implemented"`. How can any portfolio-level claim be validated without this?

3. **`tasks.py:L36-L37`** — `except Exception as e: pass` in the OHLCV cache pre-warm loop. If the API returns 5xx errors for 100% of tickers, the system would silently proceed with stale/missing data.

4. **`hypothesis_service.py:L380-L391`** — White's Reality Check queries `^NSEI` from `DailyBhavcopy`, but `DailyBhavcopy` is populated from NSE Bhavcopy CSV which contains individual equities, not index values. Is this query always returning empty results, silently defaulting `benchmark_ret = 0.0`?

5. **`momentum_service.py:L213`** — The liquidity filter uses `adv < 500000` (5 Lakh INR / ~$600). An institutional-grade filter would be 5 Crore (50M INR). Is the system generating BUY signals for stocks where a 10 Lakh order would move the market by 20%?

6. **`universe_service.py:L45-L46`** — `sync_historical_constituents` returns immediately if any `HistoricalConstituent` exists. New delistings after the initial seed are never tracked.

7. **`tasks.py:L811`** — `trade_date = datetime.utcnow()` in `capture_fundamental_snapshots_task`. For Indian markets, UTC midnight is 5:30 AM IST. Should this use IST explicitly?

8. **Phase 0 Persistence Ledger** — The DELISTED_MASTER.csv dependency was flagged in Cycle 24. Combined with the one-shot sync, the survivorship-bias-free claim for `NSE_ALL` is only as good as the initial seed data.

---

## Phase 3: The Institutional Audit Report

### 1. Audit Delta (Changes Since Last Audit)

**Genuinely Fixed:** No new fixes detected since Cycle 24. The branch (`unified_data_provider`) appears to be a feature branch pulled up to date with `main` but contains no new commits altering the quantitative pipeline.

**Cosmetically Patched:** None

**New Vulnerabilities / Regressions:** The `.limit(50)` truncation (CRITICAL) and portfolio simulation stub (HIGH) are likely long-standing issues first visible under close scrutiny this cycle, not regressions from Cycle 24.

### Persistence Ledger Table

| Prior Issue | File:Line | Status | Evidence |
|:---|:---|:---|:---|
| DELISTED_MASTER.csv accuracy | `universe_service.py:L70` | **UNRESOLVED (LOW)** | Static CSV, no automated refresh |
| PIT Fundamental Lookahead (all paths) | Multiple | **RESOLVED** | merge_asof backward; trade_date keyed lookups |
| Universe Pipeline disconnect | `universe_service.py:L24` | **RESOLVED** (Cycle 24) | NSE_ALL default + NIFTY500 fallback |
| PBO proxy != true CSCV | `hypothesis_service.py:L110` | **RESOLVED** (Cycle 24) | 16-block, 12,870-combination CSCV |

---

### 2. Subsystem Verification Status

#### Signals (Momentum Scanner)
- **Implementation Reality:** Cross-sectional percentile ranking with PIT fundamentals, multi-factor composite scoring, risk-gated signals.
- **Fatal Flaws:** None.
- **False Alpha Risk:** The 5 Lakh ADV filter is dangerously low; signals may be generated for untradeable micro-caps.

#### Factor Research (QHLM)
- **Implementation Reality:** DSR, CSCV PBO, Spearman IC, BH-FDR, White's Reality Check (degraded).
- **Fatal Flaws:** `.limit(50)` universe truncation makes all cross-sectional hypothesis experiments unreliable.
- **False Alpha Risk:** A `rank()` factor computed on 50 arbitrary stocks will show spurious correlations that disappear on the full universe.

#### ML Pipeline
- **Implementation Reality:** Purged Walk-Forward CV, Triple-Barrier Labels, CalibratedClassifierCV, multi-horizon LightGBM.
- **Fatal Flaws:** None.
- **False Alpha Risk:** PSI drift detection is dead code.

#### Portfolio Construction
- **Implementation Reality:** HRP with Ledoit-Wolf shrinkage, position constraints (5%), sector constraints (25%).
- **Fatal Flaws:** None.
- **False Alpha Risk:** No full portfolio simulation to validate HRP benefits historically.

#### Risk Management
- **Implementation Reality:** Kill switch (fails closed), MDD-based, dynamic regime tightening, sector caps, correlation gate, event blackout.
- **Fatal Flaws:** None.
- **False Alpha Risk:** Minimal. Most robustly implemented subsystem.

#### Data Engineering
- **Implementation Reality:** UnifiedDataManager with Upstox Parquet primary to yfinance fallback, FundamentalSnapshot PIT pipeline.
- **Fatal Flaws:** None.
- **False Alpha Risk:** Universe sync is one-shot; subsequent delistings go untracked.

#### Backtesting
- **Implementation Reality:** Single-stock intensive backtest with ADV-scaled slippage. Cross-sectional portfolio simulation is a stub.
- **Fatal Flaws:** Portfolio simulation not implemented.
- **False Alpha Risk:** HIGH. All aggregate performance claims are extrapolations from single-stock results.

---

### 3. Institutional Scoring (0-100)

| Dimension | Score | Key Evidence |
|:---|:---|:---|
| **Overall Scientific Score** | **72 / 100** | `.limit(50)` universe truncation and portfolio sim stub prevent a higher score. |
| Software Architecture | 82 / 100 | Clean separation, UnifiedDataManager pattern, PIT snapshot model. |
| Quantitative Research | 65 / 100 | CSCV PBO + DSR + BH-FDR is gold standard, but evaluated on 50 stocks. |
| Machine Learning | 82 / 100 | Purged CV, calibration, triple-barrier labels, fixed seeds. PSI dead code. |
| Statistical Methodology | 90 / 100 | DSR, PBO, IC, Bootstrap CI, Bonferroni FWER — comprehensive. |
| Data Engineering | 75 / 100 | PIT join machinery is sound. One-shot universe sync and ADV filter gaps. |
| Risk Management | 88 / 100 | Fail-closed kill switch, dynamic regime gating, correlation gate, event blackout. |
| Backtesting Credibility | 55 / 100 | Single-stock backtests well-implemented; portfolio-level simulation is a stub. |
| Production Readiness | 72 / 100 | 50+ broad exception handlers in tasks.py create silent failure risk. |

**Score Justification:** Cycle 24's score of 88 was awarded with "zero Critical or High" remaining. This cycle's deeper scrutiny reveals the `.limit(50)` truncation and portfolio simulation stub, both materially impacting scientific credibility. The statistical methodology itself remains excellent, but it is applied to an unrepresentative sample.

---

### 4. The "Kill List" (Critical Vulnerabilities)

| # | Severity | Finding | File:Line | Status |
|:---|:---|:---|:---|:---|
| 1 | **CRITICAL (NEW)** | Hypothesis evaluation uses `.limit(50)` unordered query — invalidates all cross-sectional alpha experiments | `hypothesis_service.py:L263` | NEW |
| 2 | **HIGH (NEW)** | Portfolio-level backtest simulation is a stub — all portfolio metrics are extrapolated | `backtest_service.py:L351-L371` | NEW |
| 3 | **MEDIUM (NEW)** | White's Reality Check silently degrades to "returns > 0" when ^NSEI absent from DailyBhavcopy | `hypothesis_service.py:L380-L391` | NEW |
| 4 | **MEDIUM (NEW)** | Universe sync is one-shot — new delistings after initial seed go untracked | `universe_service.py:L45-L46` | NEW |
| 5 | **LOW (REPEAT)** | DELISTED_MASTER.csv completeness unverifiable | `universe_service.py:L70` | UNRESOLVED |
| 6 | **LOW (NEW)** | ADV liquidity filter at 5 Lakh INR is too low for institutional trading | `momentum_service.py:L213` | NEW |
| 7 | **LOW (NEW)** | PSI drift monitoring is dead code | `ml_service.py:L258` | NEW |
| 8 | **LOW (NEW)** | Event strategies A-F use flat 0.40% friction vs ADV-scaled model | `quant_service.py:L209` | NEW |

---

### 5. Remediation Directives

#### Directive 1 — Fix `.limit(50)` Universe Truncation (CRITICAL)

**Problem:** `self.db.query(Company).limit(50)` at `hypothesis_service.py:L263` selects 50 arbitrary stocks instead of the target universe.

**Fix:**
```python
# BEFORE (broken):
companies = self.db.query(Company).limit(50).all()

# AFTER (correct):
from app.services.universe_service import UniverseService
universe_svc = UniverseService(self.db)
tickers = universe_svc.get_pit_universe(hyp.target_universe, datetime.utcnow())

# Apply liquidity filter to prevent garbage alpha on micro-caps
liquid_tickers = []
for t in tickers:
    company = self.db.query(Company).filter(Company.ticker == t).first()
    if company and company.market_cap and company.market_cap > 5_000_000_000:  # 500Cr min
        liquid_tickers.append(t)

# If universe is very large, use random stratified sample instead of .limit()
import random
random.seed(42)
if len(liquid_tickers) > 300:
    liquid_tickers = random.sample(liquid_tickers, 300)

rows = self.db.query(DailyBhavcopy).filter(
    DailyBhavcopy.ticker.in_(liquid_tickers)
).order_by(DailyBhavcopy.trade_date.asc()).all()
```

**Why the previous approach failed:** This appears to be an early development shortcut (`.limit(50)` for speed) that was never revisited as the statistical apparatus grew more sophisticated. The DSR, PBO, and IC metrics cannot compensate for a non-representative universe.

---

#### Directive 2 — Implement Cross-Sectional Portfolio Backtest (HIGH)

**Problem:** `run_historical_portfolio_simulation` at `backtest_service.py:L351` is a stub.

**Fix:** Implement a day-by-day cross-sectional simulation:
```python
def run_historical_portfolio_simulation(self, start_date, end_date):
    from app.services.universe_service import UniverseService
    universe_svc = UniverseService(self.db)

    equity = 10_000_000.0  # 1 Crore starting capital
    equity_curve = []

    for trade_date in pd.bdate_range(start_date, end_date):
        # 1. PIT universe for this date
        tickers = universe_svc.get_pit_universe("NSE_ALL", trade_date)
        # 2. Apply liquidity filter
        # 3. Generate signals (factors, ranks, composite)
        # 4. Apply HRP weights to BUY signals
        # 5. Execute trades with ADV-scaled slippage
        # 6. Handle delistings (-100% on position)
        # 7. Track equity curve
        equity_curve.append(equity)

    # Compute portfolio-level metrics
    ...
```

---

#### Directive 3 — Fix White's Reality Check (MEDIUM)

**Problem:** `^NSEI` in `DailyBhavcopy` likely returns empty results.

**Fix:** Query benchmark returns from the `UnifiedDataManager`:
```python
# BEFORE: benchmark from DailyBhavcopy (wrong table)
nifty_rows = self.db.query(DailyBhavcopy).filter(DailyBhavcopy.ticker == "^NSEI")...

# AFTER: benchmark from OHLCV data source
from app.services.data.data_manager import UnifiedDataManager
dm = UnifiedDataManager()
nifty_df = dm.get_ohlcv("^NSEI", days=len(strategy_daily_returns) * 2)
```

---

#### Directive 4 — Make Universe Sync Incremental (MEDIUM)

**Problem:** `sync_historical_constituents` at `universe_service.py:L45` early-returns if any data exists.

**Fix:** Remove the early return. The differential logic at L101-L133 already handles additions and removals correctly.

---

### 6. Modules to Scrap

| Module | Reason |
|:---|:---|
| `run_historical_portfolio_simulation` (stub) | Either implement it properly per Directive 2, or delete it. A stub claiming to "eradicate survivorship bias" while returning `None` is actively misleading. |
| `feature_selection` pass-through in `ml_service.py:L44-L50` | Returns input unchanged. Should be removed and callers updated. |

---

**Summary:**

Cycle 25 applies deeper scrutiny than Cycle 24 and uncovers two significant issues that were likely always present:

1. **The `.limit(50)` truncation in hypothesis evaluation is Critical** — it means every hypothesis experiment runs on an arbitrary subset, rendering DSR/PBO/IC metrics unreliable despite their individual correctness.
2. **The portfolio simulation stub is High** — without it, all portfolio-level performance claims are single-stock extrapolations.

The statistical methodology stack (DSR, CSCV PBO, Bootstrap CI, BH-FDR, Bonferroni FWER) remains **best-in-class**. The PIT fundamental data infrastructure is correctly implemented with `merge_asof(direction='backward')` keyed on filing-date-proxied `trade_date`. The risk management engine (kill switch, correlation gate, sector caps, event blackout) is operationally sound and correctly fails closed.

**The gap is not in the statistical tools — it is in the data they operate on.** Fix the universe sampling and implement the portfolio simulation, and this platform's scientific score would legitimately reach the 85-90 range.
