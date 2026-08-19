# Catalyst Radar — Deep Professional Audit Report

**Date:** 2026-08-18  
**Auditor:** System Architecture & Quantitative Research Audit  
**Scope:** Complete pipeline from NSE ingestion → frontend grid  
**Objective:** Determine whether this system can reliably discover important NSE events early enough for actionable trading intelligence

---

## 1. EXECUTIVE VERDICT

> [!CAUTION]
> **The Catalyst Radar is structurally incomplete. It cannot currently function as a reliable early-detection catalyst intelligence engine.**

The system has a well-designed *skeleton* — the database schema, GraphQL API, pipeline service, scoring framework, and frontend grid are all present and architecturally sound. However, **critical engineering and quantitative weaknesses** prevent it from delivering on its core promise.

### The 5 Fatal Issues

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1 | **NSE API is almost certainly being blocked** — a raw `requests.get()` to nseindia.com returns nothing or errors silently, producing `processed: 0, saved: 0` | **P0 CRITICAL** | System is blind. Zero catalysts detected. |
| 2 | **Only ONE data source** (NSE corporate announcements) — no BSE, no bulk/block deal integration into catalysts, no SAST, no insider disclosures, no earnings surprises | **P0 CRITICAL** | Massive coverage gaps. |
| 3 | **Keyword pre-filter is simultaneously too narrow AND too noisy** — events without magic keywords are silently dropped before LLM evaluation | **P1 MAJOR** | Large categories of catalysts never reach classification. |
| 4 | **Company ticker resolution requires pre-existing DB record** — if a company isn't already in the `companies` table, the catalyst is silently discarded | **P1 MAJOR** | New IPOs, small-caps, and any company not from the earnings calendar are invisible. |
| 5 | **Market reaction is calculated using daily yfinance data, not intraday** — the "Reaction" and "Vol" metrics are measuring multi-day close-to-close moves, not the actual post-catalyst price action | **P1 MAJOR** | Early score is unreliable; reactions are lagged by 1+ trading sessions. |

---

## 2. CURRENT ARCHITECTURE RECONSTRUCTION

### Complete Pipeline Trace

```
NSE Corporate Announcements API
  ↓ fetch_latest_corporate_announcements() [nse_data_service.py:210-239]
  ↓ HTTP GET https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=...&to_date=...
  ↓ Returns JSON list of announcements (symbol, desc, attchmntText, an_dt, attchmntFile)

CatalystPipelineService.run_pipeline() [catalyst_pipeline_service.py:34-190]
  ↓
  ├─ Step 1: INGEST — Loops over announcements
  ├─ Step 2: VALIDATE — Checks symbol, desc present
  ├─ Step 3: DEDUPLICATE — Same ticker + same title + same day = skip
  ├─ Step 4: NOISE FILTER — Regex ignore_filters (loss of share cert, transcripts, etc.)
  ├─ Step 5: KEYWORD FILTER — Must match keyword_filters regex in subject OR details
  ├─ Step 6: ENTITY RESOLUTION — db.query(Company).filter(ticker == symbol)
  ├─ Step 7: AI CLASSIFICATION — Gemini LLM evaluates materiality → is_material, impact_score, category, tier
  ├─ Step 8: MARKET REACTION — yfinance daily OHLCV for price reaction + relative volume
  ├─ Step 9: EARLY SCORE — _compute_early_score(impact, reaction_pct, rel_vol)
  ├─ Step 10: STATUS — EARLY (≥70) / DEVELOPING (40-69) / EXTENDED (<40)
  └─ Step 11: PERSIST — CatalystEvent + CatalystSource → PostgreSQL

GraphQL Query [queries.py:702-772]
  ↓ catalystEvents(limit, offset, tier, status, category, searchQuery)
  ↓ Returns CatalystEventType with nested CatalystSourceType

Frontend [CatalystRadar.tsx]
  ↓ Apollo CATALYST_EVENTS_QUERY with 15-second poll interval
  ↓ DataGrid with columns: TIME, TICKER, CATALYST, CATEGORY, IMPACT, EARLY, REACTION, VOL, STATUS
  ↓ CatalystDetailDrawer with Intelligence, Radar Interpretation, Detection Lag, Sources

Celery Beat Schedule [celery_app.py:56-59]
  ↓ scan_nse_catalysts_live_task runs every 900 seconds (15 minutes)
```

### Key Files

| Component | File | Lines |
|-----------|------|-------|
| Pipeline orchestrator | [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py) | 211 |
| NSE data fetcher | [nse_data_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/nse_data_service.py) | 240 |
| AI materiality classifier | [ai_analyst_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/ai_analyst_service.py#L549-L611) | 62 |
| Price reaction calculator | [quant_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/quant_service.py#L11-L61) | 51 |
| Database models | [models.py](file:///home/dhruvt/Desktop/Eps/backend/app/infrastructure/models.py#L415-L452) | 37 |
| Celery task | [tasks.py](file:///home/dhruvt/Desktop/Eps/backend/app/worker/tasks.py#L480-L496) | 16 |
| GraphQL query | [queries.py](file:///home/dhruvt/Desktop/Eps/backend/app/graphql/queries.py#L702-L772) | 70 |
| Frontend page | [CatalystRadar.tsx](file:///home/dhruvt/Desktop/Eps/frontend/src/pages/CatalystRadar.tsx) | 346 |
| Detail drawer | [CatalystDetailDrawer.tsx](file:///home/dhruvt/Desktop/Eps/frontend/src/components/catalyst/CatalystDetailDrawer.tsx) | 281 |

---

## 3. CURRENT DATA SOURCES

| Source | What It Provides | Used For Catalysts? | Status |
|--------|-----------------|---------------------|--------|
| NSE Corporate Announcements API | Board meeting outcomes, corporate filings, exchange announcements | **YES — Only source** | ⚠️ Likely blocked by NSE anti-bot |
| NSE Event Calendar API | Upcoming earnings/results dates | NO — Used for EPS page only | Working |
| NSE Bhavcopy CSV | EOD delivery %, close, volume | NO — Used for momentum only | Working |
| NSE Bulk/Block Deal API | Large institutional trades | **NO — Ingested but NOT used as catalyst signals** | Working |
| NSE ASM/GSM Watchlist API | Surveillance restrictions | NO — Used for momentum exclusion | Working |
| Yahoo Finance (yfinance) | Historical OHLCV, fundamentals | YES — For reaction/volume calc | Working but daily-only |
| Gemini LLM (Flash) | AI materiality classification | YES — For is_material decision | Requires API key |
| BSE | Corporate announcements, filings | **NOT USED** | Missing |
| SAST/Insider Disclosures | Promoter/insider transactions | **NOT USED** | Missing |
| Credit Rating Agencies | Rating changes | **NOT USED** | Missing |
| SEBI EDIFAR/SCORES | Regulatory actions, orders | **NOT USED** | Missing |

---

## 4. CURRENT DETECTION PIPELINE — DETAILED ANALYSIS

### 4.1 Ingestion ([nse_data_service.py:210-239](file:///home/dhruvt/Desktop/Eps/backend/app/services/nse_data_service.py#L210-L239))

**What happens:**
```python
session.get("https://www.nseindia.com", timeout=10)  # Cookie grab
url = f"https://www.nseindia.com/api/corporate-announcements?index=equities&from_date={from_dt}&to_date={to_dt}"
resp = session.get(url, timeout=10)
```

**Problems identified:**

1. **NSE Rate Limiting / Anti-Bot:** NSE aggressively blocks automated requests. The cookie-grab technique works sporadically but fails frequently. When it fails, `resp.status_code != 200` or the connection times out, and the function returns `[]` silently. This is the **primary reason** for `processed: 0`.

2. **3-Day Rolling Window:** The query uses `from_date = today - 2 days`. This means:
   - Weekend announcements ARE covered (Friday-to-Monday window)
   - But if the system is down for >3 days, announcements are permanently lost
   - There's no cursor or checkpoint mechanism

3. **No Pagination:** The NSE API may paginate results. The code fetches whatever comes back without checking for pagination tokens. On busy days (quarterly results season), hundreds of announcements may be truncated.

4. **Silent Failure:** All errors are caught and logged, then `return []`. The caller (`run_pipeline`) sees an empty list and reports "success" with 0 processed. **There is no distinction between "NSE is down" and "no announcements exist."**

### 4.2 Pre-Filtering ([catalyst_pipeline_service.py:23-32](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L23-L32))

**Keyword whitelist (must match one):**
```
order|contract|award|acquisition|merger|resign|fda|usfda|approval|default|fraud|scam|
warning|guidance|downgrade|upgrade|stake|buyback|dividend|bonus|split|qip|allotment|
capex|capacity|commissioning|launch|joint venture|partnership|litigation|sebi|rbi
```

**Noise blacklist (instantly rejected):**
```
loss of share certificate|closure of trading|newspaper publication|schedule of analyst|
investor presentation|secretarial compliance|transcript|audio recording
```

**Critical problems:**

| Missing Keyword | What It Misses |
|-----------------|----------------|
| `fundrais` / `raising` | Fundraising announcements, rights issues |
| `demerger` / `amalgamation` | Major corporate restructuring |
| `write-off` / `impairment` | Large financial hits |
| `profit` / `loss` / `result` | Quarterly results announcements |
| `credit rating` / `crisil` / `icra` | Rating changes |
| `promoter` (standalone) | Promoter pledge changes, encumbrance |
| `pledge` | Promoter share pledging events |
| `insolvency` / `nclt` / `bankruptcy` | NCLT/IBC proceedings |
| `suspension` / `delisting` | Trading suspensions |
| `rights` | Rights issue announcements |
| `open offer` | Mandatory open offers |
| `restructuring` | Debt/business restructuring |
| `divestiture` / `disinvestment` | Asset sales, government disinvestment |

> [!WARNING]
> The keyword filter rejects announcements BEFORE they reach the LLM. A ₹5,000 Cr fundraising announcement that says "Board approves fund raising" won't match because "fund raising" (two words) doesn't match `fundrais`. The LLM never even sees it.

### 4.3 Entity Resolution ([catalyst_pipeline_service.py:114-118](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L114-L118))

```python
company = self.db.query(Company).filter(Company.ticker == symbol).first()
if not company:
    metrics["symbol_unresolved"] += 1
    continue
```

**Critical flaw:** The `companies` table is populated ONLY by `sync_nse_calendar_task`, which adds companies from the NSE upcoming earnings calendar. This means:

- Companies that have NOT recently filed results → **NOT IN DB → catalyst silently dropped**
- New IPOs → **NOT IN DB**
- Companies that changed tickers → **NOT IN DB under new ticker**
- The entire NSE-listed universe is ~2,200 companies; the companies table likely has far fewer

This is a **massive coverage hole**. The system should auto-create company records for any valid NSE symbol encountered in announcements.

### 4.4 AI Classification ([ai_analyst_service.py:549-611](file:///home/dhruvt/Desktop/Eps/backend/app/services/ai_analyst_service.py#L549-L611))

**Good aspects:**
- The LLM prompt is well-structured with relative materiality mandate
- It explicitly asks the LLM to compare values against market cap/revenue
- Temperature is 0.0 (deterministic)
- Fallback classification exists for offline mode

**Problems:**
- **Fallback is crude:** Without Gemini, only 3 keyword patterns are checked (order/contract, resign/fraud, acquire/merger). Everything else returns `is_material: False` with impact_score 10.
- **No structured parsing validation:** If the LLM returns malformed JSON, the entire announcement is dropped
- **Single-call latency:** Each announcement requires a separate Gemini API call with 20s timeout. On a batch of 100 announcements, this takes up to 33 minutes sequentially.
- **No category standardization:** The LLM can return any string for `category` and `event_type`. The frontend filters expect specific values.

### 4.5 Market Reaction ([quant_service.py:11-61](file:///home/dhruvt/Desktop/Eps/backend/app/services/quant_service.py#L11-L61))

```python
df = yf.download(yf_ticker, period="1mo", progress=False)
# ... daily bars only
before_df = df[df.index.date < pub_date]
baseline_close = float(before_df.iloc[-1]['Close'])
current_price = float(df.iloc[-1]['Close'])
pct_change = ((current_price - baseline_close) / baseline_close) * 100
```

**Critical problems:**

1. **Daily resolution only:** Cannot measure 5-minute, 15-minute, or hourly reactions. A catalyst at 10:00 AM is measured against the PREVIOUS DAY close, not the price at 09:59 AM.

2. **No intraday volume:** Relative volume is calculated as average daily volume, not time-of-day-adjusted cumulative volume.

3. **yfinance rate limiting:** Each catalyst event triggers a separate `yf.download()` call. On a batch of 50 catalysts, this hammers Yahoo Finance and may get rate-limited.

4. **Timezone confusion:** `published_at` may be IST (from NSE), but the code compares it against UTC-based yfinance dates without explicit timezone handling.

5. **Stale baseline:** If a catalyst happened 3 days ago, `current_price` is today's close. The "reaction" includes 3 days of unrelated market movement, not just the catalyst-driven move.

### 4.6 Early Score ([catalyst_pipeline_service.py:192-210](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L192-L210))

```python
base = impact
price_penalty = min(abs(reaction_pct) * 5, 50)    # 5% move → 25 point penalty, capped at 50
vol_penalty = min(max(rel_vol - 1, 0) * 10, 40)   # 2x vol → 10 point penalty, capped at 40
score = base - price_penalty - vol_penalty
```

**Analysis:**

| Scenario | Impact | Reaction | Vol | Early Score | Correct? |
|----------|--------|----------|-----|-------------|----------|
| S-TIER event, no reaction yet | 95 | 0.0% | 1.0x | **95** | ✅ Excellent |
| S-TIER event, 2% move, 3x vol | 95 | 2.0% | 3.0x | **65** (DEVELOPING) | ⚠️ Debatable — 2% move may still be early for an S-tier event |
| B-TIER event, 5% move, 5x vol | 60 | 5.0% | 5.0x | **-15 → 0** (EXTENDED) | ✅ Reasonable |
| A-TIER event, 0.5% move, 1.2x vol | 80 | 0.5% | 1.2x | **75.5** (EARLY) | ✅ Good |

**Weaknesses:**
- Linear penalties are naive. A 5% move on a micro-cap is different from a 5% move on HDFC Bank.
- No time-since-event factor. An event from 3 days ago with 2% cumulative drift is NOT the same as an event from 2 hours ago with 2% immediate spike.
- Volume penalty starts at 1.0x. A relative volume of 0.3x (dead volume) should also be informative — it may mean the market hasn't noticed yet.

---

## 5. CURRENT CATALYST TAXONOMY

Currently, the system relies entirely on the LLM to assign categories. The [fallback categories](file:///home/dhruvt/Desktop/Eps/backend/app/services/ai_analyst_service.py#L601-L611) are:

| Keyword Match | Category | Event Type |
|--------------|----------|------------|
| order / contract | ORDERS | ORDER |
| resign / fraud / cfo | GOVERNANCE | MANAGEMENT_CHANGE |
| acquire / merger | CORPORATE | M&A |
| Everything else | NOISE | ROUTINE |

The LLM prompt suggests these categories: `LARGE_ORDERS`, `CORPORATE_ACTION`, `FUNDRAISING`, `PROMOTER`, `GOVERNANCE`, `REGULATORY`, `RESULTS_GUIDANCE`, `NOISE`.

**Missing from taxonomy:**
- INSIDER_TRANSACTION (promoter buying/selling)
- OWNERSHIP_CHANGE (stake changes, SAST disclosures)
- CREDIT_RATING (upgrades/downgrades)
- DEBT_RESTRUCTURING
- LEGAL_REGULATORY (SEBI orders, court rulings)
- SECTOR_POLICY (government policy changes)
- CAPACITY_EXPANSION
- PRODUCT_LAUNCH
- DEMERGER / RESTRUCTURING
- BUYBACK / OPEN_OFFER
- DELISTING / SUSPENSION

---

## 6. CRITICAL WEAKNESSES — ROOT CAUSE ANALYSIS

### 6.1 Why `processed: 0, saved: 0`

The root cause is almost certainly **(A) + (C) + (D)** from the user's diagnostic list:

**Evidence chain:**

1. `fetch_latest_corporate_announcements()` calls `session.get("https://www.nseindia.com")` to grab cookies, then hits the API endpoint.
2. NSE's anti-bot protection frequently returns 403, 429, or connection errors for headless requests from Docker containers / cloud servers.
3. All errors are caught silently at [nse_data_service.py:237-239](file:///home/dhruvt/Desktop/Eps/backend/app/services/nse_data_service.py#L237-L239) and return `[]`.
4. Pipeline receives empty list → reports success with 0 processed.
5. Even if some announcements get through, the entity resolution step requires the company to exist in the `companies` table, which is populated only from the earnings calendar — **not from the full NSE listed universe**.

### 6.2 False Negative Cascade

```
100 NSE announcements published today
  ↓ NSE blocks request → 0 received
  OR
  ↓ 100 received
      ↓ 15 missing symbol/desc → 85 remain
      ↓ 10 duplicates → 75 remain
      ↓ 8 noise-filtered → 67 remain
      ↓ 30 fail keyword filter → 37 remain    ← MASSIVE LOSS
      ↓ 12 unknown symbols (not in companies table) → 25 remain  ← MASSIVE LOSS
      ↓ 10 AI rejects as non-material → 15 remain
      ↓ 15 saved as catalyst events
```

**The two biggest filters are the keyword gate and the entity resolution gate.** Together, they can eliminate 50-70% of announcements before the LLM even sees them.

---

## 7. WHY IMPORTANT EVENTS MAY BE MISSING

### Verified Failure Modes

| Failure Mode | Evidence | Severity |
|-------------|----------|----------|
| NSE API blocks automated requests | Docker container IP, no browser fingerprinting, basic User-Agent | P0 |
| Keyword filter rejects valid catalysts | "Board approves fund raising" → no keyword match | P1 |
| Company not in DB | Only earnings-calendar companies are pre-loaded | P1 |
| BSE announcements not monitored | No BSE API integration | P1 |
| Bulk/block deals not treated as catalysts | `sync_bulk_block_deals()` exists but never feeds into catalyst pipeline | P1 |
| Insider/promoter transactions not monitored | No SAST/insider disclosure feed | P2 |
| Credit rating changes not monitored | No CRISIL/ICRA/CARE integration | P2 |
| Weekend/holiday gap | 3-day window, no backfill mechanism | P2 |

---

## 8. EARLY DETECTION AUDIT

### Current Definition of "Early"

`Early Score = Impact - (|Reaction%| × 5, cap 50) - (max(RelVol - 1, 0) × 10, cap 40)`

### What "Early" SHOULD Mean

From a trading perspective, "early" requires measuring the gap between:

```
T₀ = Event becomes publicly available (NSE broadcast timestamp)
T₁ = System detects event (our detected_at timestamp)
T₂ = First abnormal price movement begins
T₃ = First abnormal volume spike
T₄ = Current time
```

**The ideal Early Score should answer:** *"What fraction of the total expected repricing has already occurred?"*

### Proposed Early Score Framework

```
Information Edge = f(T₁ - T₀)          # How fast did we detect it?
Market Absorption = f(|Reaction%|)       # How much has the stock moved?
Volume Confirmation = f(RelativeVol)     # Has volume confirmed awareness?
Time Decay = f(T₄ - T₀)                # How long since the event?
Materiality Weight = f(ImpactScore)      # How important is the event?

Early Score = Materiality × (1 - Market Absorption) × (1 - Time Decay Factor)
```

Where:
- `Market Absorption` = min(1, |reaction%| / expected_typical_move_for_this_event_type)
- `Time Decay Factor` = min(1, hours_since_event / 48) — catalysts older than 2 trading days are stale
- This produces a score that genuinely decays as the market absorbs the information

### Current Weaknesses

1. **No time decay:** A catalyst from 5 days ago with 0% reaction has the same Early Score as a catalyst from 5 minutes ago with 0% reaction. The 5-day-old one is NOT early — the market may have simply decided it's irrelevant.

2. **No calibration by event type:** A 2% move after a CEO resignation is different from a 2% move after a routine order win. The expected reaction magnitude varies enormously by category.

3. **Using daily-resolution data:** Cannot distinguish "the stock moved before we detected the catalyst" from "the stock moved after."

---

## 9. REACTION METRIC AUDIT

### Current Implementation

```python
# quant_service.py:11-61
df = yf.download(yf_ticker, period="1mo", progress=False)  # DAILY bars
before_df = df[df.index.date < pub_date]                    # Sessions before publication date
after_df = df[df.index.date >= pub_date]                    # Sessions on/after publication date
baseline_close = float(before_df.iloc[-1]['Close'])         # Last close before event
current_price = float(df.iloc[-1]['Close'])                  # Most recent close
pct_change = ((current_price - baseline_close) / baseline_close) * 100
```

### What This Actually Measures

**"Cumulative return from the closing price before the catalyst date to the most recent daily close."**

This is NOT a reaction metric. It is a **multi-day drift measurement** that conflates:
- Catalyst-driven movement
- General market movement
- Sector rotation
- Random noise accumulation over multiple days

### What We Need

| Metric | Definition | Purpose |
|--------|-----------|---------|
| **Gap Reaction** | (Open on catalyst day - Previous Close) / Previous Close | Measures overnight information incorporation |
| **Intraday Reaction** | (Close on catalyst day - Open on catalyst day) / Open | Measures same-day reaction |
| **Session Reaction** | (Close on catalyst day - Previous Close) / Previous Close | Full first-session impact |
| **5-Minute Reaction** | Price change in first 5 minutes after catalyst timestamp | True early reaction (requires intraday data) |
| **Abnormal Return** | Stock return - Beta × Market return | Market-adjusted catalyst impact |

### Recommendation

Store multiple reaction horizons in the `CatalystEvent` table:
- `gap_reaction_pct` — overnight gap
- `session_reaction_pct` — first trading session
- `reaction_1d`, `reaction_3d`, `reaction_5d` — multi-day reactions
- `abnormal_return_1d` — market-adjusted

---

## 10. VOLUME METRIC AUDIT

### Current Implementation

```python
avg_vol_before = before_df['Volume'].tail(20).mean()  # 20-day avg volume BEFORE catalyst
current_vol = float(after_df['Volume'].mean())         # Average daily volume AFTER catalyst
relative_vol = current_vol / avg_vol_before
```

### What This Actually Measures

**"Average daily volume after the catalyst divided by 20-day average daily volume before the catalyst."**

### Problems

1. **No time-of-day adjustment:** 1.5x at 9:20 AM (30 minutes into session) is radically different from 1.5x at 3:25 PM (near close). The former means volume is already 1.5× the FULL DAY average after just 30 minutes — implying the day will likely finish at 8-10x.

2. **Multi-day averaging:** If the catalyst was 3 days ago, `after_df['Volume'].mean()` averages across 3 days, diluting the initial volume spike.

3. **No absolute volume context:** 6.7x relative volume on a stock that trades ₹50 Lakhs/day is meaningless compared to 2.0x on a stock that trades ₹500 Cr/day.

### Recommended Methodology

```
Intraday Relative Volume (RVOL) = 
  (Cumulative volume from open to current minute) / 
  (Average cumulative volume at this same minute over past 20 sessions)
```

For daily-only data:
```
Daily RVOL = Today's volume / 20-day average daily volume
Session RVOL = First-session volume / 20-day average daily volume (if catalyst is today)
```

---

## 11. IMPACT SCORE AUDIT

### Current Implementation

The impact score is entirely LLM-determined (0-100 scale). The prompt asks for relative materiality comparison against market cap/revenue.

### Strengths
- Relative materiality mandate is correct
- Temperature 0.0 ensures consistency
- Tier mapping is logical (S ≥ 90, A ≥ 75, B ≥ 50)

### Weaknesses
- **No verification:** If the LLM hallucinates a score of 95 for a routine filing, there's no guardrail
- **No historical calibration:** We don't validate that "impact 90 events" actually produce bigger moves than "impact 50 events"
- **Fallback is binary:** Without Gemini, orders = 75, governance = 85, M&A = 90, everything else = 10. This misclassifies many important events.

---

## 12. MISSING CATALYST CATEGORIES

### Categories we detect (via LLM + keyword filter):

- ✅ Orders / Contracts
- ✅ M&A / Acquisitions
- ✅ Management resignations
- ✅ FDA/USFDA approvals
- ✅ Buybacks, Dividends, Splits
- ✅ QIP / Allotment
- ✅ SEBI / RBI actions
- ✅ Joint Ventures

### Categories we CANNOT detect (keyword filter blocks or no source):

- ❌ **Quarterly results / Earnings surprises** — "financial results" doesn't match any keyword
- ❌ **Credit rating changes** — no source, no keyword
- ❌ **Promoter buying/selling** — SAST disclosures not monitored
- ❌ **Insider transactions** — not monitored
- ❌ **Bulk/Block deals as catalysts** — data is ingested but NOT fed into catalyst pipeline
- ❌ **Demergers / Amalgamations** — keyword "demerger" missing
- ❌ **Debt restructuring** — keyword "restructuring" missing
- ❌ **Government policy changes** — no source
- ❌ **Rights issues** — keyword "rights" missing
- ❌ **Open offers** — keyword "open offer" missing
- ❌ **Profit warnings** — no keyword for standalone warnings
- ❌ **Large impairments/write-offs** — no keyword
- ❌ **Delisting / Suspension** — no keyword

---

## 13. MISSING DATA SOURCES

| Source | What It Detects | Latency | Importance | API Available? | Implementation Complexity |
|--------|---------------|---------|------------|----------------|--------------------------|
| **BSE Corporate Announcements** | Same as NSE but often published earlier | Minutes ahead of NSE in some cases | **CRITICAL** | Yes — `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w` | Medium |
| **NSE SAST / Insider Disclosures** | Promoter/insider buy/sell transactions | Same day (T+2 legally) | **HIGH** | Yes — NSE insider trading page | Medium |
| **Bulk/Block Deals (as catalyst signals)** | Large institutional position changes | Same day | **HIGH** | Already ingested — just not used as catalyst trigger | Low — wire existing data |
| **Credit Rating Agencies** (CRISIL, ICRA, CARE, India Ratings) | Rating upgrades/downgrades | Same day of action | **HIGH** | Scraped from agency websites | Medium |
| **NSE Corporate Actions** | Bonus, split, rights, dividend dates | Pre-announced | **MEDIUM** | Yes — NSE corporate actions API | Low |
| **SEBI SCORES** | Regulatory complaints, orders | Days to weeks | **MEDIUM** | Yes — SEBI website | Medium |
| **Ministry/Government sources** | Policy changes, tenders, approvals | Variable | **MEDIUM** | Department-specific | High |
| **Company Investor Relations pages** | Press releases, investor updates | Same day | **LOW-MEDIUM** | Scraped per company | Very High (not scalable) |

---

## 14. PRE-MARKET DETECTION STRATEGY

### Current State: None

There is no dedicated pre-market scan. The Celery task runs every 15 minutes regardless of market session.

### Recommended Architecture

```
05:00 AM IST — Overnight Filing Sweep
  ├─ Fetch all NSE/BSE announcements from previous close to now
  ├─ Fetch any bulk/block deal disclosures from previous session
  ├─ Fetch any promoter/insider transaction filings
  ├─ Classify and score all overnight catalysts
  └─ Generate "Pre-Market Catalyst Briefing" ranked list

08:30 AM IST — Pre-Open Priority Ranking
  ├─ Rank overnight catalysts by materiality × information novelty
  ├─ Flag stocks with S-TIER or A-TIER catalysts
  ├─ Check if any are in F&O (for derivative-level volume confirmation)
  └─ Output: "Top 10 Pre-Market Catalyst Stocks"

09:15 AM IST — Market Open Monitoring
  ├─ Compare opening price against previous close for catalyst stocks
  ├─ Calculate gap reactions
  ├─ Begin intraday RVOL tracking
  └─ Update Early Scores with real-time absorption data
```

---

## 15. PRE-CATALYST DETECTION STRATEGY

### Concept: Detect unusual activity BEFORE the headline

This requires monitoring:

1. **Unusual volume without news** — if a stock trades 3x normal volume with no catalyst, something may be coming
2. **Abnormal promoter transactions** — a series of promoter buys before a positive announcement
3. **Bulk deal clustering** — multiple bulk deals in the same stock within a week
4. **Filing pattern analysis** — a company that suddenly files multiple board meeting notices

### Implementation Path

The system already ingests bulk/block deals. To enable pre-catalyst detection:

1. Create a daily scan that flags stocks with `volume > 2x AND no existing catalyst_event in past 3 days`
2. Create an alert when `bulk_block_deals` shows multiple entries for the same ticker within 5 days
3. Label these as `PRE-CATALYST SIGNAL` (not confirmed catalyst)

---

## 16. HISTORICAL LEARNING / ANALOG ENGINE

### Current State: None

The system has an `EventStudyService` that calculates post-event returns, but this is used for EARNINGS events only, not for catalyst events.

### Recommended Architecture

```sql
CREATE TABLE catalyst_event_outcomes (
  event_id UUID REFERENCES catalyst_events(id),
  reaction_5m FLOAT,
  reaction_15m FLOAT,
  reaction_1h FLOAT,
  reaction_1d FLOAT,
  reaction_3d FLOAT,
  reaction_5d FLOAT,
  reaction_10d FLOAT,
  abnormal_return_1d FLOAT,
  abnormal_return_5d FLOAT,
  max_favorable_excursion FLOAT,
  max_adverse_excursion FLOAT,
  volume_expansion_day1 FLOAT,
  resolved_at TIMESTAMP
);
```

This enables queries like:
- "When a company announces an order > 10% of revenue, what is the median 5-day return?"
- "When a CEO resigns, what is the typical max drawdown within 10 days?"
- "What is the false positive rate for B-TIER events?"

---

## 17. FALSE POSITIVE / DEDUPLICATION STRATEGY

### Current Deduplication

```python
existing = self.db.query(CatalystEvent).filter(
    CatalystEvent.ticker == symbol,
    CatalystEvent.event_title == subject,
    CatalystEvent.created_at >= today_start
).first()
```

This is a **title-exact-match, same-day** dedup. It misses:

- **Rephrased duplicates:** "Board approves acquisition of XYZ" vs "Company to acquire XYZ Ltd"
- **Multi-filing events:** An acquisition generates 5-10 filings (board resolution, shareholder notice, SEBI filing, etc.) — all should map to ONE catalyst episode
- **Cross-day duplicates:** An announcement on Friday evening + Monday morning mention

### Recommended Approach

1. **Fuzzy deduplication:** Use text similarity (e.g., Jaccard similarity > 0.6 on tokenized title) within a 7-day window for the same ticker
2. **Catalyst Episode Grouping:** Group related filings into a single "Catalyst Episode" with multiple source attachments
3. **Same-event detection:** If two announcements for the same ticker within 48 hours have overlapping categories and similar subject matter, merge them

---

## 18. STOCK/TICKER MAPPING AUDIT

### Current Implementation

```python
company = self.db.query(Company).filter(Company.ticker == symbol).first()
```

### Problems

1. **No auto-creation:** If symbol is valid NSE ticker but not in DB, catalyst is dropped
2. **No ticker normalization:** NSE may return "M&M" but DB may have "M_M" or "MM"
3. **No historical symbol tracking:** After a merger/name change, old announcements may use old symbols
4. **No suffix handling:** Some queries may include ".NS" or ".BO" suffixes inconsistently

### Recommendation

On entity resolution failure:
1. Try with `.NS` suffix stripped
2. Try fuzzy match against known company names in the announcement
3. **Auto-create a minimal Company record** with `sector = "NSE_AUTO"` for any valid NSE symbol
4. Maintain a ticker alias table for historical symbols

---

## 19. MARKET-HOURS INTELLIGENCE

### Current State: None

The Celery beat schedule runs every 15 minutes, 24/7, regardless of market session.

### Recommended Session-Aware Schedule

| Window | IST Time | Scan Frequency | Priority |
|--------|----------|---------------|----------|
| Pre-Market | 05:00 - 09:15 | Every 5 min | **HIGH** — Overnight filings, pre-open catalysts |
| Market Open | 09:15 - 09:30 | Every 2 min | **CRITICAL** — Opening reactions |
| Morning Session | 09:30 - 12:00 | Every 10 min | HIGH |
| Midday | 12:00 - 14:00 | Every 15 min | MEDIUM |
| Afternoon | 14:00 - 15:30 | Every 10 min | HIGH |
| Post-Market | 15:30 - 18:00 | Every 15 min | HIGH — After-hours filings |
| Evening | 18:00 - 22:00 | Every 30 min | MEDIUM |
| Night | 22:00 - 05:00 | Every 60 min | LOW |
| Weekend | All day | Every 2 hours | LOW |

---

## 20. DETAIL/INSPECT VIEW IMPROVEMENTS

### Currently Missing From Drawer

| Field | Available in DB? | Importance |
|-------|-----------------|------------|
| Company Name | ✅ Yes | Shown |
| Market Cap | ✅ In Company table | **Not shown** |
| Sector | ✅ In Company table | **Not shown** |
| Pre-event price | ❌ Not stored | **Missing — should be stored** |
| Intraday chart | ❌ No intraday data | **Missing** |
| Historical analogs | ❌ No analog engine | **Missing** |
| Sector movement | ❌ Not calculated | **Missing** |
| Market (Nifty) movement | ❌ Not calculated | **Missing** |
| Multiple reaction horizons | ❌ Only one reaction% | **Missing** |
| Abnormal return | ❌ Not calculated | **Missing** |
| Source document preview | ❌ Only URL link | **Nice to have** |

---

## 21. DETECTOR OBSERVABILITY

### Current State

The pipeline returns a metrics dict:
```python
metrics = {
    "raw_fetched": 0,
    "missing_fields": 0,
    "duplicates": 0,
    "ignore_filtered": 0,
    "keyword_failed": 0,
    "symbol_unresolved": 0,
    "ai_rejected": 0,
    "saved": 0,
    "execution_time_ms": 0
}
```

### What's Missing

- **Source health:** Was the NSE API reachable? HTTP status code? Response size?
- **Historical comparison:** "We normally get 80 announcements per day; today we got 0 — ALERT"
- **Latency tracking:** How long after NSE publishes an announcement do we detect it?
- **AI service health:** Is Gemini API responding? Error rate?
- **Pipeline run history:** Stored only in Celery task results, not in a dedicated table
- **Alerting:** No mechanism to notify when `raw_fetched = 0` for multiple consecutive runs

### Recommendation

Create a `PipelineRunLog` table:
```sql
CREATE TABLE catalyst_pipeline_runs (
  id UUID PRIMARY KEY,
  run_at TIMESTAMP,
  source_status VARCHAR,  -- 'SUCCESS', 'API_ERROR', 'TIMEOUT', 'RATE_LIMITED'
  http_status_code INT,
  raw_fetched INT,
  keyword_filtered INT,
  symbol_unresolved INT,
  ai_rejected INT,
  saved INT,
  execution_time_ms INT,
  error_message TEXT
);
```

---

## 22. BACKTESTING FRAMEWORK

### Current State

The system has a sophisticated `IntensiveBacktestEngine` and `EventStudyService`, but these are designed for **earnings events**, not catalyst events. There is no backtesting framework for catalyst detection.

### Recommended Catalyst Backtest Framework

```
For each historical CatalystEvent:
  T₀ = published_at (or detected_at if published_at is NULL)
  
  Fetch OHLCV for ticker from T₀-1d to T₀+10d
  
  Measure:
    gap_reaction = (Open[T₀] - Close[T₀-1]) / Close[T₀-1]
    session_return = (Close[T₀] - Close[T₀-1]) / Close[T₀-1]
    return_1d = (Close[T₀+1] - Close[T₀]) / Close[T₀]
    return_3d = (Close[T₀+3] - Close[T₀]) / Close[T₀]
    return_5d = (Close[T₀+5] - Close[T₀]) / Close[T₀]
    max_favorable = max(High[T₀:T₀+5]) relative to Close[T₀-1]
    max_adverse = min(Low[T₀:T₀+5]) relative to Close[T₀-1]
    volume_day1 = Volume[T₀] / avg(Volume[T₀-20:T₀-1])

  Group by:
    - category (ORDERS, GOVERNANCE, CORPORATE, etc.)
    - tier (S, A, B, C)
    - early_score bucket ([0-30], [30-60], [60-80], [80-100])
    - market cap quartile

  Compute:
    - hit rate (% positive 5d return)
    - median return
    - average return
    - precision (fraction of predicted-material events that actually moved)
    - recall (fraction of large-move events that we detected)
```

---

## 23. RECOMMENDED SCORING MODEL

### Transparent Composite Catalyst Score

```
CATALYST SCORE = 
  Materiality Component (0-40)
  + Novelty Component (0-20)
  + Early Detection Bonus (0-20)
  + Volume Confirmation (0-10)
  + Historical Analog Factor (0-10)

Where:
  Materiality = AI Impact Score × 0.4
  Novelty = 20 if first filing for this topic, 10 if related filing exists, 0 if duplicate
  Early Detection = 20 × max(0, 1 - hours_since_event / 48)
  Volume Confirmation = 10 × min(1, relative_volume / 3)  
  Historical Analog = 10 × P(positive 5d return | event_type, tier)
```

Every component is explainable and auditable.

---

## 24. RECOMMENDED CATALYST LIFECYCLE

```
DETECTED → CONFIRMED → EARLY → DEVELOPING → CONFIRMED_MOVE → EXTENDED → EXHAUSTED

DETECTED: Just ingested, not yet classified
CONFIRMED: AI classified as material (impact ≥ 50)
EARLY: < 2 hours old AND |reaction| < 2% AND volume < 2x
DEVELOPING: 2-24 hours old OR |reaction| 2-5% OR volume 2-5x
CONFIRMED_MOVE: |reaction| > 5% AND volume > 3x
EXTENDED: > 48 hours old OR |reaction| > 10%
EXHAUSTED: > 5 days old OR volume normalized
```

---

## 25. P0/P1/P2/P3 IMPLEMENTATION ROADMAP

### P0 — Critical Correctness Issues (Fix IMMEDIATELY)

| # | Problem | Solution | Files | Effort |
|---|---------|----------|-------|--------|
| P0.1 | NSE API silently failing, returning 0 announcements | Add robust retry with exponential backoff, session persistence, cookie rotation; log HTTP status codes; add source health monitoring | [nse_data_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/nse_data_service.py#L210-L239) | 1 day |
| P0.2 | Unknown symbols silently dropped | Auto-create Company record for any valid NSE symbol on first encounter | [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L114-L118) | 0.5 day |
| P0.3 | Pipeline reports "success" when source is unreachable | Distinguish source_status: SUCCESS vs API_ERROR vs TIMEOUT; create `PipelineRunLog` table | [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L34-L66) | 0.5 day |

### P1 — Major Detection Improvements

| # | Problem | Solution | Files | Effort |
|---|---------|----------|-------|--------|
| P1.1 | Keyword filter too narrow | Replace with expanded regex covering all 30+ material keywords identified in this audit; or remove keyword filter entirely and let LLM decide | [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L23-L26) | 0.5 day |
| P1.2 | Bulk/block deals not used as catalyst signals | Wire `sync_bulk_block_deals()` output into catalyst pipeline as a separate event type | [nse_data_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/nse_data_service.py#L137-L182), [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py) | 1 day |
| P1.3 | Only NSE source — add BSE | Add BSE corporate announcements API as second ingestion source with dedup across exchanges | [nse_data_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/nse_data_service.py) | 2 days |
| P1.4 | No time decay in Early Score | Add elapsed-time factor to early score formula; catalysts older than 48h should decay toward "EXTENDED" | [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L192-L210) | 0.5 day |
| P1.5 | Reaction measured with daily data only | Store gap%, session%, and multi-day reaction separately; use intraday data if available | [quant_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/quant_service.py#L11-L61), [models.py](file:///home/dhruvt/Desktop/Eps/backend/app/infrastructure/models.py#L415-L436) | 1 day |

### P2 — Important Enhancements

| # | Problem | Solution | Effort |
|---|---------|----------|--------|
| P2.1 | No session-aware scheduling | Implement market-hours-aware Celery schedule (faster during pre-market and open) | 1 day |
| P2.2 | No catalyst outcome tracking | Create `catalyst_event_outcomes` table; backfill with EventStudyService | 1.5 days |
| P2.3 | No pre-market catalyst briefing | Create dedicated pre-market ranking scan at 08:30 AM IST | 1 day |
| P2.4 | No fuzzy deduplication | Implement Jaccard similarity on tokenized titles within 7-day window | 1 day |
| P2.5 | No SAST / insider disclosure monitoring | Add NSE insider trading disclosure API as catalyst source | 2 days |
| P2.6 | Detail drawer missing market context | Add market cap, sector, sector movement, Nifty movement to drawer | 0.5 day |
| P2.7 | No pipeline observability dashboard | Create `PipelineRunLog` model + GraphQL query + simple UI panel | 1.5 days |
| P2.8 | Sequential LLM calls are slow | Batch announcements into groups of 5-10 per LLM call; or use async calls | 1 day |

### P3 — Nice-to-Have

| # | Problem | Solution | Effort |
|---|---------|----------|--------|
| P3.1 | No historical analog engine | Build event-type → historical return distribution lookup | 3 days |
| P3.2 | No credit rating change monitoring | Add CRISIL/ICRA scraping | 2 days |
| P3.3 | No pre-catalyst signal detection | Flag unusual volume stocks without recent catalysts | 2 days |
| P3.4 | No catalyst episode grouping | Group related filings into episodes | 2 days |
| P3.5 | No backtesting for catalyst scoring model | Build retrospective validation framework | 3 days |

---

## 26. "GOD MODE" TARGET ARCHITECTURE

```mermaid
graph TD
    subgraph "DATA SOURCES"
        NSE["NSE Corp Announcements"]
        BSE["BSE Corp Announcements"]
        SAST["SAST/Insider Disclosures"]
        BULK["Bulk/Block Deals"]
        CRAT["Credit Ratings"]
        CORP_ACT["Corporate Actions"]
        SURV["ASM/GSM Watchlists"]
    end
    
    subgraph "INGESTION LAYER"
        FETCH["Multi-Source Fetcher<br/>Retry + Rate Limit + Health Check"]
        NORM["Normalizer<br/>Field mapping, timezone, encoding"]
    end
    
    subgraph "PROCESSING LAYER"
        ENTITY["Entity Resolution<br/>Ticker mapping + Auto-create"]
        DEDUP["Deduplication Engine<br/>Exact + Fuzzy + Cross-exchange"]
        CLASS["Event Classifier<br/>LLM + Deterministic fallback"]
        NOVEL["Novelty Detector<br/>Is this genuinely new info?"]
        MATERIAL["Materiality Engine<br/>Relative size vs company"]
    end
    
    subgraph "MARKET CONTEXT LAYER"
        PRICE["Price Reaction Engine<br/>Gap + Intraday + Multi-horizon"]
        VOL["Volume Engine<br/>RVOL + Time-adjusted"]
        MKT["Market Context<br/>Nifty, Sector, Regime"]
        ANALOG["Historical Analog<br/>Similar past events"]
    end
    
    subgraph "SCORING LAYER"
        EARLY["Early Detection Score"]
        IMPACT["Materiality Score"]
        OPPORT["Opportunity Score"]
        LIFECYCLE["Lifecycle State Machine"]
    end
    
    subgraph "PERSISTENCE"
        DB[(PostgreSQL)]
        EPISODE["Episode Grouping"]
        OUTCOME["Outcome Tracking"]
        RUNLOG["Pipeline Run Logs"]
    end
    
    subgraph "API + UI"
        GQL["GraphQL API"]
        RADAR["Catalyst Radar Grid"]
        DRAWER["Detail/Inspect Drawer"]
        PREMARKET["Pre-Market Briefing"]
        OBS["Observability Dashboard"]
    end
    
    NSE --> FETCH
    BSE --> FETCH
    SAST --> FETCH
    BULK --> FETCH
    CRAT --> FETCH
    CORP_ACT --> FETCH
    SURV --> FETCH
    
    FETCH --> NORM
    NORM --> ENTITY
    ENTITY --> DEDUP
    DEDUP --> CLASS
    CLASS --> NOVEL
    NOVEL --> MATERIAL
    
    MATERIAL --> PRICE
    MATERIAL --> VOL
    MATERIAL --> MKT
    MATERIAL --> ANALOG
    
    PRICE --> EARLY
    VOL --> EARLY
    MKT --> EARLY
    ANALOG --> IMPACT
    MATERIAL --> IMPACT
    
    EARLY --> OPPORT
    IMPACT --> OPPORT
    OPPORT --> LIFECYCLE
    
    LIFECYCLE --> DB
    LIFECYCLE --> EPISODE
    DB --> OUTCOME
    FETCH --> RUNLOG
    
    DB --> GQL
    GQL --> RADAR
    GQL --> DRAWER
    GQL --> PREMARKET
    RUNLOG --> OBS
```

### Components We HAVE vs MISSING

| Component | Status | Quality |
|-----------|--------|---------|
| NSE Announcement Fetcher | ✅ Exists | ⚠️ Fragile (rate-limited) |
| BSE Fetcher | ❌ Missing | — |
| SAST/Insider Fetcher | ❌ Missing | — |
| Bulk/Block Deal Fetcher | ✅ Exists | ✅ Good (not wired to catalysts) |
| Entity Resolution | ✅ Exists | ⚠️ Too restrictive (requires pre-existing record) |
| Deduplication | ✅ Exists | ⚠️ Exact match only |
| Event Classifier (LLM) | ✅ Exists | ✅ Good prompt engineering |
| Deterministic Fallback | ✅ Exists | ⚠️ Too crude |
| Novelty Detector | ❌ Missing | — |
| Materiality Engine | ✅ Partial (LLM) | ⚠️ No quantitative validation |
| Price Reaction Engine | ✅ Exists | ⚠️ Daily-only, no multi-horizon |
| Volume Engine | ✅ Exists | ⚠️ No time-of-day adjustment |
| Market Context | ❌ Missing | — |
| Historical Analog | ❌ Missing | — |
| Early Score | ✅ Exists | ⚠️ No time decay |
| Opportunity Score | ❌ Missing | — |
| Lifecycle State Machine | ✅ Partial (3 states) | ⚠️ Should have 6-7 states |
| Episode Grouping | ❌ Missing | — |
| Outcome Tracking | ❌ Missing | — |
| Pipeline Run Logs | ❌ Missing | — |
| Database Schema | ✅ Exists | ✅ Good foundation |
| GraphQL API | ✅ Exists | ✅ Well-structured |
| Frontend Grid | ✅ Exists | ✅ Professional |
| Detail Drawer | ✅ Exists | ⚠️ Missing market context |
| Pre-Market Briefing | ❌ Missing | — |
| Observability Dashboard | ❌ Missing | — |
| Backtesting Framework | ❌ Missing for catalysts | — |

---

## 27. DATABASE CHANGES REQUIRED

```sql
-- 1. New table for pipeline observability
CREATE TABLE catalyst_pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_at TIMESTAMP DEFAULT NOW(),
    source_name VARCHAR NOT NULL DEFAULT 'NSE',
    source_status VARCHAR NOT NULL,  -- SUCCESS, API_ERROR, TIMEOUT, RATE_LIMITED
    http_status_code INT,
    raw_fetched INT DEFAULT 0,
    keyword_filtered INT DEFAULT 0,
    symbol_unresolved INT DEFAULT 0,
    ai_classified INT DEFAULT 0,
    ai_rejected INT DEFAULT 0,
    duplicates INT DEFAULT 0,
    saved INT DEFAULT 0,
    execution_time_ms INT,
    error_message TEXT
);

-- 2. New columns on catalyst_events for multi-horizon reactions
ALTER TABLE catalyst_events ADD COLUMN gap_reaction_pct FLOAT;
ALTER TABLE catalyst_events ADD COLUMN session_reaction_pct FLOAT;
ALTER TABLE catalyst_events ADD COLUMN reaction_1d FLOAT;
ALTER TABLE catalyst_events ADD COLUMN reaction_3d FLOAT;
ALTER TABLE catalyst_events ADD COLUMN reaction_5d FLOAT;
ALTER TABLE catalyst_events ADD COLUMN abnormal_return_1d FLOAT;
ALTER TABLE catalyst_events ADD COLUMN pre_event_price FLOAT;
ALTER TABLE catalyst_events ADD COLUMN sector VARCHAR;
ALTER TABLE catalyst_events ADD COLUMN market_cap_at_event FLOAT;

-- 3. New table for catalyst outcome tracking
CREATE TABLE catalyst_event_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES catalyst_events(id) ON DELETE CASCADE,
    reaction_gap FLOAT,
    reaction_session FLOAT,
    reaction_1d FLOAT,
    reaction_3d FLOAT,
    reaction_5d FLOAT,
    reaction_10d FLOAT,
    abnormal_return_1d FLOAT,
    abnormal_return_5d FLOAT,
    max_favorable_excursion FLOAT,
    max_adverse_excursion FLOAT,
    volume_expansion_day1 FLOAT,
    nifty_return_1d FLOAT,
    sector_return_1d FLOAT,
    resolved_at TIMESTAMP DEFAULT NOW()
);

-- 4. Ticker alias table
CREATE TABLE ticker_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_ticker VARCHAR NOT NULL,
    alias VARCHAR NOT NULL UNIQUE,
    valid_from DATE,
    valid_to DATE
);
```

---

## 28. API CHANGES REQUIRED

1. **New GraphQL query:** `catalystPipelineHealth` — returns latest pipeline run logs
2. **New GraphQL query:** `preMarketCatalysts` — returns overnight/pre-market catalysts ranked by priority
3. **Extend `CatalystEventType`** with: `gapReactionPct`, `sessionReactionPct`, `reaction1d`, `reaction3d`, `preEventPrice`, `marketCapAtEvent`, `sector`
4. **New mutation:** `triggerCatalystScan` — manual trigger with source parameter (NSE/BSE/ALL)

---

## 29. EXACT FILES / FUNCTIONS / WORKERS THAT NEED CHANGES

| File | Function | Change Required |
|------|----------|----------------|
| [nse_data_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/nse_data_service.py#L210-L239) | `fetch_latest_corporate_announcements()` | Add retry logic, session persistence, HTTP status logging, error categorization |
| [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L23-L26) | `keyword_filters` | Expand to cover all 30+ material keywords |
| [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L114-L118) | Entity resolution block | Auto-create Company for unknown symbols |
| [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L34-L66) | `run_pipeline()` | Return source health status, log to PipelineRunLog table |
| [catalyst_pipeline_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/catalyst_pipeline_service.py#L192-L210) | `_compute_early_score()` | Add time decay factor |
| [quant_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/quant_service.py#L11-L61) | `get_recent_price_reaction()` | Return multiple reaction horizons; separate gap from session return |
| [models.py](file:///home/dhruvt/Desktop/Eps/backend/app/infrastructure/models.py#L415-L436) | `CatalystEvent` | Add new columns (gap_reaction, session_reaction, multi-day reactions, pre_event_price) |
| [models.py](file:///home/dhruvt/Desktop/Eps/backend/app/infrastructure/models.py) | NEW | Add `CatalystPipelineRun`, `CatalystEventOutcome`, `TickerAlias` models |
| [celery_app.py](file:///home/dhruvt/Desktop/Eps/backend/app/worker/celery_app.py#L56-L59) | `beat_schedule` | Make scan frequency session-aware |
| [tasks.py](file:///home/dhruvt/Desktop/Eps/backend/app/worker/tasks.py#L480-L496) | `scan_nse_catalysts_live_task()` | Add BSE source, bulk deal catalyst integration |
| [ai_analyst_service.py](file:///home/dhruvt/Desktop/Eps/backend/app/services/ai_analyst_service.py#L601-L611) | `_fallback_catalyst_evaluation()` | Expand to cover 15+ event types instead of 3 |

---

## 30. FINAL DEFINITION: WHAT "EXCELLENT CATALYST RADAR" MEANS

An excellent Catalyst Radar for the NSE universe must satisfy ALL of the following:

1. **Coverage:** Monitors ≥95% of material corporate events across all ~2,200 NSE-listed companies
2. **Latency:** Detects events within 5 minutes of NSE/BSE publication
3. **Precision:** ≥80% of flagged S-TIER and A-TIER events produce measurable price/volume response within 5 trading days
4. **Early Detection:** ≥60% of S-TIER events are flagged BEFORE the stock has moved >2% from pre-event price
5. **No Silent Failures:** The system ALWAYS knows whether the source is healthy or broken
6. **Explainability:** Every score (Impact, Early, Reaction, Vol) has a transparent, auditable formula
7. **Historical Validation:** Scoring model is calibrated against ≥200 historical catalyst events with measured outcomes
8. **Multi-Source:** At minimum: NSE announcements + BSE announcements + Bulk/Block deals + Insider disclosures
9. **Deduplication:** Multiple filings about the same event are grouped into a single catalyst episode
10. **Market Context:** Reactions are market-adjusted (abnormal returns, not raw returns)

---

## FINAL SUMMARY

### WHAT IS WRONG TODAY

1. The NSE API is almost certainly being blocked, producing zero catalysts
2. The keyword pre-filter silently rejects important event types
3. Companies not already in the DB are invisible
4. Only one data source (NSE corporate announcements)
5. Market reaction uses daily data, not intraday
6. No time decay in Early Score
7. No pipeline health monitoring
8. Bulk/block deals are ingested but never used as catalyst signals
9. No deduplication beyond exact title match

### WHAT WE SHOULD CHANGE

1. **Fix NSE ingestion** with proper retry, session management, and error reporting (P0)
2. **Auto-create Company records** for unknown valid NSE symbols (P0)
3. **Expand keyword filter** or remove it entirely (P1)
4. **Add BSE as second source** (P1)
5. **Wire bulk/block deals** into catalyst pipeline (P1)
6. **Add time decay** to Early Score (P1)
7. **Store multiple reaction horizons** (P1)
8. **Create pipeline observability** (P2)

### WHAT WE SHOULD NOT CHANGE

1. ✅ The LLM materiality classification prompt — it's well-designed
2. ✅ The database schema foundation (CatalystEvent, CatalystSource) — it's solid
3. ✅ The GraphQL API structure — it's clean and extensible
4. ✅ The frontend grid and detail drawer — they're professional
5. ✅ The Early Score concept (Impact - Reaction penalty - Volume penalty) — just needs refinement
6. ✅ The Celery task architecture — just needs session-aware scheduling

### WHAT WILL GIVE THE BIGGEST IMPROVEMENT IN EARLY CATALYST DETECTION

**P0.1: Fix the NSE API ingestion.** Everything downstream is irrelevant if the system receives zero announcements. This single fix will take the system from "blind" to "functional."

### WHAT SHOULD BE IMPLEMENTED FIRST

```
Week 1: P0.1 (Fix NSE API) + P0.2 (Auto-create companies) + P0.3 (Source health monitoring)
Week 2: P1.1 (Expand keywords) + P1.2 (Bulk/block deal integration) + P1.4 (Time decay in Early Score)
Week 3: P1.3 (Add BSE source) + P1.5 (Multi-horizon reactions)
Week 4: P2.1 (Session-aware scheduling) + P2.2 (Outcome tracking) + P2.7 (Observability)
```

**After Week 1, the system will be functional.**
**After Week 4, the system will be competitive.**
**After P3 items, the system will be excellent.**
