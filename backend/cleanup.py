from app.infrastructure.database import SessionLocal
from app.infrastructure.models import Company, EarningsReport, Prediction

def clean_db():
    db = SessionLocal()
    try:
        # Delete predictions, earnings reports, and companies that are NOT sector='NSE'
        non_nse_companies = db.query(Company).filter(Company.sector != "NSE").all()
        for c in non_nse_companies:
            db.query(Prediction).filter(Prediction.company_id == c.id).delete()
            db.query(EarningsReport).filter(EarningsReport.company_id == c.id).delete()
            db.delete(c)
        db.commit()
        print(f"Purged {len(non_nse_companies)} non-NSE companies from database.")
    finally:
        db.close()

if __name__ == "__main__":
    clean_db()
