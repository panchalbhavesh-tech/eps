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
            logging.getLogger(__name__).warning(f"No historical constituents found for {index_name} on {as_of_date}. Returning empty list to prevent survivorship bias.")
            return []
            
        return [c.ticker for c in constituents]
        
    def sync_historical_constituents(self):
        """
        Fetches the list of currently listed NSE equities from the official NSE archives.
        As per user decision, this accepts survivorship bias for historical backtesting
        in exchange for providing a comprehensive, realistic current universe (approx 2000+ stocks).
        """
        import uuid
        import logging
        
        # Check if already seeded to avoid redundant downloads
        if self.db.query(HistoricalConstituent).first():
            return
            
        logger = logging.getLogger(__name__)
        logger.info("Fetching current NSE equity universe...")
        
        try:
            # Official NSE URL for all listed equities
            url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
            df = pd.read_csv(url)
            
            # The CSV has a 'SYMBOL' column
            if 'SYMBOL' not in df.columns:
                raise ValueError("SYMBOL column not found in NSE CSV.")
                
            symbols = df['SYMBOL'].dropna().unique().tolist()
            logger.info(f"Successfully fetched {len(symbols)} symbols from NSE.")
            
        except Exception as e:
            logger.error(f"Failed to fetch NSE universe: {e}. Falling back to top 50.")
            # Fallback to NIFTY 50 if the NSE site blocks the request (common with automated requests)
            try:
                wiki_url = 'https://en.wikipedia.org/wiki/NIFTY_50'
                tables = pd.read_html(wiki_url)
                symbols = tables[1]['Symbol'].tolist()
            except Exception as e_wiki:
                logger.error(f"Wiki fallback failed: {e_wiki}")
                symbols = ["RELIANCE", "HDFCBANK", "TCS", "INFY", "ICICIBANK", "HINDUNILVR", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK"]
        
        # Seed the database
        # We use a default 'added_date' far in the past so they are always available in backtests
        default_added_date = datetime.strptime("2010-01-01", "%Y-%m-%d")
        
        for ticker in symbols:
            c = HistoricalConstituent(
                id=uuid.uuid4(),
                index_name="NSE_ALL",
                ticker=ticker,
                added_date=default_added_date,
                removed_date=None # Never removed, accepting survivorship bias
            )
            self.db.add(c)
            
        self.db.commit()
        logger.info("Universe synchronization complete.")
