# EPS Project - Complete Command Cheatsheet (DT)

## 🐳 Core Docker Commands

**Start the Entire Project**
```bash
docker compose up -d
```
*Starts frontend, backend, workers, redis, postgres, pgadmin, and nginx in the background.*

**Rebuild the Project (After Code/Dependency Changes)**
```bash
docker compose up --build -d
```
*Rebuilds images (useful if `requirements.txt` or `package.json` changes).*

**Stop All Services**
```bash
docker compose down
```
*Stops and removes containers. (Database data remains safe).*

**Stop & WIPE DATABASE (Danger!)**
```bash
docker compose down -v
```
*Stops containers AND completely deletes the PostgreSQL and Redis persistent volumes.*

---

## 🗄️ Database & Alembic Commands (Migrations)

**Apply Migrations (Sync Schema)**
```bash
docker exec qeps_backend alembic upgrade head
```
*Updates PostgreSQL to match the latest Python models.*

**Check Current Database Version**
```bash
docker exec qeps_backend alembic current
```
*Shows what migration ID the live database is currently sitting on.*

**Generate a New Migration File**
```bash
docker exec qeps_backend alembic revision --autogenerate -m "Added xyz column"
```
*Scans `models.py` and creates a new migration file. (Run `upgrade head` afterward).*

**View Migration History & Conflicts**
```bash
docker exec qeps_backend alembic history
```
*Shows the tree of migrations. Useful for spotting "multiple heads".*

**Fix "Multiple Heads" Merge Conflict**
```bash
docker exec qeps_backend alembic merge heads -m "Merge branches"
```
*Resolves git merge conflicts in Alembic. (Follow with `upgrade head`).*

**Open Postgres SQL Shell**
```bash
docker exec -it qeps_postgres psql -U postgres -d qeps
```
*Opens the raw SQL terminal inside the DB container.*

---

## ⚙️ Backend & Worker Commands (Python / FastAPI / Celery)

**Restart Backend API Only**
```bash
docker compose restart backend
```
*Quickly restarts the FastAPI server without tearing down the DB.*

**Restart Celery Workers (Apply Task Changes)**
```bash
docker compose restart worker scheduler
```
*Essential if you edit code inside `tasks.py`. Workers must be restarted to see new code.*

**Run a specific Python Script (e.g., Backtests or Admin scripts)**
```bash
docker exec qeps_backend python run_full_system_verification.py
```
*Executes a Python file using the container's environment.*

**Enter Backend Shell**
```bash
docker exec -it qeps_backend bash
```
*Opens a terminal inside the backend container.*

**Clear/Purge Celery Queue**
```bash
docker exec qeps_backend celery -A app.worker.celery_app purge -f
```
*Deletes all pending/stuck background jobs from the Redis queue.*

---

## 🌐 Frontend Commands (React/Vite)

**Restart Frontend Only**
```bash
docker compose restart frontend
```
*Restarts the Vite dev server.*

**Install New NPM Package**
```bash
docker exec -it qeps_frontend npm install <package-name>
```
*Installs a package directly into the running frontend container.*

**Enter Frontend Shell**
```bash
docker exec -it qeps_frontend /bin/sh
```
*Opens a terminal inside the frontend container.*

---

## 🧠 Redis Cache Commands

**Clear Entire Redis Cache**
```bash
docker exec -it qeps_redis redis-cli FLUSHALL
```
*Wipes all cached API responses and clears the Celery queue simultaneously.*

**Open Redis Monitor**
```bash
docker exec -it qeps_redis redis-cli monitor
```
*Watches every command hitting the Redis server in real-time.*

---

## 🚦 Nginx Proxy Commands

**Reload Nginx Configuration**
```bash
docker exec qeps_nginx nginx -s reload
```
*Applies changes made to `default.conf` without dropping active connections.*

---

## 📊 Logging & Debugging

**View Backend Logs (Live)**
```bash
docker compose logs -f backend
```
*Streams FastAPI print statements and errors.*

**View Celery Worker Logs (Live)**
```bash
docker compose logs -f worker
```
*Streams background job logs (earnings processing, momentum calc).*

**View All Logs Together**
```bash
docker compose logs -f
```
*Streams logs from every single container combined.*

**Check Container Status & Health**
```bash
docker ps
```
*Lists all running containers and their health status.*

---

## 🧹 System Cleanup Commands

**Clean Up Unused Docker Data**
```bash
docker system prune
```
*Removes stopped containers and dangling images to save disk space.*

**Aggressive Cleanup (Free up heavy disk space)**
```bash
docker system prune -a --volumes
```
*Removes ALL unused images, containers, and anonymous volumes. (Will redownload base images next time you build).*

---

## 🏃‍♂️ Custom Project Scripts (Backend)

**Run the Full System Verification Test**
```bash
docker exec qeps_backend python run_full_system_verification.py
```
*Runs the integration tests ensuring all pipelines (NSE, Momentum, AI) are working together.*

**Run the Backtest Suite**
```bash
docker exec qeps_backend python run_backtest_suite.py
```
*Executes the algorithmic backtesting logic to evaluate quant models.*

**Trigger Manual Population**
```bash
docker exec qeps_backend python trigger_populate.py
```
*Forces the system to start populating earnings data immediately.*

**Test Gemini LLM Connection**
```bash
docker exec qeps_backend python scripts/test_gemini.py
```
*Pings the Gemini API to verify your API key and connection are working.*

**Run the Catalyst Pipeline**
```bash
docker exec qeps_backend python scripts/run_catalyst_pipeline.py
```
*Manually triggers the news sentiment and catalyst scoring pipeline.*

**Diagnose Catalyst Pipeline Issues**
```bash
docker exec qeps_backend python scripts/diagnose_pipeline.py
```
*Runs diagnostic checks if news or sentiment scores are failing to generate.*
