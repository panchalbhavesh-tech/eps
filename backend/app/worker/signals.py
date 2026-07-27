from celery.signals import task_prerun, task_success, task_failure
from app.infrastructure.database import SessionLocal
from app.infrastructure.models import BackgroundJob
from datetime import datetime

@task_prerun.connect
def task_prerun_handler(task_id, task, *args, **kwargs):
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
    except Exception as e:
        db.rollback()
        print(f"Error in task_failure_handler: {e}")
    finally:
        db.close()
