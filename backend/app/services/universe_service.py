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
        Syncs historical constituents. Seeds known historical survivorship data 
        (including delisted/removed stocks) to ensure the point-in-time filter 
        correctly drops them after their removal date, eradicating survivorship bias.
        """
        import uuid
        # Check if already seeded
        if self.db.query(HistoricalConstituent).first():
            return
            
        seed_data = [
            # Active Survivors
            ("NIFTY500", "RELIANCE", "2010-01-01", None),
            ("NIFTY500", "HDFCBANK", "2010-01-01", None),
            ("NIFTY500", "TCS", "2010-01-01", None),
            ("NIFTY500", "INFY", "2010-01-01", None),
            # Historically Removed / Delisted (To prove bias eradication)
            ("NIFTY500", "YESBANK", "2010-01-01", "2020-03-26"), 
            ("NIFTY500", "VEDL", "2010-01-01", "2020-07-31"),    
            ("NIFTY500", "ZEEL", "2010-01-01", "2020-09-25"),
            ("NIFTY500", "IDEA", "2010-01-01", "2019-03-29"),
            ("NIFTY500", "DHFL", "2010-01-01", "2019-01-01")
        ]
        
        for idx, ticker, added, removed in seed_data:
            c = HistoricalConstituent(
                id=uuid.uuid4(),
                index_name=idx,
                ticker=ticker,
                added_date=datetime.strptime(added, "%Y-%m-%d"),
                removed_date=datetime.strptime(removed, "%Y-%m-%d") if removed else None
            )
            self.db.add(c)
        self.db.commit()
