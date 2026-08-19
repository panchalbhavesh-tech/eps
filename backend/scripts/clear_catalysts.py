import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.infrastructure.database import SessionLocal
from app.infrastructure.models import CatalystEvent, CatalystSource

def clear_db():
    db = SessionLocal()
    try:
        print("Clearing Catalyst tables...")
        db.query(CatalystSource).delete()
        db.query(CatalystEvent).delete()
        db.commit()
        print("Cleared successfully.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    clear_db()
