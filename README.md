# Quantitative Earnings Prediction System (QEPS)

**QEPS** is an enterprise-grade quantitative analytics and institutional research platform for stocks listed on the National Stock Exchange of India (NSE). It features real-time historical financial statement extraction, quantitative event study modeling around earnings announcement dates, continuous number line timeline tracking with central release pivots, interactive normalized scorecard evaluations, and automated LLM analyst research report generation via Google Gemini.

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
*Note: On the very first launch, Docker will download base alpine images, construct Python packages (SQLAlchemy, Pandas, Celery), and build React/Vite dependencies. This takes ~2–5 minutes depending on internet connection.*

#### Step 4: Access the Platform
Once Docker finishes building and displays `Container Started / Healthy`, open your web browser and navigate to:
👉 **[http://localhost](http://localhost)**

---

## 🌐 Active Services & Port Map

| Service Name | Local Endpoint / URL | Authentication & Notes |
| :--- | :--- | :--- |
| **QEPS Web Dashboard** | `http://localhost` | Served via Alpine Nginx Reverse Proxy (Port 80). |
| **GraphQL API / Console** | `http://localhost/graphql` or `http://localhost:8000/graphql` | Interactive GraphiQL console for querying stocks & event metrics. |
| **pgAdmin Database GUI** | `http://localhost:5050` | Login Email: `admin@example.com`<br>Password: `admin` |
| **PostgreSQL Database** | `localhost:5432` | User: `qeps_user` \| DB: `qeps_db` \| Pass: `qeps_password` |
| **Redis Cache Broker** | `localhost:6379` | In-memory message store for Celery task queues. |

---

## 🛠️ Essential Commands & Operation Guide

### Checking Container Health Status
To confirm that all microservices and health checks are running properly:
```bash
docker compose ps
```

### Viewing Live Terminal Logs
To inspect system execution, API routing, or data extraction progresses:
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

### Shutting Down the Project
To stop all running services without deleting your database records:
```bash
docker compose down
```
To stop the stack and **cleanly erase all data volumes** (resetting the database and pgAdmin config to pristine state):
```bash
docker compose down -v
```

---

## 📚 Further Architecture Documentation

For deep dives into internal data structures, financial scorecard normalization algorithms, interactive click-only formulas, unified earnings pivot timelines, and Strawberry GraphQL schema designs, refer to our primary system specification:
📖 **[project.md](project.md)**
