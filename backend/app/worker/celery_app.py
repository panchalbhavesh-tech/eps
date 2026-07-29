import os
from celery import Celery

redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "qeps_worker",
    broker=redis_url,
    backend=redis_url
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    imports=["app.worker.tasks"],
    beat_schedule={
        'sync-nse-daily': {
            'task': 'app.worker.tasks.sync_nse_calendar_task',
            'schedule': 86400.0, # Every 24 hours
        },
        'scan-nse-momentum-daily': {
            'task': 'app.worker.tasks.run_nse_momentum_scan_task',
            'schedule': 86400.0, # Every 24 hours post-market
        },
        'retrain-momentum-ml-model-weekly': {
            'task': 'app.worker.tasks.retrain_momentum_ml_model_task',
            'schedule': 604800.0, # Weekly scheduled walk-forward model retraining
        },
    }
)

import app.worker.signals
