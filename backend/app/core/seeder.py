from sqlalchemy.orm import Session
from app.infrastructure.models import User, Company
from app.core.security import get_password_hash

def seed_database(db: Session):
    # Check if admin user exists
    admin_user = db.query(User).filter(User.email == "admin@qeps.com").first()
    if not admin_user:
        admin_user = User(
            email="admin@qeps.com",
            hashed_password=get_password_hash("adminpassword"),
            is_active=True
        )
        db.add(admin_user)

    # Seed default companies
    default_companies = [
        {"ticker": "AAPL", "name": "Apple Inc.", "sector": "Technology"},
        {"ticker": "MSFT", "name": "Microsoft Corp.", "sector": "Technology"},
        {"ticker": "TSLA", "name": "Tesla, Inc.", "sector": "Automotive"}
    ]

    for c_data in default_companies:
        company = db.query(Company).filter(Company.ticker == c_data["ticker"]).first()
        if not company:
            company = Company(**c_data)
            db.add(company)

    db.commit()
