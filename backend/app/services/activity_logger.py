import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.infrastructure.models import AdminActivityLog

def log_activity_start(db: Session, user_email: str, event_type: str, event_name: str, celery_task_id: str = None, description: str = None, status: str = "RUNNING"):
    try:
        log = AdminActivityLog(
            user_email=user_email,
            event_type=event_type,
            event_name=event_name,
            event_description=description,
            celery_task_id=celery_task_id,
            status=status,
            started_at=datetime.utcnow()
        )
        if status != "RUNNING":
            log.completed_at = datetime.utcnow()
        db.add(log)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error logging activity start: {e}")

def log_activity_finish(db: Session, celery_task_id: str, status: str, error_message: str = None, metadata: dict = None):
    try:
        log = db.query(AdminActivityLog).filter(AdminActivityLog.celery_task_id == celery_task_id).first()
        if log:
            log.status = status
            log.completed_at = datetime.utcnow()
            
            if log.started_at:
                delta = log.completed_at - log.started_at
                log.duration_ms = int(delta.total_seconds() * 1000)
                
            if metadata or error_message:
                meta = metadata or {}
                if error_message:
                    meta["error"] = str(error_message)
                log.metadata_json = json.dumps(meta)
                
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error logging activity finish: {e}")

def cleanup_old_activity_logs(db: Session, days: int = 15):
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        db.query(AdminActivityLog).filter(AdminActivityLog.created_at < cutoff).delete()
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error cleaning up old activity logs: {e}")
