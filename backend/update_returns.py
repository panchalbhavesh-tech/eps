from app.infrastructure.database import SessionLocal
from app.infrastructure.models import Company
from app.services.quant_service import QuantService
import pandas as pd

def main():
    db = SessionLocal()
    quant = QuantService()
    companies = db.query(Company).all()

    count = 0
    for comp in companies:
        if not comp.upcoming_date:
            continue
            
        try:
            # We pass None for df, allowing fetch_historical_ohlcv to get the data
            pr_ret = quant.calculate_latest_post_release_return(comp.ticker, comp.upcoming_date)
            # We explicitly want to set it even if it's None to clear out bad data
            comp.post_release_return = pr_ret
            count += 1
            print(f"Updated {comp.ticker}: {pr_ret}")
        except Exception as e:
            print(f"Failed {comp.ticker}: {e}")

    db.commit()
    db.close()
    print(f"Updated {count} companies.")

if __name__ == "__main__":
    main()
