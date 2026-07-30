# QEPS - Quantitative Earnings Prediction & Analytics Dashboard

## 1. Project Overview

QEPS (Quantitative Earnings Prediction System) is a full-stack, containerized enterprise quantitative finance application designed to track, model, and evaluate upcoming earnings fixtures for companies listed on the National Stock Exchange of India (NSE). The platform ingests earnings calendars, fetches multi-year historical financial statement metrics via Yahoo Finance, executes deep event studies and strategy backtesting using Python quantitative libraries, and integrates with Google Gemini AI to assemble comprehensive 11-section institutional equity research reports. 

All analytics are delivered via a high-density, low-latency React dashboard featuring custom financial visualizers, continuous timeline number lines, and transparent scorecards.

---

## 2. System Architecture & Docker Infrastructure

The platform implements a containerized microservices-inspired architecture orchestrated entirely via **Docker Compose**. It brings together 8 interconnected services:

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
- **Framework & Language**: React 19, TypeScript, Vite
- **State & Data Layer**: Apollo GraphQL Client (`@apollo/client`) configured with real-time polling and explicit cache hydration policies (`network-only` where live worker streaming is active).
- **Component Design System**: Material UI (MUI v5), customized `@mui/x-data-grid` for ultra-dense quantitative tables, and Google Fonts (`Inter`, monospace code presentation).
- **Specialized Visualizations**: Custom zero-dependency horizontal SVG/DOM number line trackers, radial gauge equivalents, and click-triggered interactive tooltips.

### Backend & Quantitative Engine
- **Web Framework**: FastAPI, Uvicorn asynchronous ASGI server.
- **API Interface**: Strawberry GraphQL (`strawberry-graphql`) exposing structured Types, Queries, and Mutations.
- **Database & Migrations**: SQLAlchemy 2.0 Core/ORM paired with PostgreSQL and Alembic database migrations.
- **Task Orchestration**: Celery distributed task queue connected to Redis and Postgres result backend.
- **Data Engineering & Finance**: `pandas`, `pandas-ta`, `numpy`, `yfinance` (Yahoo Finance extraction engine), custom NSE website web scrapers (`NSEService`).
- **Machine Learning & Predictive Modeling**: `lightgbm`, `xgboost`, `scikit-learn`, `shap` (SHapley Additive exPlanations) for probability calibration, feature attribution, Purged Walk-Forward Cross-Validation, and PCA trajectory compression.
- **Artificial Intelligence**: Google Gemini API via `AIAnalystService` structured prompting for institutional evaluation and catalyst sentiment scoring.
- **Security & Authentication**: JSON Web Tokens (JWT) via `python-jose` and cryptographic hashing with `bcrypt`.

---

## 4. Architectural Feature Modules

### 4.1 High-Density Stock Screening Grid (`Home.tsx`)
The primary screener presents real-time data across hundreds of listed stocks with optimized ergonomic density:
- **Unified Company / Ticker Columns**: Combines the full corporate name and ticker symbol into a single streamlined column to maximize horizontal screening room.
- **Condensed Row Geometry**: Eliminated redundant table radii and compressed padding to create an institutional Bloomberg-style tabular interface.
- **Dynamic Financial Sub-Rows & QoQ Trends**: Inline percentage evaluation badges (`▲ +X%`, `▼ -Y%`) compare real-time Quarterly Revenue, Net Profit, and Diluted EPS against prior-quarter baselines.
- **Interactive Cloud Operations**: Features one-click triggers for **Cloud Download** (scraping quarterly statements) and **Mass Calc Health** (bulk numerical score normalization).

### 4.2 Transparent Financial Health Scorecard (`FinancialHealthScorecard.tsx`)
When reviewing a specific stock, the application builds an interactive normalized scorecard evaluation:
- **7 Evaluation Sectors**: Scores Profitability & Returns, Debt & Solvency, Cash Flow Efficiency, Growth Expansion, Valuation Multiples, Price Stability, and Ownership Quality on an aggregate 100-point scale.
- **Click-Only Interactive Formula Tooltips**: To preserve sleek, compact aesthetic dimensions without cluttering visual cards, the explicit normalization math formulas are concealed by default. Each metric card houses an info icon (`i`) in its top-right header; **clicking the icon** reveals an interactive dark glassmorphic tooltip detailing the exact mathematical formula (e.g., `clamp((ROE - 0.0%) / (20.0% - 0.0%), 0, 1) * 25.0`).
- **Governance Penalty & Transparency Logs**: An explicit footer tracks institutional governance deductions (such as Promoter Pledges exceeding nominal thresholds), ensuring reproducible point adjustments.

### 4.3 Unified Quarterly Earnings Market Impact (`QuarterlyMarketImpact.tsx`)
A dedicated visualization module designed to perform event studies around official quarterly financial release dates:
- **Continuous Single-Line Timeline**: Unlike fragmented tabular layouts, trading intervals are rendered as a scrollable horizontal number line that unites pre-event days (`T-7` through `T-1`) with post-event reaction days (`T+1` through `T+7`) without interruption.
- **Central Earnings Pivot Node (`T-0 PIVOT`)**: Directly in the center of the timeline sits an amber-glowing `T-0 PIVOT` coordinate representing the exact earnings release event date, displaying the baseline price entering the report.
- **Dynamic Colored Rail Transition**: To the left of the pivot node, the connecting horizontal rail is a muted slate grey representing **Pre-Event Drift**. As it passes through `T-0 PIVOT`, it transforms into a luminous purple gradient rail connecting `T+1` (where announcement volume surge occurs) through subsequent reaction days.
- **Responsive Window Switcher**: Low-profile tab selectors allow users to switch seamlessly between a compact **7 Days Window** (15 total nodes fitting cleanly without horizontal scrolling) and an extended **1 Month Window** (up to 45 nodes across an interactive timeline).
- **Inline Financial Statement Summaries**: Pairs every quarterly timeline (Q1-Q4) with condensed Total Revenue, Net Profit, and Diluted EPS comparison cards (`vs ₹... prior`).

### 4.4 Multi-Factor Momentum & Attention Scanner (`MomentumTracker.tsx`)
A real-time institutional quantitative scanner engineered to rank the entire NSE equities universe across five orthogonal alpha dimensions:
- **Five-Pillar Composite Score (T / F / SM / D / Regime)**: Normalizes and blends **Technical Strength** (breakout velocity vs SMA200/DMA50), **Fundamental Quality** (ROE & debt efficiency), **Smart Money Accumulation** (relative volume expansion and block order flows), **Derivatives Structure** (volatility dynamics), and **Market Regime Alignment** (`^NSEI` index structural health) into a continuous 100-point index.
- **Automated Anomaly Attention Trigger**: Immediately flags equities for urgent analyst intervention when anomaly criteria are satisfied (e.g., daily volume exceeding $2\times$ the 20-day average, sudden volatility expansion, imminent earnings fixture within $\le 7$ days, or trend divergence).
- **Embedded ML Probability & AI Sentiment (Phases 3–5)**: Incorporates calibrated multi-horizon directional gain probabilities ($P(\text{gain, 3d})$, $P(\text{gain, 5d})$, $P(\text{gain, 10d})$) from our LightGBM/XGBoost engine, PCA sequence trajectory embeddings, SHAP feature attribution logs, and real-time news catalyst sentiment scores via Google Gemini LLM synthesis.

### 4.5 Intensive Strategy & Momentum Backtesting Engine (`IntensiveBacktestEngine`)
An interactive quantitative simulation module directly accessible from the momentum grid via a dark glassmorphic report modal:
- **Net-of-Friction Accuracy Calculation**: Automatically subtracts a **0.20% round-trip transaction friction deduction** (accounting for Indian Securities Transaction Tax, Stamp Duty, GST, brokerage fees, and execution impact cost) from every simulated trade return, guaranteeing realistic edge reporting.
- **Executive Portfolio Analytics**: Computes strict **Net Win Rates**, **Expected Value (EV)** per trade ($\text{EV} = (\text{Win Rate} \times \text{Avg Gain}) + (\text{Loss Rate} \times \text{Avg Loss})$), **Profit Factor** ($\frac{\sum \text{Winning Gains}}{|\sum \text{Losing Losses}|}$), **Sharpe/Sortino Ratios**, and **Nifty 50 Alpha (%)** across customizable 1-Year, 3-Year, and 5-Year historical windows.

### 4.6 Native NSE Hybrid Data & Surveillance Pipeline (`NseDataService`)
Engineered to deliver institutional accuracy by supplementing global historical price feeds with native Indian market parameters:
- **Official Daily Bhavcopy Ingestion**: Downloads and parses daily EOD exchange CSV archives to extract precise T+1 Delivery Percentages (differentiating long-term capital accumulation from intraday speculation).
- **Regulatory Surveillance Watchlists**: Automatically syncs with active SEBI & NSE **Additional Surveillance Measure (ASM)** and **Graded Surveillance Measure (GSM)** warning rosters and frozen circuit-filter tables. Equities flagged under surveillance are automatically barred from momentum BUY recommendations.
- **Institutional Order Flows**: Monitors daily regulatory disclosures for large Bulk and Block deals to quantify institutional sentiment directions.
- **Hybrid Fallback Resilience**: Employs polite rotating headers and robust timeout retries when accessing NSE archives, gracefully falling back to historical database proxies if exchange rate limits trigger.

### 4.7 Institutional Portfolio Risk Engine & Emergency Kill Switch (`RiskEngine`)
An enterprise-grade safety defense layer integrated into the quantitative evaluation loop to guard capital and prevent systemic portfolio blowups:
- **Emergency Algorithmic Kill Switch**: Automatically monitors trailing portfolio drawdowns across live and simulated recommendations. If rolling maximum drawdown crosses **-15.0%** (or during a systemic market crash), the **Kill Switch automatically trips**. While active, all new directional `BUY` momentum signals are instantly halted across the dashboard (downgraded to `WATCHLIST` or `EXIT`) until an analyst verifies market recovery and manually resets the system.
- **Strict Concurrency Caps**: Caps active portfolio exposure at a maximum of **15 concurrent long recommendations**, preventing capital dilution and over-diversification.
- **Concentration & Sizing Ceilings**: Enforces a strict **30% maximum capital allocation per industry sector** and caps individual position weighting at 20% max (adjusted dynamically via ATR volatility sizing).
- **Correlation Gating**: Rejects new candidate BUY recommendations if their trailing 180-day daily price returns exhibit a Pearson correlation $>0.78$ with existing portfolio holdings.
- **Event-Risk Blackouts**: Enforces a protective trading exclusion buffer that suppresses directional BUY entries within $\le 3$ trading days of an upcoming corporate earnings announcement or scheduled macroeconomic release.

### 4.8 Validation Suite, IC Tracking & Model Shadow Probation (`ValidationService`)
A continuous real-world verification infrastructure ensuring statistical integrity and AI safety:
- **14-Day Shadow Model Probationary Controller ("Shadow Mode")**: Whenever automated walk-forward workers retrain a new AI/ML predictive model, it is prohibited from immediately taking control of live trading recommendations. Instead, it enters **Shadow Mode**—an automated probationary testing period where it calculates predictions silently in the background alongside our active production model for **14 days**. Only if the new shadow model statistically proves a superior forward win-rate accuracy over those 14 days will the controller authorize its official switch into active production.
- **Rolling Information Coefficient (IC) Tracking**: Calculates daily Spearman rank correlations between composite momentum scores and actual subsequently realized price returns across the universe, guaranteeing signal edge persistence ($IC > 0.03$).
- **Quintile Spread Monotonicity Audit**: Monthly automated test sorting all scored equities into 5 quintile buckets to mathematically verify that Quintile 5 (top momentum ranks) monotonically outperforms Quintile 1 (laggard ranks).

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

---

## 6. Database Schema Core Entities

- `User`: Manages analyst identities, encrypted passwords, and session authentication.
- `Company`: Primary entity storing stock metadata (Ticker, Name, Purpose, Upcoming Date), immediate closing pricing, 4-quarter fundamental snapshots, normalized health grades, and Point-in-Time timestamps (`known_at`, `period_end`).
- `EarningsReport`: Historical ledger of past quarterly earnings events with strict publication lag timestamps.
- `Prediction`: Directional confidence scoring and statistical probability estimates.
- `EventStudyResult`: Holds empirical backtested performance metrics (Pre-announcement drift %, announcement gap %, post-announcement return trajectories).
- `StrategyBacktest`: Logs quantitative event strategies (A–F) and rolling momentum simulations, recording exact win rates, expected values, profit factors, drawdown profiles, and total net trades executed.
- `MomentumSignal`: Persists multi-factor composite ranks (Technical, Fundamental, Smart Money, Derivatives, Regime), ML gain probability calibrations ($P(\text{gain, 3d/5d/10d})$), volatility stop losses, attention anomaly flags, and point-in-time timestamps.
- `DailyBhavcopy`: Stores official EOD exchange records including trade date volume, closing prices, and precise T+1 Delivery Percentages.
- `BulkBlockDeal`: Archives large institutional regulatory transaction disclosures (Bulk/Block deals) to gauge professional capital bias.
- `SurveillanceWatchlist`: Registry of equities actively listed under SEBI/NSE ASM, GSM, or circuit breaker trading exclusions.
- `ScorePredictionLog`: Point-in-time historical audit ledger logging daily composite scores and multi-horizon gain predictions alongside subsequently realized 3d/5d/10d forward returns for IC verification and shadow model evaluation.
- `TechnicalSnapshot`: Point-in-time snapshot of technical trading indicator oscillators.
- `AIAnalysisReport`: Persisted storage for LLM-generated qualitative analytical narratives, news catalyst sentiments, and markdown commentary.

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

### 7.4 Modifying Database Schema & GraphQL Types
When extending backend models or adding new analytical fields:
1. Update the SQLAlchemy model class definitions in `backend/app/infrastructure/models.py`.
2. Generate and run Alembic database migrations (or execute DDL schema modifications against Postgres).
3. Expose the new attributes within the corresponding Strawberry GraphQL schema definition in `backend/app/graphql/types.py`.
4. Update resolver functions in `backend/app/graphql/queries.py` or mutation handlers in `backend/app/graphql/mutations.py`.
5. On the frontend, update your Apollo Client query definitions in `frontend/src/pages/Home.tsx` or `CompanyDetail.tsx`, ensuring `fetchPolicy: 'network-only'` is utilized when pulling real-time background worker tasks.

---

## 8. Git Maintenance & Branch Status
The local repository is connected to the upstream remote `origin` (`main` branch). All UI/UX density refinements, interactive click-only tooltip behaviors, unified earnings pivot number lines, Multi-Factor Momentum & Attention Scanners (Phases 1–5), multi-horizon ML probability pipelines, native NSE Bhavcopy T+1 delivery parsing, regulatory surveillance filtering, Portfolio Risk Engine with Emergency Kill Switch (-15% drawdown limit), and the 14-Day Shadow Model Probationary verification suite have been fully incorporated into the active containerized deployment branch.
