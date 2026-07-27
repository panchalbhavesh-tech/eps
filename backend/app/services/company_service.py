from sqlalchemy.orm import Session
from app.infrastructure.repositories import CompanyRepository
from app.infrastructure.models import Company
from typing import List, Optional

class CompanyService:
    def __init__(self, db: Session):
        self.company_repo = CompanyRepository(db)

    def get_all_companies(self) -> List[Company]:
        return self.company_repo.get_all()

    def get_company_by_ticker(self, ticker: str) -> Optional[Company]:
        return self.company_repo.get_by_ticker(ticker)
