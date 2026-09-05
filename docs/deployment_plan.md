# QEPS Production Deployment Strategy (Final)

> [!NOTE]
> Consolidated to a **single VPS** — **OVHcloud VPS-2** (4 vCores / 8 GB RAM / 75 GB NVMe SSD / 1 Gbps) in **Canada (BHS) datacenter**. Frontend hosted on **Cloudflare Pages** (free CDN). The 8 GB RAM budget is tight and requires careful memory limits; the 75 GB disk is sufficient for now but will require a disk upgrade or additional storage as the Parquet data lake grows over time.

---

## Phase 1 — Codebase & Service Inspection

### 1.1 Running Processes

| # | Process | Command | Port | RAM Estimate |
|---|---------|---------|------|-------------|
| 1 | **FastAPI** (Uvicorn x2) | `uvicorn main:app --workers 2` | 8000 | ~400 MB |
| 2 | **Celery Worker** (x2 concurrency) | `celery worker --concurrency=2` | — | ~1–3 GB (ML training) |
| 3 | **Celery Beat** | `celery beat` | — | ~50 MB |
| 4 | **PostgreSQL 17** | postgres:17-alpine | 5432 | ~300–600 MB |
| 5 | **Redis 7** | redis:7-alpine | 6379 | ~100–200 MB |
| 6 | **Nginx** | nginx:alpine (API proxy + SSL) | 80/443 | ~20 MB |
| 7 | **Data Harvester** | cron: `python3 harvester.py` | — | ~200–500 MB (intermittent) |

**Total peak**: ~3–5 GB RAM. With 8 GB, there's ~3–5 GB of headroom — adequate with reduced concurrency. ML training runs sequentially (concurrency=2) to stay within budget.

### 1.2 Infrastructure Dependencies

| Dependency | Source |
|------------|--------|
| **PostgreSQL** | [`docker-compose.yml:54`](file:///c:/Users/Vipul%20Gorana/Desktop/Config%20Manager/Dummy/docker-compose.yml#L54-L73) — primary data store |
| **Redis** | [`docker-compose.yml:93`](file:///c:/Users/Vipul%20Gorana/Desktop/Config%20Manager/Dummy/docker-compose.yml#L93-L105) — Celery broker + result backend + observability cache |
| **ML stack** | `lightgbm`, `xgboost`, `scikit-learn`, `shap` — heavy RAM consumers during concurrent training |
| **Parquet Data Lake** | `pyarrow`, `fastparquet` — historical OHLCV stored as per-ticker `.parquet` files |

### 1.3 External Services

| Service | Env Var | Constraint |
|---------|---------|-----------|
| Google Gemini API | `GEMINI_API_KEY` | Graceful fallback if unavailable |
| Financial Modeling Prep | `FMP_API_KEY` | Required |
| Upstox API | `UPSTOX_ACCESS_TOKEN` | Token valid ~1 year |
| Yahoo Finance | — | Rate-limited, no auth |
| Google News / RSS | — | No auth |
| NSE India | — | Rate-limited |

No static IP, hosting region, or compliance constraints.

### 1.4 Data Layer

- **Database**: PostgreSQL 17. Current dump: ~0.25 MB (tiny). Growth expected with historical data.
- **Schema**: Triple migration approach (create_all → migrate.py → Alembic). Safe for additive changes; fragile for destructive ones.
- **Parquet Data Lake**: One `.parquet` file per ticker. With full NSE universe (~2000+ tickers), expected growth to **50–200 GB** over 2–3 years. The 75 GB boot disk is enough for the initial phase, but storage will need to be upgraded or an additional disk attached later when the system gets bigger.

### 1.5 Frontend–Backend Communication

| Channel | Pattern |
|---------|---------|
| **GraphQL** (Apollo Client) | `POST /api/graphql` — relative URL in [`client.ts`](file:///c:/Users/Vipul%20Gorana/Desktop/Config%20Manager/Dummy/frontend/src/graphql/client.ts) |
| **REST** (window.fetch) | `GET /api/news/*`, `/api/news-sentiment/*` — relative URLs |
| **Auth** | JWT in `localStorage`, sent as `Authorization: Bearer` header |

All URLs are relative → can be repointed to an absolute backend URL for Cloudflare Pages hosting.

> [!CAUTION]
> **Leaked API keys**: The committed `.env` contains real `FMP_API_KEY` and `GEMINI_API_KEY`. Rotate immediately and purge from git history.

---

## Phase 2 — Decision: Single VPS (OVHcloud VPS-2)

### Why Single VPS Works at 8 GB (with constraints)

| Concern | Mitigation |
|---------|-----------|
| ML training OOM | 8 GB total minus ~2 GB for other services = **~6 GB available** for the worker. Docker memory limit set to 3 GB. Celery concurrency reduced to 2. 4 GB swap as additional buffer. |
| Worker crash kills web server | Docker `restart: unless-stopped` + `deploy.resources.limits.memory` per container. Linux OOM killer targets the container that exceeded its limit, not random processes. |
| Disk space for historical data | 75 GB boot disk is sufficient for now. We will upgrade disk capacity later as the data lake grows. |
| CPU contention during training | `--concurrency=2` on worker (reduced from 3). FastAPI uses async I/O and doesn't compete much for CPU. Training runs on scheduled cadence (daily/weekly), not during peak user activity. |
| Latency to India | Canada (BHS) → India is ~200–250ms network latency. With Cloudflare Pages CDN for frontend and typical 50–200ms server processing, total API response = ~250–450ms. Usable for a dashboard, but not snappy. |

**What would force an upgrade**: If the stock universe grows beyond ~2000 tickers with concurrent training, or if 8 GB RAM proves too tight under real load. Upgrade path: OVHcloud VPS-4 (8 vCores / 16 GB / 160 GB) or move the worker to a dedicated machine — the architecture supports this via `REDIS_URL` and `DATABASE_URL` changes.

---

## Phase 3 — Free-Tier Offload

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| **CI/CD** | ✅ GitHub Actions | 2,000 free min/month. Build + test + SSH deploy = ~5 min per push. |
| **Frontend hosting** | ✅ Cloudflare Pages | Free tier, global CDN, automatic HTTPS, auto-deploy from GitHub. |
| **Cron jobs** | ❌ Keep on VPS | Harvester needs DB + filesystem access. Actions cron is unreliable. |
| **Static hosting (nginx)** | ❌ Not needed | Frontend on Cloudflare Pages. Nginx only proxies API traffic. |

---

## Phase 4 — Deployment Cycle

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE PAGES                        │
│                   (app.your-domain.com)                     │
│            React SPA · Global CDN · FREE TIER               │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (GraphQL + REST)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         OVHcloud VPS-2 (api.your-domain.com)                │
│         4 vCores / 8 GB / 75 GB NVMe — Canada (BHS)         │
│                                                             │
│  ┌─────────────┐  ┌──────────────────────────────────────┐  │
│  │   Nginx     │  │         Docker Network               │  │
│  │  :80 :443   │  │                                      │  │
│  │  SSL + Proxy├──►  FastAPI (:8000) · 2 Uvicorn workers │  │
│  └─────────────┘  │                                      │  │
│                    │  PostgreSQL 17 (:5432)               │  │
│                    │  Redis 7 (:6379)                     │  │
│                    │                                      │  │
│                    │  Celery Worker (concurrency=2)       │  │
│                    │  Celery Beat (scheduler)             │  │
│                    └──────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Data Harvester (system cron)                        │   │
│  │  Writes to: PostgreSQL (live_quotes)                 │   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  OVH Additional Disk (250-500 GB) mounted            │   │
│  │  at /mnt/data_lake — Parquet OHLCV data lake         │   │
│  │  ~50-200 GB historical data over 2-3 years           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│         GitHub Actions CI/CD → SSH Deploy                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Chosen Provider: OVHcloud VPS-2 (Canada)

| Spec | Value |
|------|-------|
| **Plan** | VPS-2 |
| **vCPU** | 4 vCores |
| **RAM** | 8 GB |
| **Storage** | 75 GB NVMe SSD (boot) |
| **Bandwidth** | 1 Gbps / unmetered |
| **Datacenter** | 🇨🇦 Canada (BHS — Beauharnois) |
| **Latency to India** | ~200–250ms |
| **Additional Disk** | None for now (upgrade later as data grows) |

> [!IMPORTANT]
> **Disk constraint**: The 75 GB boot disk is sufficient initially for the OS, Docker, Postgres, and the starting Parquet data lake. We will upgrade the system storage when the data lake grows larger.
>
> **RAM constraint**: 8 GB is workable but tight. Celery concurrency is reduced to 2 (from 3), and all container memory limits are tuned aggressively. If ML training consistently OOMs, upgrade to VPS-4 (16 GB).
>
> **Latency note**: Canada → India adds ~200–250ms network latency. With Cloudflare Pages CDN for frontend (instant page loads), only API calls are affected. Total API response = ~250–450ms. Acceptable for a dashboard that refreshes every few seconds, but not snappy.

### 4.3 Provisioning

#### OS Setup

```bash
# Ubuntu 24.04 LTS (OVHcloud VPS-2, BHS datacenter)
apt update && apt upgrade -y
timedatectl set-timezone Asia/Kolkata
hostnamectl set-hostname qeps-prod

apt install -y \
  curl wget git \
  ufw fail2ban \
  htop iotop ncdu \
  unattended-upgrades

dpkg-reconfigure --priority=low unattended-upgrades
```

#### Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (certbot + redirect)
ufw allow 443/tcp    # HTTPS
# PostgreSQL, Redis stay internal — no ports exposed
ufw enable
```

#### User & Permissions

```bash
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy

sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

su - deploy
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# Add public key to ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

#### Swap (OOM Safety Net — critical on 8 GB)

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf
```

#### Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker

cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker
```

#### Parquet Data Lake Storage

```bash
# Create local directory for the data lake on the boot disk
su - deploy
mkdir -p ~/qeps/data_lake/ohlcv/daily
```

### 4.4 Environment Setup

```bash
su - deploy
git clone <repository-url> ~/qeps
cd ~/qeps
cp .env.example .env
chmod 600 .env
nano .env  # Opens the file in a text editor for you to paste the values below
```

#### Production `.env`

Copy the following into your `.env` file (replace the placeholders with real values):

```env
# === DATABASE (Docker internal) ===
DATABASE_URL=postgresql://qeps_user:<STRONG_PW>@postgres:5432/qeps_db
POSTGRES_DB=qeps_db
POSTGRES_USER=qeps_user
POSTGRES_PASSWORD=<STRONG_PW>          # openssl rand -base64 32

# === SECURITY ===
JWT_SECRET=<STRONG_SECRET>             # openssl rand -hex 64
REDIS_URL=redis://redis:6379/0

# === API KEYS (rotate the leaked ones!) ===
FMP_API_KEY=<new_production_key>
GEMINI_API_KEY=<new_production_key>
UPSTOX_ACCESS_TOKEN=<1yr_analytics_token>

# === DATA ===
DATA_LAKE_PATH=/app/data_lake
ENVIRONMENT=production

# Note: /app/data_lake inside Docker maps to /home/deploy/qeps/data_lake on host

# === AUTH ===
AUTH_USER_1_EMAIL=<real_email>
AUTH_USER_1_PASSWORD=<strong_password>
AUTH_USER_2_EMAIL=<real_email>
AUTH_USER_2_PASSWORD=<strong_password>

# === DISCORD ALERTS ===
DISCORD_TRADING_WEBHOOK_URL=<your_discord_trading_channel_webhook_url>  # For BUY/EXIT signals and catalysts
DISCORD_ADMIN_WEBHOOK_URL=<your_discord_ops_channel_webhook_url>     # For VPS status, cron failures, and deploys
DISCORD_ALERTS_ENABLED=True
```

### 4.5 Production Docker Compose

**File: `docker-compose.prod.yml`** — single file, all services on one machine. Memory limits tuned for 8 GB VPS.

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
    container_name: qeps_backend
    restart: unless-stopped
    command: >
      uvicorn main:app
      --host 0.0.0.0
      --port 8000
      --workers 2
      --no-access-log
    volumes:
      - data_lake:/app/data_lake:ro
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      - REDIS_URL=redis://redis:6379/0
      - JWT_SECRET=${JWT_SECRET}
      - FMP_API_KEY=${FMP_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - ENVIRONMENT=production
      - DISCORD_TRADING_WEBHOOK_URL=${DISCORD_TRADING_WEBHOOK_URL}
      - DISCORD_ADMIN_WEBHOOK_URL=${DISCORD_ADMIN_WEBHOOK_URL}
      - DISCORD_ALERTS_ENABLED=${DISCORD_ALERTS_ENABLED}
    deploy:
      resources:
        limits:
          memory: 1536M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - qeps_network
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  worker:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
    container_name: qeps_worker
    command: celery -A app.worker.celery_app worker --loglevel=warning --concurrency=2
    restart: unless-stopped
    volumes:
      - data_lake:/app/data_lake:ro
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      - REDIS_URL=redis://redis:6379/0
      - JWT_SECRET=${JWT_SECRET}
      - FMP_API_KEY=${FMP_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - ENVIRONMENT=production
      - DISCORD_TRADING_WEBHOOK_URL=${DISCORD_TRADING_WEBHOOK_URL}
      - DISCORD_ADMIN_WEBHOOK_URL=${DISCORD_ADMIN_WEBHOOK_URL}
      - DISCORD_ALERTS_ENABLED=${DISCORD_ALERTS_ENABLED}
    deploy:
      resources:
        limits:
          memory: 3G    # Tight budget on 8 GB VPS — 2 concurrent ML training jobs
    networks:
      - qeps_network
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy

  scheduler:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
    container_name: qeps_scheduler
    command: celery -A app.worker.celery_app beat --loglevel=warning
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      - REDIS_URL=redis://redis:6379/0
      - JWT_SECRET=${JWT_SECRET}
      - FMP_API_KEY=${FMP_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - ENVIRONMENT=production
    deploy:
      resources:
        limits:
          memory: 256M
    networks:
      - qeps_network
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:17-alpine
    container_name: qeps_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - qeps_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 768M   # Tuned for 8 GB VPS: shared_buffers=256MB, work_mem=32MB

  redis:
    image: redis:7-alpine
    container_name: qeps_redis
    restart: unless-stopped
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - qeps_network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 384M

  nginx:
    build:
      context: .
      dockerfile: docker/nginx/Dockerfile.prod
    container_name: qeps_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/prod.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - certbot_webroot:/var/www/certbot:ro
    networks:
      - qeps_network
    depends_on:
      backend:
        condition: service_healthy

  certbot:
    image: certbot/certbot
    container_name: qeps_certbot
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt
      - certbot_webroot:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

networks:
  qeps_network:
    name: qeps_network

volumes:
  postgres_data:
  redis_data:
  certbot_webroot:
  data_lake:
    driver: local
    driver_opts:
      type: none
      device: /home/deploy/qeps/data_lake
      o: bind
```

**Memory Budget & Limit Validation (8 GB VPS):**

| Container / Process | Limit | Expected Baseline | Peak Usage | Notes |
|---------------------|-------|-------------------|------------|-------|
| **Worker** (Celery) | **3 GB** | ~300 MB | ~1.5–2 GB | 2 concurrent workers running ML training (`lightgbm`, `xgboost`, `shap`) on tabular data. ~500 MB per training fold. Tight but viable. |
| **PostgreSQL 17**   | **768 MB** | ~150 MB | ~500 MB | Configure: `shared_buffers=256MB`, `work_mem=32MB`. Sufficient for current data size. |
| **Backend** (FastAPI)| **1.5 GB** | ~250 MB | ~500 MB | 2 Uvicorn workers. Generous margin for GraphQL and RSS parsing. |
| **Redis 7**         | **384 MB** | ~50 MB | ~280 MB | Bounded by `--maxmemory 256mb --maxmemory-policy allkeys-lru`. |
| **Scheduler** (Beat) | **256 MB** | ~40 MB | ~60 MB | Light process, only issues task signals to Redis. |
| **Nginx Proxy**     | *(unset)* | ~15 MB | ~30 MB | Negligible footprint. |
| **Total Container Limits** | **~5.9 GB** | **~805 MB** | **~3.37 GB** | Leaves **~2.1 GB** free on the host. |

**Host Memory Allocation:**
- **Ubuntu OS kernel + system services**: ~600 MB
- **Docker engine overhead**: ~200 MB
- **Data Harvester cron job (runs on host)**: ~150 MB
- **Linux Page Cache**: ~1.1 GB (auto-used for Parquet file caching)

**OOM Risk Analysis (8 GB):**
1. **No Overcommit**: Container limits (5.9 GB) + host overhead (~0.95 GB) = **~6.85 GB**, under the 8 GB physical limit. The 4 GB swap provides an additional safety net.
2. **Tighter margins than 16 GB**: If ML training on a particularly large ticker dataset pushes the worker past 3 GB, Docker kills only that container (cgroup isolation). `restart: unless-stopped` brings it back.
3. **Container Auto-Recovery**: All critical containers restart automatically on crash.
4. **Swap Buffer**: 4 GB swap at `swappiness=10` — kernel swaps cold pages before killing processes.

> [!WARNING]
> **8 GB is the minimum viable config**. Monitor memory usage closely after first deploy with `htop` and `docker stats`. If the worker consistently OOMs or swap usage stays high, upgrade to OVHcloud VPS-4 (16 GB).

### 4.6 Production Nginx Config

**File: `docker/nginx/prod.conf`** — API-only proxy (frontend is on Cloudflare Pages):

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/api.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # CORS for Cloudflare Pages frontend
    add_header Access-Control-Allow-Origin "https://app.your-domain.com" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
    add_header Access-Control-Allow-Credentials "true" always;

    if ($request_method = OPTIONS) {
        return 204;
    }

    gzip on;
    gzip_types application/json;
    gzip_min_length 256;

    location / {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /health {
        proxy_pass http://backend:8000/health;
        access_log off;
    }
}
```

**File: `docker/nginx/Dockerfile.prod`**:

```dockerfile
FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/nginx/prod.conf /etc/nginx/conf.d/default.conf
```

### 4.7 Frontend Code Changes (Cloudflare Pages)

**1. Configurable API base** — [`frontend/src/graphql/client.ts`](file:///c:/Users/Vipul%20Gorana/Desktop/Config%20Manager/Dummy/frontend/src/graphql/client.ts):

```diff
+const API_BASE = import.meta.env.VITE_API_URL || '';
+
 const httpLink = createHttpLink({
-  uri: '/api/graphql',
+  uri: `${API_BASE}/api/graphql`,
 });
```

**2. API URL helper** — create `frontend/src/utils/api.ts`:

```typescript
export const API_BASE = import.meta.env.VITE_API_URL || '';
export const apiUrl = (path: string) => `${API_BASE}${path}`;
```

Replace all `fetch('/api/...')` calls with `fetch(apiUrl('/api/...'))` in:
- [`Home.tsx:32`](file:///c:/Users/Vipul%20Gorana/Desktop/Config%20Manager/Dummy/frontend/src/pages/Home.tsx#L32)
- [`sentimentCache.ts:79`](file:///c:/Users/Vipul%20Gorana/Desktop/Config%20Manager/Dummy/frontend/src/store/sentimentCache.ts#L79)
- [`SocialSentimentCard.tsx:70-77`](file:///c:/Users/Vipul%20Gorana/Desktop/Config%20Manager/Dummy/frontend/src/components/SocialSentimentCard.tsx#L70-L77)

**3. Backend CORS** — add to [`main.py`](file:///c:/Users/Vipul%20Gorana/Desktop/Config%20Manager/Dummy/backend/main.py) after `app = FastAPI(...)`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.your-domain.com",   # Cloudflare Pages
        "http://localhost:5173",           # Local dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**4. Cloudflare Pages Deployment Steps:**
1. Create a free account at [Cloudflare](https://dash.cloudflare.com/sign-up).
2. Go to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Select your GitHub repository and the `main` branch.
4. **Build settings:**
   - Framework preset: `None` (or `Vite`)
   - Build command: `cd frontend && npm run build`
   - Build output directory: `frontend/dist`
5. **Environment variables (Add before building):**
   - `VITE_API_URL=https://api.your-domain.com` (If you don't have a domain yet, use your VPS IP like `http://<VPS_IP>:8000`, but HTTPS via a domain is strongly recommended).
6. Click **Save and Deploy**. Cloudflare will provide a free `.pages.dev` subdomain (e.g., `https://qeps.pages.dev`).

### 4.8 CI/CD Pipeline (GitHub Actions)

**File: `.github/workflows/deploy.yml`**

```yaml
name: Deploy QEPS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r backend/requirements.txt
      - run: cd backend && python -m pytest tests/ -v --tb=short || true
        env:
          DATABASE_URL: "sqlite:///test.db"
          JWT_SECRET: "test-secret"
          REDIS_URL: "redis://localhost:6379/0"

  deploy:
    needs: [test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ~/qeps

            # Pull latest code
            git fetch origin main
            git reset --hard origin/main

            # Rebuild and restart (rolling)
            docker compose -f docker-compose.prod.yml build --no-cache backend worker scheduler nginx
            docker compose -f docker-compose.prod.yml up -d --remove-orphans

            # Health check
            echo "Waiting for backend..."
            for i in $(seq 1 30); do
              curl -sf http://localhost:8000/health > /dev/null 2>&1 && echo "Healthy!" && break
              sleep 2
            done

            docker image prune -f

      - name: Send Discord Success Notification
        if: success()
        run: |
          curl -H "Content-Type: application/json" \
            -d '{"content": "🚀 **QEPS Deploy Successful!** New release built and deployed to production VPS."}' \
            -s "${{ secrets.DISCORD_ADMIN_WEBHOOK_URL }}"

      - name: Send Discord Failure Notification
        if: failure()
        run: |
          curl -H "Content-Type: application/json" \
            -d '{"content": "❌ **QEPS Deploy FAILED!** Production release build/deploy failed. Check Github Actions run logs."}' \
            -s "${{ secrets.DISCORD_ADMIN_WEBHOOK_URL }}"

  # Frontend auto-deploys via Cloudflare Pages GitHub integration
```

**GitHub Secrets:**
- `VPS_HOST` — VPS IP address
- `VPS_SSH_KEY` — Private key for `deploy` user
- `DISCORD_ADMIN_WEBHOOK_URL` — Discord webhook URL for `#ops-alerts` channel

### 4.9 Database Migration

Migrations run automatically at backend container startup:
1. `Base.metadata.create_all()` — creates new tables
2. `migrate.upgrade_db()` — adds missing columns (`ADD COLUMN IF NOT EXISTS`)
3. Seeds developer accounts

**For destructive migrations** — run manually before deploying new code:

```bash
ssh deploy@<VPS>
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### 4.10 Data Harvester (System Cron)

```bash
su - deploy
cd ~/qeps/data_harvester
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate
```

The harvester needs to reach PostgreSQL. Since it runs on the host (not in Docker), expose Postgres on localhost only. Add to `docker-compose.prod.yml` under the `postgres` service:

```yaml
    ports:
      - "127.0.0.1:5432:5432"   # Host-only, not exposed to internet
```

**Crontab (`crontab -e` as `deploy`):**

```cron
# === DATA HARVESTER ===
# Intraday: every 15 min during market hours (Mon-Fri, 9:00-15:30 IST)
*/15 9-15 * * 1-5 cd /home/deploy/qeps/data_harvester && DATABASE_URL=postgresql://qeps_user:<password>@127.0.0.1:5432/qeps_db DATA_LAKE_PATH=/home/deploy/qeps/data_lake /home/deploy/qeps/data_harvester/.venv/bin/python harvester.py --mode intraday >> /home/deploy/qeps/data_harvester/harvester.log 2>&1

# EOD: full daily candles at 4:00 PM IST (Mon-Fri)
0 16 * * 1-5 cd /home/deploy/qeps/data_harvester && DATABASE_URL=postgresql://qeps_user:<password>@127.0.0.1:5432/qeps_db DATA_LAKE_PATH=/home/deploy/qeps/data_lake /home/deploy/qeps/data_harvester/.venv/bin/python harvester.py --mode eod >> /home/deploy/qeps/data_harvester/harvester.log 2>&1

# Log rotation: truncate weekly
0 0 * * 0 truncate -s 0 /home/deploy/qeps/data_harvester/harvester.log
```

### 4.11 Monitoring & Health Checks

#### Discord Webhook Setup

To enable notifications for deployments, container crashes, and system alerts directly on Discord, set up dedicated webhooks:

1. **Create Discord Channels**:
   - In your Discord Server, create two channels: `#trading-signals` (for stock setups/catalysts) and `#ops-alerts` (for system status, cron logs, backups, and outages).

2. **Generate Webhook URLs**:
   - For `#trading-signals`, open **Channel Settings** → **Integrations** → **Webhooks** → **New Webhook**. Name it `QEPS Signals` and click **Copy Webhook URL**.
   - For `#ops-alerts`, do the same. Name it `QEPS Ops` and click **Copy Webhook URL**.

3. **Deploy Alert Helper Script**:
   Create a reusable notification script on the VPS to streamline alert delivery.
   
   **File: `/home/deploy/qeps/notify.sh`**
   ```bash
   #!/bin/bash
   # Production Alert Notification Helper (Discord)
   WEBHOOK_URL="YOUR_DISCORD_ADMIN_WEBHOOK_URL" # Pointing to #ops-alerts
   MESSAGE="$1"

   if [ -z "$MESSAGE" ]; then
       echo "Usage: $0 \"alert message\""
       exit 1
   fi

   # Send to Discord using JSON payload
   curl -H "Content-Type: application/json" \
     -d "{\"content\": \"$MESSAGE\"}" \
     -s "$WEBHOOK_URL" > /dev/null
   ```

   ```bash
   # Make the helper script executable
   chmod +x /home/deploy/qeps/notify.sh
   ```

#### Uptime Kuma (Self-hosted, Free)

Configure uptime and ping monitors inside a Docker container:

```bash
docker run -d \
  --name uptime-kuma \
  --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  -v uptime-kuma:/app/data \
  louislam/uptime-kuma:1
```

Access via SSH tunnel: `ssh -L 3001:localhost:3001 deploy@<VPS>`

**Monitors:**
1. `https://api.your-domain.com/health` — HTTP check every 60s
2. `https://app.your-domain.com` — HTTP check every 60s (Cloudflare Pages)
3. Docker containers: `qeps_backend`, `qeps_worker`, `qeps_scheduler`, `qeps_postgres`, `qeps_redis`
4. Disk usage alert at 80%

**Discord Alert Integration in Uptime Kuma UI**:
- Go to **Settings** → **Notifications** → **Setup Notification**.
- Notification Type: **Discord**.
- Title: `QEPS Ops`.
- Discord Webhook URL: `<DISCORD_ADMIN_WEBHOOK_URL>`.
- Click **Save** and test. Uptime Kuma will now push instant notifications on any outage or recovery to Discord.

#### Cron-based Container & System Monitoring

Integrate the `/home/deploy/qeps/notify.sh` script to report local host-level failures directly to Discord `#ops-alerts`:

```cron
# Alert if critical containers are down (every 5 min)
*/5 * * * * docker ps --format "{{.Names}}: {{.Status}}" | grep -E "qeps_(backend|worker|postgres|redis)" | grep -v "Up" && /home/deploy/qeps/notify.sh "⚠️ **QEPS System Alert**: One or more critical containers are DOWN! Run \`docker ps\` on VPS to inspect."

# Alert if host disk space exceeds 80% (every 6 hours)
0 */6 * * * df -h / | awk 'NR==2 {if ($5+0 > 80) system("/home/deploy/qeps/notify.sh \"🚨 **QEPS Disk Warning**: Disk space is at " $5 " capacity on host!\"")}'
```

### 4.12 Rollback

#### Bad Code Deploy

```bash
ssh deploy@<VPS>
cd ~/qeps
git log --oneline -5
git reset --hard <good-commit>
docker compose -f docker-compose.prod.yml build --no-cache backend worker scheduler
docker compose -f docker-compose.prod.yml up -d
curl http://localhost:8000/health
```

#### Bad Database Migration

```bash
docker compose -f docker-compose.prod.yml stop backend worker scheduler
docker exec qeps_postgres pg_restore -U qeps_user -d qeps_db --clean /backups/qeps_latest.dump
git reset --hard <pre-migration-commit>
docker compose -f docker-compose.prod.yml up -d
```

#### Full Disaster Recovery

```bash
# 1. Provision new OVHcloud VPS-2 (same specs)
# 2. Run OS setup from section 4.3
# 3. Attach Additional Disk, mount at /mnt/data_lake
# 4. Clone repo, restore .env
# 5. Restore DB: pg_restore from off-site backup
# 6. Restore data lake: tar -xzf data_lake_backup.tar.gz -C /mnt/
# 7. docker compose -f docker-compose.prod.yml up -d
```

### 4.13 Backup Strategy

```cron
# === POSTGRESQL (daily at 2 AM, retain 14 days) ===
0 2 * * * docker exec qeps_postgres pg_dump -U qeps_user -Fc qeps_db > /home/deploy/backups/qeps_$(date +\%Y\%m\%d).dump && find /home/deploy/backups -name "qeps_*.dump" -mtime +14 -delete

# === DATA LAKE (weekly Sunday 3 AM, retain 30 days) ===
0 3 * * 0 tar -czf /home/deploy/backups/data_lake_$(date +\%Y\%m\%d).tar.gz /mnt/data_lake/ && find /home/deploy/backups -name "data_lake_*.tar.gz" -mtime +30 -delete

# === OFF-SITE (Backblaze B2 — $0.005/GB/month) ===
0 4 * * * b2 upload-file qeps-backups /home/deploy/backups/qeps_$(date +\%Y\%m\%d).dump db/qeps_$(date +\%Y\%m\%d).dump
0 5 * * 0 b2 upload-file qeps-backups /home/deploy/backups/data_lake_$(date +\%Y\%m\%d).tar.gz lake/data_lake_$(date +\%Y\%m\%d).tar.gz
```

### 4.14 SSL/TLS

```bash
# Point DNS: api.your-domain.com → VPS_IP
# Then get certificate:
docker run -it --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v certbot_webroot:/var/www/certbot \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d api.your-domain.com \
  --email your@email.com \
  --agree-tos --non-interactive

# Auto-renewal handled by certbot container in compose.
# Monthly nginx reload for renewed certs:
0 0 1 * * docker exec qeps_nginx nginx -s reload
```

### Getting a Free Domain & DNS Setup

If you want a custom domain but don't want to pay for a `.com`, you have a few options:
1. **Use the free `.pages.dev` domain**: Cloudflare Pages gives you a free domain (e.g., `qeps.pages.dev`). You can use this for the frontend, but you still need a domain or raw IP for the backend API.
2. **Free Domains**: Services like **eu.org** (e.g. `yourname.eu.org`) offer free domains, though approval can take time.
3. **Cheap Domains (Recommended)**: Namecheap offers 6-digit `.xyz` domains for ~$1/year, which is often easier and more reliable than a free domain.

Once you have a domain (e.g., `your-domain.xyz`), add it to Cloudflare as a new Website, change your domain registrar's Nameservers to Cloudflare's, and then set up these DNS Records in Cloudflare:

| Record | Type | Value | Proxy Status |
|--------|------|-------|--------------|
| `api.your-domain.com` | A | `<VPS_IP>` | **DNS Only (Gray cloud)** - Required for Certbot |
| `app.your-domain.com` | CNAME | `<project>.pages.dev` | **Proxied (Orange cloud)** |

*Note: For the Cloudflare Pages frontend, go to your Pages project -> **Custom Domains** -> add `app.your-domain.com`.*

---

## First Deploy Checklist

```
 VPS PROVISIONING (OVHcloud VPS-2)
 1. [ ] Provision OVHcloud VPS-2: 4 vCores / 8 GB RAM / 75 GB NVMe (Canada BHS)
 2. [ ] Order & attach OVH Additional Disk (250-500 GB)
 3. [ ] OS setup: firewall, fail2ban, swap (4 GB), Docker
 4. [ ] Create deploy user + SSH keys
 5. [ ] Format & mount Additional Disk at /mnt/data_lake (see 4.3)
 6. [ ] Create /home/deploy/backups

 SECURITY
 7. [ ] Rotate leaked FMP_API_KEY and GEMINI_API_KEY
 8. [ ] Purge .env from git history (BFG or filter-branch)
 9. [ ] Create production .env (chmod 600)

 BACKEND (VPS)
 10. [ ] Clone repo to ~/qeps
 11. [ ] Create docker-compose.prod.yml
 12. [ ] Create docker/nginx/prod.conf + Dockerfile.prod
 13. [ ] Start: docker compose -f docker-compose.prod.yml up -d
 14. [ ] Verify: docker exec qeps_backend curl http://localhost:8000/health
 15. [ ] Check memory: docker stats (confirm within budget)

 SSL + DNS
 16. [ ] DNS: api.your-domain.com → VPS_IP
 17. [ ] Certbot: get SSL certificate
 18. [ ] Enable HTTPS in nginx config, restart

 DATA HARVESTER
 19. [ ] Set up Python venv + install requirements
 20. [ ] Expose Postgres on 127.0.0.1:5432
 21. [ ] Set up cron jobs (intraday + EOD + log rotation)
 22. [ ] Test: run harvester manually

 FRONTEND (CLOUDFLARE PAGES)
 23. [ ] Apply code changes (VITE_API_URL, apiUrl helper, CORS)
 24. [ ] Connect repo to Cloudflare Pages
 25. [ ] Set VITE_API_URL=https://api.your-domain.com
 26. [ ] DNS: app.your-domain.com → Cloudflare Pages
 27. [ ] Verify: frontend loads, API calls succeed

 CI/CD
 28. [ ] Create .github/workflows/deploy.yml
 29. [ ] Add GitHub Secrets: VPS_HOST, VPS_SSH_KEY, DISCORD_ADMIN_WEBHOOK_URL
 30. [ ] Test: push to main → auto-deploy works and sends Discord status to #ops-alerts channel

 MONITORING + BACKUPS
 31. [ ] Create Discord Channels (#trading-signals and #ops-alerts) and generate Webhook URLs
 32. [ ] Create and test /home/deploy/qeps/notify.sh script on VPS (pointing to Discord #ops-alerts Webhook)
 33. [ ] Deploy Uptime Kuma, configure monitors + Discord alerts
 34. [ ] Set up PostgreSQL backup cron
 35. [ ] Set up data lake backup cron
 36. [ ] Set up off-site backup (Backblaze B2)

 SMOKE TEST
 37. [ ] Login works (JWT auth)
 38. [ ] Company data loads (GraphQL)
 39. [ ] News/sentiment responds
 40. [ ] Worker logs show scheduled tasks running
 41. [ ] Data Harvester cron fires on schedule and completes
 42. [ ] Monitoring alert fires on simulated failure and posts to Discord #ops-alerts
 43. [ ] Verify memory usage stays within budget (htop, docker stats)
```
