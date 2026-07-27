from fastapi import Depends, Request
from sqlalchemy.orm import Session
from app.infrastructure.database import get_db
from strawberry.fastapi import BaseContext
from jose import jwt, JWTError
from app.core.config import settings
from app.infrastructure.repositories import UserRepository
from typing import Optional
from app.infrastructure.models import User

class Context(BaseContext):
    def __init__(self, db: Session, user: Optional[User]):
        self.db = db
        self.user = user

def get_current_user(request: Request, db: Session) -> Optional[User]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
        
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
        
    user_repo = UserRepository(db)
    return user_repo.get_by_id(user_id)

async def get_context(request: Request, db: Session = Depends(get_db)) -> Context:
    user = get_current_user(request, db)
    return Context(db=db, user=user)
