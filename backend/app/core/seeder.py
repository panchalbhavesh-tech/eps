from sqlalchemy.orm import Session
from app.infrastructure.models import User, Company
from app.core.security import get_password_hash

from app.core.config import settings

def seed_database(db: Session):
    # Safely deactivate old admin account if it exists
    old_admin = db.query(User).filter(User.email == "admin@qeps.com").first()
    if old_admin and old_admin.is_active:
        old_admin.is_active = False
        db.commit()

    # Ensure configured developer accounts exist
    developer_accounts = [
        {"email": settings.AUTH_USER_1_EMAIL, "password": settings.AUTH_USER_1_PASSWORD},
        {"email": settings.AUTH_USER_2_EMAIL, "password": settings.AUTH_USER_2_PASSWORD},
    ]

    for acc in developer_accounts:
        user = db.query(User).filter(User.email == acc["email"]).first()
        if not user:
            hashed_pw = get_password_hash(acc["password"])
            new_user = User(email=acc["email"], hashed_password=hashed_pw, is_active=True)
            db.add(new_user)

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
