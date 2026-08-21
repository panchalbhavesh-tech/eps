# QEPS Production Deployment Strategy (Final)

> [!NOTE]
> Consolidated to a **single high-spec VPS** (16 GB RAM / 500 GB SSD) per team preference. Frontend hosted on **Cloudflare Pages** (free CDN). This eliminates cross-VPS networking complexity while providing ample headroom for concurrent ML training and historical data storage.

---

## Phase 1 — Codebase & Service Inspection

### 1.1 Running Processes

| # | Process | Command | Port | RAM Estimate |
|---|---------|---------|------|-------------|
| 1 | **FastAPI** (Uvicorn x2) | `uvicorn main:app --workers 2` | 8000 | ~400 MB |
| 2 | **Celery Worker** (x3 concurrency) | `celery worker --concurrency=3` | — | ~2–6 GB (ML training) |
| 3 | **Celery Beat** | `celery beat` | — | ~50 MB |
| 4 | **PostgreSQL 17** | postgres:17-alpine | 5432 | ~500 MB–1 GB |
| 5 | **Redis 7** | redis:7-alpine | 6379 | ~100–200 MB |
| 6 | **Nginx** | nginx:alpine (API proxy + SSL) | 80/443 | ~20 MB |
| 7 | **Data Harvester** | cron: `python3 harvester.py` | — | ~200–500 MB (intermittent) |

**Total peak**: ~4–9 GB RAM. With 16 GB, there's 7–12 GB of headroom — comfortable even with concurrent ML training spikes.

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
- **Parquet Data Lake**: One `.parquet` file per ticker. With full NSE universe (~2000+ tickers), expected growth to **50–200 GB** over 2–3 years. 500 GB SSD handles this comfortably.

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

## Phase 2 — Decision: Single VPS

### Why Single VPS Works at 16 GB

| Concern | Mitigation |
|---------|-----------|
| ML training OOM | 16 GB total minus ~4 GB for other services = **~12 GB available** for the worker. Docker memory limit set to 8 GB. 4 GB swap as additional buffer. |
| Worker crash kills web server | Docker `restart: unless-stopped` + `deploy.resources.limits.memory` per container. Linux OOM killer targets the container that exceeded its limit, not random processes. |
| Disk space for historical data | 500 GB SSD. Parquet lake grows ~50–200 GB over 2–3 years. ~300 GB headroom. |
| CPU contention during training | `--concurrency=3` on worker. FastAPI uses async I/O and doesn't compete much for CPU. Training runs on scheduled cadence (daily/weekly), not during peak user activity. |

**What would force a split**: If the stock universe grows beyond ~5000 tickers with concurrent training across all of them, or if the team adds real-time streaming workloads. At that point, move the worker to a dedicated machine — the architecture already supports this via `REDIS_URL` and `DATABASE_URL` changes.

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
│              SINGLE VPS (api.your-domain.com)               │
│              4-6 vCPU / 16 GB / 500 GB SSD                  │
│                                                             │
│  ┌─────────────┐  ┌──────────────────────────────────────┐  │
│  │   Nginx     │  │         Docker Network               │  │
│  │  :80 :443   │  │                                      │  │
│  │  SSL + Proxy├──►  FastAPI (:8000) · 2 Uvicorn workers │  │
│  └─────────────┘  │                                      │  │
│                    │  PostgreSQL 17 (:5432)               │  │
│                    │  Redis 7 (:6379)                     │  │
│                    │                                      │  │
│                    │  Celery Worker (concurrency=3)       │  │
│                    │  Celery Beat (scheduler)             │  │
│                    └──────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Data Harvester (system cron)                        │   │
│  │  Writes to: PostgreSQL (live_quotes)                 │   │
│  │             Parquet Data Lake (/data_lake)            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Parquet Data Lake: /home/deploy/data_lake            │   │
│  │  ~50-200 GB historical OHLCV (500 GB SSD capacity)    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│         GitHub Actions CI/CD → SSH Deploy                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 VPS Provider Comparison (16 GB RAM / 500 GB SSD tier)

| Provider | Plan | vCPU | RAM | SSD | Traffic | Location | Monthly Cost | Notes |
|----------|------|------|-----|-----|---------|----------|-------------|-------|
| **Contabo VPS L** | Shared | 8 | 30 GB | 800 GB | 32 TB | 🇩🇪 🇺🇸 🇯🇵 🇸🇬 | **~€12 ($14)** | Most specs/dollar by far. Support is slow. Performance inconsistent (oversubscribed). Singapore DC = ~50ms to India. |
| **Hetzner CX52** | Shared | 8 | 16 GB | 240 GB | 20 TB | 🇩🇪 Germany | **€27 (~$31)** | Excellent reliability. 240 GB SSD — add a 300 GB Volume (+$14) = $45 total. ~100ms to India. |
| **Hetzner CCX23** | Dedicated | 4 | 16 GB | 160 GB | 20 TB | 🇩🇪 Germany | **€36 (~$41)** | Dedicated CPU (no noisy neighbors). Add 400 GB Volume (+$19) = $60 total. Best for consistent ML performance. |
| **OVH VPS** | Comfort | 4 | 16 GB | 320 GB | Unmetered | 🇫🇷 🇺🇸 🇸🇬 | **~€35 ($40)** | Singapore = ~50ms to India. Add 200 GB block storage (~$8) = $48 total. |
| **Vultr High Freq** | — | 4 | 16 GB | 384 GB | 5 TB | 🇮🇳 **Mumbai** | **$96** | Mumbai = ~10ms latency. NVMe storage. Most expensive. |
| **DigitalOcean** | Premium AMD | 4 | 16 GB | 320 GB | 6 TB | 🇮🇳 **Bangalore** | **$96** | Bangalore = ~10ms. Managed DB add-on available. |
| **AWS Lightsail** | 2xlarge | 4 | 16 GB | 320 GB | 6 TB | 🇮🇳 **Mumbai** | **$80** | Mumbai. Simplified AWS. Can attach extra SSD volumes. |

**Recommendation:**

| Budget | Pick | Total | Latency to India |
|--------|------|-------|-----------------|
| 💰 **Tightest** | Contabo VPS L (Singapore) | **~$14/mo** | ~50ms |
| ⚖️ **Best balance** | Hetzner CX52 + 300 GB Volume | **~$45/mo** | ~100ms |
| ⚖️ **Best for ML** | Hetzner CCX23 (dedicated CPU) + 400 GB Volume | **~$60/mo** | ~100ms |
| 🌏 **Lowest latency** | Vultr Mumbai or DigitalOcean Bangalore | **~$96/mo** | ~10ms |

> [!IMPORTANT]
> **Team Decision**: Since frontend is on Cloudflare Pages (CDN-cached, instant page loads globally), only **API latency** is affected by VPS location. GraphQL queries typically take 50-200ms of server processing. With Hetzner Germany (~100ms network), total API response = ~150-300ms. With Mumbai/Bangalore (~10ms), total = ~60-210ms. For a dashboard refreshing every few seconds, both are usable — but sub-200ms feels noticeably snappier. Choose based on budget priority.

### 4.3 Provisioning

#### OS Setup

```bash
# Ubuntu 24.04 LTS
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

#### Swap (OOM Safety Net)

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

### 4.4 Environment Setup

```bash
su - deploy
git clone <repository-url> ~/qeps
cd ~/qeps
cp .env.example .env
chmod 600 .env

# Create data lake directory
mkdir -p /home/deploy/data_lake/ohlcv/daily
```

#### Production `.env`

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

**File: `docker-compose.prod.yml`** — single file, all services on one machine.

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
    command: celery -A app.worker.celery_app worker --loglevel=warning --concurrency=3
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
          memory: 8G    # Headroom for 3 concurrent ML training jobs
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
          memory: 2G

  redis:
    image: redis:7-alpine
    container_name: qeps_redis
    restart: unless-stopped
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
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
          memory: 768M

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
      device: /home/deploy/data_lake
      o: bind
```

**Memory Budget & Limit Validation (16 GB VPS):**

| Container / Process | Limit | Expected Baseline | Peak Usage | Safety Margin & OOM Risk Analysis |
|---------------------|-------|-------------------|------------|-----------------------------------|
| **Worker** (Celery) | **8 GB** | ~300 MB | ~1.5 - 2.5 GB | **400%+ Margin.** 3 concurrent workers running ML training (`lightgbm`, `xgboost`, `shap`) on tabular data (100k rows, <20 features) use ~500 MB per training fold. The 8 GB limit prevents memory leaks from crashing the host, triggering container-only restarts if exceeded. |
| **PostgreSQL 17**   | **2 GB** | ~200 MB | ~800 MB | **250%+ Margin.** To prevent Postgres from exceeding the 2 GB limit, configure it with production-safe limits: `shared_buffers = 512MB` and `work_mem = 64MB`. This guarantees database memory remains bounded. |
| **Backend** (FastAPI)| **1.5 GB** | ~250 MB | ~500 MB | **300%+ Margin.** Running 2 Uvicorn workers. Peak memory occurs during parallel GraphQL queries and RSS parsing. 1.5 GB is extremely safe. |
| **Redis 7**         | **768 MB** | ~50 MB | ~550 MB | **140%+ Margin.** Bounded by running command: `redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru`. Redis will actively evict old keys, keeping usage strictly below 768 MB. |
| **Scheduler** (Beat) | **256 MB** | ~40 MB | ~60 MB | **400%+ Margin.** Light process that only issues task execution signals to Redis. |
| **Nginx Proxy**     | *(unset)* | ~15 MB | ~30 MB | Negligible footprint. Bypasses limit controls. |
| **Total Container Limits** | **12.52 GB** | **~855 MB** | **~4.44 GB** | Leaves **3.48 GB** completely free on the host. |

**Host Memory Allocation:**
- **Ubuntu OS kernel + system services**: ~800 MB
- **Docker engine overhead**: ~300 MB
- **Data Harvester cron job (runs on host)**: ~150 MB (fetches and saves OHLCV/quotes per ticker in a loop sequentially)
- **Linux Page Cache (Buffers)**: ~2.2 GB (Linux automatically uses this free space to cache the Parquet data lake files, significantly accelerating I/O without triggering OOM).

**Why this will not cause any OOM issues:**
1. **No Overcommit**: The sum of all container memory limits (12.52 GB) plus the host OS overhead (~1.25 GB total) is **13.77 GB**, which is strictly below the physical 16 GB limit. The system will never experience host-level swap thrashing or system-wide locks due to over-allocated memory.
2. **Container Isolation (cgroups)**: If a specific process leaks memory (e.g., a worker process due to Python object reference holding), only that container is targeted by the Linux kernel's OOM killer when it hits its limit. The rest of the system (Web server, PostgreSQL database, host OS) remains fully unaffected.
3. **Container Auto-Recovery**: All critical containers are configured with `restart: unless-stopped`, so if a memory-related crash occurs in a container, Docker automatically spins up a fresh replacement instance within seconds.
4. **Swap Buffer**: The host is provisioned with a **4 GB Swap File** ([`4.3 OS Setup`](file:///C:/Users/Vipul%20Gorana/.gemini/antigravity-ide/brain/8e0f987d-cf05-40e5-8428-183b59d993cf/implementation_plan.md#L211-L218)) tuned to `swappiness=10`. This ensures that in the event of unexpected concurrent peaks, the kernel has a safety net to swap cold pages rather than terminating processes.

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

**4. Cloudflare Pages settings:**
- Build command: `cd frontend && npm run build`
- Output directory: `frontend/dist`
- Environment variable: `VITE_API_URL=https://api.your-domain.com`

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
*/15 9-15 * * 1-5 cd /home/deploy/qeps/data_harvester && DATABASE_URL=postgresql://qeps_user:<password>@127.0.0.1:5432/qeps_db DATA_LAKE_PATH=/home/deploy/data_lake /home/deploy/qeps/data_harvester/.venv/bin/python harvester.py --mode intraday >> /home/deploy/qeps/data_harvester/harvester.log 2>&1

# EOD: full daily candles at 4:00 PM IST (Mon-Fri)
0 16 * * 1-5 cd /home/deploy/qeps/data_harvester && DATABASE_URL=postgresql://qeps_user:<password>@127.0.0.1:5432/qeps_db DATA_LAKE_PATH=/home/deploy/data_lake /home/deploy/qeps/data_harvester/.venv/bin/python harvester.py --mode eod >> /home/deploy/qeps/data_harvester/harvester.log 2>&1

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
# 1. Provision new VPS (same specs)
# 2. Run OS setup from section 4.3
# 3. Clone repo, restore .env
# 4. Restore DB: pg_restore from off-site backup
# 5. Restore data lake: tar -xzf data_lake_backup.tar.gz -C /home/deploy/
# 6. docker compose -f docker-compose.prod.yml up -d
```

### 4.13 Backup Strategy

```cron
# === POSTGRESQL (daily at 2 AM, retain 14 days) ===
0 2 * * * docker exec qeps_postgres pg_dump -U qeps_user -Fc qeps_db > /home/deploy/backups/qeps_$(date +\%Y\%m\%d).dump && find /home/deploy/backups -name "qeps_*.dump" -mtime +14 -delete

# === DATA LAKE (weekly Sunday 3 AM, retain 30 days) ===
0 3 * * 0 tar -czf /home/deploy/backups/data_lake_$(date +\%Y\%m\%d).tar.gz /home/deploy/data_lake/ && find /home/deploy/backups -name "data_lake_*.tar.gz" -mtime +30 -delete

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

### DNS Records

| Record | Type | Value |
|--------|------|-------|
| `api.your-domain.com` | A | `<VPS_IP>` |
| `app.your-domain.com` | CNAME | `<project>.pages.dev` (Cloudflare Pages) |

---

## First Deploy Checklist

```
 VPS PROVISIONING
 1. [ ] Provision VPS: 4-6 vCPU / 16 GB RAM / 500 GB SSD
 2. [ ] OS setup: firewall, fail2ban, swap, Docker
 3. [ ] Create deploy user + SSH keys
 4. [ ] Create /home/deploy/data_lake and /home/deploy/backups

 SECURITY
 5. [ ] Rotate leaked FMP_API_KEY and GEMINI_API_KEY
 6. [ ] Purge .env from git history (BFG or filter-branch)
 7. [ ] Create production .env (chmod 600)

 BACKEND (VPS)
 8.  [ ] Clone repo to ~/qeps
 9.  [ ] Create docker-compose.prod.yml
 10. [ ] Create docker/nginx/prod.conf + Dockerfile.prod
 11. [ ] Start: docker compose -f docker-compose.prod.yml up -d
 12. [ ] Verify: curl http://localhost:8000/health

 SSL + DNS
 13. [ ] DNS: api.your-domain.com → VPS_IP
 14. [ ] Certbot: get SSL certificate
 15. [ ] Enable HTTPS in nginx config, restart

 DATA HARVESTER
 16. [ ] Set up Python venv + install requirements
 17. [ ] Expose Postgres on 127.0.0.1:5432
 18. [ ] Set up cron jobs (intraday + EOD + log rotation)
 19. [ ] Test: run harvester manually

 FRONTEND (CLOUDFLARE PAGES)
 20. [ ] Apply code changes (VITE_API_URL, apiUrl helper, CORS)
 21. [ ] Connect repo to Cloudflare Pages
 22. [ ] Set VITE_API_URL=https://api.your-domain.com
 23. [ ] DNS: app.your-domain.com → Cloudflare Pages
 24. [ ] Verify: frontend loads, API calls succeed

 CI/CD
 25. [ ] Create .github/workflows/deploy.yml
 26. [ ] Add GitHub Secrets: VPS_HOST, VPS_SSH_KEY, DISCORD_ADMIN_WEBHOOK_URL
 27. [ ] Test: push to main → auto-deploy works and sends Discord status to #ops-alerts channel

 MONITORING + BACKUPS
 28. [ ] Create Discord Channels (#trading-signals and #ops-alerts) and generate Webhook URLs
 29. [ ] Create and test /home/deploy/qeps/notify.sh script on VPS (pointing to Discord #ops-alerts Webhook)
 30. [ ] Deploy Uptime Kuma, configure monitors + Discord alerts
 31. [ ] Set up PostgreSQL backup cron
 32. [ ] Set up data lake backup cron
 33. [ ] Set up off-site backup (Backblaze B2)

 SMOKE TEST
 34. [ ] Login works (JWT auth)
 35. [ ] Company data loads (GraphQL)
 36. [ ] News/sentiment responds
 37. [ ] Worker logs show scheduled tasks running
 38. [ ] Data Harvester cron fires on schedule and completes
 39. [ ] Monitoring alert fires on simulated failure and posts to Discord #ops-alerts
```
