from celery.signals import task_prerun, task_success, task_failure
from app.infrastructure.database import SessionLocal
from app.infrastructure.models import BackgroundJob, AdminActivityLog
from datetime import datetime
from app.services.activity_logger import log_activity_finish, log_activity_start
from app.worker.task_mappings import get_task_metadata

IGNORED_TASKS = {
    "app.worker.tasks.sync_single_ohlcv_task",
    "app.worker.tasks.sync_ohlcv_cache_callback"
}

@task_prerun.connect
def task_prerun_handler(task_id, task, *args, **kwargs):
    if task.name in IGNORED_TASKS:
        return
        
    db = SessionLocal()
    try:
        job = db.query(BackgroundJob).filter(BackgroundJob.celery_task_id == task_id).first()
        if not job:
            # If not explicitly queued beforehand, create it now
            job = BackgroundJob(
                celery_task_id=task_id,
                task_name=task.name
            )
            db.add(job)
        
        job.status = "RUNNING"
        job.started_at = datetime.utcnow()
        db.commit()

        # Update or Create AdminActivityLog
        admin_log = db.query(AdminActivityLog).filter(AdminActivityLog.celery_task_id == task_id).first()
        if admin_log:
            admin_log.status = "RUNNING"
            admin_log.started_at = datetime.utcnow()
            db.commit()
        else:
            # It's a CRON task (scheduled)
            meta = get_task_metadata(task.name)
            log_activity_start(db, "SYSTEM", meta["event_type"], meta["event_name"], task_id, status="RUNNING")

    except Exception as e:
        db.rollback()
        print(f"Error in task_prerun_handler: {e}")
    finally:
        db.close()

@task_success.connect
def task_success_handler(sender, result, **kwargs):
    task_id = sender.request.id
    db = SessionLocal()
    try:
        job = db.query(BackgroundJob).filter(BackgroundJob.celery_task_id == task_id).first()
        if job:
            job.status = "SUCCESS"
            job.finished_at = datetime.utcnow()
            job.result = str(result)
            db.commit()
        
        # Finish AdminActivityLog
        log_activity_finish(db, task_id, "SUCCESS", metadata={"result": str(result)[:200]})

    except Exception as e:
        db.rollback()
        print(f"Error in task_success_handler: {e}")
    finally:
        db.close()

@task_failure.connect
def task_failure_handler(task_id, exception, traceback, einfo, *args, **kwargs):
    db = SessionLocal()
    try:
        job = db.query(BackgroundJob).filter(BackgroundJob.celery_task_id == task_id).first()
        if job:
            job.status = "FAILURE"
            job.finished_at = datetime.utcnow()
            import traceback as tb
            job.error_message = "".join(tb.format_exception(type(exception), exception, traceback)) if traceback else str(exception)
            db.commit()
            
        # Finish AdminActivityLog
        import traceback as tb
        error_msg = "".join(tb.format_exception(type(exception), exception, traceback)) if traceback else str(exception)
        log_activity_finish(db, task_id, "FAILED", error_message=error_msg)

    except Exception as e:
        db.rollback()
        print(f"Error in task_failure_handler: {e}")
    finally:
        db.close()
