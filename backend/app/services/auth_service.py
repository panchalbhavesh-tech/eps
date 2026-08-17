from sqlalchemy.orm import Session
from app.infrastructure.repositories import UserRepository
from app.infrastructure.models import User
from app.services.activity_logger import log_activity_start
from app.core.security import verify_password, get_password_hash, create_access_token
from typing import Optional, Dict

class AuthService:
    def __init__(self, db: Session):
        self.user_repo = UserRepository(db)

    def authenticate(self, email: str, password: str) -> Optional[User]:
        user = self.user_repo.get_by_email(email)
        if not user:
            return None
        if not user.is_active:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def login(self, email: str, password: str) -> Optional[Dict[str, str]]:
        user = self.authenticate(email, password)
        if not user:
            return None
        
        access_token = create_access_token(subject=user.id)
        
        # Log successful login activity
        log_activity_start(
            db=self.user_repo.db, 
            user_email=user.email, 
            event_type="AUTH", 
            event_name="LOGIN", 
            status="SUCCESS"
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_id": str(user.id)
        }
