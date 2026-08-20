# Quantitative Earnings Prediction System (VD EPS)

EPS is an institutional-grade quantitative analytics and surveillance platform for NSE-listed equities. It provides automated financial modeling, technical indicator calculation, algorithmic strategy backtesting, and AI-driven sentiment analysis.

## Features

- **Company & Event Analytics**: Financial statement aggregation and event study modeling around earnings.
- **Technical Analysis**: Real-time technical indicators (SMA, RSI, MACD, Trend/Cross detection).
- **Verified News & Sentiment**: Live RSS news aggregation with Gemini-driven sentiment scoring.
- **Quantitative Backtesting**: Algorithmic strategy evaluation and performance metrics.
- **Financial Scoring**: Automated health grading and statistical probability analysis.
- **Background Processing**: Celery-based workers for OHLCV caching and NSE universe synchronization.

## Tech Stack

- **Frontend**: React (Vite), TypeScript, Material UI, Apollo Client (GraphQL)
- **Backend**: Python, FastAPI, Strawberry (GraphQL), SQLAlchemy, pandas, scikit-learn
- **Database**: PostgreSQL
- **Cache/Queue**: Redis, Celery
- **AI**: Google Gemini API
- **Infrastructure**: Docker Compose, Nginx

## Project Structure

```text
Eps/
├── frontend/             # React SPA (Vite)
├── backend/              # FastAPI & Celery services
│   ├── app/              # Main application code (API, models, services)
│   ├── docker/           # Service-specific Dockerfiles
├── docker-compose.yml    # Full local environment orchestration
```

## Setup

```bash
git clone <repository-url>
cd Eps
cp .env.example .env
# Edit .env with your specific API keys
docker compose up --build -d
```

- **Frontend Application**: [http://localhost:8080](http://localhost:8080)
- **Backend API (GraphQL)**: [http://localhost:8000/graphql](http://localhost:8000/graphql)
- **pgAdmin**: [http://localhost:5050](http://localhost:5050)

## Environment Variables

Configure these in `.env`:

```env
DATABASE_URL=postgresql://qeps_user:qeps_password@postgres:5432/qeps_db
REDIS_URL=redis://redis:6379/0
JWT_SECRET=super_secret_jwt_key
FMP_API_KEY=your_fmp_api_key_here          # Financial Modeling Prep API Key
GEMINI_API_KEY=your_gemini_api_key_here    # Google Gemini API Key
POSTGRES_DB=qeps_db
POSTGRES_USER=qeps_user
POSTGRES_PASSWORD=qeps_password
PGADMIN_EMAIL=admin@example.com
PGADMIN_PASSWORD=admin
```

## Useful Commands

**Docker Operations**
```bash
# Start all services in the background
docker compose up --build -d

# Check service status
docker compose ps

# View logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f backend
docker compose logs -f worker

# Restart background workers (required after updating Python task logic)
docker compose restart worker scheduler

# Stop and remove all containers
docker compose down
```

**Frontend Development (Outside Docker)**
```bash
cd frontend
npm install
npm run dev
```

**Backend Database (Alembic Migrations)**
*(Run from inside the backend container or locally with the virtual environment)*
```bash
alembic upgrade head
alembic revision --autogenerate -m "description"
```

## Development Notes

- **Worker Reloading**: The Celery `worker` and `scheduler` containers do NOT auto-reload on Python file changes. You must run `docker compose restart worker scheduler` to apply updates to background tasks.
- **Data Ingestion**: Initial NSE universe sync and OHLCV data ingestion occur via background Celery tasks. If data is missing, check the `worker` logs for API limits or connection errors.
- **Gemini Fallback**: If `GEMINI_API_KEY` is missing or invalid, the sentiment engine will safely fall back to a deterministic keyword-density heuristic rather than crashing.

## Troubleshooting

### Containers not starting / Port conflicts
Check for existing services running on ports 8080, 8000, 5050, or 5432.
```bash
docker compose ps
docker compose logs
```

### Missing Data on UI
If the UI shows "Company not found" or missing data:
1. Ensure the PostgreSQL database was initialized correctly.
2. Check if the `scheduler` triggered the daily data fetch tasks.
3. Check `worker` logs for `yfinance` rate limits or network blocks.
```bash
docker compose logs -f worker
```

## Authors
- Vipul G.
- Dhruv T.
