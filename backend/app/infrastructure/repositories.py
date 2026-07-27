from sqlalchemy.orm import Session
from app.infrastructure.models import User, Company
from typing import Optional, List

class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()
        
    def get_by_id(self, user_id: str) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def create(self, user: User) -> User:
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user


class CompanyRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> List[Company]:
        return self.db.query(Company).all()

    def get_by_ticker(self, ticker: str) -> Optional[Company]:
        return self.db.query(Company).filter(Company.ticker == ticker).first()
        
    def create(self, company: Company) -> Company:
        self.db.add(company)
        self.db.commit()
        self.db.refresh(company)
        return company
