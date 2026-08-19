import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.infrastructure.database import SessionLocal
from app.services.catalyst_pipeline_service import CatalystPipelineService

def main():
    db = SessionLocal()
    try:
        print("Initializing Catalyst Pipeline...")
        svc = CatalystPipelineService(db)
        
        print("Running pipeline...")
        result = svc.run_pipeline()
        
        print("\n--- Pipeline Result ---")
        for k, v in result.items():
            print(f"{k}: {v}")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
