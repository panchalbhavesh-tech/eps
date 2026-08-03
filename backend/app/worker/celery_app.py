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
        'sync-nse-market-data-daily': {
            'task': 'app.worker.tasks.sync_nse_market_data_task',
            'schedule': 86400.0, # Overnight Bhavcopy & Surveillance sync
        },
        'scan-nse-momentum-daily': {
            'task': 'app.worker.tasks.run_nse_momentum_scan_task',
            'schedule': 86400.0, # Every 24 hours post-market
        },
        'resolve-realized-forward-returns-daily': {
            'task': 'app.worker.tasks.resolve_realized_forward_returns_task',
            'schedule': 86400.0, # Daily backfill of realized returns and rolling IC calculation
        },
        'retrain-momentum-ml-model-weekly': {
            'task': 'app.worker.tasks.retrain_momentum_ml_model_task',
            'schedule': 604800.0, # Weekly scheduled walk-forward model retraining
        },
        'audit-shadow-model-probation-weekly': {
            'task': 'app.worker.tasks.audit_shadow_model_performance_task',
            'schedule': 604800.0, # Weekly review of 14-day shadow probation status
        },
        'sync-ohlcv-cache-daily': {
            'task': 'app.worker.tasks.sync_ohlcv_cache_task',
            'schedule': 86400.0, # Nightly incremental OHLCV cache synchronization
        },
        'run-automated-hypothesis-research-daily': {
            'task': 'app.worker.tasks.run_automated_hypothesis_research_task',
            'schedule': 86400.0, # Nightly QHLM FSM statistical evaluation and alpha decay retirement
        },
    }
)

import app.worker.signals
