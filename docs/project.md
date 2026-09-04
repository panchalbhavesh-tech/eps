# QEPS - Quantitative Earnings Prediction & Analytics Dashboard

## 1. Project Overview

QEPS (Quantitative Earnings Prediction System) is a full-stack, containerized quantitative finance application designed to track, model, and evaluate upcoming earnings fixtures across the National Stock Exchange of India (NSE). The platform ingests earnings calendars, fetches historical financial data (via an Upstox-powered Parquet Data Lake and Yahoo Finance), executes event studies and strategy backtesting using Python quantitative libraries, and integrates with Google Gemini AI to assemble equity research reports.

Analytics are delivered via a React dashboard featuring custom financial visualizers, continuous timeline number lines, scorecards, real-time task pipeline surveillance, interactive sentiment drawers, and dual visual themes (Institutional Light / Trading Floor Dark).

---

## 2. System Architecture & Docker Infrastructure

The platform implements a containerized microservices architecture orchestrated via **Docker Compose**:

- **frontend**: React 19 + TypeScript single-page application bundled with Vite (Accessible on Port 80 via Nginx proxy).
- **backend**: Python 3.12 FastAPI application hosting a Strawberry GraphQL API layer (Internal Port 8000).
- **worker (`qeps_worker`)**: Asynchronous Celery execution engine dedicated to intensive scraping, financial data population, quantitative modeling, and LLM communication.
- **scheduler (`qeps_scheduler`)**: Celery Beat cron daemon for routine scheduled data synchronization.
- **nginx**: Alpine-based Nginx reverse proxy managing client requests and upstream route distribution.
- **postgres**: Relational PostgreSQL DBMS storing historical fundamental snapshots, user credentials, live intraday quotes, and event backtest logs (Port 5432).
- **redis**: In-memory data broker facilitating Celery task queueing and result buffering (Port 6379).

### Decoupled Data Ingestion (`data_harvester/`)
Market data ingestion has been decoupled from the FastAPI backend to ensure performance and isolation. A standalone Python script running via native Linux `cron` extracts market data via the Upstox API:
1. **Intraday State (PostgreSQL):** Fetches live quotes every 15 minutes and upserts them into the PostgreSQL `live_quotes` table.
2. **Historical Data (Parquet):** Fetches End-Of-Day (EOD) OHLCV candles and appends them to a high-speed Parquet Data Lake.

---

## 3. Core Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Apollo GraphQL Client, Material UI (MUI v5).
- **Backend Framework**: FastAPI, Uvicorn, Strawberry GraphQL, SQLAlchemy 2.0.
- **Task Orchestration**: Celery, Redis.
- **Database**: PostgreSQL.
- **Data & Quantitative Processing**: `pandas`, `pandas-ta`, `numpy`, `yfinance`, Scikit-learn (LightGBM, XGBoost, SHAP).
- **AI/LLM**: Google Gemini API (`AIAnalystService`).
- **Authentication**: JWT (`python-jose`), bcrypt.

---

## 4. Architectural Feature Modules

### 4.1 Frontend Dashboard: Raw Codebase Implementation Logic
The following breaks down the exact execution flow from the frontend interfaces down to the background workers and data processing services, based strictly on the implemented code logic.

#### **1. Momentum Scanner**
- **Description:** This page serves as a high-speed, cross-sectional equities scanner. It continuously monitors the entire market to identify stocks with the strongest upward or downward momentum, factoring in the overall health of the broader market to adjust its risk posture dynamically.
- **Frontend Logic:** Polls for updated momentum data every 15 seconds, displaying generated trade signals alongside a global market regime status.
- **Backend Task:** Triggered via a background momentum scan worker task: `run_nse_momentum_scan_task`.
- **Backend Logic**:
  - Fetches the active trading universe.
  - Implements a liquidity filter, dropping stocks where Average Daily Value (ADV) is below a strict threshold (`ADV < 500,000`).
  - Computes technical indicators (moving averages, RSI, ADX), retrieves the latest fundamental snapshot (ROE, PE, Debt-to-Equity), and pulls native delivery percentages (`SMA: 50/200 period, RSI: 14 period, ADX: 14 period, Delivery Pct = NSE Bhavcopy T+1`).
  - Applies a cross-sectional percentile ranking for every factor across the valid universe, meaning stocks are scored relative to their peers rather than using absolute thresholds (`Rank = Percentile[0-1] * 100, Method = Average`).
  - Calculates a dynamic regime score based on the benchmark index's distance from its 200-day moving average (`Regime Score = 50 + (Market Score * 200DMA Direction) / 2`).
  - Aggregates rankings via a dynamic weight learning service into a composite score. If the score drops below 40, an EXIT signal is generated; if it crosses 70, a BUY signal is generated (`Score < 40 = EXIT, Score >= 70 = BUY`). 
  - Calculates the optimal position size percentage and stop loss price directly using the stock's Average True Range volatility metric (`Stop Loss = Price - (ATR * 2), Risk = (Price - StopLoss)/Price, Weight = (1% / Risk) bounded 2-20%`).

#### **2. Company Detail**
- **Description:** A comprehensive tear-sheet for individual assets. It functions as an automated institutional analyst, instantly compiling financial data, event studies, and technicals into a readable qualitative report without requiring manual spreadsheet modeling.
- **Frontend Logic:** Renders a multi-tab data interface. A primary action button triggers a deep research analysis request.
- **Backend Task:** Triggers the deep research report generation worker: `generate_deep_research_report_task`.
- **Backend Logic**:
  - The worker retrieves the raw company attributes (valuation ratios, return metrics, and quarterly revenue/profit figures) (`Features: pe_ratio, roe, debt_to_equity, q1_eps`).
  - It serializes this data and passes it to an AI Analyst service.
  - The Large Language Model is prompted to return a strictly structured document containing a Risk Assessment Matrix and an explicit Financial Health Score (`JSON Schema Validation: Risk Matrix + Health Score [0-100]`).
  - The backend deletes any existing analysis report for the company, inserts the newly generated report, and immediately updates the numerical financial health score on the primary company record (`Score Range: 0-100`).

#### **3. Hypothesis Laboratory**
- **Description:** A rigorous Quantitative Hypothesis Lifecycle Engine designed to test custom mathematical trading formulas. It prevents "lucky" strategies from losing real money by subjecting them to extreme statistical validation before allowing them to trade live.
- **Frontend Logic:** Fetches existing hypotheses and live trade signals. Includes an interface to submit a mathematical alpha expression for evaluation.
- **Backend Task:** Executes single hypothesis evaluation and live signal generation tasks: `evaluate_single_hypothesis_task`, `generate_live_signals_task`.
- **Backend Logic**:
  - **Parsing:** Uses abstract syntax tree parsing to safely convert user-submitted mathematical strings into vectorized data operations (`Parser = ast.parse(mode='eval') -> Pandas Vectorized Ops`).
  - **DSR Calculation:** To validate the formula against historical data, it calculates the Deflated Sharpe Ratio. This function explicitly penalizes the classic Sharpe ratio for multiple testing variance (tracking total trials), skewness, and excess kurtosis to prevent false discoveries (`DSR = CDF(((SR - E(MaxSR)) * sqrt(T-1)) / sqrt(1 - Skew*SR + (Kurt-1)/4 * SR^2))`).
  - **PBO Calculation:** Evaluates the Probability of Backtest Overfitting via Combinatorial Symmetric Cross-Validation, splitting the historical returns array into multiple distinct blocks to verify out-of-sample robustness (`Block Count = 16`).
  - **Live Signal Generation:** For hypotheses that pass validation and enter the live stream stage, a worker pulls live 5-minute intraday market data, evaluates the validated expression against the live frame, and commits exact buy/sell signal records into the database.

#### **4. Catalyst Radar**
- **Description:** A high-frequency event feed that tracks breaking corporate news. It cuts through market noise by automatically grading the severity of announcements and tracking how quickly the market prices in the new information.
- **Frontend Logic:** Continuously polls the event feed endpoint for new corporate announcements.
- **Backend Task:** Powered by a live catalyst scanning cron job: `scan_nse_catalysts_live_task`.
- **Backend Logic**:
  - Attempts to fetch announcements from a primary exchange source to bypass blocking, falling back to a secondary exchange on failure.
  - Performs fuzzy deduplication on broadcast timestamps and announcement subjects to prevent spam (`Rule: difflib SequenceMatcher Similarity > 0.85 within 7-day lookback`).
  - Executes a pattern search against a vast whitelist (acquisitions, defaults, litigation, etc.) and a blacklist (annual reports, routine compliance) (`Regex Match: whitelist keywords NOT in blacklist`).
  - If a ticker parsed from the announcement doesn't exist in the database, it automatically creates a new company record.
  - Batches valid events to an AI service for materiality grading, assigning impact tiers (`S-TIER, A-TIER, B-TIER`).
  - Queries historical pricing data to calculate the gap reaction percentage and session reaction percentage, measuring the immediate market response to the event (`Gap Reaction = (Open_T0 - Close_T-1) / Close_T-1`).

#### **5. Home / Earnings Screener**
- **Description:** The primary watchboard for tracking upcoming earnings fixtures. It helps users quickly identify which companies are reporting soon and gauges the immediate news sentiment surrounding them.
- **Frontend Logic:** Queries the active companies list, rendering data grid rows and calculating the "Days Until Earnings" countdown locally (`Days Until = Target Date - Current Date`). A specialized cell monitors when it enters the user's viewport to lazy-load external news sentiment, bypassing the main graph API.
- **Backend Task:** A global "Mass Calculate" action triggers a worker that iterates over the universe to sequentially regenerate AI financial health scores: `mass_calculate_financial_health_task`.
- **Backend Logic**:
  - The sentiment analyzer makes a direct REST call to fetch recent headlines for the specific ticker.
  - It calculates a bullish/bearish ratio based strictly on the text sentiment of those recent headlines (`Ratio = Bullish Articles / Total Articles`).

#### **6. Task Pipeline Surveillance**
- **Description:** A diagnostic command center for the background processing engine. It allows administrators to watch the system run in real-time and instantly identify why a specific data scrape or ML model failed.
- **Frontend Logic:** Polls the background jobs and worker status endpoints every few seconds.
- **Backend Task:** Queries current worker states: `celery_app.control.inspect()`.
- **Backend Logic**:
  - Performs direct reads from the background job database table, which is asynchronously updated by pre-run and post-run task hooks.
  - Exposes raw execution errors. If a task fails, the UI dynamically changes row styling and dumps the exact system error traceback directly into the interface for immediate debugging (`Status == 'FAILED' -> Show Traceback`).

### 4.2 Backend Data Services
- **Unified Data Manager (`UnifiedDataManager`)**: Centralized data access layer that natively reads from the Upstox Parquet Data Lake for high-speed OHLCV queries, dynamically falling back to `yfinance` if data is missing or out of bounds.
- **NSE Service (`NSEService`)**: Web scraper module to fetch upcoming earnings calendars directly from the official NSE website.
- **Discord Notifier (`DiscordNotifier`)**: Alert service to dispatch real-time momentum signals and high-impact catalyst events directly to designated Discord Webhooks.

### 4.3 Automated Celery Workflows
Background tasks are mapped via `task_mappings.py` and processed in `tasks.py`. Key workflows include:
- `sync_nse_calendar_task`: Daily sync of upcoming corporate results.
- `populate_companies_data_task`: Bulk extraction of quarterly financial statements.
- `mass_calculate_financial_health_task`: Iterates across tickers to compute and normalize health scores.
- `run_nse_momentum_scan_task`: Evaluates multi-factor momentum indicators across the equities universe.
- `generate_deep_research_report_task`: Synthesizes algorithmic metrics with Google Gemini to generate qualitative reports.
- `evaluate_single_hypothesis_task` / `run_automated_hypothesis_research_task`: Quantitative factor formulation and statistical significance evaluation.

---

## 5. Database Schema & Core Entities

The PostgreSQL schema is managed via SQLAlchemy ORM. The following details the precise table definitions, primary data columns, and relational constraints.

### Core Domain Entities
- **Company** (`companies`)
  - **Definition**: The primary root entity representing a tradable asset. It stores static metadata (Ticker, Name), dynamically updated EOD pricing, aggregated point-in-time fundamental snapshots (ROE, PE, D/E), and quarterly revenue/profit matrices.
  - **Relations**: Acts as the master foreign key root for `EarningsReport`, `EventStudyResult`, `StrategyBacktest`, `TechnicalSnapshot`, `AIAnalysisReport`, `MomentumSignal`, `ScorePredictionLog`, and `CatalystEvent`. All relations enforce `cascade="all, delete-orphan"`.
- **EarningsReport** (`earnings_reports`)
  - **Definition**: Ledger of historical quarterly earnings events. Tracks `eps_estimate`, `eps_actual`, `yoy_revenue_growth`, and parsed `management_guidance`.
  - **Relations**: `Many-to-One` with `Company`.
- **DailyBhavcopy** (`daily_bhavcopy`)
  - **Definition**: High-speed materialized table storing End-Of-Day OHLCV quotes and exchange-native `delivery_pct`. Enforces a unique constraint on `(ticker, trade_date)`.
- **SurveillanceWatchlist** (`surveillance_watchlist`)
  - **Definition**: Tracks regulatory restrictions (`ASM`, `GSM`, `CIRCUIT_FROZEN`) to automatically gate and exclude restricted stocks from the active trading universe.

### Quantitative & Algorithmic Entities
- **MomentumSignal** (`momentum_signals`)
  - **Definition**: Persists point-in-time cross-sectional ranks. Stores `technical_score`, `fundamental_score`, `composite_score`, `signal` (BUY/EXIT), calculated `confidence`, `stop_loss_price`, and algorithmic `position_size_pct`.
  - **Relations**: `Many-to-One` with `Company`.
- **ScorePredictionLog** (`score_prediction_logs`)
  - **Definition**: Evaluation tracking for the Multi-Horizon ML models. Stores point-in-time inferred probabilities (`prob_gain_3d`, `prob_gain_5d`, `prob_gain_10d`) alongside the actually `realized_5d_return` for ongoing model drift monitoring.
  - **Relations**: `Many-to-One` with `Company`.
- **TechnicalSnapshot** (`technical_snapshots`)
  - **Definition**: Snapshot of the stock's technical state. Stores `imm_support`, `maj_resistance`, `dma_50`, `dma_200`, `rsi`, `adx`, and `vwap_position`.
  - **Relations**: `Many-to-One` with `Company`.
- **EventStudyResult** (`event_studies`)
  - **Definition**: Statistical post-earnings drift and gap analysis metrics. Tracks `gap_pct`, `volume_change_pct`, forward returns (`ret_1d` to `ret_30d`), and Cumulative Abnormal Returns (`car_30d`, `car_pvalue`).
  - **Relations**: `Many-to-One` with `Company` and `EarningsReport`.

### Hypothesis Testing (Quant Lab)
- **ResearchHypothesis** (`research_hypotheses`)
  - **Definition**: Stores institutional quantitative factors and their lifecycle state. Tracks the raw `alpha_expression` (e.g. `rank(volatility_20)`), `economic_mechanism`, and `current_stage`.
  - **Relations**: `One-to-Many` with `HypothesisExperiment`.
- **HypothesisExperiment** (`hypothesis_experiments`)
  - **Definition**: The empirical evaluation results of a hypothesis. Stores critical statistical viability metrics including `total_trials_in_family`, `classic_sharpe`, `deflated_sharpe`, `pbo` (Probability of Backtest Overfitting), and `turnover_decay_penalty`.
  - **Relations**: `Many-to-One` with `ResearchHypothesis` (enforces `ondelete="CASCADE"`).

### Catalyst & Event Pipeline
- **CatalystEvent** (`catalyst_events`)
  - **Definition**: High-frequency corporate announcements. Tracks `event_title`, `impact_score`, AI-assigned `tier` (S/A/B/C), and calculated immediate market response (`gap_reaction_pct`, `session_reaction_pct`).
  - **Relations**: `Many-to-One` with `Company`, `One-to-Many` with `CatalystSource`.
- **CatalystPipelineRun** (`catalyst_pipeline_runs`)
  - **Definition**: Pipeline observability ledger. Logs every execution scan, tracking `raw_fetched`, `keyword_filtered`, `duplicates`, `ai_rejected`, and total `execution_time_ms` for health monitoring.

### Administrative Entities
- **User** (`users`): Manages identities via `email` and `hashed_password`.
- **BackgroundJob** (`background_jobs`): Traceability for Celery async execution. Stores `celery_task_id`, `status` (QUEUED, RUNNING, FAILED), and `error_message`.

---

## 6. Developer Reference

### 6.1 Local Container Execution
To boot the full multi-container deployment locally:
```bash
# Start all containers in detached mode
docker compose up -d

# Rebuild images after updating requirements.txt or package.json
docker compose up --build -d
```

### 6.2 Port Mapping Reference
- **Frontend Dashboard**: `http://localhost` (proxied via Nginx)
- **GraphQL Interactive Console (GraphiQL)**: `http://localhost/api/graphql` (accessible directly on `http://localhost:8000/graphql` internally)
- **PostgreSQL Port (Host access)**: `localhost:5432`
- **Redis Broker Port**: `localhost:6379`

### 6.3 Worker Reload Rules
> [!IMPORTANT]
> Celery background worker processes (`qeps_worker`) do **NOT** automatically hot-reload when modifications are made to Python source code in `backend/app/worker/tasks.py` or associated analytical services.
> 
> Whenever you modify task logic, you **MUST** manually restart the worker container:
> ```bash
> docker compose restart qeps_worker
> ```

### 6.4 Modifying Database Schema & GraphQL Types
When extending backend models or adding new analytical fields:
1. Update the SQLAlchemy model class definitions in `backend/app/infrastructure/models.py`.
2. Generate and run Alembic database migrations.
3. Expose the new attributes within the corresponding Strawberry GraphQL schema definition in `backend/app/graphql/types.py`.
4. Update resolver functions in `backend/app/graphql/queries.py` or mutation handlers in `backend/app/graphql/mutations.py`.
5. On the frontend, update your Apollo Client query definitions and ensure `fetchPolicy: 'network-only'` is utilized when pulling real-time background worker tasks.
