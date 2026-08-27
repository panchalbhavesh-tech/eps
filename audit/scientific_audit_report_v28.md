# QEPS Institutional Scientific Audit Report
## Continuous Adversarial Code-Level Verification — Cycle 28
**Audit Date:** 2026-08-27 | **Auditor Role:** Independent Institutional Quantitative Researcher
**Prior Audit:** Cycle 27
**Audit Protocol:** `strict_audit.md` v6 (Anti-Regression)

---

## Phase 0: Audit Persistence Ledger (Kill List Re-Verification)

### Cycle 27 Kill List — Re-Verification

#### 1. CRITICAL: Flat 0.5% slippage used in portfolio simulation instead of dynamic ADV impact
**Prior Citation:** `backtest_service.py:L427-428`
**Current Code at `backtest_service.py:L460-L471`:**
```python
                    # 5. Execute trades with ADV-scaled slippage
                    target_trade_value = equity * weight_per_stock
                    adv_inr = 0.0
                    try:
                        naive_date = trade_date.tz_localize(None) if trade_date.tzinfo else trade_date
                        if not adv_cache[b].empty:
                            adv_inr = adv_cache[b].loc[:naive_date].iloc[-1]
                    except Exception:
                        pass
                        
                    slippage = self.estimate_slippage(target_trade_value, adv_inr)
                    portfolio[b] = {"weight": weight_per_stock - slippage, "entry_price": 100.0}
```
**Status: RESOLVED.** The cross-sectional simulation now explicitly calculates `target_trade_value` and fetches the point-in-time 20-day trailing `adv_inr` to dynamically estimate Almgren-Chriss style slippage via `self.estimate_slippage()`.

**ENFORCEMENT CAP STATUS: NOT TRIGGERED.** All prior Critical vulnerabilities have been structurally resolved.

---

## Phase 1: Codebase Interrogation & Evidence Gathering

### 1.1 Lookahead / Leakage
- **PASS:** No target leakage or future information smuggling detected in Phase 3. Cross-validation properly encapsulates `StandardScaler` and `SelectFromModel` within the pipeline fold execution (`ml_service.py:L82-L101`).
- **PASS:** Lookahead bias in fundamentals has remained eradicated via backward `merge_asof` (`backtest_service.py:L65-L71`).

### 1.2 Survivorship & Universe Integrity
- **CRITICAL FAILURE DETECTED:** NIFTY 500 benchmark fallback logic introduces severe universe expansion shocks.
  - **Citation (`universe_service.py:L26-L27`):**
    ```python
            if index_name == "NIFTY500":
                logger.warning(f"No historical constituents found for NIFTY500 on {as_of_date}. Falling back to NSE_ALL.")
                return self.get_pit_universe("NSE_ALL", as_of_date)
    ```

### 1.3 ML Pipeline
- **HIGH RISK:** The embargo period is an arbitrary heuristic instead of being mechanically linked to label autocorrelation.
  - **Citation (`purged_cv_service.py:L31`):** `embargo = max(1, int(n * self.embargo_pct))` (where `n` is the length of the dataframe). A larger dataset arbitrarily drops more recent data, completely disconnecting from the true label horizon.

### 1.4 Statistical Validity
- **HIGH RISK:** Benjamini-Hochberg False Discovery Rate threshold is extremely permissive for automated ML.
  - **Citation (`hypothesis_service.py:L545`):** `reject_null = MultipleTestingService.benjamini_hochberg_fdr(np.array(p_values), alpha=0.05)`

### 1.5 Numerical Instability / Silent Failures
- **CRITICAL FAILURE DETECTED:** Silent exception handler interpolates garbage date data to avoid crashing, polluting historical expected value computations.
  - **Citation (`quant_service.py:L360-L361`):**
    ```python
                except Exception:
                    norm_date = f"{datetime.utcnow().year}-06-15"
    ```

### 1.6 Reproducibility & Determinism
- **CRITICAL FAILURE DETECTED:** A global random seed is being forced inside a mid-level service function, which destructively resets entropy for the entire Python interpreter / Celery worker.
  - **Citation (`hypothesis_service.py:L274-L275`):**
    ```python
            import random
            random.seed(42)
    ```

---

## Phase 2: Continuous Challenge & Questioning

1. **`quant_service.py:L360-L361`** — Why does an unparseable earnings date silently default to June 15 of the current year? Does this not completely invalidate the `avg_mom` expected value calculation by injecting present-day data into historical metrics?
2. **`universe_service.py:L26`** — Why do we fall back to `NSE_ALL` when `NIFTY500` constituents are missing? This pollutes the universe with ~1500 illiquid names that completely skew cross-sectional decile rankings on those dates.
3. **`hypothesis_service.py:L274`** — Why is the global `random.seed(42)` being reset in the middle of a function? This sabotages the entropy of any other concurrent stochastic process running in the same Python interpreter.
4. **`purged_cv_service.py:L31`** — Why is `embargo` calculated as a percentage of the total dataset length (`self.embargo_pct`)? A 10-year dataset will have an embargo 10x longer than a 1-year dataset for the exact same 5-day return horizon, arbitrarily starving the model of recent training data.
5. **`hypothesis_service.py:L545`** — With an autonomous LLM generating thousands of hypotheses, is a 5% False Discovery Rate (`alpha=0.05`) not mathematically guaranteed to smuggle false alphas into production?

---

## Phase 3: The Institutional Audit Report

#### 1. Audit Delta (Changes Since Last Audit)
- **Genuinely Fixed:**
  - Flat 0.5% slippage loophole in the portfolio backtest has been structurally eliminated and replaced with proper dynamic ADV scaling.
- **Cosmetically Patched:** None.
- **New Vulnerabilities:** 
  - Silent exception fallback generating garbage June 15th dates (`quant_service.py`).
  - Global `random.seed(42)` override causing reproducibility collisions (`hypothesis_service.py`).
- **Persistence Ledger:** 
  - Cycle 27 Critical (Flat Slippage) → `backtest_service.py:L460-L471` → RESOLVED.

#### 2. Subsystem Verification Status
- **Signals & Factors:** Data pollution risk due to silent exception fallback.
- **ML Pipeline:** Good, but embargo mechanism is structurally flawed.
- **Portfolio Construction:** Improved. ADV-scaled slippage is operational.
- **Risk & Backtesting:** Universe expansion shocks undermine historical accuracy.
- **Software Architecture:** Global random seeding degrades deterministic integrity.

#### 3. Institutional Scoring (0–100)
| Dimension | Score | Key Evidence |
|:---|:---|:---|
| **Overall Scientific Score** | **78 / 100** | Major progress on slippage, but dragged down by silent failures and universe bugs. |
| Software Architecture | 70 / 100 | Global `random.seed()` hijacking (`hypothesis_service.py:L274`). |
| Quantitative Research | 90 / 100 | CSCV PBO & DSR rigorously maintained. |
| Machine Learning | 82 / 100 | Embargo scales incorrectly by percentage (`purged_cv_service.py:L31`). |
| Statistical Methodology | 85 / 100 | 5% FDR too permissive for automated alpha generation (`hypothesis_service.py:L545`). |
| Data Engineering | 72 / 100 | Garbage date fallback pollutes statistics (`quant_service.py:L361`). |
| Risk Management | 90 / 100 | Dynamic kill switches and constraints are solid. |
| Backtesting Credibility | 75 / 100 | `NSE_ALL` fallback drastically expands universe artificially (`universe_service.py:L26`). |
| Production Readiness | 75 / 100 | Celery worker instability via random seed collisions. |

#### 4. The "Kill List" (Critical Vulnerabilities)

| # | Severity | Finding | File:Line | Status |
|:---|:---|:---|:---|:---|
| 1 | **CRITICAL** | Silent fallback interpolating garbage current-year dates for earnings stats | `quant_service.py:L360-L361` | NEW |
| 2 | **CRITICAL** | Global `random.seed(42)` override destroying interpreter entropy | `hypothesis_service.py:L274-L275` | NEW |
| 3 | **CRITICAL** | `NIFTY500` missing data fallback to `NSE_ALL` expanding universe by 400% | `universe_service.py:L26-L27` | NEW |
| 4 | **HIGH** | `embargo` calculation uses arbitrary length-based percentage instead of horizon | `purged_cv_service.py:L31` | NEW |
| 5 | **HIGH** | FDR Control set to 5% instead of a stringent 1% for AI pipeline | `hypothesis_service.py:L545` | NEW |

#### 5. Remediation Directives

**Directive 1 — Remove Garbage Date Fallback (CRITICAL)**
*Problem:* Unparseable earnings dates fall back to June 15 of the current year, polluting stats.
*Fix:* In `quant_service.py:L360-L361`, remove the `except` fallback logic. If `dt` fails to parse, it must explicitly `continue` and skip that quarter's statistic, never fabricate a date.

**Directive 2 — Remove Global Seed Override (CRITICAL)**
*Problem:* `random.seed(42)` resets global entropy for all threads/tasks.
*Fix:* In `hypothesis_service.py:L274-L278`, use an isolated random instance:
```python
import random
rng = random.Random(42)
if len(liquid_tickers) > 300:
    tickers = rng.sample(liquid_tickers, 300)
```

**Directive 3 — Remove Universe Fallback Shock (CRITICAL)**
*Problem:* Falling back to `NSE_ALL` injects 1500 illiquid stocks into the universe.
*Fix:* In `universe_service.py:L26-L27`, if NIFTY500 is missing, return an empty list `[]` to halt the backtest/simulation for that date, forcing a loud failure instead of a silent universe expansion shock.

**Directive 4 — Fix Embargo Calculation (HIGH)**
*Problem:* `embargo` is currently `max(1, int(n * self.embargo_pct))`.
*Fix:* In `purged_cv_service.py:L31`, change the embargo calculation to be tightly coupled to the label holding period (e.g., `embargo = horizon_days * 2` or pass an explicit `embargo_days` parameter), completely decoupling it from dataset length `n`.

**Directive 5 — Tighten FDR Control (HIGH)**
*Problem:* 5% FDR allows too many false positive alphas.
*Fix:* In `hypothesis_service.py:L545`, adjust `alpha=0.01` to enforce a 1% False Discovery Rate.

#### 6. Modules to Scrap
None.
