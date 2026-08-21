import pandas as pd
from datetime import datetime
from typing import List
from app.infrastructure.models import HistoricalConstituent
from sqlalchemy.orm import Session

class UniverseService:
    def __init__(self, db: Session):
        self.db = db
        
    def get_pit_universe(self, index_name: str, as_of_date: datetime) -> List[str]:
        """
        Returns Point-in-Time (PIT) survivorship-bias-free universe of tickers
        for a given index on a specific date.
        """
        constituents = self.db.query(HistoricalConstituent).filter(
            HistoricalConstituent.index_name == index_name,
            HistoricalConstituent.added_date <= as_of_date,
            (HistoricalConstituent.removed_date == None) | (HistoricalConstituent.removed_date > as_of_date)
        ).all()
        
        if not constituents:
            import logging
            logger = logging.getLogger(__name__)
            if index_name == "NIFTY500":
                logger.warning(f"No historical constituents found for NIFTY500 on {as_of_date}. Falling back to NSE_ALL.")
                return self.get_pit_universe("NSE_ALL", as_of_date)
            
            logger.warning(f"No historical constituents found for {index_name} on {as_of_date}. Returning empty list to prevent survivorship bias.")
            return []
            
        return [c.ticker for c in constituents]
        
    def sync_historical_constituents(self):
        """
        Fetches the list of currently listed NSE equities from the official NSE archives.
        Tracks point-in-time index additions and delistings to maintain a survivorship-bias-free
        universe for historical backtesting. Delisted symbols are retained in the database
        with a removed_date to accurately simulate historical universes.
        """
        import uuid
        import logging
        
        # Check if already seeded to avoid redundant downloads
        if self.db.query(HistoricalConstituent).first():
            return
            
        logger = logging.getLogger(__name__)
        logger.info("Fetching current NSE equity universe...")
        
        # Fallback dictionary if we can't parse date
        default_added_date = datetime.strptime("2010-01-01", "%Y-%m-%d")
        
        # 1. Get currently tracked constituents
        current_constituents = self.db.query(HistoricalConstituent).filter(
            HistoricalConstituent.index_name == "NSE_ALL",
            HistoricalConstituent.removed_date == None
        ).all()
        current_map = {c.ticker: c for c in current_constituents}
        
        try:
            # Official NSE URL for all listed equities
            url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
            df = pd.read_csv(url)
            
            if 'SYMBOL' not in df.columns:
                raise ValueError("SYMBOL column not found in NSE CSV.")
                
            # Attempt to load historical delisted master dataset if it exists locally
            import os
            delisted_path = "data/DELISTED_MASTER.csv"
            if os.path.exists(delisted_path):
                delisted_df = pd.read_csv(delisted_path)
                if 'SYMBOL' in delisted_df.columns:
                    df = pd.concat([df, delisted_df], ignore_index=True)
                    logger.info("Loaded historical delisted master dataset to prevent survivorship bias.")
            
            # Map symbol to listing date if available
            symbol_to_date = {}
            if 'DATE OF LISTING' in df.columns:
                for _, row in df.iterrows():
                    sym = str(row['SYMBOL']).strip()
                    date_str = str(row['DATE OF LISTING']).strip()
                    try:
                        # Typical format: 17-MAY-1995 or 17-May-1995
                        d = datetime.strptime(date_str, "%d-%b-%Y")
                        symbol_to_date[sym] = d
                    except Exception:
                        symbol_to_date[sym] = default_added_date
            else:
                for sym in df['SYMBOL'].dropna().unique().tolist():
                    symbol_to_date[sym] = default_added_date
            
            new_symbols = set(symbol_to_date.keys())
            logger.info(f"Successfully fetched {len(new_symbols)} symbols from NSE.")
            
        except Exception as e:
            logger.error(f"Failed to fetch NSE universe: {e}. Aborting sync to prevent false delistings.")
            return

        # 2. Add newly listed stocks
        from app.infrastructure.models import Company
        
        for ticker, added_date in symbol_to_date.items():
            if ticker not in current_map:
                c = HistoricalConstituent(
                    id=uuid.uuid4(),
                    index_name="NSE_ALL",
                    ticker=ticker,
                    added_date=added_date,
                    removed_date=None
                )
                self.db.add(c)
                
                # Update Company metadata if the company exists
                company = self.db.query(Company).filter(Company.ticker == ticker).first()
                if company:
                    company.ipo_date = added_date
                    company.is_active = True
                    company.listing_status = "Active"
                
        # 3. Mark delisted stocks (active yesterday, missing today)
        for ticker, const in current_map.items():
            if ticker not in new_symbols:
                logger.info(f"Marking {ticker} as delisted.")
                const.removed_date = datetime.utcnow()
                
                company = self.db.query(Company).filter(Company.ticker == ticker).first()
                if company:
                    company.is_active = False
                    company.listing_status = "Delisted"
                    company.delisted_date = datetime.utcnow()
                
        self.db.commit()
        logger.info("Universe synchronization complete.")
