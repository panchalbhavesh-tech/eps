# EPS Data Harvester

The EPS Data Harvester is a standalone ingestion pipeline that isolates market data fetching (via Upstox) from the main EPS backend.

## Architecture

This pipeline follows a **Dual-Storage Architecture**:
1. **Intraday State (PostgreSQL):** Every 15 minutes, it fetches live quotes and upserts them into the existing PostgreSQL database (`live_quotes` table). The EPS backend reads this table for real-time dashboard data.
2. **Historical Data (Parquet):** At EOD, it fetches full daily OHLCV candles and appends them to Parquet files in the Data Lake. The ML pipeline reads these files for high-speed training.

## Configuration

Upstox now provides a **1-Year Analytics Token** specifically for fetching market data without needing daily automated TOTP logins.

1. Go to the [Upstox Developer Apps Console](https://account.upstox.com/developer/apps)
2. Navigate to the **Analytics** tab.
3. Click **Generate Token** and copy the long-lived token.

Set the following environment variables (or add them to your `.env` file):
```env
# Paste the 1-Year Analytics Token here
UPSTOX_ACCESS_TOKEN=your_1_year_analytics_token

DATA_LAKE_PATH=/app/data_lake
DATABASE_URL=postgresql://qeps_user:qeps_password@localhost:5432/qeps_db
```

## Bare-Metal Deployment Guide

The harvester is designed to be run via native Linux `cron` for maximum efficiency. 

### 1. Prepare the Server
SSH into your Linux server and ensure Python and pip are installed.
```bash
sudo apt update
sudo apt install python3 python3-pip git -y
```

### 2. Install Dependencies
Navigate to the Harvester directory and install the minimal dependencies.
```bash
cd /path/to/Eps/data_harvester
pip3 install -r requirements.txt
```

### 3. Verify Execution
Run a manual test to ensure it successfully connects to Upstox and your Postgres database before automating it.
```bash
python3 harvester.py --mode eod
```

### 4. Automate with Cron
Open the native Linux job scheduler:
```bash
crontab -e
```
Add the following two lines (ensure you use absolute paths to your repository):

```bash
# Run Intraday snapshots every 15 minutes during market hours (Mon-Fri)
*/15 9-15 * * 1-5 cd /absolute/path/to/Eps/data_harvester && python3 harvester.py --mode intraday >> harvester.log 2>&1

# Run the heavy End-Of-Day ML data dump at 4:00 PM (Mon-Fri)
0 16 * * 1-5 cd /absolute/path/to/Eps/data_harvester && python3 harvester.py --mode eod >> harvester.log 2>&1
```

The system will now run silently in the background, continuously writing to your Parquet lake and Postgres database.
