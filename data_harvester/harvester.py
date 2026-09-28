import argparse
import os
import sys
from dotenv import load_dotenv

# Load variables from the root .env file automatically
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# Add root to path so we can run this directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vendors.upstox_provider import UpstoxProvider
from storage.data_lake import DataLakeStorage
from sqlalchemy import text

def get_universe(storage: DataLakeStorage):
    """Fetch all active company tickers from the database."""
    with storage.engine.connect() as conn:
        result = conn.execute(text("SELECT ticker FROM companies"))
        return [row[0] for row in result]

def run_intraday():
    """15-Min Snapshot: Fetch live quotes in bulk and upsert to Postgres."""
    print("Running Intraday Harvester (Live Quotes)...")
    provider = UpstoxProvider()
    storage = DataLakeStorage()
    
    tickers = get_universe(storage)
    if not tickers:
        print("No active companies found in universe.")
        return
        
    # Chunk into 500s (Upstox limit)
    chunk_size = 500
    for i in range(0, len(tickers), chunk_size):
        chunk = tickers[i:i + chunk_size]
        print(f"Fetching quotes for chunk {i} to {i+len(chunk)}...")
        quotes = provider.fetch_bulk_market_quotes(chunk)
        if quotes:
            storage.update_live_quotes(quotes)
    print("Intraday harvest complete.")

def run_eod(days: int):
    """End-Of-Day Batch: Fetch full daily candles and append to Parquet."""
    print(f"Running EOD Harvester (Fetching last {days} days of ML Data)...")
    provider = UpstoxProvider()
    storage = DataLakeStorage()
    
    tickers = get_universe(storage)
    for ticker in tickers:
        print(f"Fetching EOD data for {ticker}...")
        df = provider.fetch_historical_ohlcv(ticker, days=days) 
        if not df.empty:
            storage.append_daily_ohlcv(ticker, df)
            
            # Update data health metadata in Postgres
            try:
                from datetime import datetime, timezone
                from sqlalchemy import text
                
                # Fetch full data to get accurate history metrics
                full_df = storage.get_historical_ohlcv(ticker)
                if not full_df.empty:
                    import pandas as pd
                    earliest = pd.to_datetime(full_df.index.min()).to_pydatetime()
                    latest = pd.to_datetime(full_df.index.max()).to_pydatetime()
                    total_bars = len(full_df)
                    years_available = (latest - earliest).days / 365.25
                    
                    with storage.engine.connect() as conn:
                        conn.execute(
                            text("""
                                UPDATE companies 
                                SET last_harvested_at = :now,
                                    earliest_historical_date = :earliest,
                                    latest_historical_date = :latest,
                                    total_daily_bars = :total_bars,
                                    historical_years_available = :years
                                WHERE ticker = :ticker
                            """),
                            {"now": datetime.now(timezone.utc), "earliest": earliest, "latest": latest, "total_bars": total_bars, "years": years_available, "ticker": ticker}
                        )
                        conn.commit()
            except Exception as e:
                print(f"Failed to update metadata for {ticker}: {e}")
                
                with storage.engine.connect() as conn:
                    conn.execute(
                        text("UPDATE companies SET last_error_log = :error WHERE ticker = :ticker"),
                        {"error": str(e)[:250], "ticker": ticker}
                    )
                    conn.commit()
                    
    print("EOD harvest complete.")

import traceback
import requests

def notify_discord(message: str, is_error: bool = False):
    """Sends a notification to the Discord Admin Webhook."""
    webhook_url = os.environ.get("DISCORD_ADMIN_WEBHOOK_URL")
    if not webhook_url:
        print("Notice: DISCORD_ADMIN_WEBHOOK_URL not set in .env. Skipping Discord alert.")
        return
        
    color = 16711680 if is_error else 65280 # Red for error, Green for success
    prefix = "🚨 **HARVESTER CRASHED**" if is_error else "✅ **HARVESTER SUCCESS**"
    
    payload = {
        "embeds": [{
            "title": prefix,
            "description": message[:4000], # Discord limits description to 4096 chars
            "color": color
        }]
    }
    
    try:
        requests.post(webhook_url, json=payload, timeout=5)
    except Exception as e:
        print(f"Failed to send Discord notification: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EPS Data Harvester")
    parser.add_argument("--mode", choices=["intraday", "eod"], required=True, help="Mode to run in.")
    parser.add_argument("--days", type=int, default=5, help="Number of days to fetch for EOD mode (default 5)")
    args = parser.parse_args()
    
    try:
        if args.mode == "intraday":
            run_intraday()
        elif args.mode == "eod":
            run_eod(args.days)
            notify_discord(f"EOD Harvester successfully collected data for the last {args.days} days.", is_error=False)
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"FATAL ERROR: {error_trace}")
        notify_discord(f"The {args.mode.upper()} harvester encountered a fatal error and stopped:\n```python\n{error_trace}\n```", is_error=True)
        sys.exit(1)
