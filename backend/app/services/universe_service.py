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
        Parses NSE index change circulars to sync historical additions and deletions.
        (Placeholder for full scraping logic)
        """
        pass
