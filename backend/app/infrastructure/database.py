import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://qeps_user:qeps_password@postgres:5432/qeps_db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

import math
from sqlalchemy import event

def sanitize_nans(mapper, connection, target):
    """
    Globally intercepts all inserts/updates.
    Scans all float columns and forcefully sanitizes NaNs to 0.0
    preventing GraphQL 502 crashes on any environment.
    """
    for column in mapper.columns:
        if column.type.python_type == float:
            val = getattr(target, column.key, None)
            if val is not None and math.isnan(val):
                setattr(target, column.key, 0.0)

event.listens_for(Base, 'before_insert', sanitize_nans, propagate=True)
event.listens_for(Base, 'before_update', sanitize_nans, propagate=True)
