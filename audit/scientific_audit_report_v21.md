# QEPS Institutional Scientific Audit Report
## Continuous Adversarial Code-Level Verification — Cycle 21
**Audit Date:** 2026-08-21 | **Auditor Role:** Independent Institutional Quantitative Researcher

---

## Phase 0: Audit Persistence Ledger (The Kill List Re-Verification)

| Prior Issue | File & Line | Status | Evidence Quote (Current Code) |
|:---|:---|:---|:---|
| Close-to-Close execution in strategies A-C, E-F | `quant_service.py:L206` | **UNRESOLVED** | `entry = e_day['Close']` (Still present in strategies A, B, C, E, F) |
| Acknowledged survivorship bias in Universe | `universe_service.py:L32` | **UNRESOLVED** | `As per user decision, this accepts survivorship bias...` |
| Fabricated backtest statistics in AI fallback | `ai_analyst_service.py:L368` | **UNRESOLVED** | `\| **Post-Earnings Drift (PEAD)**\| **64.2%** \| 14 Trades \|...` |
| `CalibratedClassifierCV` falls back to `KFold(3)` | `ml_service.py:L234` | **UNRESOLVED** | `if len(splits) < 3: splits = 3` |
| White's Reality Check constant 0.02%/day | `hypothesis_service.py` | **COSMETICALLY PATCHED** | The benchmark test was completely removed from the code rather than fixed. |
| Standard `KFold` in weight learning | `weight_learning_service.py:L48` | **COSMETICALLY PATCHED** | Changed to `TimeSeriesSplit`, which avoids standard lookahead but fails to apply an embargo period for multi-day returns. |
| `min_periods=1` on 200-day SMA | `backtest_service.py:L136` | **UNRESOLVED** | `df['SMA200'] = df['Close'].rolling(200, min_periods=1).mean()` |
| Kill switch uses average return instead of MDD | `risk_engine.py:L46` | **UNRESOLVED** | `avg_return = np.mean(returns) * 100.0 ... if avg_return < dynamic_threshold:` |

*Standing Item: Point-in-Time Fundamental Data*
**RESOLVED:** `backtest_service.py:L65` now correctly uses `pd.merge_asof(..., direction='backward')` to align fundamental snapshots without lookahead bias.

**ENFORCEMENT CAP TRIGGERED:** Because multiple Critical vulnerabilities from the prior round remain UNRESOLVED (notably the Close-to-Close execution and fabricated AI statistics), the **Overall Scientific Score for this round is hard-capped at 20/100**.

---

## Phase 1 & 2: Subsystem Verification & Interrogation

### Brutal Specific Questions for Engineering
1. **Unresolved Fabricated AI Stats:** In `ai_analyst_service.py:L368`, the fallback report still hardcodes "64.2% PEAD win rate". This was a CRITICAL finding in round 20. Why is fabricated performance data still being presented to users?
2. **Close-to-Close Execution Ignored:** In `quant_service.py:L206`, Strategy A still enters at `e_day['Close']` on the earnings day. It is practically impossible to execute on the closing auction of the most volatile day of the quarter after knowing the gap. Why was this Critical fix ignored?
3. **Cosmetic Patching of Benchmark:** In `hypothesis_service.py`, White's Reality Check was flagged for using a flat 0.02% benchmark. Instead of replacing it with Nifty returns as directed, the entire Reality Check was deleted. Why are we removing statistical rigor instead of fixing it?
4. **Survivorship Bias Acceptance:** In `universe_service.py:L32`, the code continues to explicitly "accept survivorship bias". How can any backtest metric be trusted if delisted failures are systematically removed from history?
5. **Kill Switch Logic Flaw:** In `risk_engine.py:L46`, the kill switch uses `np.mean(returns)`. Averaging individual trade returns is not mathematically equivalent to portfolio Maximum Drawdown (MDD). Why is the kill switch evaluating average trade expectancy instead of capital preservation?

---

## Phase 3: Institutional Audit Report

### 1. Audit Delta
- **Genuinely Fixed:** `pd.merge_asof` successfully deployed in the backtest engine to fix fundamental lookahead bias.
- **Cosmetically Patched:** Weight learning uses `TimeSeriesSplit` (no embargo), and White's Reality Check was deleted.
- **Unresolved:** The majority of Critical issues from Cycle 20 remain actively exploited in the codebase.

### 2. Subsystem Verification Status
- **ML Pipeline:** Purged CV is implemented but fatally undermined by the fallback to `KFold(3)` in `ml_service.py:L234`.
- **Event Strategy Backtests:** **Fatal Flaw:** Close-to-close execution across Strategies A, B, C, E, and F inflates returns by assuming perfect execution on peak volatility bars.
- **AI Analyst Module:** **Fatal Flaw:** Still generates fabricated backtest numbers when offline.

### 3. Institutional Scoring
- **Overall Scientific Score:** **20 / 100 (HARD-CAPPED due to Unresolved Criticals)**
- **Software Architecture:** 74/100
- **Quantitative Research:** 65/100
- **Machine Learning:** 50/100 (Penalized for `KFold` fallback)
- **Statistical Methodology:** 60/100 (Penalized for removing benchmark test)
- **Data Engineering:** 60/100
- **Risk Management:** 45/100 (Kill switch implementation remains flawed)
- **Backtesting Credibility:** 40/100 (Event strategies rely on impossible execution)

### 4. The "Kill List" (Critical Vulnerabilities)
1. 🔴 **CRITICAL (REPEAT - Round 21 Unresolved)**: `quant_service.py:L206` - Close-to-Close execution in event strategies.
2. 🔴 **CRITICAL (REPEAT - Round 21 Unresolved)**: `ai_analyst_service.py:L368` - Fabricated backtest statistics in AI fallback report.
3. 🔴 **CRITICAL (REPEAT - Round 21 Unresolved)**: `universe_service.py:L32` - Acknowledged survivorship bias (seeding only active NSE symbols).
4. 🔴 **CRITICAL (REPEAT - Round 21 Unresolved)**: `ml_service.py:L234` - `CalibratedClassifierCV` falls back to standard `KFold(3)`.
5. 🟠 **HIGH (REPEAT - Round 21 Unresolved)**: `risk_engine.py:L46` - Kill switch uses average return instead of MDD.
6. 🟠 **HIGH (REPEAT - Round 21 Unresolved)**: `backtest_service.py:L136` - `min_periods=1` on 200-day SMA creates statistically meaningless indicators.

### 5. Remediation Directives
- **Direct Order 1:** Modify `quant_service.py` to use `entry = next_day['Open']` for all strategies. Stop delaying this fix.
- **Direct Order 2:** Replace the markdown block in `ai_analyst_service.py:L368` with a "No Data Available" message. Do not hallucinate numbers.
- **Direct Order 3:** In `risk_engine.py`, calculate true portfolio equity curve MDD using `np.cumprod(1 + returns)` and `np.maximum.accumulate`, instead of `np.mean(returns)`.
- **Direct Order 4:** In `ml_service.py`, when `len(splits) < 3`, skip calibration entirely rather than injecting `KFold(3)`.

### 6. Modules to Scrap
- Delete the fabricated backtest table in `ai_analyst_service.py`. It is a compliance nightmare.
