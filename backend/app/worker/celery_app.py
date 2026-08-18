import os
from celery import Celery

redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "qeps_worker",
    broker=redis_url,
    backend=redis_url
)

from celery.schedules import crontab

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
        'cleanup-old-activity-logs-daily': {
            'task': 'app.worker.tasks.cleanup_old_activity_logs_task',
            'schedule': 86400.0, # Daily cleanup of admin logs older than 15 days
        },
        'scan-nse-catalysts-live': {
            'task': 'app.worker.tasks.scan_nse_catalysts_live_task',
            # P2.1 Session-Aware Scheduling: Mon-Fri, 3:00 AM - 11:59 AM UTC (8:30 AM - 5:29 PM IST)
            'schedule': crontab(minute='*/15', hour='3-11', day_of_week='mon-fri'),
        },
        'update-catalyst-outcomes-daily': {
            'task': 'app.worker.tasks.update_catalyst_outcomes_task',
            # P2.2 Outcome Tracking: Mon-Fri at 12:30 PM UTC (6:00 PM IST)
            'schedule': crontab(minute=30, hour=12, day_of_week='mon-fri'),
        },
        'scan-pre-catalyst-anomalies-daily': {
            'task': 'app.worker.tasks.scan_pre_catalyst_anomalies_task',
            # P3.3 Pre-Catalyst Signals: Mon-Fri at 08:30 AM UTC (14:00 PM IST)
            'schedule': crontab(minute=30, hour=8, day_of_week='mon-fri'),
        },
        'scan-insider-trades-daily': {
            'task': 'app.worker.tasks.scan_insider_trades_task',
            # P2.5 Insider Trading: Mon-Fri at 12:30 PM UTC (18:00 IST - post market)
            'schedule': crontab(minute=30, hour=12, day_of_week='mon-fri'),
        },
    }
)

import app.worker.signals
