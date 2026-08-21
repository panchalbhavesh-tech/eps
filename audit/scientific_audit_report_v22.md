# QEPS Institutional Scientific Audit Report
## Continuous Adversarial Code-Level Verification — Cycle 22
**Audit Date:** 2026-08-21 | **Auditor Role:** Independent Institutional Quantitative Researcher  
**Prior Audit:** Cycle 21 (2026-08-21)  
**Audit Protocol:** `strict_audit.md` v6 (Anti-Regression)

---

## Phase 0: Audit Persistence Ledger (Kill List Re-Verification)

**ENFORCEMENT RULE:** If any Critical from Cycle 21 is still UNRESOLVED, the Overall Scientific Score is hard-capped at 20/100.

### Prior Issue #1: Close-to-Close Execution in Event Strategies A–F
**Prior Citation:** `quant_service.py:L206` — `entry = e_day['Close']`  
**Current Code at `quant_service.py:L206–L207`:**
```python
next_day = df.iloc[iloc_idx + 1]
entry = next_day['Open']
```
**Status: RESOLVED**  
All six strategies (A, B, C, D, E, F) now uniformly enter at `next_day['Open']` — the next-trading-day open price — instead of the event-day close. Strategy E at L253 uses `df.iloc[iloc_idx - 9]['Open']` (T-9 open), which is valid for a pre-earnings run-up strategy.

---

### Prior Issue #2: Acknowledged Survivorship Bias in Universe
**Prior Citation:** `universe_service.py:L32` — `As per user decision, this accepts survivorship bias...`  
**Current Code at `universe_service.py:L11–L27`:**
```python
def get_pit_universe(self, index_name: str, as_of_date: datetime) -> List[str]:
    """Returns Point-in-Time (PIT) survivorship-bias-free universe..."""
    constituents = self.db.query(HistoricalConstituent).filter(
        HistoricalConstituent.index_name == index_name,
        HistoricalConstituent.added_date <= as_of_date,
        (HistoricalConstituent.removed_date == None) | (HistoricalConstituent.removed_date > as_of_date)
    ).all()
```
And at `universe_service.py:L64–L71`:
```python
delisted_path = "data/DELISTED_MASTER.csv"
if os.path.exists(delisted_path):
    delisted_df = pd.read_csv(delisted_path)
    df = pd.concat([df, delisted_df], ignore_index=True)
```
And at `universe_service.py:L117–L127`:
```python
for ticker, const in current_map.items():
    if ticker not in new_symbols:
        const.removed_date = datetime.utcnow()
        company.is_active = False
        company.listing_status = "Delisted"
```
**Status: RESOLVED**  
The old static-active-symbols-only approach has been replaced with a `HistoricalConstituent` table tracking `added_date` and `removed_date`. Delisted symbols are retained. The old "accept survivorship bias" comment is gone.

---

### Prior Issue #3: Fabricated Backtest Statistics in AI Fallback
**Prior Citation:** `ai_analyst_service.py:L368` — Hardcoded PEAD 64.2% win rate  
**Current Code at `ai_analyst_service.py:L363–L366`:**
```python
backtest = f"""### Historical Algorithmic Strategy Synthesis
...
> **Scientific Synthesis:** No historical backtest data has been computed for {ticker} in offline mode.
  The platform requires live connectivity to the Quant Engine for rigorous empirical verification."""
```
**Status: RESOLVED**  
The fabricated statistics table has been removed entirely and replaced with a truthful "No Data Available" disclosure.

---

### Prior Issue #4: `CalibratedClassifierCV` Falls Back to `KFold(3)`
**Prior Citation:** `ml_service.py:L234` — `if len(splits) < 3: splits = 3`  
**Current Code at `ml_service.py:L241–L247`:**
```python
if len(splits) < 3:
    base_pipeline.fit(X, y)
    models[horizon] = {'pipeline': base_pipeline, 'features': selected}
else:
    calibrated = CalibratedClassifierCV(base_pipeline, method='isotonic', cv=splits)
    calibrated.fit(X, y)
    models[horizon] = {'pipeline': calibrated, 'features': selected}
```
**Status: RESOLVED**  
Instead of injecting `KFold(3)`, the code now skips calibration entirely and uses the raw pipeline when purged splits are insufficient.

---

### Prior Issue #5: White's Reality Check Constant 0.02%/day Benchmark
**Prior Citation:** `hypothesis_service.py` — benchmark test removed entirely  
**Current Code at `hypothesis_service.py:L330–L344`:**
```python
# --- White's Reality Check ---
try:
    nifty_rows = self.db.query(DailyBhavcopy).filter(DailyBhavcopy.ticker == "^NSEI")...
    if nifty_rows:
        ...
        benchmark_ret = aligned['nifty_ret'].mean() if len(aligned) > 0 else 0.0
...
rc_excess = mean_ret - benchmark_ret
```
And at L366: `is_valid = ... and (rc_excess > 0)`
**Status: RESOLVED**  
White's Reality Check was NOT deleted. It was replaced with actual Nifty benchmark returns. The constant 0.02%/day placeholder is gone.

---

### Prior Issue #6: Standard `KFold` in Weight Learning (no embargo)
**Prior Citation:** `weight_learning_service.py:L48`  
**Current Code at `weight_learning_service.py:L46–L58`:**
```python
embargo = 5

def purged_cv():
    fold_size = n_samples // (n_splits + 1)
    for i in range(n_splits):
        train_end = (i + 1) * fold_size - embargo
        ...
        yield np.arange(0, train_end), np.arange(test_start, test_end)
        
custom_cv = list(purged_cv()) if n_samples >= 50 else 5
```
**Status: RESOLVED**  
The CV now implements a custom `purged_cv()` generator with a 5-day embargo gap.

---

### Prior Issue #7: `min_periods=1` on 200-day SMA
**Prior Citation:** `backtest_service.py:L136`  
**Current Code at `backtest_service.py:L135–L137`:**
```python
df['SMA50'] = df['Close'].rolling(50, min_periods=50).mean()
df['SMA200'] = df['Close'].rolling(200, min_periods=200).mean()
df['Vol_Avg'] = df['Volume'].rolling(20, min_periods=20).mean()
```
**Status: RESOLVED**  
All rolling indicators now require full window lookback.

---

### Prior Issue #8: Kill Switch Uses Average Return Instead of MDD
**Prior Citation:** `risk_engine.py:L46` — `avg_return = np.mean(returns)`  
**Current Code at `risk_engine.py:L43–L48`:**
```python
equity_curve = np.cumprod(1 + returns)
peak = np.maximum.accumulate(equity_curve)
drawdown_pct = ((equity_curve - peak) / peak) * 100.0
mdd = float(np.min(drawdown_pct)) if len(drawdown_pct) > 0 else 0.0
```
**Status: RESOLVED**  
True Maximum Drawdown via equity curve calculation replaces `np.mean(returns)`.

---

### Standing Item: Point-in-Time Fundamental Data Lookahead Bias
**Prior Status (Cycle 21):** RESOLVED  
**Current Code at `backtest_service.py:L65–L71`:**
```python
df = pd.merge_asof(
    df.sort_values(date_col), 
    snapshots[['trade_date_dt', 'roe', 'debt_to_equity', 'pe_ratio']], 
    left_on=date_col, right_on='trade_date_dt', direction='backward'
)
```
**Status: STILL RESOLVED**

---

**ENFORCEMENT CAP STATUS: NOT TRIGGERED.** All 8 prior Critical and High issues are RESOLVED. The 20/100 hard cap does NOT apply.

### Persistence Ledger Summary

| Prior Issue | File:Line | Status | Evidence |
|:---|:---|:---|:---|
| Close-to-Close execution (A–F) | `quant_service.py:L207` | **RESOLVED** | `entry = next_day['Open']` |
| Survivorship bias universe | `universe_service.py:L11` | **RESOLVED** | PIT query with `added_date/removed_date` |
| Fabricated AI backtest stats | `ai_analyst_service.py:L363` | **RESOLVED** | "No Data Available" |
| `KFold(3)` calibration fallback | `ml_service.py:L241` | **RESOLVED** | Skips calibration |
| White's Reality Check constant | `hypothesis_service.py:L330` | **RESOLVED** | Nifty returns as benchmark |
| Weight learning no embargo | `weight_learning_service.py:L46` | **RESOLVED** | 5-day embargo |
| `min_periods=1` on SMA200 | `backtest_service.py:L136` | **RESOLVED** | `min_periods=200` |
| Kill switch avg return vs MDD | `risk_engine.py:L43` | **RESOLVED** | True MDD |

---

## Phase 1: Codebase Interrogation & Evidence Gathering

### Lookahead / Leakage

**1.1 `yfinance` Fundamental Data:** `yfinance` is used for OHLCV price data only. `FundamentalSnapshot` table with `pd.merge_asof(direction='backward')` handles PIT alignment. No lookahead detected in the fundamental join path.

**Warning:** `FundamentalSnapshot.trade_date` semantics are undocumented. If this field is populated with fiscal period end date rather than the actual filing/announcement date (typically 30–90 days later for Indian quarterly results), `merge_asof` aligns to capture time, not information availability time. Data quality issue, not code logic error.

**1.2 Scaling Inside CV Folds:** `StandardScaler` is inside a `Pipeline` at `ml_service.py:L82–L86` that is trained inside purged CV folds. `SelectFromModel` is also inside the pipeline. No leakage detected.

**1.3 Hypothesis Service Forward Return Calculation** (`hypothesis_service.py:L255–L259`):
```python
df['next_open'] = grouped['open'].shift(-1)
df['future_close'] = grouped['close'].shift(-horizon)
df['fwd_ret'] = df['future_close'] / df['next_open'] - 1.0
```
Uses next-day open for entry and future close for exit — correct.

**1.4 In-Sample / Out-of-Sample Segregation** (`hypothesis_service.py:L246–L253`):
```python
if hyp.current_stage == "DRAFT_HYPOTHESIS":
    df = df[df.index.get_level_values('Date') <= cutoff].copy()
elif hyp.current_stage in ["OUT_OF_SAMPLE_SHADOW", "LIVE_ALPHA_STREAM"]:
    df = df[df.index.get_level_values('Date') > cutoff].copy()
```
Correct segregation.

### Survivorship & Universe Integrity

**2.1 Point-in-Time Universe:** `get_pit_universe()` queries `HistoricalConstituent` with correct date filtering. Working.

**2.2 Index Reconstitution (NEW FINDING - HIGH):** There is no mechanism to track NIFTY 500 reconstitution dates separately from the broader NSE listing universe. `get_pit_universe()` only supports `"NSE_ALL"`. When `momentum_service.py:L180` calls it, it returns the entire exchange listing history, not the NIFTY 500 benchmark.

**2.3 Corporate Actions:** `yfinance` returns adjusted prices by default. No explicit corporate action handling visible. Acceptable but creates a hidden dependency.

### ML Pipeline

**3.1 Cross-Validation:** `purged_cv_service.py` implements Walk-Forward CV with embargo. Embargo is proportional to horizon.

**3.2 Trial Count Logging:** `TotalHypothesisTrials` table tracks global trial count. Feeds into DSR and PBO. Present.

**3.3 Multiple Testing Correction:**
- DSR: Bailey & López de Prado formula at `hypothesis_service.py:L72–L108`. Correct.
- PBO proxy: Logistic heuristic at `hypothesis_service.py:L110–L121`. Not true CSCV.
- BH FDR: Benjamini-Hochberg at `hypothesis_service.py:L459–L484`. Applied across active hypotheses.

### Statistical Validity

**4.1 Metric Selection:** No `accuracy_score` usage found. ML uses `roc_auc_score`. Hypothesis uses Spearman IC. Correct.

**4.2 PBO Proxy vs True CSCV (NEW FINDING - MEDIUM):**
```python
z = math.log(total_trials) - (deflated_sharpe * 2.0)
pbo = 1.0 / (1.0 + math.exp(-z))
```
This is a heuristic logistic proxy, not true CSCV. It systematically understates overfitting risk for moderate trial counts.

**4.3 Sharpe Ratio Confidence Intervals:** Block bootstrap at `statistical_testing_service.py:L20–L29` with adaptive block size. Good implementation.

### LLM-Generated Alpha Factors (QHLM-Specific)

**5.1 Formula Parse Failure Handling** (`hypothesis_service.py:L262–L267`):
```python
try:
    df['factor'] = ev.evaluate(expr)
except Exception as parse_err:
    raise ValueError(f"Failed to parse alpha expression: {parse_err}")
```
Broken formulas raise ValueError, caught by outer except, causing rollback. No silent passthrough.

**5.2 Sandboxed Evaluator:** `SafeASTEvaluator` at `hypothesis_service.py:L16–L60` restricts to pre-defined operators only. Functionally sandboxed.

### Execution Realism

**6.1 Market Impact Model** (`backtest_service.py:L116–L125`):
```python
participation_rate = trade_value / adv_inr
return 0.001 + 0.005 * np.sqrt(participation_rate)
```
Square-root market impact model implemented.

**6.2 ADV-Based Capacity Constraint** (`backtest_service.py:L189–L199`):
10% ADV participation cap with proportional cash drag dilution. Implemented.

**6.3 Gap-Down Execution Realism** (`backtest_service.py:L214–L219`):
Gap-down scenarios execute at open price, not stop-loss level. Correct.

### Numerical Instability / Silent Failures

**7.1 Kill Switch Fails Open (NEW FINDING - CRITICAL):**
`risk_engine.py:L66–L67`: `except Exception as e: print(...)` — if the kill switch check fails, defaults to `(False, "Normal operation")`. A database error silently returns "system is fine."

**7.2 Other Silent Failures:**
- `weight_learning_service.py:L99`: Bare `except:` returns default weights silently.
- `backtest_service.py:L100`: Strategy backtest DB save failure is swallowed.

### Reproducibility & Determinism

**8.1 Random Seeds:** All ML models use `random_state=42`. Seeded.

**8.2 Bootstrap Randomness:** `statistical_testing_service.py:L26`: `np.random.randint(0, ...)` — No seed set for bootstrap CI. Minor reproducibility gap.

### New Vulnerabilities Introduced

**NEW-1 (CRITICAL): Kill Switch Fails Open on DB Error** — `risk_engine.py:L66`

**NEW-2 (HIGH): Fabricated Portfolio Simulation Results** — `backtest_service.py:L370`:
```python
return {"portfolio_sharpe": 1.25, "delisted_wipeouts_triggered": 0}
```
Hardcoded Sharpe from a stub function.

**NEW-3 (HIGH): No NIFTY 500 Reconstitution Tracking** — `universe_service.py:L17`

**NEW-4 (MEDIUM): PBO Proxy != True CSCV** — `hypothesis_service.py:L110`

**NEW-5 (MEDIUM): Dead PCA Embeddings Code** — `ml_service.py:L342`:
```python
def generate_sequence_embeddings(self, prices, volumes, n_components=2):
    return [0.0] * n_components  # Always returns zeros
```
Still called at `momentum_service.py:L144`.

**NEW-6 (MEDIUM): `fillna(50.0)` Injects Synthetic Data** — `weight_learning_service.py:L38`

---

## Phase 2: Continuous Challenge & Questioning

1. **Risk Engine Fail-Open (Phase 0 Reference):** `risk_engine.py:L66` — The kill switch catch-all `except Exception` defaults to "Normal operation." If the database is unreachable during a -20% drawdown, the system continues issuing BUY signals. Why is the safety system fail-open instead of fail-closed?

2. **Index Reconstitution Gap:** `universe_service.py:L17` — `get_pit_universe()` only supports `"NSE_ALL"`. When `momentum_service.py:L180` calls it, it returns the entire exchange listing history. How is benchmark-relative alpha calculated when the backtest universe is "everything ever listed on NSE"?

3. **Fabricated Portfolio Sharpe:** `backtest_service.py:L370` — `"portfolio_sharpe": 1.25` is a hardcoded constant in a function claiming to simulate a full portfolio backtest. Is this function called from any user-facing endpoint?

4. **FundamentalSnapshot `trade_date` Semantics:** `models.py:L430` — No documentation specifying whether `trade_date` represents fiscal period end, filing date, or capture date. What does the data pipeline actually populate this with?

5. **PBO Proxy Validity:** `hypothesis_service.py:L119` — The logistic proxy bears no mathematical relationship to actual CSCV-PBO. For 200 trials with DSR=0.90, the proxy gives PBO ≈ 0.91, but true CSCV might yield ≈ 0.55. Is the team aware of this systematic inflation?

6. **Close-to-Close Delay (Phase 0 Reference):** The Close-to-Close execution bug was flagged in multiple prior rounds. This round it is genuinely fixed at `quant_service.py:L207`. What was the engineering reason for the repeated delay?

7. **Strategy E Exit Price:** `quant_service.py:L254` — Strategy E exits at `prev_day['Close']` (day before earnings). Is the 0.40% friction adequate for the closing auction on a pre-earnings day?

8. **Dead Code:** `ml_service.py:L342–L346` — `generate_sequence_embeddings` returns `[0.0, 0.0]` always but is still called throughout the pipeline. Why hasn't this been removed?

---

## Phase 3: The Institutional Audit Report

### 1. Audit Delta (Changes Since Last Audit)

**Genuinely Fixed (with code evidence):**
| Fix | Evidence |
|:---|:---|
| Close-to-Close → Next-Day Open | `entry = next_day['Open']` at `quant_service.py:L207` |
| Survivorship bias → PIT universe | `HistoricalConstituent` with `added_date/removed_date` |
| Fabricated AI stats → No Data | Truthful offline message at `ai_analyst_service.py:L363` |
| KFold(3) fallback → skip calibration | Raw pipeline when splits < 3 at `ml_service.py:L241` |
| White's Reality Check → Nifty benchmark | `benchmark_ret = aligned['nifty_ret'].mean()` at `hypothesis_service.py:L338` |
| Weight learning → purged CV with embargo | 5-day embargo at `weight_learning_service.py:L46` |
| `min_periods=1` → full window | `min_periods=200` at `backtest_service.py:L136` |
| Kill switch avg → MDD | `np.cumprod`, `np.maximum.accumulate` at `risk_engine.py:L43` |

**Cosmetically Patched:** None this round.

**New Vulnerabilities:**
| Vulnerability | File:Line | Severity |
|:---|:---|:---|
| Kill switch fails open on DB error | `risk_engine.py:L66` | CRITICAL |
| Fabricated portfolio simulation Sharpe | `backtest_service.py:L370` | HIGH |
| No NIFTY 500 reconstitution tracking | `universe_service.py:L17` | HIGH |
| PBO proxy != true CSCV | `hypothesis_service.py:L110` | MEDIUM |
| Dead PCA embeddings code | `ml_service.py:L342` | MEDIUM |
| `fillna(50.0)` injects synthetic data | `weight_learning_service.py:L38` | MEDIUM |

### 2. Subsystem Verification Status

**Signals / Event Study:** All 6 strategies now use Next-Day Open. Event study uses CAPM + Patell Z-test. No fatal flaws.

**Factor Research (QHLM):** Full lifecycle with DSR + PBO proxy + BH FDR + Spearman IC. SafeASTEvaluator sandboxes expressions. PBO is a heuristic proxy, not CSCV.

**ML Pipeline:** Purged Walk-Forward CV with embargo, Triple Barrier Labels, LightGBM seeded, feature selection inside folds. No fatal flaws.

**Portfolio Construction:** HRP with Ledoit-Wolf shrinkage, 5% max position, 25% max sector. No fatal flaws.

**Risk Management:** MDD kill switch fixed, but FAILS OPEN on DB error. Sector and correlation gates present.

**Data Engineering:** PIT universe + merge_asof. Missing NIFTY 500 reconstitution. `trade_date` semantics unclear.

**Backtesting:** ADV-scaled impact, capacity constraints, gap-down realism. Fabricated portfolio sim hurts credibility.

### 3. Institutional Scoring (0–100)

**The Phase 0 enforcement cap is NOT triggered. All prior Criticals are resolved.**

| Dimension | Score | Key Evidence |
|:---|:---|:---|
| **Overall Scientific Score** | **68 / 100** | All prior criticals resolved; new findings are genuine discoveries |
| Software Architecture | 79 / 100 | Clean service separation, ML pipelines inside CV. Dead embeddings code. |
| Quantitative Research | 74 / 100 | DSR + PBO + BH FDR + Spearman IC + White's RC. PBO is a proxy. |
| Machine Learning | 72 / 100 | Purged CV with embargo, triple barrier labels, seeded LightGBM |
| Statistical Methodology | 70 / 100 | Block bootstrap Sharpe CI, Patell Z, BH FDR. Missing true CSCV-PBO. |
| Data Engineering | 65 / 100 | PIT universe + merge_asof. Missing NIFTY 500 reconstitution. |
| Risk Management | 58 / 100 | MDD kill switch fixed, but fails open on DB error. |
| Backtesting Credibility | 72 / 100 | ADV-scaled impact, capacity constraints. Fabricated portfolio sim. |
| Production Readiness | 55 / 100 | Bootstrap not seeded, dead code, bare except, fabricated sim data. |

### 4. The "Kill List" (Critical Vulnerabilities)

| # | Severity | Finding | File:Line |
|:---|:---|:---|:---|
| 1 | **CRITICAL (NEW)** | Kill switch fails open on DB error | `risk_engine.py:L66` |
| 2 | **HIGH (NEW)** | Fabricated `portfolio_sharpe: 1.25` in stub simulation | `backtest_service.py:L370` |
| 3 | **HIGH (NEW)** | No NIFTY 500 reconstitution tracking | `universe_service.py:L17` |
| 4 | **MEDIUM (NEW)** | PBO proxy is heuristic logistic, not CSCV | `hypothesis_service.py:L110` |
| 5 | **MEDIUM (NEW)** | `fillna(50.0)` injects synthetic neutral scores | `weight_learning_service.py:L38` |
| 6 | **MEDIUM (NEW)** | Dead `generate_sequence_embeddings` returns `[0,0]` | `ml_service.py:L342` |
| 7 | **LOW (NEW)** | Bootstrap CI not seeded | `statistical_testing_service.py:L26` |
| 8 | **LOW (NEW)** | `FundamentalSnapshot.trade_date` semantics undocumented | `models.py:L430` |

### 5. Remediation Directives

**Directive 1 — Kill Switch Fail-Closed (CRITICAL)**

At `risk_engine.py:L66–L69`, replace:
```python
# BEFORE (fail-open — DANGEROUS):
except Exception as e:
    print(f"Error checking kill switch status: {e}")
self._kill_switch_active = (False, "Normal operation.")

# AFTER (fail-closed — SAFE):
except Exception as e:
    import logging
    logging.getLogger(__name__).critical(f"Kill switch DB unreachable: {e}. FAILING CLOSED.")
    self._kill_switch_active = (True, f"Kill Switch ACTIVE: Database unreachable ({e}). Failing closed.")
    return self._kill_switch_active
```

**Directive 2 — Remove Fabricated Portfolio Simulation (HIGH)**

At `backtest_service.py:L351–L372`, replace:
```python
return {"status": "Not yet implemented", "portfolio_sharpe": None, 
        "note": "Requires daily cross-sectional iteration over OHLCV data."}
```

**Directive 3 — NIFTY 500 Reconstitution (HIGH)**

Add `"NIFTY500"` index to `HistoricalConstituent`. Use NSE's semi-annual reconstitution files. Modify `momentum_service.py:L180` to use `get_pit_universe("NIFTY500", ...)`.

**Directive 4 — Delete Dead Embeddings Code (MEDIUM)**

Remove `generate_sequence_embeddings` from `ml_service.py:L342` and all call sites in `momentum_service.py`.

**Directive 5 — Fix `fillna(50.0)` (MEDIUM)**

Replace `fillna(50.0)` with `SimpleImputer(strategy='median')` inside the pipeline at `weight_learning_service.py:L38`.

**Directive 6 — Seed Bootstrap (LOW)**

Add `rng = np.random.RandomState(42)` and use `rng.randint(...)` in `statistical_testing_service.py`.

### 6. Modules to Scrap

| Module / Code Path | Reason |
|:---|:---|
| `ml_service.py:generate_sequence_embeddings` | Always returns `[0.0, 0.0]` — dead code |
| `backtest_service.py:run_historical_portfolio_simulation` | Returns fabricated results — implement or delete |

---

## Summary

This is the first audit cycle where **all prior Critical and High issues from the Kill List are RESOLVED.** The engineering team has addressed the foundational scientific integrity problems.

The codebase has genuinely transitioned from a "demo with impressive-sounding names" to a platform with institutionally defensible statistical methodology. The new discoveries are real engineering concerns, not repetitions of prior failures.

The primary remaining risk is operational: the kill switch's fail-open behavior is a capital preservation hazard that should be addressed before any production deployment with real money.
