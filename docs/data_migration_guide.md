# Data Migration & Backup Guide

This document outlines how to safely move the Quantitative EPS (qeps) system's data state from one machine to another. This is particularly useful for setting up a new development environment or taking manual backups.

The system state is distributed across two separate components:
1.  **PostgreSQL Database:** Stores the stock universe, computed ML signals, backtest records, and technical snapshots.
2.  **Parquet Data Lake:** Stores all the raw historical price data (OHLCV) downloaded via Upstox.

To migrate the system, you must copy **both**.

---

## 1. Exporting Data from the Source Machine

### Step 1.1: Dump the PostgreSQL Database
Since the database runs inside a Docker container (`qeps_postgres`), we use `pg_dump` to extract the tables into a single binary dump file.

Run these commands in the terminal on the **source machine** (from the root of the project):
```bash
# 1. Create the dump inside the postgres container
docker exec qeps_postgres pg_dump -U qeps_user -d qeps_db -F c -f /tmp/qeps_backup.dump

# 2. Copy the dump out of the container to your local Windows filesystem
docker cp qeps_postgres:/tmp/qeps_backup.dump .\qeps_backup.dump
```
You will now have a file named `qeps_backup.dump` in your project root.

### Step 1.2: Locate the Data Lake
The historical price data is stored in raw Parquet files.
Locate the folder at:
`data_harvester/data_lake/`

### Step 1.3: Transfer Files
Transfer both the `qeps_backup.dump` file and the entire `data_lake` directory to the target (new) machine via USB, network drive, or cloud storage.

---

## 2. Importing Data on the Target Machine

### Step 2.1: Initial Setup
On the new machine, clone the git repository and start the empty infrastructure:
```bash
docker compose up -d
```
Wait a few seconds for the `qeps_postgres` container to initialize the empty database.

### Step 2.2: Restore the Data Lake
Place the transferred `data_lake` folder into the exact same path in your new project folder:
`data_harvester/data_lake/`

### Step 2.3: Restore the PostgreSQL Database
Run these commands on the **new machine** to inject the SQL dump into the empty Docker database:
```bash
# 1. Copy the dump from your Windows filesystem into the empty container
docker cp .\qeps_backup.dump qeps_postgres:/tmp/qeps_backup.dump

# 2. Restore the database using pg_restore
docker exec qeps_postgres pg_restore -U qeps_user -d qeps_db -1 /tmp/qeps_backup.dump
```

*Note: The `-1` flag ensures the restoration happens in a single transaction. If it fails, it rolls back entirely, preventing a corrupted state.*

---

## 3. Verification
To verify the migration was successful:
1. Run the universe sync: `docker compose exec backend python -c "from app.services.universe_service import UniverseService; from app.infrastructure.database import SessionLocal; UniverseService(SessionLocal()).sync_historical_constituents()"`
2. Check your data lake size to ensure parquet files are present.
3. You should see all 3,109 active NSE stocks and their historical AI signals in the database.
