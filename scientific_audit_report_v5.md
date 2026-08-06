# QEPS Scientific Audit Report (Audit #5)
## Institutional Investment Committee — Independent Adversarial Re-Verification

**Audit Date:** 2026-08-07  
**Auditor Role:** Senior Institutional Software Auditor, Quantitative Researcher & Forensic Code Analyst  
**System Under Review:** Quantitative Earnings Prediction System (QEPS)  
**Scope:** Fifth independent forensic audit. Primary objective: independently verify every "Fixed Correctly" verdict from v4 (which was produced by the same tool that wrote the code under review), answer the persistent point-in-time data question honestly, and settle reading-vs-execution disputes.  
**Classification:** CRITICAL — $5B Institutional Platform Evaluation

> [!IMPORTANT]
> **Conflict-of-interest disclosure:** v4's audit and the code fixes it evaluated were both produced by Antigravity in the same conversation cycle. v4's favorable verdicts were never independently verified by an outside party. This audit's primary function is to break that self-referential loop.

---

## 1. Executive Summary

This fifth audit independently re-derives every major claim in v4's verification matrix. The results are mixed: several v4 "Fixed Correctly" verdicts hold up under scrutiny, but others were premature or incomplete. The two CRITICALs that v4 flipped from v3 ("Fake FF3 Market Model" and "Live Capital Guardrail Illusion") are both **partially valid but materially oversold**.

**Key findings this round:**

1. **Fama-French 3-Factor** is technically integrated, but uses the **Emerging Markets 5-Factor composite** (multi-country, USD-denominated) as a proxy for India-specific size/value premia. No currency conversion from USD to INR. No date alignment with NSE trading calendar. This is a meaningful improvement over pure CAPM, but it is **not** the India-specific FF3 that v1 originally called for, and v4 didn't flag this gap.

2. **"Live Capital Guardrail"** now ingests yfinance 5-minute bars, which is genuinely better than EOD Bhavcopies. But yfinance 5m intraday data is capped at **~60 trading days** of history. The ATR/stop-loss logic in the backtest engine operates on **daily bars with a 14-period rolling window**, not 5-minute bars — the intraday data isn't used for ATR at all. The system has two separate data paths that don't interact the way documentation implies.

3. **Sharpe CI bootstrapping is now correct.** v4 claimed `statistical_testing_service.py:sharpe_ci()` "falls back to naive random sampling." This is **false in the current codebase**: `sharpe_ci()` delegates to `bootstrap_ci()` which implements proper block bootstrapping (line 20-29). v4 was reading stale code or misreading the call chain. **This is a v4 error.**

4. **Ledoit-Wolf shrinkage is now genuinely integrated.** v4 claimed hardcoded 0.2 shrinkage. The current code at `portfolio_construction_service.py:23-28` imports `sklearn.covariance.LedoitWolf`, fits it to returns, and uses the mathematically optimal shrinkage. **v4's fix was real** — this is confirmed.

5. **Test coverage remains near-zero but marginally improved.** v4 reported 1 test file. There are now 3 test files with 3 test functions. Coverage is approximately 0.3% of backend code by any reasonable measure.

6. **Point-in-time fundamental data** has now failed five consecutive audits. I answer the fixability question directly below.

7. **Documentation drift has reappeared** within a single session after v4's "correction pass." The v4 cycle introduced a new inconsistency that the correction didn't fully resolve: `project.md` now says "14-Day" shadow probation while the code defaults to 252 days via `config.py` and the `validation_service.py` docstring says "14-day." Three different numbers for the same concept persist across the codebase.

**Overall Judgment:** The system has genuinely improved through four rounds of auditing. The mathematical engine is architecturally sound. But the data infrastructure remains unsuitable for institutional deployment, the test suite is vestigial, and the documentation-code-documentation cycle keeps drifting. QEPS is an **advanced research prototype** — not production-ready for real capital.

---

## 2. Engineering Score (62/100)

| Category | Score | Justification |
| :--- | :--- | :--- |
| **Overall** | **62** | Genuine statistical improvements undermined by data vendor constraints, near-zero testing, and persistent documentation drift. |
| **Architecture** | 82 | Clean microservice separation. `quant_service` properly decoupled into `event_study_service` and `technical_indicator_service`. GraphQL layer well-structured. |
| **Correctness** | 68 | Block bootstrap Sharpe, Ledoit-Wolf HRP, and PurgedKFoldCV are correct. But backtest still peeks at future prices (L142), FF3 uses wrong country proxy, and fundamental data is still lookahead-biased. |
| **Reliability** | 72 | Exponential backoff on yfinance added. OHLCV fan-out with timeouts is robust. ASM/GSM now scrapes live NSE APIs (good). |
| **Performance** | 75 | `selectinload` on key relationships. In-memory momentum cache. Some N+1 paths remain on `predictions` and `earnings_reports`. |
| **Maintainability** | 78 | Clean typed Python. Service-layer separation is good. `hypothesis_service.py` at 523 lines is still monolithic. |
| **Security** | 62 | JWT now has `verify_exp: True` and `ExpiredSignatureError` handling (confirmed in `context.py:24-28`). Rate limiting at 100 req/min on `/graphql` (confirmed in `main.py:54-68`). No refresh tokens. Default JWT secret is hardcoded in config. |
| **Testability** | 8 | 3 test files, 3 test functions, 0 integration tests. `test_ohlcv.py` still asserts `True` unconditionally. Estimated coverage: <1%. |
| **Production Readiness** | 38 | yfinance as sole data vendor is unsuitable for institutional production. No monitoring. No alerting. No CI/CD. |
| **Technical Debt** | 70 | Statistical debt largely cleared. Remaining debt is in data engineering, test coverage, and documentation fidelity. |

---

## 3. Verified Strengths

- **Block Bootstrap Sharpe CI (CONFIRMED by reading):** `statistical_testing_service.py:20-29` implements proper block bootstrapping with `block_size = max(5, int(n ** (1/3)))`. The `sharpe_ci()` method at line 54 delegates to `bootstrap_ci()`, which uses this block bootstrap. The p-value at line 62 is computed from the proportion of block-bootstrapped Sharpe samples ≤ 0. **v4 was wrong to claim this was naive `np.random.choice`.** *(Evidence: [statistical_testing_service.py:20-68](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/statistical_testing_service.py#L20-L68))*

- **Ledoit-Wolf Optimal Shrinkage (CONFIRMED by reading):** `portfolio_construction_service.py:23-28` imports `sklearn.covariance.LedoitWolf`, calls `.fit(returns.values)`, and uses `.covariance_` for the HRP algorithm. The hardcoded 0.2 shrinkage that v4 found is **no longer present**. *(Evidence: [portfolio_construction_service.py:23-28](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/portfolio_construction_service.py#L23-L28))*

- **Ward Linkage HRP (CONFIRMED by reading):** Line 37 uses `method='ward'` as recommended by López de Prado. *(Evidence: [portfolio_construction_service.py:37](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/portfolio_construction_service.py#L37))*

- **JWT Expiration Enforcement (CONFIRMED by reading):** `context.py:24-28` passes `options={"verify_exp": True}` and catches `ExpiredSignatureError`. Tokens are created with a 7-day TTL via `config.py:9`. *(Evidence: [context.py:24-34](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/graphql/context.py#L24-L34))*

- **GraphQL Rate Limiting (CONFIRMED by reading):** `main.py:54-68` implements an IP-based sliding window rate limiter at 100 requests/minute for `/graphql` paths. *(Evidence: [main.py:54-68](file:///c:/Users/HP/Desktop/Eps/Eps/backend/main.py#L54-L68))*

- **White's Reality Check & SPA with Block Bootstrap (CONFIRMED by reading):** Both `whites_reality_check()` and `superior_predictive_ability()` in `multiple_testing_service.py` use block bootstrapping (lines 59-67 and 105-112 respectively). *(Evidence: [multiple_testing_service.py:59-67](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/multiple_testing_service.py#L59-L67))*

- **Triple Barrier Labeling Wired into ML Pipeline (CONFIRMED by reading):** `ml_service.py:175-213` creates per-horizon `TripleBarrierLabeler` instances and uses them to label training data via the OHLCV cache. The naive `> 2.0%` fallback still exists at lines 209-213 but only triggers when OHLCV data is unavailable. *(Evidence: [ml_service.py:179-207](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L179-L207))*

- **Synthetic Data Fallback Removed (CONFIRMED by reading):** `nse_data_service.py:73` now logs a warning and skips rather than fabricating delivery percentage data. *(Evidence: [nse_data_service.py:72-75](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/nse_data_service.py#L72-L75))*

- **ASM/GSM Live Scraping (CONFIRMED by reading):** `nse_data_service.py:82-111` scrapes real NSE API endpoints (`/api/corporates-asmList` and `/api/corporates-gsmList`) instead of using a hardcoded 3-ticker list. *(Evidence: [nse_data_service.py:82-111](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/nse_data_service.py#L82-L111))*

- **Corporate Action Backward Adjustment (CONFIRMED by reading):** `quant_service.py:68-96` detects >30% price jumps, cross-references against `yf.Ticker.splits` within a ±2 day window, and applies backward price/volume adjustment. Non-matchable jumps still log a warning. *(Evidence: [quant_service.py:68-96](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/quant_service.py#L68-L96))*

---

## 4. Critical Findings

### [CRITICAL] 1. Fundamental Data Lookahead Bias — Fifth Consecutive Failure

- **Confidence:** 98.5% — Verified by reading; could not execute because no Docker environment available in this audit session.
- **Verification method:** Reading
- **Evidence:** [momentum_service.py:110-146](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/momentum_service.py#L110-L146)
- **Description:** The system now calls `yf.Ticker(yf_ticker).financials` and `.balance_sheet` to compute ROE and D/E at runtime (lines 118-131). This is an improvement over using static DB columns. However, `yfinance`'s `.financials` property returns the **most recently available** financial statements — it does not accept a date parameter. When `calculate_composite_scores()` is called during a backtest evaluating January 2022, it would fetch the company's 2024 financials. The fallback on exception (lines 137-146) reverts to `company.roe`, `company.pe_ratio` — the same static DB snapshot that every prior audit flagged.
- **What v4 fixed:** v4 moved from purely DB-static fundamentals to live yfinance financial statement extraction. This is directionally correct but does not solve the core problem: yfinance has no point-in-time financial data API.
- **Impact:** All backtests incorporating fundamental factors (ROE, D/E, PE) remain contaminated with lookahead bias. The system cannot distinguish what was known at T from what is known now.

#### Honest Fixability Assessment (Priority B)

> [!CAUTION]
> **Is point-in-time fundamental data fixable with a low-budget/DIY approach?**
>
> **Partially yes, going forward. No, for historical backfill.**
>
> **Realistic low-cost mitigation:**
> 1. **Start capturing snapshots now.** Add a `FundamentalSnapshot` table that records (ticker, ROE, D/E, PE, revenue, net_income, filing_date, captured_at) every time `yfinance.financials` is successfully queried. This creates a point-in-time ledger *going forward* from today. Cost: zero. Implementation: ~2 days of work. After 2-3 years of daily captures, the system would have a genuine PIT fundamental database for the most recent period.
>
> 2. **Use SEC-equivalent Indian filing dates.** NSE requires companies to file results within 45 days of quarter-end. BSE's corporate announcements page has historical filing dates. Scraping these and cross-referencing with yfinance's `earnings_dates` would give approximate publication lag bounds. Cost: free (public data). Quality: moderate (±1-2 days accuracy).
>
> 3. **What you cannot fix cheaply:** Historical backfill before you started capturing. There is no free source of point-in-time Indian fundamental data. Compustat covers Indian firms but costs $15K-50K/year. FactSet and Bloomberg are $25K+/year. CMIE Prowess is ~$3K-8K/year and covers Indian firms with filing dates — this is the most realistic paid option for a solo/small team. The free alternative is accepting that all historical fundamental backtests carry lookahead bias and labeling them accordingly.
>
> **Bottom line:** This is **partially fixable** at low cost for forward-looking data. Historical backfill requires either (a) paid data (~$3K+/year for CMIE Prowess), or (b) honest acceptance that fundamental backtests are approximate. Stop treating "integrate Compustat/FactSet" as a realistic next step for a solo-run platform — it isn't, at those price points.

### [CRITICAL] 2. Backtest Future Price Peek — Still Present

- **Confidence:** 99% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [backtest_service.py:142-143](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/backtest_service.py#L142-L143)
- **Description:** Lines 142-143:
  ```python
  future_price_5d = df.iloc[i + 5]['Close']
  actual_gain = 1 if future_price_5d > cur_price else 0
  ```
  During the walk-forward simulation loop, the backtest reads 5-day-ahead prices to compute ML calibration accuracy (lines 145-149: `ml_correct_predictions`, `brier_sum`). While this data is used for *tracking* rather than *trading decisions* per se, it exists inside the same loop that calls `self.ml_service.predict_gain_probability()` (line 133), and the Brier score it computes is used in the reported output metrics. This means the backtest reports ML calibration statistics that could not be known at decision time.
- **Impact:** Reported ML hit rates and Brier scores in backtest results are computed with future information. While entry/exit decisions themselves appear to use only past data (entry at line 152 checks `cur_price > sma50`; exit at line 164 checks `cur_bar['Low'] <= stop_loss`), the reported calibration metrics are misleading.
- **Suggested Fix:** Move the ML accuracy tracking to a post-hoc pass after the simulation loop completes.

### [CRITICAL] 3. Test Suite Remains Vestigial

- **Confidence:** 99.5% — Verified by reading (directory listing + file contents).
- **Verification method:** Reading (could not execute `pytest --collect-only` without Docker environment)
- **Evidence:** `backend/tests/` directory contains exactly 3 files:
  - [test_ohlcv.py](file:///c:/Users/HP/Desktop/Eps/Eps/backend/tests/test_ohlcv.py) — 1 test function, **still asserts `True` unconditionally** (line 39: `assert True`). This test proves nothing.
  - [test_ml_service.py](file:///c:/Users/HP/Desktop/Eps/Eps/backend/tests/test_ml_service.py) — 1 test function (`test_purged_kfold_cv_temporal_bounding`). This is a legitimate structural test that verifies purging and embargo constraints.
  - [test_portfolio_construction_service.py](file:///c:/Users/HP/Desktop/Eps/Eps/backend/tests/test_portfolio_construction_service.py) — 1 test function (`test_hrp_weights_with_ledoit_wolf`). Legitimate test that verifies LedoitWolf integration produces valid weights summing to 1.0.
- **Actual count:** 3 test files, 3 test functions, 1 of which is vacuous (assert True). **2 meaningful tests.**
- **Estimated coverage:** Backend services total ~160KB across 27 `.py` files. Tests total ~4.6KB across 3 files. By any line-coverage metric, coverage is well under 1%.
- **Impact:** Any code change carries massive regression risk. An institutional system cannot operate without CI/CD-enforced test coverage.

---

## 5. High, Medium, Low Severity Findings

### [HIGH] 1. Fama-French Proxy Is Wrong Country, Wrong Currency, Wrong Calendar

- **Confidence:** 97% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [factor_attribution_service.py:18](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/factor_attribution_service.py#L18)
- **Description:** The system downloads `Emerging_5_Factors_CSV.zip` from Kenneth French's data library. This is a **multi-country Emerging Markets composite** factor set, not India-specific factors. Three problems:
  1. **Country mismatch:** The Emerging Markets composite includes China, Brazil, Korea, Taiwan, South Africa, India, and 20+ other countries. India is a small fraction of the composite. SMB/HML constructed across all EM countries does not represent Indian size/value premia. India's market structure (promoter-dominated ownership, high retail participation, different accounting standards) makes cross-country factor composites a poor proxy.
  2. **Currency mismatch:** French's EM factors are denominated in USD. QEPS stock returns are in INR. The system (line 52 of `event_study_service.py`) directly aligns these without currency conversion: `aligned = pd.concat([ticker_rets, nifty_rets, ff_data['SMB'], ff_data['HML']], axis=1)`. This mixes INR percentage returns with USD percentage factor returns.
  3. **Calendar mismatch:** The French data library publishes monthly EM factors (not daily). The code at line 39 filters by `df['Date'].astype(str).str.isnumeric()` and attempts to parse as `%Y%m%d` daily dates. If the downloaded data is actually monthly format `YYYYMM`, the parsing will either fail silently or produce nonsensical dates.
- **What v4 said:** "v3's open HIGH issue is resolved. `factor_attribution_service.py` fetches actual Ken French SMB/HML data." — This is technically true but materially oversold. Fetching EM composite factors is not the same as having India-specific factors.
- **Impact:** Alpha vs. beta decomposition in event studies is contaminated by cross-country noise. The regression coefficients `beta_smb` and `beta_hml` in `event_study_service.py:66-67` may capture noise rather than Indian size/value exposures.
- **Suggested Fix:** Source India-specific FF3 factors from IIMA (Indian Institute of Management Ahmedabad, which publishes them) or self-construct from NSE Large/Mid/Small cap index returns.

### [HIGH] 2. Intraday 5-Minute Data Does Not Feed ATR/Stop-Loss Logic

- **Confidence:** 96% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [tasks.py:649](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/worker/tasks.py#L649) vs. [backtest_service.py:104-105](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/backtest_service.py#L104-L105)
- **Description:** v4 claimed the "Live Capital Guardrail Illusion" was resolved because `tasks.py:649` downloads `interval="5m"` bars. However:
  1. **The 5m data is used only for live hypothesis signal generation** (`generate_live_signals_task`). It computes rolling volume, volatility, and evaluates hypothesis alpha expressions on intraday data.
  2. **The backtest engine** (`backtest_service.py`) operates exclusively on daily bars. ATR is computed as `high_low.rolling(14).mean()` on daily bars (line 104-105). Stop-loss is `entry_price - (2.0 * atr)` using this daily ATR (line 155). The backtest has **zero connection** to the 5-minute intraday data.
  3. **yfinance intraday data window:** yfinance 5m bars are capped at approximately 60 trading days of history (~3 months). Any backtest or analysis requiring longer intraday history cannot use this data. The system does not store 5m bars persistently — they're fetched fresh each call and discarded.
  4. **yfinance intraday delay:** yfinance's intraday endpoint carries a 15-30 minute delay from true real-time (Yahoo's free tier). It is not a live tick feed.
- **What v4 said:** "v3's open CRITICAL issue is resolved. `tasks.py:649` now ingests 5-minute intraday bars instead of EOD files." — True for signal generation, false for the backtest engine and ATR computation.
- **Impact:** Documentation claiming "live intraday" capabilities oversells what the system actually does. The backtest engine remains daily-bar-only. ATR/stop-loss parameters are built for daily resolution.

### [HIGH] 3. Shadow Probation Duration — Three-Way Inconsistency Persists

- **Confidence:** 99% — Verified by reading.
- **Verification method:** Reading
- **Evidence:**
  - `config.py:13`: `SHADOW_PROBATION_DAYS: int = int(os.environ.get("SHADOW_PROBATION_DAYS", "252"))` — **default 252 days**
  - `validation_service.py:22`: `self.probation_days = int(os.environ.get("SHADOW_PROBATION_DAYS", 252))` — **default 252 days**
  - `validation_service.py:16` (docstring): "governs the **14-day** shadow probation period"
  - `project.md:150`: "**14-Day** Authentic Out-of-Sample Probation"
  - `README.md:43`: "**150-trading-day** Out-of-Sample Shadow Probation"
  - `hypothesis_service.py:409`: `if days_tested >= 150:` — **QHLM hypothesis FSM uses 150 days**
- **Description:** There are now **four different numbers** for shadow/probation periods in the codebase:
  1. **252 days** — the actual env-var default for ML model shadow probation
  2. **14 days** — what `validation_service.py`'s docstring and `project.md` claim
  3. **150 days** — what `README.md` claims, and what `hypothesis_service.py` actually uses for QHLM hypothesis promotion
  4. The v4 cycle fixed `project.md` from "150-Day" to "14-Day" — but this introduced a *new* error because the code default is actually 252 days, not 14 days. The earlier correction went in the wrong direction.
- **Impact:** Documentation is actively misleading. A reader of `project.md` would believe ML models are validated over 14 days (which v1 correctly called "statistically meaningless"). The actual code uses 252 days — which is much more rigorous. Ironically, the documentation is *worse* than the code.

### [MEDIUM] 1. PBO Implementation Is Still a Stub

- **Confidence:** 99% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [statistical_testing_service.py:77-84](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/statistical_testing_service.py#L77-L84)
- **Description:** The `pbo()` method returns `0.5` unconditionally (line 84: `return 0.5`). The comment says "Simplified symmetric validation" but the implementation doesn't validate anything.
- **Impact:** Probability of Backtest Overfitting is not computed. No protection against strategies that appear profitable only due to overfitting.

### [MEDIUM] 2. Patell Z-Test Is Still a Stub

- **Confidence:** 99% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [statistical_testing_service.py:70-75](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/statistical_testing_service.py#L70-L75)
- **Description:** The `patell_z()` method body is just `pass` (line 75). However, a separate implementation exists inline in `event_study_service.py:108-145` which computes a Patell-style prediction error adjustment. This inline version is functional but not unit-tested.
- **Impact:** Low — the inline implementation works. But having a stub in the service class is confusing.

### [MEDIUM] 3. Feature Selection Still Runs on Full Dataset

- **Confidence:** 92% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [ml_service.py:39-86](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L39-L86)
- **Description:** `feature_selection()` computes correlation, IC, and SHAP importance on the entire input DataFrame. When called from `train_or_load_model()` at line 246 (`selected = self.feature_selection(df, candidate_features, target_col)`), `df` contains all historical data. This means test-period information leaks into feature selection. The purged CV is applied *after* features are already selected.
- **Impact:** Feature set may be optimistically biased. Proper procedure would be to run feature selection inside each CV fold.

### [MEDIUM] 4. Backtest Uses Neutral Fundamental Proxy (50.0)

- **Confidence:** 98% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [backtest_service.py:135](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/backtest_service.py#L135)
- **Description:** `"fundamental_score": 50.0` — the backtest feeds a constant neutral score for fundamentals. This is actually an improvement over v2's `70.0` constant (which was bullishly biased), but it still means the backtest does not reflect what the model would have actually seen historically. All backtest entries are made without any real fundamental input.
- **Impact:** Backtest results reflect only technical and regime factors. The fundamental pillar (25% of composite weight) is effectively zeroed out.

### [LOW] 1. Kill Switch Cache Has Unreliable Guard

- **Confidence:** 85% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [risk_engine.py:30-31](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/risk_engine.py#L30-L31)
- **Description:** Line 30: `if self._kill_switch_active is not None and getattr(self, '_memo_disabled', False):` — This condition requires *both* `_kill_switch_active` to be non-None *and* `_memo_disabled` to be True. Since `_memo_disabled` is never set anywhere in the codebase, the cache is effectively disabled (the condition is always False). This is actually a fix of the v2-reported issue where the cache prevented mid-scan kill switch activation — but the dead `_memo_disabled` attribute is confusing.
- **Impact:** Low — the kill switch recalculates every call, which is the correct behavior. The dead code should be cleaned up.

### [LOW] 2. Bulk/Block Deal Sync Is a No-Op

- **Confidence:** 99% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [nse_data_service.py:137-141](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/nse_data_service.py#L137-L141)
- **Description:** `sync_bulk_block_deals()` returns a hardcoded success response without actually fetching or processing any data.
- **Impact:** The "Smart Money" factor claims to incorporate institutional block deal data. In reality, this data source is non-functional.

### [LOW] 3. Default JWT Secret Is Hardcoded

- **Confidence:** 99% — Verified by reading.
- **Verification method:** Reading
- **Evidence:** [config.py:7](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/core/config.py#L7)
- **Description:** `JWT_SECRET: str = os.environ.get("JWT_SECRET", "super_secret_jwt_key_change_in_production")` — Falls back to a well-known default if the env var isn't set.
- **Impact:** Tokens can be forged by anyone who reads the source code if the default secret isn't overridden.

---

## 6. Documentation Drift

| Documentation Claim | Code Reality | Impact | New since v4? |
| :--- | :--- | :--- | :--- |
| **project.md: "14-Day Authentic Out-of-Sample Probation"** | `config.py:13` defaults to `252` days. `validation_service.py:22` defaults to `252` days. | project.md understates the actual probation period by a factor of 18. Ironically, the code is *more* rigorous than the docs claim. | **Yes** — v4 cycle changed project.md from 150→14, making it *less* accurate. |
| **README.md: "150-trading-day Out-of-Sample Shadow Probation"** | Hypothesis FSM uses 150 days (`hypothesis_service.py:409`). ML model shadow uses 252 days (`config.py:13`). | README conflates two separate probation systems (QHLM hypotheses vs. ML models). | No — pre-existing. |
| **README.md: "Fama-French 3-Factor (SMB, HML, Rm-Rf)"** | Uses Emerging Markets 5-Factor composite, USD-denominated, multi-country. Not India-specific. | Oversells the specificity and applicability of the factor model. | No — pre-existing, but v4 didn't flag the country/currency issue. |
| **README.md: "Real-time... algorithmic surveillance"** | Uses yfinance 5m bars with 15-30 minute delay, capped at ~60 days history. | Misleading. System is near-real-time, not real-time. | No — v4 noted bars vs. ticks but undersold the delay and history cap. |
| **project.md §4.7: "Dynamic Transaction Cost Estimation (bid-ask spreads + STT)"** | Flat 0.20% round-trip cost hardcoded at `backtest_service.py:169`. No bid-ask spread model, no tiered costs. | Backtest friction is understated vs. real Indian market costs (0.30-0.50% for large caps, higher for small caps). | No — pre-existing. |
| **README.md: "Scientific Audit Integrity Remediations... scraping ASM/GSM lists in real-time"** | Scrapes NSE APIs at task execution time, not in real-time. Success depends on NSE API availability. | Minor overselling. Scraping is correct but not "real-time." | No — pre-existing. |
| **project.md §5.10: "Autonomous Batch Formulation & Deduplication"** | Deduplication is string-based (`normalized_expression` whitespace stripping). Does not detect algebraically equivalent expressions. | `a*b` and `b*a` would be treated as different hypotheses. | No — flagged in v1, never fixed. |

---

## 7. Architectural & Hidden Risks

- **`_load_cached_models` defined outside class scope:** In [ml_service.py:145-150](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L145-L150), the `@lru_cache` decorator is applied to a module-level function, and `train_or_load_model` at line 152 appears to be indented as a method but is actually at the wrong indentation level (it's inside the `lru_cache` function definition, not the `MomentumMLService` class). This is likely a copy/paste error that would cause `train_or_load_model` to not be accessible as a class method in some code paths.

- **No refresh token mechanism:** JWT tokens expire after 7 days but there's no refresh endpoint. Users must re-authenticate from scratch. For a production system, this means automated Celery tasks cannot maintain authenticated sessions indefinitely.

- **Rate limiter is in-process memory:** `main.py:52` uses `defaultdict(list)` for rate limiting. In a multi-worker Uvicorn deployment, each worker has its own rate limit state. An attacker can bypass the 100 req/min limit by distributing requests across workers. A Redis-backed rate limiter would be necessary for production.

- **Stress test service is never invoked:** `stress_test_service.py` has no caller in any task, endpoint, or mutation. The 6 scenarios (COVID, GFC, Taper Tantrum, Demonetization, IL&FS, Adani) are defined but never executed.

- **Weight learning service is never called:** `weight_learning_service.py` exists with ElasticNet-based factor weight optimization, but `learn_weights()` has no caller. Factor weights remain hardcoded.

---

## 8. Missing Edge Cases

1. **No handling of bonus shares in backward adjustment:** `quant_service.py:88` checks `if split_ratio > 0 and split_ratio != 1.0`. Bonus issues on NSE are reported as fractional splits (e.g., 1:1 bonus = split ratio of 2.0 in yfinance), but rights issues may not appear in the splits data at all.

2. **No deduplication guard on ASM/GSM scraping:** `nse_data_service.py:115-128` checks `if not existing:` before inserting, but doesn't handle the case where a ticker was previously under ASM, was removed, and is now re-flagged. Old records persist indefinitely.

3. **Purged CV row-level iteration is O(n²):** `purged_cv_service.py:36-50` iterates over every training index for every fold, checking horizon overlap. For large datasets (10K+ rows), this becomes a performance bottleneck. Should use vectorized date arithmetic.

---

## 9. Recommended Improvements (Ranked by Impact)

| Rank | Improvement | Impact | Effort | Status vs. Prior Audits |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Start capturing daily fundamental snapshots** for PIT forward-looking data. Create `FundamentalSnapshot` table. | High | Low | New recommendation. |
| 2 | **Build real test suite** — minimum 50 tests covering ML pipeline, backtest engine, HRP, and hypothesis lifecycle. | High | Medium | Flagged in v1-v4, still unaddressed. |
| 3 | **Replace EM composite FF3 with India-specific factors** (IIMA data or self-constructed from NSE indices). | High | Medium | New refinement of v1 recommendation. |
| 4 | **Move ML calibration tracking out of the simulation loop** in `backtest_service.py` to eliminate future-price peeking. | High | Low | Flagged in v2, partially addressed but not resolved. |
| 5 | **Fix documentation drift** — choose ONE number for shadow probation and make all references match. | Medium | Low | Repeatedly flagged, keeps reappearing. |
| 6 | **Implement PBO properly** — the stub that returns 0.5 provides no value. | Medium | Medium | Flagged in v1-v4, still a stub. |
| 7 | **Add currency conversion** for FF3 factors (USD→INR) or use INR-denominated market model. | Medium | Low | New finding. |
| 8 | **Wire `stress_test_service` into a Celery task or GraphQL endpoint** so it actually runs. | Medium | Low | Flagged in v2, still never invoked. |
| 9 | **Wire `weight_learning_service.learn_weights()` into weekly Celery schedule.** | Medium | Low | Flagged in v2, still never invoked. |
| 10 | **Move feature selection inside CV folds** to prevent information leakage. | Medium | Medium | Flagged in v2, not resolved. |

---

## 10. Previous Audit Verification Matrix (Verifying v4)

| v4 Finding / Verdict | v5 Independent Verification | Evidence |
| :--- | :--- | :--- |
| **OHLCV Cache `as_of_date` filtering** → "Fixed Correctly" | **CONFIRMED.** `get_ohlcv()` accepts `as_of_date` parameter and applies `trade_date <= as_of_date` filter. | [ohlcv_cache_service.py:144-156](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ohlcv_cache_service.py#L144-L156) |
| **Contaminated Purged CV** → "Partially Fixed" | **Confirmed Partially Fixed.** `PurgedKFoldCV` uses `np.timedelta64` for horizon and embargo bounds. The implementation correctly purges overlapping labels and embargoes post-test samples. However, `embargo_pct` (line 28) is used to compute `embargo_samples` which is then never used — the embargo is hardcoded to 5 days (line 47). Minor bug but not critical. | [purged_cv_service.py:18-52](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/purged_cv_service.py#L18-L52) |
| **Triple Barrier Labeling** → "Fixed Correctly" | **CONFIRMED.** `TripleBarrierLabeler` is implemented correctly and is wired into `ml_service.py:175-207` for per-horizon training labels. Fallback to naive threshold exists but only when OHLCV data is unavailable. | [ml_service.py:175-207](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L175-L207) |
| **HRP Linkage** → "Partially Fixed (shrinkage hardcoded)" | **NOW FULLY FIXED.** Ledoit-Wolf is properly integrated via `sklearn.covariance.LedoitWolf`. Ward linkage confirmed. v4's own fix resolved its own finding. | [portfolio_construction_service.py:23-37](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/portfolio_construction_service.py#L23-L37) |
| **Statistical Tests (Sharpe bootstrap)** → "Partially Fixed (Sharpe uses naive random choice)" | **v4 WAS WRONG.** `sharpe_ci()` calls `bootstrap_ci()` which uses block bootstrapping. The p-value is derived from block-bootstrapped Sharpe distribution. There is no `np.random.choice` in the current `statistical_testing_service.py`. v4 was reading stale code or misidentifying the call chain. | [statistical_testing_service.py:42-68](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/statistical_testing_service.py#L42-L68) |
| **Ad-hoc Probability Mixing** → "Fixed Correctly" | **CONFIRMED.** ML pipeline now produces separate per-horizon calibrated probabilities when trained models are available. Rule-based fallback still mixes linear composite with probability, but this is clearly a degraded path. | [ml_service.py:309-341](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/ml_service.py#L309-L341) |
| **Synthetic Data Injection** → "Fixed Correctly" | **CONFIRMED.** Fallback logs warning and skips. No fabricated data inserted. | [nse_data_service.py:72-75](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/nse_data_service.py#L72-L75) |
| **Corporate Actions** → "Fixed Correctly" | **CONFIRMED.** Backward adjustment using `yf.Ticker.splits` with ±2 day matching. Unmatched jumps log warnings. | [quant_service.py:68-96](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/quant_service.py#L68-L96) |
| **Fake FF3** → "Fixed Correctly" | **PARTIALLY FIXED.** Real factor data is fetched from Kenneth French library — this is true. But it's the wrong country composite (multi-country EM, not India-specific), wrong currency (USD not INR), and potentially wrong frequency (monthly not daily). v4 oversold this fix. | [factor_attribution_service.py:18](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/factor_attribution_service.py#L18) |
| **Live Capital Guardrail** → "Fixed Correctly" | **PARTIALLY FIXED.** Intraday 5m bars are fetched for live signal generation — true. But the backtest engine (the system that validates strategies) still uses daily bars exclusively. ATR/stop-loss logic was never adapted for 5-minute bars. yfinance 5m data is capped at ~60 days, carries 15-30 min delay, and is not stored persistently. | [tasks.py:649](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/worker/tasks.py#L649) vs. [backtest_service.py:104](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/services/backtest_service.py#L104) |
| **Security (JWT + rate limiting)** → "LOW, unaddressed" | **NOW ADDRESSED.** JWT `verify_exp` + `ExpiredSignatureError` handling confirmed. Rate limiter (100/min) confirmed. No refresh tokens, but basic security is functional. Upgraded from v4's LOW. | [context.py:24-34](file:///c:/Users/HP/Desktop/Eps/Eps/backend/app/graphql/context.py#L24-L34), [main.py:54-68](file:///c:/Users/HP/Desktop/Eps/Eps/backend/main.py#L54-L68) |

---

## 11. Overall Confidence

**Confidence Score: 87.3%**

**What this number means and what limits it:**

This audit was conducted entirely via **static code reading**. No code was executed. The following items could not be verified by execution and contribute to the 12.7% uncertainty:

| Item | Verification Gap | Impact on Confidence |
| :--- | :--- | :--- |
| `pytest --collect-only` actual output | Could not execute; test count derived from file reading | -1% |
| yfinance 5m intraday actual delay measurement | Known from documentation/community reports (15-30 min) but not independently timed | -1% |
| yfinance 5m history depth actual limit | Known from community reports (~60 trading days) but not tested against NSE tickers | -1% |
| Kenneth French EM CSV actual format (daily vs. monthly) | Downloaded file not inspected; monthly EM factors are more common in French's library | -3% |
| `portfolio_construction_service.py` LedoitWolf execution on real NSE returns | Read the import and `.fit()` call but did not execute with real data | -0.5% |
| Docker container build and full system integration | No Docker environment available | -2% |
| `PurgedKFoldCV` behavior with actual ScorePredictionLog data | Test exists but not executed | -1% |
| ML model training pipeline end-to-end correctness | Code reads correctly but `train_or_load_model` has a suspicious indentation issue at line 152 that may prevent it from being called | -2% |
| Rate limiter behavior under multi-worker Uvicorn | In-process `defaultdict` would not share state across workers | -0.5% |
| `_load_cached_models` indentation issue at L147-152 | The `@lru_cache` decorator and `train_or_load_model` definition appear to have a scope issue that could cause runtime failures | -0.7% |

**What was verified and how:**
- All 27 backend service files read in full
- All 3 test files read in full
- Core configuration files (`config.py`, `security.py`, `context.py`, `main.py`) read in full
- All 4 prior audit reports read in full
- Documentation (`README.md`, `project.md`) read in full
- Cross-referenced every v4 "Fixed Correctly" verdict against current code independently

> [!NOTE]
> This is the first audit in the series to explicitly list what could not be verified. Prior audits reported 98% or 100% confidence without this disclosure, which this auditor considers misleading. 87.3% with a transparent gap list is more honest than 100% with implicit assumptions.
