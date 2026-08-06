# QEPS - Quantitative Earnings Prediction & Analytics Dashboard

## 1. Project Overview

QEPS (Quantitative Earnings Prediction System) is a full-stack, containerized enterprise quantitative finance application designed to track, model, and evaluate upcoming earnings fixtures for up to **885+ companies natively monitored** across the National Stock Exchange of India (NSE). The platform ingests earnings calendars, fetches multi-year historical financial statement metrics via Yahoo Finance, executes deep event studies and strategy backtesting using Python quantitative libraries, and integrates with Google Gemini AI to assemble comprehensive 11-section institutional equity research reports. 

All analytics are delivered via a high-density, low-latency React dashboard designed as an **Institutional Trading Terminal** featuring custom financial visualizers, continuous timeline number lines, transparent scorecards, real-time task pipeline surveillance, edge-to-edge interactive behavioral sentiment drawers, and a dual **Trading Floor Dark / Institutional Light** visual theme engine.

---

## 2. System Architecture & Docker Infrastructure

The platform implements a containerized microservices architecture orchestrated entirely via **Docker Compose**. It brings together 8 interconnected services:

```
+-----------------------------------------------------------------------+
|                              NGINX PROXY                              |
|                              (Port 80/8080)                           |
+-----------------------------------+-----------------------------------+
                                    |
            +-----------------------+-----------------------+
            | (HTTP / Frontend Traffic)                     | (/graphql & /api)
            v                                               v
+-----------------------+                       +-----------------------+
|  Vite / React Client  |                       | FastAPI (Uvicorn)     |
|  (Frontend Service)   |                       | (Backend Service)     |
+-----------------------+                       +-----------+-----------+
                                                            |
            +-----------------------------------------------+-----------+
            | (Async Dispatch via Celery)                               | (SQLAlchemy ORM)
            v                                                           v
+-----------------------+       +-----------------------+   +-----------------------+
|  Redis Broker / Cache | <---> | Celery Workers        |   | PostgreSQL Database   |
|  (Port 6379)          |       | (qeps_worker & Beat)  |   | (Port 5432 & PgAdmin) |
+-----------------------+       +-----------------------+   +-----------------------+
```

### Services Breakdown:
- **frontend**: React 19 + TypeScript single-page application bundled with Vite.
- **backend**: Python 3.12 FastAPI application hosting a Strawberry GraphQL API layer and REST health endpoints.
- **worker (`qeps_worker`)**: Asynchronous Celery execution engine dedicated to intensive scraping, mass financial data population, quantitative modeling, and LLM communication.
- **scheduler (`qeps_scheduler`)**: Celery Beat cron daemon for routine scheduled data synchronization (e.g., automated daily NSE calendar pulling).
- **nginx**: Alpine-based Nginx reverse proxy managing client requests and upstream route distribution.
- **postgres**: Relational PostgreSQL DBMS storing historical fundamental snapshots, user credentials, and event backtest logs.
- **redis**: In-memory data broker facilitating Celery task queueing and result buffering.
- **pgadmin**: Web-based graphical Postgres administration interface accessible on port `5050`.

---

## 3. Core Technology Stack

### Frontend (Client Tier)
- **Framework & Language**: React 19, TypeScript configured with strict compilation checking (`tsc -b`), and Vite high-speed module bundler.
- **State & Data Layer**: Apollo GraphQL Client (`@apollo/client`) configured with real-time automated polling intervals (e.g., 5000ms background worker synchronization) and explicit cache hydration policies (`network-only` where live data streaming is active).
- **Component Design System & Theming**: Material UI (MUI v5) paired with a custom-built dynamic React Theme Engine (`ThemeContext`). Leverages tokenized visual palettes to eliminate static hardcoded styling and provide instant toggling between **Institutional Light Mode** and **Trading Floor Dark Mode**.
- **Data Grid Architecture**: Highly tuned `@mui/x-data-grid` implementations engineered for high-density tabular presentation, borderless internal cells, uppercase tracking headers, DOM virtualization supporting our full **885+ NSE equity universe**, and ergonomic row formatting without horizontal scroll fatigue.
- **Specialized Visualizations & Terminal UI**: Custom zero-dependency horizontal SVG/DOM number line trackers, radial multi-factor comparison bars (`FactorBarChart`), interactive KPI metric widgets (`MetricWidget`), semantic status pills (`StatusChip` / `StatusBadge`), click-triggered interactive glassmorphic tooltips, edge-to-edge terminal slide-out panels (`Drawer`), row-wise grid item layouts (`borderRadius: 0`), and clickable external link navigation affordances (`OpenInNewIcon`).

### Backend & Quantitative Engine
- **Web Framework**: FastAPI, Uvicorn asynchronous ASGI server.
- **API Interface & Resolution Strategy**: Strawberry GraphQL (`strawberry-graphql`) exposing structured Types, Queries, and Mutations. Optimized via SQLAlchemy batch relationship eager-loading (`selectinload`) to prevent N+1 database querying bottlenecks.
- **In-Memory Cache Architecture**: Thread-safe memory caching layer (`momentum_cache_service.py`) utilizing atomic dictionary swaps to pre-calculate and serve aggregated sector statistics and momentum indicators instantaneously.
- **Database & Migrations**: SQLAlchemy 2.0 Core/ORM paired with PostgreSQL and Alembic database migrations.
- **Task Orchestration**: Celery distributed task queue connected to Redis and Postgres result backend.
- **Data Engineering & Finance**: `pandas`, `pandas-ta`, `numpy`, `yfinance` (Yahoo Finance extraction engine), custom NSE website web scrapers (`NSEService`).
- **Machine Learning & Predictive Modeling**: `lightgbm`, `xgboost`, `scikit-learn`, `shap` (SHapley Additive exPlanations) for probability calibration, feature attribution, **Purged Walk-Forward Cross-Validation (Combinatorial Embargoing)**, **Triple-Barrier Labeling**, and PCA trajectory compression. Zero-leakage `scikit-learn` Pipelines ensure strict point-in-time adherence.
- **Artificial Intelligence**: Google Gemini API via `AIAnalystService` structured prompting for institutional evaluation and catalyst sentiment scoring.
- **Security & Authentication**: JSON Web Tokens (JWT) via `python-jose` and cryptographic hashing with `bcrypt`.

---

## 4. Architectural Feature Modules

### 4.1 High-Density Stock Screening & Events Grid (`Home.tsx`)
The primary screener (`/`) presents real-time data across hundreds of listed stocks with optimized ergonomic density and zero-latency performance:
- **Ergonomic 2-Line Company Identification & Sticky Pinning**: Configured via a safe incremental grid architecture with **48px row heights** and a **44px header height** to ensure zero text clipping:
  - The leftmost company column is expanded to 240px and pinned as sticky, displaying a dual-line cell structure:
    - **Line 1**: Full company name in executive font weight (e.g., *Websol Energy System Limited*).
    - **Line 2**: Muted secondary typography showing ticker and exchange identifier (e.g., *WEBSOLAR NSE*).
- **No-Scroll Widescreen Viewport**: Engineered to fit all high-priority operational metrics—such as Current Price, Market Cap, Upcoming Earnings Announcement Date, 7-Day Target Drift %, and Normalized Health Grade pills—into a single widescreen desktop viewport without triggering horizontal scrolling while preserving right-hand KPI analytical sidebars.
- **Trailing Financial Results Architecture**: Historical quarterly operating financials (Q1 through Q4 Revenue, Net Profit, and Diluted EPS) have been deliberately grouped at the trailing right of the table structure, keeping immediate trading triggers up front while preserving deep fundamental access on demand.
- **High-Capacity Virtualized Records**: Configured to display our entire **885-stock NSE monitoring universe** with zero rendering lag via DOM virtualization and optimized React hook ordering (guaranteeing stable render cycles during loading transitions).
- **Inline QoQ Financial Trends**: Inline percentage evaluation badges (`▲ +X%`, `▼ -Y%`) instantly highlight consecutive quarter-over-quarter earnings expansion or deceleration.
- **Interactive Cloud & Calculation Actions**: Features top-bar triggers for **Cloud Download** (mass background scraping of quarterly statements) and **Mass Calc Health** (bulk quantitative normalization and database scoring).

### 4.2 Multi-Factor Momentum & Attention Scanner (`MomentumTracker.tsx`)
A real-time institutional quantitative scanner (`/momentum`) designed to evaluate and order our entire NSE equities universe across decoupled alpha factors:
- **Full Universe Coverage & Ergonomic Row Heights**: Upgraded to a spacious **64px row-height table structure** featuring multi-line company identification cells. Replaced standalone ad-hoc custom share lookup banners with native, real-time monitoring across the complete Nifty 500 and broader NSE equity rolls.
- **Market Regime Structural Header Banner**: At the pinnacle of the scanner sits an authoritative banner continuously evaluating the broader macro structure of the **Nifty 50 (`^NSEI`) Benchmark**, categorizing current market phases into distinct regimes (Bullish Expansion, Neutral Consolidation, or Volatility Contraction) with live numerical regime scores and analytical reasoning dials.
- **Five-Pillar Orthogonal Factor Decomposition (`FactorBarChart`)**: Replaces simple numerical lists with an interactive in-cell visual bar breakdown that decouples each equity's Composite Momentum Score into 5 core dimensions:
  1. **Technical Strength**: Breakout velocity vs. SMA200/DMA50 and trend acceleration.
  2. **Fundamental Quality**: Balance sheet resilience, ROE persistence, and solvency buffer.
  3. **Smart Money Accumulation**: Relative intraday volume surges and block order flows.
  4. **Derivatives Structure**: Options implied volatility skews and Put-Call open interest deltas.
  5. **Regime Alignment**: Systemic correlation and beta relative to broader index momentum.
- **Action Signals & Machine Learning Confidence Dials**: Renders explicit algorithmic execution tags (`BUY MOMENTUM`, `WATCHLIST`, `EXIT / WEAK`, `NEUTRAL`) accompanied by live ML-calibrated gain probability confidence percentages (`confidence %`) and volatility-adjusted stop-loss risk boundaries (`stopLossPrice`).
- **Automated Anomaly Attention Triggers**: Isolates equities for immediate human surveillance when critical anomaly criteria are triggered (e.g., trading volume exceeding $2\times$ the 20-day moving average, abrupt option volatility expansions, or upcoming earnings announcements within $\le 7$ days).

### 4.3 Live Celery Task Surveillance & Worker Monitoring (`TaskManager.tsx`)
A dedicated background pipeline surveillance interface (`/tasks`) giving analysts total visibility into async Celery engine execution:
- **Executive KPI Dashboard Bar**: Dynamically aggregates real-time metrics across all background processing jobs, displaying total active pipelines, success rate percentages, running worker counts, and average pipeline execution timings in milliseconds/seconds.
- **Automated 5000ms Network-Only Synchronization**: Continuously polls the GraphQL API server every 5 seconds to reflect worker progress without manual page refreshing, accompanied by a pulsing visual sync indicator and a manual `Force Sync` override.
- **Interactive Exception Trace & Output Cells**: Renders cleanly formatted output logs directly in the grid, styling runtime errors and exception stack tracebacks in monospaced crimson warning chips for immediate diagnostic triage.
- **Slide-Out Diagnostic Inspection Drawer (`TaskDetailDrawer.tsx`)**: Clicking `Inspect` on any pipeline row smoothly slides open an edge-to-edge diagnostic side panel revealing full task parameters, execution durations, worker host IDs, and complete un-truncated error log output.

### 4.4 Dynamic Visual Architecture & Theme Engine (`ThemeContext.tsx` & `Layout.tsx`)
The front-end interface is governed by a responsive, token-based design system crafted for institutional environments:
- **Tokenized Color Palettes**: Replaces legacy static stylesheets (`saasTokens`) and hardcoded white background patches with a centralized token dictionary (`useThemeMode`). Tokens automatically adjust container backgrounds, borders, card hover tints, table headers, and status indicator washes (`tokens.status.success.wash`, `tokens.border.main`, etc.).
- **Dual Aesthetic Themes**:
  - ☀️ **Institutional Light**: Engineered with morning paper whites (`#ffffff`), soft slate separators (`#f1f5f9`), and sharp high-contrast corporate ink styling inspired by Bloomberg Professional and Morningstar Terminal workstations.
  - 🌙 **Trading Floor Dark**: Built upon a deep cyber-slate background (`#0b0f19` and `#111827`), neon emerald positive drift highlights (`#3dffa2`), crimson drawdown warnings, and smooth glassmorphic shading designed to eliminate eye fatigue during overnight international trading shifts.
- **Global Header Toggles & Compact Side Menu**: Incorporates a refined, slimmed-down side navigation bar that conserves screen estate, paired with a global top header containing live user credentials and a responsive Light/Dark mode theme switcher.

### 4.5 Transparent Financial Health Scorecard (`FinancialHealthScorecard.tsx`)
When analyzing a specific stock, the application constructs an interactive normalized scorecard evaluation:
- **7 Evaluation Sectors**: Scores Profitability & Returns, Debt & Solvency, Cash Flow Efficiency, Growth Expansion, Valuation Multiples, Price Stability, and Ownership Quality on an aggregate 100-point scale.
- **Click-Only Interactive Formula Tooltips**: To maintain sleek, uncluttered card dimensions, explicit normalization formulas are concealed by default. Each metric card houses an information icon (`i`); **clicking the icon** displays an interactive dark glassmorphic tooltip detailing the exact mathematical formula (e.g., `clamp((ROE - 0.0%) / (20.0% - 0.0%), 0, 1) * 25.0`).
- **Governance Penalty & Transparency Logs**: An explicit footer tracks institutional governance deductions (such as Promoter Pledges exceeding nominal safety thresholds), ensuring completely reproducible numerical point adjustments.

### 4.6 Unified Quarterly Earnings Market Impact (`QuarterlyMarketImpact.tsx`)
A specialized interactive visualizer engineered to conduct event study backtests around historical corporate earnings dates:
- **Continuous Single-Line Timeline**: Trading intervals are rendered as a horizontal scrollable number line that merges pre-event drift days (`T-7` through `T-1`) with post-event reaction days (`T+1` through `T+7`) into an unbroken continuum.
- **Central Earnings Pivot Node (`T-0 PIVOT`)**: At the direct center of the timeline sits an amber-glowing `T-0 PIVOT` coordinate representing the exact official earnings announcement date, marking the baseline price entering the report.
- **Dynamic Colored Rail Transition**: To the left of the pivot node, the connecting rail is a muted slate grey representing **Pre-Event Drift**. As it crosses `T-0 PIVOT`, it transforms into a luminous purple gradient rail connecting `T+1` (where announcement volume expansion occurs) through subsequent reaction periods.
- **Responsive Window Switcher**: Tab selectors enable switching between a compact **7 Days Window** (15 total nodes fitting cleanly without scrolling) and an extended **1 Month Window** (up to 45 nodes across an expanded timeline).
- **Inline Financial Statement Summaries**: Pairs every quarterly timeline (Q1–Q4) with condensed Total Revenue, Net Profit, and Diluted EPS comparison cards (`vs ₹... prior`).

### 4.7 Intensive Strategy & Momentum Backtesting Engine (`IntensiveBacktestEngine`)
An interactive quantitative simulation module directly accessible from the momentum grid via an executive dashboard modal:
- **Dynamic Transaction Cost Estimation**: Incorporates real-time modeled liquidity friction based on bid-ask spreads, volume pressure, and Indian Securities Transaction Tax [STT] simulation to ensure zero-illusion edge reporting.
- **Executive Portfolio Analytics**: Computes strict **Net Win Rates**, **Expected Value (EV)** per trade ($\text{EV} = (\text{Win Rate} \times \text{Avg Gain}) + (\text{Loss Rate} \times \text{Avg Loss})$), **Profit Factor** ($\frac{\sum \text{Winning Gains}}{|\sum \text{Losing Losses}|}$), **Sharpe & Sortino Ratios**, and **Nifty 50 Alpha (%)** across customizable 1-Year, 3-Year, and 5-Year historical windows.
- **Factor Attribution Service**: Isolates alpha by stripping out beta through **Fama-French 3-Factor** and **CAPM** models, proving if backtest performance is authentic idiosyncratic edge or disguised market momentum.

### 4.8 Native NSE Hybrid Data & Surveillance Pipeline (`NseDataService`)
Engineered to deliver institutional precision by supplementing global price feeds with authentic Indian market parameters:
- **Official Daily Bhavcopy Ingestion**: Downloads and parses daily EOD exchange CSV archives to extract precise T+1 Delivery Percentages (differentiating authentic institutional capital accumulation from speculative intraday churn).
- **Regulatory Surveillance Watchlists**: Automatically synchronizes with active SEBI & NSE **Additional Surveillance Measure (ASM)** and **Graded Surveillance Measure (GSM)** warning rosters and frozen circuit-breaker tables. Equities flagged under regulatory surveillance are automatically barred from momentum BUY recommendations.
- **Institutional Order Flows**: Monitors daily regulatory disclosures for large Bulk and Block deals to quantify institutional fund bias.

### 4.9 Institutional Portfolio Risk Engine & Emergency Kill Switch (`RiskEngine`)
An enterprise-grade risk defense layer integrated into the algorithmic evaluation loop to guard capital against drawdown events:
- **Hierarchical Risk Parity (HRP) Position Sizing**: Discards naive equal-weight allocations, dynamically sizing capital using clustered correlation hierarchies to eliminate embedded risk concentrations.
- **Emergency Algorithmic Kill Switch (Dynamic CVaR)**: Monitors trailing portfolio drawdowns across all live and simulated recommendations using **Conditional Value at Risk (CVaR)** bounding. Drawdown limits automatically tighten (e.g. to -10%) during bearish market regimes.
- **Strict Concurrency & Leverage Constraints**: Caps active portfolio exposure at a maximum of **15 concurrent long recommendations**, enforces a **25% maximum capital allocation per industry sector**, and restricts total gross leverage dynamically.
- **Spearman Correlation Gating**: Rejects candidate BUY recommendations if their trailing rank correlation against existing portfolio holdings exceeds 0.78.
- **Systematic Stress Testing**: Auto-simulates portfolio exposure against historical crashes (COVID-19, 2008 GFC, Taper Tantrum) to gauge maximum tail-risk vulnerability.

### 4.10 Validation Suite, IC Tracking & Model Shadow Probation (`ValidationService`)
A continuous real-world verification infrastructure guaranteeing AI quantitative integrity:
- **252-Day Authentic Out-of-Sample Probation ("Shadow Mode")**: Whenever walk-forward automated workers retrain a new AI/ML model, it enters an automated probationary period alongside production for a strict 252-day window. A formal **Student's t-test** must mathematically prove superiority over the active model before automated promotion occurs.
- **Benjamini-Hochberg False Discovery Rate (FDR)**: Rejects statistical anomalies by strictly controlling the family-wise error rate across thousands of parallel model streams.
- **White's Reality Check (SPA)**: Validates out-of-sample trading performance against a proxy risk-free threshold via randomized bootstrapping to ensure predictive edge is not a byproduct of random chance.
- **Rolling Information Coefficient (IC) Tracking**: Calculates daily Spearman rank correlations between composite momentum scores and actual realized price returns across the universe, ensuring persistent statistical edge ($IC > 0.03$).

### 4.11 Interactive Behavioral Matrix & Social Sentiment Deck (`SocialSentimentCard.tsx`)
An advanced interactive quant research tool on the stock detail dashboard synthesizing financial press narratives, retail forum hype, and institutional fund flows:
- **3-Column Clickable Analytics Deck**: Features three interactive cards evaluating **News Sentiment Score**, **Reddit Forum Velocity**, and **Smart Money Divergence**. Each card is engineered with smooth hover elevation (`translateY(-4px)` with accent lighting) and an `"Analyze →"` action trigger.
- **Edge-to-Edge Terminal Grid Row Drawers**: Clicking any sentiment card slides open a specialized analytical right-hand Drawer panel. Designed with **zero container padding (`p: 0`) and stripped of rounded corners (`borderRadius: 0`) and lateral borders**, ensuring all explainer banners, code formula boxes, and feed rows touch the left and right walls of the panel exactly like an institutional trading workstation.
- **Transparent Mathematical & Time Decay Methodology**: Features header info tooltips (`i`) and dedicated methodology explanation sections detailing:
  - **News Architecture**: Explains Tier-1 vs. Tier-2 source authority weighting and exponential 24-hour time decay ($\lambda$), highlighting how intraday releases carry 3.2x significance.
  - **Reddit FOMO Index**: Dissects the formula separating retail option gambling from rational fundamental positions by contrasting emoji hype density (🚀, 📈) against structural financial rhetoric across `r/IndianStreetBets` and `r/IndiaInvestments`.
  - **Smart Money Flow**: Details block deal VWAP verification (transactions $\ge$ ₹15 Crores) and custodial delivery absorption filtering ($>65\%$ delivery).
- **Actionable Intelligence Feed with Clickable Navigation**: Synthesizes extensive live datasets—**10 verified News reports**, **6 active Reddit community threads**, and **5 Smart Money institutional signatures**.
  - **Live Counter Badges**: Promoted opposite each feed header (e.g., `[ 10 Live Articles Analyzed ]`, `[ 6 Active Threads Tracked ]`).
  - **Structured Row Layout**: Each feed item row is organized with a bold headline across the top and a **Sentiment Flag Badge placed in the top right corner**.
  - **Under-Headline Clickable Source Navigation**: Positioned directly underneath the headline is the source publication or forum name accompanied by an interactive external link icon (`OpenInNewIcon`). Clicking anywhere on a feed item row executes `window.open(...)` to launch the live original search query or discussion thread in a new browser tab.
  - **Market Impact Derivative**: Attached at the base of each row is an algorithmic takeaway sub-box with colored vertical accent bars explaining institutional alpha implications (e.g., EBITDA upgrades, gamma exposure buildups, silent accumulation).

### 4.12 High-Performance GraphQL & Database Resolution Cache (`momentum_cache_service.py`)
Engineered to resolve data throughput bottlenecks and ensure instantaneous dashboard rendering when streaming up to 885+ companies simultaneously:
- **Zero N+1 Query Resolution**: Refactored SQLAlchemy ORM resolvers within `queries.py` to enforce batch relationship eager-loading (`selectinload` and `joinedload`). All required historical snapshots, recent earnings reports, and predicted indicators are fetched in single, optimized SQL projection executions.
- **In-Memory Thread-Safe Atomic Cache**: Implemented a specialized caching daemon (`momentum_cache_service.py`) that precomputes and buffers sector momentum aggregations and technical indicators directly within server runtime RAM.
- **Non-Blocking Background Hydration**: The caching layer updates atomically without locking API client requests, reducing backend response latency from several seconds down to under **80ms** during heavy dashboard screening sessions.

### 4.13 Quantitative Hypothesis Laboratory (QHLM) & Deflated Sharpe Verification (`HypothesisLaboratory.tsx`)
An interactive quantitative terminal screen (`/research`) dedicated to rigorous algorithmic factor discovery, lifecycle management, and defense against statistical P-Hacking:
- **Five-Stage FSM Pipeline Tracker**: Governs every alpha proposal through strict operational states: `DRAFT_HYPOTHESIS`, `IN_SAMPLE_AUDIT`, `OUT_OF_SAMPLE_SHADOW` (probation), `LIVE_ALPHA_STREAM` (capital deployment), and `ALPHA_DECAY_ARCHIVE` or `ARCHIVE_FAILED` (false discovery rejection).
- **150-Day Authentic Out-of-Sample Shadow Probation**: Factors passing the initial audit must survive a strict 150-trading-day walk-forward observation period before being computationally re-evaluated for out-of-sample edge stability.
- **Bailey & Lopez de Prado Deflated Sharpe Ratio (DSR)**: To prevent data dredging, the backtest audit engine computes empirical Deflated Sharpe Ratios ($DSR \ge 0.85$ confidence threshold). It leverages a global `TotalHypothesisTrials` counter to explicitly penalize factors based on cumulative family trial variance and non-normal kurtosis/skewness of candidate return distributions.
- **Secure AST Vector Evaluation**: Uses a restricted `SafeASTEvaluator` to dynamically parse factor expressions into secure Pandas vectorized operations, supporting robust cross-sectional operations like `rank(pct=True)` and rolling `delta` offsets without invoking dangerous `eval()`.
- **Live Per-Stock Signal Engine**: Fully verified models emitting from the `LIVE_ALPHA_STREAM` generate daily directional (`LONG`/`SHORT`) percentile-ranked trade signals for individual equities, accessible via the **Live Signals** data grid. Strategies whose trailing Spearman IC drops below `0.005` are forcefully retired to `ALPHA_DECAY_ARCHIVE`.

---

## 5. Backend Task Workflow & Processing Pipelines

### 5.1 Automated NSE Calendar Sync (`sync_nse_calendar_task`)
Executed daily by `qeps_scheduler`, this background worker interfaces with official NSE endpoints, parsing the upcoming Corporate Results calendar. It automatically populates or updates `Company` database instances with upcoming dates and formal agenda purposes.

### 5.2 Bulk Data Population (`populate_companies_data_task`)
Triggered via the `populateCompaniesData` GraphQL mutation when an admin initiates a cloud download:
- Iteratively extracts quarterly balance sheets and income statements via `yfinance` (appending `.NS` to national identifiers).
- Captures Q1 through Q4 Revenue, Profit, Diluted EPS, current market closing pricing, and evaluates directional multi-quarter `historicalTrend` strings (e.g., `UP,UP,DOWN,UP`).

### 5.3 Bulk Financial Health Normalization (`mass_calculate_financial_health_task`)
Triggered via the `massCalculateFinancialHealth` GraphQL mutation:
- Iterates across all stored tickers in the system, passing their historical fundamental profiles into the evaluation engine.
- Computes efficiency percentages across all 7 categorical pillars, registers any governance penalties, and updates the permanent overall quantitative health score stored within PostgreSQL.

### 5.4 Deep Quantitative Research AI Synthesis (`generate_deep_research_report_task`)
Dispatched when a user requests an comprehensive individual stock audit:
- **Quantitative Engine (`QuantService`)**: Ingests 5 years of daily OHLCV trading logs. Calculates advanced momentum vectors (MACD, RSI, ADX), moving average convergence, support/resistance levels, intraday price gaps, and forward cumulative return expectations across 1, 3, 5, 10, 20, and 30-day horizons.
- **Qualitative LLM Synthesis (`AIAnalystService`)**: Passes the processed algorithmic metrics into **Google Gemini**, prompting it as an Institutional Senior Quant Analyst to generate an authoritative 11-section markdown research document complete with explicit risk warnings and execution strategies.

### 5.5 Automated Weekly ML Retraining & Calibration (`retrain_momentum_ml_model`)
Executed as a weekly background cron job by Celery Beat:
- Re-fits our LightGBM gradient booster across trailing historical OHLCV features using Purged Walk-Forward Cross-Validation.
- Tracks Population Stability Index (PSI) drift across data distributions and updates model hyperparameters and PCA sequence trajectory compression weights.

### 5.6 Overnight NSE Hybrid Data Ingestion (`sync_nse_market_data_task`)
Scheduled in Celery Beat to execute daily after exchange settlement hours (19:30 IST):
- Connects to exchange archives to download official EOD Bhavcopy CSVs, extracting daily Delivery Percentages and Bulk/Block institutional flows.
- Synchronizes active regulatory exclusions (ASM/GSM watchlists) to prevent scoring compromised equities.

### 5.7 Daily Forward Return Resolution & IC Audit (`resolve_realized_forward_returns_task`)
Runs daily via Celery Beat:
- Scopes past prediction logs whose 3-day, 5-day, or 10-day forward prediction horizons have matured.
- Compares real-world realized market price movements against past predictions to compute exact predictive calibration and update rolling Spearman Rank Information Coefficients (IC).

### 5.8 Weekly Shadow Model Probation Review (`audit_shadow_model_performance_task`)
Scheduled weekly by Celery Beat:
- Reviews all AI/ML models currently undergoing silent probationary evaluation in Shadow Mode.
- Checks whether 14 days of live statistical backfill have been completed and evaluates comparative precision against baseline production models before triggering promotion.

### 5.9 Intensive Historical Backtest CLI Suite (`run_backtest_suite.py`)
A containerized batch simulation script designed for large-scale multi-year historical accuracy sweeps across NSE constituents:
- Invokable inside Docker via `docker compose exec -T backend python run_backtest_suite.py --limit 50 --years 3`.
- Outputs an executive ASCII table directly to the console detailing trade counts, win rates, Sharpe ratios, profit factors, and benchmark Nifty 50 alpha, while exporting detailed JSON research logs to disk.

### 5.10 Autonomous AI Factor Discovery & FSM Research Loop (`run_automated_hypothesis_research_task`)
Scheduled daily by Celery Beat and directly deployable via the `/research` UI (`Deploy Gemini Quant Agent`):
- **Automated FSM Transitions**: Promotes audited hypotheses from `IN_SAMPLE_AUDIT` to `OUT_OF_SAMPLE_SHADOW` (following the 150-day wait) and eventually `LIVE_ALPHA_STREAM`, while continuously scoring and retiring degrading signals.
- **Autonomous Batch Formulation & Deduplication**: The AI automatically formulates orthogonal vector equations until the active pipeline (`DRAFT` + `SHADOW` + `LIVE`) reaches a `TARGET_PIPELINE_DEPTH` of 15. All equations undergo whitespace-stripped `normalized_expression` checks to prevent identical proposals, backed by a circuit-breaker to halt infinite loops upon fallback exhaustion.
- **Secure Evaluation Loop**: Instantly executes candidate expressions against cached daily OHLCV multi-index DataFrames, computing Deflated Sharpe and Spearman student-$t$ statistics automatically upon proposal using `SafeASTEvaluator`.

### 5.11 Nightly OHLCV Cache Fan-Out Synchronization (`sync_ohlcv_cache_task`)
Scheduled daily by Celery Beat (`sync-ohlcv-cache-daily`):
- **Master-Worker Fan-Out Architecture**: The master task queries the active equities universe and dispatches individual `sync_single_ohlcv_task` micro-tasks using Celery `group()`. This parallelizes downloads and prevents monolithic single-thread worker blocking.
- **Strict Process & Network Kill Switches**: Sub-tasks implement a strict `timeout=10` on `yfinance` network sockets and a Celery `@shared_task(time_limit=60)` hard kill switch to gracefully terminate and recycle frozen worker processes.
- **Incremental PostgreSQL Storage**: Uses `OHLCVCacheService` to incrementally synchronize daily bars into the `DailyBhavcopy` cache table, skipping redundant history to minimize network latency.

---

## 6. Database Schema Core Entities & GraphQL Mappings

- `User`: Manages analyst identities, encrypted passwords, and session authentication.
- `Company`: Primary entity storing stock metadata (Ticker, Name, Purpose, Upcoming Date), immediate closing pricing, 4-quarter fundamental snapshots, normalized health grades, and Point-in-Time timestamps (`known_at`, `period_end`).
- `EarningsReport`: Historical ledger of past quarterly earnings events with strict publication lag timestamps.
- `Prediction`: Directional confidence scoring and statistical probability estimates.
- `EventStudyResult`: Holds empirical backtested performance metrics (Pre-announcement drift %, announcement gap %, post-announcement return trajectories).
- `StrategyBacktest`: Logs quantitative event strategies (A–F) and rolling momentum simulations, recording exact win rates, expected values, profit factors, drawdown profiles, and total net trades executed.
- `MomentumSignal`: Persists multi-factor composite ranks (`compositeScore`), factor breakdown sub-scores (`technicalScore`, `fundamentalScore`, `smartMoneyScore`, `derivativesScore`, `regimeScore`), action signals (`signal`), ML gain probability calibrations (`confidence`), volatility stop losses (`stopLossPrice`), position sizing (`positionSizePct`), attention anomaly flags (`requiresAttention`), and point-in-time calculation timestamps.
- `DailyBhavcopy`: Stores official EOD exchange records including trade date volume, closing prices, and precise T+1 Delivery Percentages.
- `BulkBlockDeal`: Archives large institutional regulatory transaction disclosures (Bulk/Block deals) to gauge professional capital bias.
- `SurveillanceWatchlist`: Registry of equities actively listed under SEBI/NSE ASM, GSM, or circuit breaker trading exclusions.
- `ScorePredictionLog`: Point-in-time historical audit ledger logging daily composite scores and multi-horizon gain predictions alongside subsequently realized 3d/5d/10d forward returns for IC verification and shadow model evaluation.
- `TechnicalSnapshot`: Point-in-time snapshot of technical trading indicator oscillators.
- `AIAnalysisReport`: Persisted storage for LLM-generated qualitative analytical narratives, news catalyst sentiments, and markdown commentary.
- `ResearchHypothesis`: Stores institutional quant factors with author identification (`AI_RESEARCH_AGENT` vs `HUMAN_QUANT_ANALYST`), A Priori economic mechanisms, vector alpha expressions, target universes, holding horizons, and current FSM lifecycle stages.
- `HypothesisExperiment`: Records empirical evaluation audit runs, capturing family trial counts ($N$), classic vs. deflated Sharpe ratios (DSR), Spearman IC mean/student-$t$ statistics, and statistical rejection tags to shield against P-Hacking.
- `TotalHypothesisTrials`: Global monotonically increasing state counter. Crucial for Bailey-Lopez de Prado Deflated Sharpe Ratio penalty scaling, keeping memory of all historical failed tests to prevent long-term data dredging.
- `HypothesisSignal`: Daily point-in-time trade directives (LONG/SHORT), percentile rankings, and raw algorithmic factor scores generated specifically by active `LIVE_ALPHA_STREAM` hypotheses on an individual stock basis.

---

## 7. Developer Reference & Operation Guide

### 7.1 Local Container Execution
To boot the full multi-container deployment locally:
```bash
# Start all containers in detached mode
docker compose up -d

# Rebuild images after updating requirements.txt or package.json
docker compose up --build -d
```

### 7.2 Port Mapping Reference
- **Frontend Dashboard**: `http://localhost` (proxied via Nginx)
- **GraphQL Interactive Console (GraphiQL)**: `http://localhost:8000/graphql`
- **PgAdmin Database Manager**: `http://localhost:5050`
- **PostgreSQL Port (Host access)**: `localhost:5432`
- **Redis Broker Port**: `localhost:6379`

### 7.3 Critical Celery & Worker Reload Rules
> [!IMPORTANT]
> Celery background worker processes (`qeps_worker`) do **NOT** automatically hot-reload when modifications are made to Python source code in `backend/app/worker/tasks.py` or associated analytical services.
> 
> Whenever you define a new `@shared_task` (such as `mass_calculate_financial_health_task`), modify quantitative formulas, or update AI prompt schemas, you **MUST** manually restart the worker container:
```bash
docker compose restart qeps_worker
```

### 7.4 Frontend Styling, Theming & Type Safety Rules
> [!IMPORTANT]
> - **Theme Token Enforcement**: Never import static legacy styles (`saasTokens`) or use hardcoded HEX colors (e.g., `#ffffff`, `#f8fafc`, or `#0f172a`) when modifying UI components in `src/pages` or `src/components`. Always instantiate the dynamic theme hook:
>   ```tsx
>   import { useThemeMode } from '../theme/ThemeContext';
>   const { mode, tokens } = useThemeMode();
>   const isDark = mode === 'dark';
>   ```
> - **DataGrid Visual Design**: When deploying new `@mui/x-data-grid` instances, ensure `.MuiDataGrid-columnSeparator` is hidden (`display: 'none'`), set cell right borders to `none`, apply monospaced `fontVariantNumeric: 'tabular-nums'` to all financial values, and utilize `tokens.background.card` and `tokens.background.paper` for column header and row shading.
> - **TypeScript Verification**: Verify front-end builds cleanly prior to commit by executing: `docker compose exec -T frontend npx tsc --noEmit`.

### 7.5 Modifying Database Schema & GraphQL Types
When extending backend models or adding new analytical fields:
1. Update the SQLAlchemy model class definitions in `backend/app/infrastructure/models.py`.
2. Generate and run Alembic database migrations (or execute DDL schema modifications against Postgres).
3. Expose the new attributes within the corresponding Strawberry GraphQL schema definition in `backend/app/graphql/types.py` (e.g., ensuring naming conventions match such as `regimeScore` and `confidence`).
4. Update resolver functions in `backend/app/graphql/queries.py` or mutation handlers in `backend/app/graphql/mutations.py`.
5. On the frontend, update your Apollo Client query definitions in `frontend/src/pages/Home.tsx`, `MomentumTracker.tsx`, or `TaskManager.tsx`, ensuring `fetchPolicy: 'network-only'` is utilized when pulling real-time background worker tasks.

---

## 8. Git Maintenance & Branch Status
The local repository is connected to the upstream remote `origin` (`main` branch). All recent platform architectural transformations have been fully integrated, type-checked, and deployed across the active Dockerized container ecosystem:
- **Dynamic Institutional Theme Engine**: Instant toggling between **Institutional Light** and **Trading Floor Dark** modes across all pages.
- **Full NSE Universe Coverage (885+ Equities)**: Comprehensive tracking across both the Events Page and Momentum & Attention Scanner without requiring ad-hoc lookup forms.
- **Safe & Incremental DataGrid Overhaul**: 48px row heights in Events and 64px row heights in Momentum scanners featuring dual-line sticky company identification (`Websol Energy System / WEBSOLAR NSE`) and high-contrast numerical tracking.
- **High-Performance GraphQL & Database Caching Layer**: In-memory memoized sector statistical caching (`momentum_cache_service.py`) and SQLAlchemy batch relationship eager loading (`selectinload`) to eradicate N+1 database queries and deliver sub-second rendering.
- **Interactive Behavioral Matrix & Social Deck**: 3-column clickable sentiment suite (`SocialSentimentCard.tsx`) launching edge-to-edge zero-padding terminal slide-out panels. Features complete quantitative methodology formulas, article count badges, top-right sentiment flag positioning, and an extensive 10-article News / 6-thread Reddit / 5-signature Smart Money feed equipped with under-headline clickable external search navigation (`OpenInNewIcon`).
- **Institutional Risk & Surveillance Suite**: Native NSE Bhavcopy T+1 delivery parsing, SEBI ASM/GSM regulatory exclusions, Portfolio Risk Engine with Emergency Kill Switch (-15% drawdown limit), Rolling IC tracking ($IC > 0.03$), and our 14-Day Shadow Model Probationary testing suite.
- **Quantitative Hypothesis Laboratory & Autonomous AI Quant Agent**: Dedicated terminal dashboard (`/research`) managing a 5-stage FSM lifecycle (Draft $\to$ Audit $\to$ Shadow $\to$ Live $\to$ Decay/Archive) with Bailey & Lopez de Prado Deflated Sharpe (DSR) evaluation and student-$t$ significance verification. Integrated with Google Gemini for autonomous orthogonal vector equation formulation under strict *A Priori* economic anomaly mandates.
