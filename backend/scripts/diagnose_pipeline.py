import sys
import os
import json
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.infrastructure.database import SessionLocal
from app.services.catalyst_pipeline_service import CatalystPipelineService

def main():
    db = SessionLocal()
    try:
        print("=== DIAGNOSTIC RUN ===")
        svc = CatalystPipelineService(db)
        
        # 1. Fetch raw
        print("Fetching raw announcements from NSE...")
        raw = svc.nse_service.fetch_latest_corporate_announcements()
        print(f"RAW FETCHED: {len(raw)}")
        
        if not raw:
            print("ERROR: NSE API returned 0 records.")
            return

        print("\n--- First 3 Raw Records ---")
        for r in raw[:3]:
            print(json.dumps(r, indent=2))
        
        # Metrics
        raw_count = len(raw)
        missing_fields = 0
        duplicate = 0
        ignore_filtered = 0
        keyword_failed = 0
        symbol_unresolved = 0
        ai_rejected = 0
        saved = 0
        
        # 2. Trace
        for item in raw:
            symbol = item.get("symbol")
            subject = item.get("desc", "")
            details = item.get("attchmntText", "")
            broadcast_date = item.get("an_dt", "")
            
            if not symbol or not subject:
                missing_fields += 1
                continue
                
            from datetime import datetime
            try:
                dt = datetime.strptime(broadcast_date, "%d-%b-%Y %H:%M:%S")
            except Exception:
                dt = datetime.utcnow()
                
            # Deduplication
            today_start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
            from app.infrastructure.models import CatalystEvent
            existing = db.query(CatalystEvent).filter(
                CatalystEvent.ticker == symbol,
                CatalystEvent.event_title == subject,
                CatalystEvent.created_at >= today_start
            ).first()
            
            if existing:
                duplicate += 1
                continue
                
            # Pre-filter
            if svc.ignore_filters.search(subject):
                ignore_filtered += 1
                continue
                
            if not svc.keyword_filters.search(subject) and not svc.keyword_filters.search(details):
                keyword_failed += 1
                continue
                
            # Resolve Entity
            from app.infrastructure.models import Company
            company = db.query(Company).filter(Company.ticker == symbol).first()
            if not company:
                symbol_unresolved += 1
                continue
                
            # Mocking AI for diagnostic to just count
            ai_rejected += 1 # We'll just assume they fail or we won't call the real AI here to save time/tokens.
            # Actually, let's just log what SURVIVED to this point
            print(f"\nSURVIVED FILTERS: {symbol} - {subject}")
            print(f"Details: {details[:100]}...")
            
        print("\n=== DIAGNOSTIC RESULTS ===")
        print(f"Raw Fetched: {raw_count}")
        print(f"Missing Fields: {missing_fields}")
        print(f"Duplicates: {duplicate}")
        print(f"Ignore Filtered: {ignore_filtered}")
        print(f"Keyword Failed: {keyword_failed}")
        print(f"Symbol Unresolved: {symbol_unresolved}")
        print(f"Candidate Events reaching AI: {raw_count - (missing_fields + duplicate + ignore_filtered + keyword_failed + symbol_unresolved)}")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
