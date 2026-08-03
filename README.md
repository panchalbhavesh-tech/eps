# Quantitative Earnings Prediction System (QEPS)

**QEPS** is an enterprise-grade quantitative analytics, algorithmic surveillance, and institutional research platform engineered for stocks listed on the National Stock Exchange of India (NSE). It combines real-time historical financial statement extraction, quantitative event study modeling around earnings announcement dates, continuous number line timeline tracking with central release pivots, interactive normalized scorecard evaluations, and automated LLM analyst research report generation via Google Gemini.

The platform is designed around a high-performance **Institutional Trading Terminal Interface** featuring dual **Trading Floor Dark** and **Institutional Light** aesthetic themes, optimized for ultra-dense screening across up to **885+ NSE equities natively monitored**.

---
### https://chatgpt.com/share/6a701127-7ca4-83ee-be57-74540d19eab3
### ✨ Institutional Features & Frontend Trading Terminal Infrastructure

#### 🖥️ Next-Gen Visual Architecture & Theme Engine
- **Dynamic Institutional Theme Engine (Light / Dark Mode)**: Built upon a high-speed React `ThemeContext` providing instant toggling between two expertly color-calibrated design systems:
  - ☀️ **Institutional Light (Morningstar / Bloomberg Professional)**: Clean neutral paper slate (`#ffffff`), executive typography, and high-contrast numerical tracking for daytime equity analysis.
  - 🌙 **Trading Floor Dark (Dark Quant Terminal)**: Deep cyber-slate backdrop (`#0b0f19`), neon emerald positive drift accents (`#3dffa2`), crimson drawdown highlights, and smooth glassmorphic container shading designed for extended quant surveillance sessions.
- **Ultra-Dense Terminal DataGrids**: Specialized DOM-virtualized tables (`@mui/x-data-grid`) engineered for zero-latency presentation of our full **885+ NSE equities universe**. Features borderless interior cell structures, uppercase tracking headers, tabular monospaced numbers, and subtle semantic row tints for automated anomaly recognition without visual fatigue.

#### ⚡ Events Dashboard & Financial Screening (`/`)
- **Ergonomic 2-Line Company & Ticker Layout**: Designed via a safe incremental architecture featuring **48px row heights** to eliminate text clipping and present a high-contrast sticky leftmost column:
  - **Line 1**: Full corporate entity name (e.g., *Websol Energy System Limited*).
  - **Line 2**: Muted ticker symbol + exchange identifier (e.g., *WEBSOLAR NSE*).
- **Streamlined Metric Visibility**: Immediate execution metrics (Current Price, Market Cap, Upcoming Earnings Calendar, 7-Day Target Drift %, and Normalized Health Scorecards) remain instantly scannable without horizontal scrolling or losing sidebar statistics.
- **Dedicated Quarterly Financial Suite**: Positioned at the trailing right of the screener, presenting interactive multi-quarter performance sub-cards (Q1 to Q4 Revenue, Net Profit, and Diluted EPS) complete with real-time QoQ directional percentage change indicators (`▲ +X%` / `▼ -Y%`).

#### 📡 Multi-Factor Momentum & Attention Scanner (`/momentum`)
- **Full NSE Equities Universal Tracking**: Monitors the entire Nifty 500 and broader NSE stock universe natively within an upgraded **64px row-height DataGrid**, removing the need for ad-hoc custom lookup banners in favor of continuous real-time market surveillance.
- **Market Regime Alignment & Structural Header**: Displays real-time macro health of the **Nifty 50 (`^NSEI`) benchmark**, categorizing market structure into distinct regime states (Bullish Expansion, Neutral Consolidation, or High-Volatility Contraction) to contextualize individual equity signals.
- **5-Pillar Orthogonal Factor Visualization**: Renders real-time micro-visualizations (`FactorBarChart`) dissecting each equity's Composite Momentum Score into five decoupled dimensions:
  1. **Technical Strength**: Breakout velocity, EMA ribbon alignment, and RSI momentum.
  2. **Fundamental Quality**: ROE consistency and debt-to-equity resilience.
  3. **Smart Money Accumulation**: Institutional block order flows and volume delta persistence.
  4. **Derivatives Structure**: Options implied volatility (IV) skews and Open Interest dynamics.
  5. **Regime Alignment**: Relative structural beta vs. benchmark indexes.
- **Action Signals & Confidence Ratings**: Emits explicit quantitative execution directives (`BUY MOMENTUM`, `WATCHLIST`, `EXIT / WEAK`, or `NEUTRAL`) backed by automated machine learning probability confidence scores (`confidence %`) and volatility-adjusted stop-loss risk sizing.
- **Anomaly Attention Alerts**: Automatically isolates equities requiring urgent analyst intervention due to unnatural trading activity (e.g., daily volume $>2\times$ 20DMA, implied volatility spikes, or impending earnings releases within $\le 7$ days).

#### 🧮 Quantitative AI, Behavioral Matrix & Risk Defense
- **Interactive Behavioral Matrix & Deep Analytics Deck (`SocialSentimentCard`)**:
  - **Clickable Quant Cards**: 3-column deck evaluating **News Sentiment Score**, **Reddit Forum Velocity (FOMO Index)**, and **Smart Money Divergence** with interactive hover elevation and `"Analyze →"` prompts.
  - **Edge-to-Edge Terminal Grid Row Drawers**: Clicking any card slides open a zero-padding right-hand analytical panel where explainer banners, calculation code boxes, and intelligence feeds extend wall-to-wall without rounded borders or side margins.
  - **Mathematical Methodology & Time Decay**: Details source authority weightings, exponential 24-hour time decay ($\lambda$), emoji hype vs. financial rhetoric density, and verified custodial delivery (>65%) absorption ratios.
  - **Actionable Intelligence Feed with Clickable Navigation**: Synthesizes 10 live institutional press reports, 6 retail forum threads (`r/IndianStreetBets`, `r/IndiaInvestments`), and 5 Smart Money block deal signatures. Features live item counter badges, sentiment flag tags positioned in the top-right corner opposite headlines, and source/timestamp lines placed directly underneath headlines equipped with an external link affordance (`OpenInNewIcon`) that opens live search queries in a new browser tab upon clicking.
- **High-Performance GraphQL & Database Caching Engine**: Eradicates dashboard loading bottlenecks across Events and Momentum pages by leveraging SQLAlchemy batch relationship eager-loading (`selectinload`), memoized in-memory sector statistical caching (`momentum_cache_service.py`) with thread-safe atomic swaps, and optimized GraphQL payload projections for sub-second page rendering.
- **Native NSE Bhavcopy & Surveillance Watchlists**: Daily automated background ingestion of official NSE EOD Delivery Percentages (T+1), institutional Bulk/Block Deal directions, and automatic filtering of equities placed on SEBI Additional & Graded Surveillance Measure (ASM/GSM) rosters.
- **Institutional Portfolio Risk Engine & Emergency Kill Switch**: Automated continuous drawdown monitoring that trips an **Emergency Algorithmic Kill Switch** if simulated system trailing losses cross **-15.0%**, instantly terminating all new directional BUY signals across the app. Enforces a 15 concurrent long position cap, a 30% maximum industry sector concentration limit, correlation gating against existing holdings, and a 3-day pre-earnings blackout buffer.
- **Validation Suite & 14-Day Shadow Model Probation**: Real-time statistical verification tracking rolling Spearman Information Coefficients ($IC > 0.03$) and monthly quintile return monotonicity. Enforces a mandatory **14-Day Shadow Model Probationary Period ("Shadow Mode")** where newly retrained machine learning models run silently in background evaluation for two weeks before promotion to active production.
- **Multi-Horizon ML & AI Catalyst Pipelines**: Incorporates LightGBM/XGBoost for calibrated multi-horizon directional gain probabilities ($P(\text{gain, 3d/5d/10d})$), PCA sequence trajectory matrix embeddings, SHAP feature attribution logs, PSI drift tracking, and Google Gemini LLM qualitative news sentiment synthesis.
- **Intensive Strategy & Momentum Backtesting Engine**: Executes precision multi-year historical walk-forward backtests on real NSE data, applying an automated **0.20% round-trip Indian transaction cost reduction** (STT, Stamp Duty, Brokerage, GST, and Slippage). Reports accurate Expected Value (EV), Profit Factor, Sharpe/Sortino Ratios, and Nifty 50 Benchmark Alpha directly on an interactive UI dashboard modal and via automated Docker batch suites.
- **Async Worker Task Surveillance Suite (`/tasks`)**: Live Celery pipeline monitoring dashboard showing execution timings, success rate KPIs, automated 5000ms GraphQL synchronization, and inspectable exception traceback drawers.

---

## 🚀 Universal Setup Guide (Windows, macOS, Linux, WSL)

Because the entire application stack is fully containerized using **Docker Compose**, running QEPS on any operating system requires zero local Python, Node.js, or PostgreSQL installations.

### 1. Prerequisites
- **Docker Desktop** installed and running on Windows or macOS (Apple Silicon M1/M2/M3 & Intel natively supported), or **Docker Engine + Docker Compose Plugin** on Linux/WSL2.
- **Git** (to manage or clone the repository).

---

### 2. Quick-Start Instructions

#### Step 1: Navigate to the Project Root
Open your terminal (PowerShell, Command Prompt, macOS Terminal, or Linux bash) and enter the repository folder:
```bash
cd "/path/to/Eps"  # Adjust path to your workspace directory
```

#### Step 2: Configure Environment Variables
Copy the starter template `.env.example` to create your working `.env` configuration file:

- **macOS / Linux / Windows WSL / Git Bash:**
  ```bash
  cp .env.example .env
  ```
- **Windows (Command Prompt / PowerShell):**
  ```powershell
  copy .env.example .env
  ```

> [!NOTE]
> **Optional API Keys:** Open `.env` in any text editor if you wish to configure real AI Research synthesis:
> - `GEMINI_API_KEY`: Add your Google Gemini API key to enable automated quantitative LLM reports.
> - `DATABASE_URL` & PostgreSQL credentials default to pre-configured values that instantly work within the Docker network.

#### Step 3: Launch the Container Ecosystem
Build and start all 8 microservices (Frontend, Backend API, Postgres Database, Redis Broker, Celery Worker, Celery Scheduler, Nginx Proxy, and pgAdmin) in detached mode:
```bash
docker compose up --build -d
```
*Note: On the very first launch, Docker will download base alpine images, construct Python packages (SQLAlchemy, Pandas, Celery, LightGBM), and bundle React/Vite dependencies. This takes ~2–5 minutes depending on internet speed.*

#### Step 4: Access the Platform
Once Docker finishes building and displays `Container Started / Healthy`, open your web browser and navigate to:
👉 **[http://localhost](http://localhost)**

---

## 🌐 Active Services & Port Map

| Service Name | Local Endpoint / URL | Authentication & Notes |
| :--- | :--- | :--- |
| **QEPS Web Dashboard** | `http://localhost` | Served via Alpine Nginx Reverse Proxy (Port 80). Features dynamic Light & Dark mode switching. |
| **GraphQL API / Console** | `http://localhost/graphql` or `http://localhost:8000/graphql` | Interactive GraphiQL console for querying stocks & event metrics. |
| **pgAdmin Database GUI** | `http://localhost:5050` | Login Email: `admin@example.com`<br>Password: `admin` |
| **PostgreSQL Database** | `localhost:5432` | User: `qeps_user` \| DB: `qeps_db` \| Pass: `qeps_password` |
| **Redis Cache Broker** | `localhost:6379` | In-memory message store for Celery task queues and real-time worker logs. |

---

## 🛠️ Essential Commands & Operation Guide

### Checking Container Health Status
To confirm that all microservices and health checks are running properly:
```bash
docker compose ps
```

### Viewing Live Terminal Logs
To inspect system execution, API routing, or data extraction progress:
```bash
# View logs across all services
docker compose logs -f

# View logs specifically for the async Celery background worker
docker compose logs -f worker
```

### Critical Note on Background Workers (`worker`)
> [!IMPORTANT]
> The asynchronous Celery background worker (`qeps_worker`) does **NOT** auto-reload on code modifications. Whenever you add or edit Python source code in `backend/app/worker/tasks.py` (such as mass calculation tasks or scraper functions), **you must manually restart the worker service**:
```bash
docker compose restart worker
```

### Rebuilding After Dependency Modifications
If you install new packages in `requirements.txt` (Python) or `package.json` (Node/React), run:
```bash
docker compose up --build -d
```

### Running the Intensive Historical Backtest Suite in Docker
To run batch quantitative strategy simulations and measure Sharpe ratios, win rates, and Nifty 50 alphas net of real-world Indian trading costs across your stock list:
```bash
# Execute a 3-year evaluation across up to 50 equities
docker compose exec -T backend python run_backtest_suite.py --limit 50 --years 3

# Export detailed simulation results to a JSON research report
docker compose exec -T backend python run_backtest_suite.py --limit 100 --years 5 --export-json /app/reports/nifty_backtest_summary.json
```

### Shutting Down the Project
To stop all running services without deleting your database records:
```bash
docker compose down
```
To stop the stack and **cleanly erase all data volumes** (resetting the database and pgAdmin config to a pristine state):
```bash
docker compose down -v
```

---

## 📚 Further Architecture Documentation

For deep dives into internal data structures, dual-theme visual design system specs, multi-factor momentum scoring models, ML gain calibration, financial scorecard normalization algorithms, interactive click-only formulas, edge-to-edge terminal sentiment drawers, in-memory GraphQL query optimization, unified earnings pivot timelines, and Strawberry GraphQL schema designs, refer to our primary system specification:
📖 **[project.md](project.md)**
