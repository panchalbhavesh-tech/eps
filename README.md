# QEPS - Quantitative Earnings Prediction System

QEPS is a full-stack, containerized quantitative analytics and surveillance platform for NSE-listed equities. It provides automated financial modeling, algorithmic strategy backtesting, technical indicator calculation, and AI-driven sentiment analysis.

## Core Features
- **High-Density Dashboard:** React-based terminal UI with dual themes (Institutional Light / Trading Floor Dark).
- **Data Ingestion:** Standalone Upstox Data Harvester persisting OHLCV to a Parquet Data Lake and live quotes to PostgreSQL.
- **Quantitative Engine:** Multi-factor momentum scanning, dynamic financial health scoring, and hypothesis lifecycle management.
- **Asynchronous Workflows:** Robust Celery/Redis background task orchestration.
- **AI Integration:** Automated institutional research report generation powered by Google Gemini.

## System Architecture
The application is orchestrated entirely via **Docker Compose**:
- **Frontend:** React (Vite), TypeScript, Apollo Client, Material UI.
- **Backend:** Python, FastAPI, Strawberry GraphQL, SQLAlchemy.
- **Workers:** Celery & Celery Beat for task execution and scheduling.
- **Data Stores:** PostgreSQL, Redis, and Parquet (Data Lake).

## Getting Started

### 1. Prerequisites
- Docker and Docker Compose installed.

### 2. Environment Configuration
Create a `.env` file in the root directory based on `.env.example`. Key variables:
```env
POSTGRES_USER=qeps_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=qeps_db
DATABASE_URL=postgresql://qeps_user:your_password@postgres:5432/qeps_db
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_google_gemini_key

# Optional: Discord Alerts
DISCORD_ALERTS_ENABLED=true
DISCORD_TRADING_WEBHOOK_URL=your_webhook_url
```

### 3. Running the Stack
Launch the full platform using Docker Compose:
```bash
docker compose up -d --build
```
- **Dashboard:** Access via `http://localhost`
- **GraphQL API:** Access via `http://localhost/api/graphql`

### 4. Data Harvester Setup
Market data ingestion runs independently of the main API via the `data_harvester` script.
- Requires `UPSTOX_ACCESS_TOKEN` (1-Year Analytics Token) in your `.env`.
- Deploy via native Linux `cron` to capture intraday snapshots and end-of-day OHLCV. See [data_harvester/README.md](data_harvester/README.md) for detailed setup instructions.
