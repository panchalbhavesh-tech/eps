import os
import pandas as pd
from sqlalchemy import create_engine, text
from typing import List, Dict, Any

class DataLakeStorage:
    """
    Handles persisting data to the Parquet Data Lake (Historical)
    and PostgreSQL database (Intraday State).
    """
    def __init__(self):
        self.data_lake_path = os.environ.get("DATA_LAKE_PATH", "/app/data_lake")
        self.ohlcv_path = os.path.join(self.data_lake_path, "ohlcv/daily")
        os.makedirs(self.ohlcv_path, exist_ok=True)
        
        # Connect to existing Postgres for the 15-min snapshot state
        db_url = os.environ.get("DATABASE_URL", "postgresql://qeps_user:qeps_password@localhost:5432/qeps_db")
        self.engine = create_engine(db_url)
        self._init_db()
        
    def _init_db(self):
        # Ensure the live_quotes table exists in the Postgres DB
        with self.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS live_quotes (
                    ticker VARCHAR(20) PRIMARY KEY,
                    price FLOAT,
                    timestamp TIMESTAMP
                )
            """))
            
    def append_daily_ohlcv(self, ticker: str, df: pd.DataFrame):
        """
        Writes EOD OHLCV data to Parquet files for ML training.
        """
        if df.empty:
            return
            
        file_path = os.path.join(self.ohlcv_path, f"{ticker}.parquet")
        
        # If file exists, load, append, deduplicate, and save
        if os.path.exists(file_path):
            existing_df = pd.read_parquet(file_path)
            combined_df = pd.concat([existing_df, df])
            # Drop duplicates by index (Date) keeping the last (newest) entry
            combined_df = combined_df[~combined_df.index.duplicated(keep='last')]
            combined_df.sort_index(inplace=True)
            combined_df.to_parquet(file_path, engine='pyarrow')
        else:
            df.to_parquet(file_path, engine='pyarrow')
            
    def update_live_quotes(self, quotes: List[Dict[str, Any]]):
        """
        Upserts live quotes (15-min snapshot) into PostgreSQL.
        """
        if not quotes:
            return
            
        with self.engine.begin() as conn:
            for quote in quotes:
                conn.execute(text("""
                    INSERT INTO live_quotes (ticker, price, timestamp) 
                    VALUES (:ticker, :price, :timestamp)
                    ON CONFLICT (ticker) 
                    DO UPDATE SET price = EXCLUDED.price, timestamp = EXCLUDED.timestamp
                """), quote)
