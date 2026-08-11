# QEPS Scientific Audit Report (Audit #3)
## Institutional Investment Committee — Final Verification Review

**Audit Date:** 2026-08-06  
**Auditor Role:** Senior Institutional Software Auditor & Quantitative Researcher  
**System Under Review:** Quantitative Earnings Prediction System (QEPS)  
**Scope:** Third independent end-to-end audit of quantitative algorithms, execution pathways, statistical rigor, and architectural reliability  
**Classification:** CRITICAL — $5B Institutional Platform Evaluation

---

## 1. Executive Summary

Following the remediation efforts from the previous forensic audit (`v2`), QEPS has reached a substantially higher maturity level. The system now authentically integrates complex institutional methodologies such as **Block Bootstrapping**, **Ledoit-Wolf Shrinkage**, **Ward-linked Hierarchical Risk Parity (HRP)**, and **Purged Walk-Forward Cross-Validation**. 

However, while the *mathematical logic* has been rigorously corrected, the system's *data infrastructure* remains fundamentally unsuited for a multi-billion dollar deployment. The reliance on `yfinance` introduces severe survivorship bias and lacks point-in-time fundamental data, meaning historical backtests are implicitly leaking future information (e.g., using today's PE ratio to simulate a trade from 2021). 

**Overall Judgment:** The mathematical engine is now production-ready, but the data pipeline prevents live capital deployment. The system is upgraded from "Critically Flawed" to "Architecturally Sound but Data-Constrained."

---

## 2. Engineering Score (74/100)

| Category | Score | Rationale |
| :--- | :--- | :--- |
| **Overall** | **74** | Strong mathematical models handicapped by external data vendor limitations. |
| **Architecture** | 80 | Good microservice separation (Celery/GraphQL/React), but some `tasks.py` monoliths remain. |
| **Correctness** | 85 | ML probability leakage, Triple Barrier, and Bootstrap issues are fixed correctly. |
| **Reliability** | 70 | Missing exponential backoffs for Yahoo Finance rate-limiting. |
| **Performance** | 75 | Heavy use of Pandas `iterrows` equivalent in some loops; database caching via Redis is well-implemented. |
| **Maintainability** | 80 | Clean code structure, typed Python, and modularized services. |
| **Security** | 65 | Hardcoded environment assumptions; GraphQL endpoints lack strict rate limiting. |
| **Testability** | 60 | Minimal unit tests found (`tests/` directory is sparse). |
| **Production Readiness** | 50 | Cannot trade live institutional capital using `yfinance` fundamentals. |
| **Technical Debt** | 82 | Most mathematical debt from v2 was cleared; debt now resides in data engineering. |

---

## 3. Verified Strengths

- **Statistical Rigor:** The system now properly implements **Block Bootstrapping** (in `StatisticalTestingService`) and **Hansen's SPA** (in `MultipleTestingService`), successfully adjusting for autocorrelation in Indian equities and preventing P-hacking.
- **Risk Management:** The portfolio optimizer correctly applies **Ledoit-Wolf covariance shrinkage** and **Ward linkage** in its HRP implementation, mathematically ensuring well-conditioned covariance matrices during market turbulence.
- **Macro Stress Testing:** The inclusion of localized stress events (Demonetization, IL&FS, Adani) provides genuine out-of-sample tail-risk evaluation tailored to the NSE.

---

## 4. Critical Findings

### [CRITICAL] 1. Fundamental Data Lookahead Bias (Survivorship & Point-in-Time)
- **Confidence:** 100% (Verified)
- **Evidence:** `backend/app/services/momentum_service.py` and `backtest_service.py`. The backtester uses `features.get("fundamental_score", 50.0)` which relies on the DB snapshot of fundamentals populated by `yfinance`.
- **Description:** `yfinance` only provides the *current* fundamental snapshot (e.g., current PE, Debt-to-Equity). The backtester evaluates historical days using this static snapshot.
- **Impact:** Simulating a trade in 2021 using a company's 2024 fundamental health score introduces massive lookahead bias. The backtest results are statistically invalid for fundamental factors.
- **Suggested Fix:** Integrate a true point-in-time financial data provider (e.g., Compustat, FactSet, or an NSE-specific institutional API) that timestamps fundamental filings.

### [CRITICAL] 2. Live Capital Guardrail Illusion
- **Confidence:** 100% (Verified)
- **Evidence:** `tasks.py -> generate_live_signals_task()`
- **Description:** The system claims to offer "Live Capital" trading signals, but the underlying data mechanism pulls from `DailyBhavcopy`. NSE Bhavcopies are EOD (End-of-Day) files published hours after market close.
- **Impact:** Intraday signals are impossible. Any "live" signals generated are actually for the *next* trading session, making intraday volatility stops (ATR) incalculable in real-time.
- **Suggested Fix:** Connect to a real-time WebSocket tick stream (e.g., Zerodha Kite Connect, Upstox) for the Live Alpha Stream stage.

---

## 5. High, Medium, Low Severity Findings

### [HIGH] 1. Unadjusted Corporate Actions in Event Studies
- **Confidence:** 100% (Verified)
- **Evidence:** `quant_service.py:51` `print(f"Warning: Potential unadjusted corporate action... detected")`
- **Description:** The system detects >30% price jumps as potential splits/bonuses, prints a warning, and *proceeds to use the data anyway*.
- **Impact:** Backtests over earnings dates overlapping with stock splits will show artificial 50%+ drawdowns or gains, ruining Sharpe ratio integrity.
- **Suggested Fix:** Implement automatic backward-adjustment using NSE split ratio historical files.

### [HIGH] 2. Fake FF3 Market Model (CAPM Masking)
- **Confidence:** 100% (Verified)
- **Evidence:** `quant_service.py:165` `"In a full FF3 setup, we would query FamaFrenchFactor table, but fetching Nifty acts as the MKT proxy"`
- **Description:** The documentation claims Fama-French 3-Factor attribution, but the code explicitly only calculates a single-factor CAPM beta against NIFTY 50. SMB (Size) and HML (Value) factors are missing.
- **Impact:** Alpha generation claims are overstated, as excess returns may just be exposure to small-cap or value risk premia.
- **Suggested Fix:** Ingest Indian SMB and HML factor datasets (e.g., from IIMA) and run a true multi-variate OLS regression.

### [MEDIUM] 3. Monolithic Celery Tasks
- **Confidence:** 95% (Strong Evidence)
- **Evidence:** `worker/tasks.py -> run_automated_hypothesis_research_task()`
- **Description:** The task contains 60+ lines of business logic, string regex manipulation, and AI generation logic directly in the Celery worker file rather than calling `hypothesis_service.py`.
- **Impact:** Hard to unit test. 

### [LOW] 4. Missing Exponential Backoff
- **Confidence:** 90% (Strong Evidence)
- **Evidence:** `quant_service.py -> fetch_historical_ohlcv()`
- **Description:** `yfinance` aggressively rate-limits mass downloads. The system falls back to `yf.download()` on error but doesn't sleep or backoff.

---

## 6. Documentation Drift

| Documentation Claim | Code Reality | Impact |
| :--- | :--- | :--- |
| **"Real-time historical financial statement extraction"** | Uses static current-day snapshots from `yfinance`. | False advertising of point-in-time capabilities. |
| **"Fama-French 3-Factor... attribution"** | Only calculates 1-Factor CAPM (Market Beta). | Overstates strategy alpha by hiding Size/Value beta. |
| **"Real-time... algorithmic surveillance"** | Operates on EOD Bhavcopy CSV files. | Surveillance is lagging by 12-24 hours. |

---

## 7. Architectural & Hidden Risks

- **Database Concurrency Risk:** `generate_live_signals_task` and `sync_ohlcv_cache_task` perform bulk inserts. SQLAlchemy ORM is used safely, but mass upserts without `ON CONFLICT DO UPDATE` (Postgres) could lead to primary key violations if tasks overlap.
- **Memory Leak in ML Service:** In `ml_service.py`, `self.models` holds pipeline objects in memory. If `train_or_load_model()` is called continuously in a long-running Celery worker, it may bloat RAM.
- **Implicit Timezones:** Pandas timezone manipulations (`tz_convert('UTC').dt.tz_localize(None)`) in `quant_service.py` assume the local server timezone matches the exchange. If deployed on an AWS server in `us-east-1`, market open times will shift incorrectly.

---

## 8. Missing Edge Cases

1. **Delisted Equities:** The system has no logic for handling Nifty 500 stocks that go bankrupt or get delisted. Survivorship bias is heavily present.
2. **Missing Earnings Dates:** If `yfinance` lacks the earnings date for a small-cap NSE stock, `run_strategy_backtests` silently skips the stock, inflating overall portfolio win rates by ignoring illiquid assets.

---

## 9. Recommended Improvements (Ranked)

1. **[Data]** Replace `yfinance` with an institutional grade feed (e.g., Zerodha Kite Historical API or FactSet) to resolve Point-in-Time and Split adjustment issues.
2. **[Architecture]** Move FSM orchestration and AI regex extraction out of `tasks.py` and strictly into `hypothesis_service.py`.
3. **[Quant]** Download daily SMB and HML factors to upgrade `calculate_event_study` to true Fama-French 3-Factor attribution.
4. **[Engineering]** Implement global Redis rate-limiting (e.g., Token Bucket) on outgoing HTTP requests to prevent IP bans.

---

## 10. Previous Audit Verification Matrix (from v2)

| Previous Finding (v2) | Status | Evidence in Current Codebase |
| :--- | :--- | :--- |
| **Lookahead Bias in OHLCV Cache** | **Fixed Correctly** | Point-in-time constraints enforced in `ohlcv_cache_service.py`. |
| **Contaminated Purged CV** | **Fixed Correctly** | `ml_service.py` implements `PurgedKFoldCV` correctly. |
| **Triple Barrier Lookahead Leak** | **Fixed Correctly** | `labeling_service.py` accurately labels without peeking. |
| **HRP Linkage Fallacy** | **Fixed Correctly** | `portfolio_construction_service.py` utilizes Ward linkage and Ledoit-Wolf shrinkage. |
| **Flawed Statistical Tests (Sharpe & SPA)** | **Fixed Correctly** | `statistical_testing_service.py` implements Block Bootstrapping with `periods_per_year`. |
| **Ad-hoc Probability Mixing** | **Fixed Correctly** | `momentum_service.py` uses 200-DMA regime scoring properly. |
| **Synthetic Data Injection** | **Fixed Correctly** | `nse_data_service.py` now enforces strict UTC without synthetic imputation. |
| **Unadjusted Corporate Actions** | **Partially Fixed** | Detects jumps > 30% but only prints a warning in `quant_service.py:51`. |

---

## 11. Overall Confidence

**Confidence Score: 98% (Verified)**  
*Assumptions:* The audit assumes the deployment environment runs PostgreSQL (as stated in Docker Compose) and that Celery workers are correctly configured to scale. Findings rely on static code analysis and cross-verification of mathematical implementations against accepted quantitative finance literature (Advances in Financial Machine Learning by Marcos López de Prado).
