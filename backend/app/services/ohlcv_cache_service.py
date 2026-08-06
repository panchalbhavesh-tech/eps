import uuid
import time
import logging
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.infrastructure.models import DailyBhavcopy

logger = logging.getLogger(__name__)


class OHLCVCacheService:
    """
    Persistent OHLCV Cache Service.
    Eliminates redundant yfinance HTTP requests during daily scans by incrementally
    synchronizing daily bars into the DailyBhavcopy PostgreSQL cache table.
    """

    def __init__(self, db: Session):
        self.db = db

    def sync_ticker(self, ticker: str, years: int = 2) -> int:
        """
        Fetches historical OHLCV from Yahoo Finance and caches it in PostgreSQL.
        Performs incremental synchronization if earlier records already exist.
        Returns the number of new bars inserted into cache.
        """
        try:
            latest = self.db.query(func.max(DailyBhavcopy.trade_date)).filter(
                DailyBhavcopy.ticker == ticker
            ).scalar()

            yf_ticker = f"{ticker}.NS" if not ticker.endswith((".NS", ".BO", ".US", ".L", "^NSEI")) else ticker

            if latest:
                # Incremental download from day after latest cached bar
                start_date = (latest + timedelta(days=1)).strftime('%Y-%m-%d')
                now_date = datetime.utcnow().strftime('%Y-%m-%d')
                if start_date >= now_date:
                    return 0
                df = yf.download(yf_ticker, start=start_date, progress=False, timeout=10)
            else:
                # Full download
                df = yf.download(yf_ticker, period=f"{years}y", progress=False, timeout=10)

            if df.empty or len(df) == 0:
                return 0

            # Handle MultiIndex columns if yfinance returns them
            if isinstance(df.columns, pd.MultiIndex):
                try:
                    df = df.xs(yf_ticker, axis=1, level=-1)
                except Exception:
                    # Flatten multiindex if single ticker
                    df.columns = [col[0] for col in df.columns]

            # Prepare for upsert
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            from sqlalchemy.dialects.sqlite import insert as sqlite_insert
            
            dialect = self.db.bind.dialect.name

            inserted_count = 0
            for date_idx, row in df.iterrows():
                try:
                    dt = pd.to_datetime(date_idx).tz_localize(None) if hasattr(pd.to_datetime(date_idx), 'tz_localize') and pd.to_datetime(date_idx).tz is not None else pd.to_datetime(date_idx)
                    
                    open_val = float(row.get('Open', 0.0))
                    high_val = float(row.get('High', 0.0))
                    low_val = float(row.get('Low', 0.0))
                    close_val = float(row.get('Close', 0.0))
                    vol_val = float(row.get('Volume', 0.0))

                    if close_val <= 0 or pd.isna(close_val):
                        continue

                    val_dict = {
                        'id': uuid.uuid4(),
                        'ticker': ticker,
                        'trade_date': dt,
                        'open_price': round(open_val, 2),
                        'high_price': round(high_val, 2),
                        'low_price': round(low_val, 2),
                        'close_price': round(close_val, 2),
                        'volume': vol_val,
                        'known_at': datetime.utcnow()
                    }

                    if dialect == 'postgresql':
                        stmt = pg_insert(DailyBhavcopy).values(**val_dict)
                        stmt = stmt.on_conflict_do_update(
                            index_elements=['ticker', 'trade_date'],
                            set_={
                                'open_price': stmt.excluded.open_price,
                                'high_price': stmt.excluded.high_price,
                                'low_price': stmt.excluded.low_price,
                                'close_price': stmt.excluded.close_price,
                                'volume': stmt.excluded.volume,
                                'known_at': stmt.excluded.known_at,
                            }
                        )
                        self.db.execute(stmt)
                    elif dialect == 'sqlite':
                        stmt = sqlite_insert(DailyBhavcopy).values(**val_dict)
                        stmt = stmt.on_conflict_do_update(
                            index_elements=['ticker', 'trade_date'],
                            set_={
                                'open_price': stmt.excluded.open_price,
                                'high_price': stmt.excluded.high_price,
                                'low_price': stmt.excluded.low_price,
                                'close_price': stmt.excluded.close_price,
                                'volume': stmt.excluded.volume,
                                'known_at': stmt.excluded.known_at,
                            }
                        )
                        self.db.execute(stmt)
                    else:
                        # Fallback to check-and-insert for other DBs
                        exists = self.db.query(DailyBhavcopy.id).filter(
                            DailyBhavcopy.ticker == ticker,
                            DailyBhavcopy.trade_date == dt
                        ).first()
                        if not exists:
                            bhav = DailyBhavcopy(**val_dict)
                            self.db.add(bhav)

                    inserted_count += 1
                except Exception as e:
                    print(f"Error upserting row {date_idx}: {e}")
                    continue

            if inserted_count > 0:
                self.db.commit()

            return inserted_count
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error syncing OHLCV cache for {ticker}: {e}")
            return 0

    def get_ohlcv(self, ticker: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, as_of_date: Optional[datetime] = None) -> pd.DataFrame:
        """
        Retrieves cached historical OHLCV directly from database as a pandas DataFrame formatted like yfinance outputs.
        Returns an empty DataFrame if no cached data exists.
        """
        try:
            query = self.db.query(DailyBhavcopy).filter(DailyBhavcopy.ticker == ticker)
            if start_date:
                query = query.filter(DailyBhavcopy.trade_date >= start_date)
            if end_date:
                query = query.filter(DailyBhavcopy.trade_date <= end_date)
            if as_of_date:
                query = query.filter(DailyBhavcopy.trade_date <= as_of_date)

            rows = query.order_by(DailyBhavcopy.trade_date.asc()).all()
            if not rows:
                return pd.DataFrame()

            data = []
            for r in rows:
                data.append({
                    "Date": r.trade_date,
                    "Open": r.open_price,
                    "High": r.high_price,
                    "Low": r.low_price,
                    "Close": r.close_price,
                    "Volume": r.volume
                })

            df = pd.DataFrame(data)
            df.set_index("Date", inplace=True)
            return df
        except Exception as e:
            logger.error(f"Error reading OHLCV cache for {ticker}: {e}")
            return pd.DataFrame()
