# QEPS - NSE Earnings Prediction & Analytics Dashboard

## 1. Project Overview

QEPS (Quantitative Earnings Prediction System) is a full-stack, containerized web application designed to track and analyze upcoming earnings fixtures for companies listed on the National Stock Exchange of India (NSE). The platform scrapes earnings calendars, fetches historical financial data from Yahoo Finance, performs deep quantitative event studies and strategy backtesting via `pandas`, and integrates with the Google Gemini AI to generate comprehensive 11-section analyst reports. All insights are visualized on a premium, dark-themed dashboard.

## 2. Architecture & Infrastructure

The project is built using a microservices-inspired architecture, orchestrated completely via **Docker Compose**. It consists of 7 interconnected services:

- **frontend**: The Vite/React client application.
- **backend**: The FastAPI application serving the GraphQL API.
- **worker**: The Celery background worker for heavy tasks (data scraping, EPS population).
- **scheduler**: The Celery Beat scheduler for recurring tasks (e.g., daily NSE calendar sync).
- **nginx**: A reverse proxy that routes traffic to the frontend and backend.
- **postgres**: The PostgreSQL database.
- **redis**: The Redis instance used as a Celery message broker and result backend.
- **pgadmin**: A web interface for managing the PostgreSQL database.

## 3. Technology Stack

### Frontend (Client-Side)
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **API Client**: Apollo GraphQL Client (`@apollo/client`)
- **Styling & UI**: Material UI (MUI v5) and `@mui/x-data-grid`
- **Routing**: React Router DOM
- **Aesthetic**: Custom sleek dark mode with premium color palettes, glassmorphism hints, and custom chips for data visualization.

### Backend (Server-Side)
- **Framework**: FastAPI (Python 3.12)
- **Server**: Uvicorn
- **API Standard**: GraphQL via **Strawberry** (`strawberry-graphql`)
- **Database ORM**: SQLAlchemy 2.0 with Alembic for migrations
- **Background Tasks**: Celery + Redis
- **Quantitative Engine**: `pandas` and `pandas-ta` for technical analysis, strategy backtesting, and forward-return event studies.
- **Data Scraping/Finance API**: `yfinance` (Yahoo Finance), custom NSE scrapers (`PredictionService`).
- **AI Integration**: Google Gemini API via `AIAnalystService`.
- **Authentication**: JWT-based auth with `python-jose` and `bcrypt`.

## 4. Key Features & Workflows

### 4.1 Automated NSE Calendar Sync
The Celery Scheduler (`qeps_scheduler`) routinely triggers the `sync_nse_calendar_task`. This task scrapes upcoming earnings dates for NSE companies and saves the report dates and purposes into the database.

### 4.2 Bulk Historical Data Population
Because fetching 4-quarter historical EPS data for 400+ companies is time-consuming, the system utilizes an asynchronous Celery worker (`qeps_worker`).
- When the user clicks the "Cloud Download" button on the UI, a GraphQL mutation (`populateCompaniesData`) fires.
- This mutation dispatches a Celery task that iterativly pulls the `quarterly_income_stmt` from `yfinance` for each company (appending `.NS` to the ticker).
- It extracts `Q1 EPS`, `Q2 EPS`, `Q3 EPS`, `Q4 EPS`, the current stock price, and calculates the `historicalTrend`.
- The database is updated incrementally.

### 4.3 GraphQL Data Fetching
The frontend polls the GraphQL API (using Apollo Client's `network-only` fetch policy to bypass strict caching) every 15 seconds to stream the background worker's progress to the DataGrid in real-time.

### 4.4 Data Model Core Entities
- **User**: Authentication models.
- **Company**: Stores company metadata (Ticker, Name, Sector), upcoming report dates, exact recent prices, historical Q1-Q4 EPS, and fundamental snapshots (Market Cap, P/E, Holdings, etc.).
- **EarningsReport**: Historical earnings fixtures.
- **Prediction**: Stores basic trend and confidence scores.
- **EventStudyResult**: Stores deep quantitative event study metrics (Pre/Post gap %, intraday %, forward returns for 1, 3, 5, 10, 20, 30 days).
- **StrategyBacktest**: Stores win-rates, total trades, and expected values for proprietary trading strategies.
- **TechnicalSnapshot**: Stores latest technical indicators (MACD, RSI, DMAs, ADX, Support/Resistance).
- **AIAnalysisReport**: Stores the LLM-generated qualitative Markdown report containing risk assessments and trading plans.

### 4.5 Deep Quantitative Event Study & AI Analyst
Users can click on a specific company in the dashboard to view a comprehensive 11-section Deep Research Report.
- Generating this report triggers a heavy Celery background task (`generate_deep_research_report_task`).
- The `QuantService` fetches 5 years of daily OHLCV data using `yfinance` and calculates complex technicals, event studies, and strategy backtests using `pandas` and `pandas-ta`.
- The `AIAnalystService` securely passes this processed quantitative data to the **Google Gemini API**, which acts as a Senior Quantitative Analyst to generate qualitative risk assessments, pattern recognition, and trading plans.
- The UI elegantly renders this massive dataset using Material UI metric cards and `react-markdown` for the AI text.

## 5. Development Guide

### Running Locally
1. Ensure Docker Desktop is running.
2. In the root directory, start the infrastructure:
   ```bash
   docker compose up -d
   ```
3. To rebuild containers after installing new dependencies (e.g., modifying `requirements.txt` or `package.json`):
   ```bash
   docker compose up --build -d
   ```

### Ports & Endpoints
- **Web App**: `http://localhost` (via Nginx)
- **GraphQL API / Docs**: `http://localhost:8000/graphql`
- **PgAdmin**: `http://localhost:5050`
- **Database**: `localhost:5432`

### Modifying the Database Schema
1. Modify the SQLAlchemy models in `backend/app/infrastructure/models.py`.
2. Ensure you add corresponding fields to `CompanyType` (or relevant types) in `backend/app/graphql/types.py`.
3. Update the GraphQL resolvers in `backend/app/graphql/queries.py` to map the DB model attributes to the GraphQL type attributes.
4. Execute raw SQL migrations or use `alembic` to update the actual Postgres schema.

### Troubleshooting Caching
- **Nginx DNS Cache**: If the backend container receives a new internal Docker IP, Nginx will throw a `502 Bad Gateway` until restarted. Run `docker restart qeps_nginx`.
- **Apollo Client Cache**: If a new field is added to the GraphQL schema, Apollo might cache the old schema and drop new fields on the frontend. Utilizing `fetchPolicy: 'network-only'` in the `useQuery` hook resolves this issue for dynamic development environments.
