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
            'schedule': crontab(minute=0, hour=13, day_of_week='mon-fri'), # 13:00 UTC / 18:30 IST
        },
        'sync-nse-universe-daily': {
            'task': 'app.worker.tasks.sync_nse_universe_task',
            'schedule': crontab(minute=0, hour=13, day_of_week='mon-fri'), # 13:00 UTC / 18:30 IST
        },
        'sync-nse-market-data-daily': {
            'task': 'app.worker.tasks.sync_nse_market_data_task',
            'schedule': crontab(minute=30, hour=13, day_of_week='mon-fri'), # 13:30 UTC / 19:00 IST
        },
        'sync-ohlcv-cache-daily': {
            'task': 'app.worker.tasks.sync_ohlcv_cache_task',
            'schedule': crontab(minute=0, hour=14, day_of_week='mon-fri'), # 14:00 UTC / 19:30 IST
        },
        'calculate-universe-health-daily': {
            'task': 'app.worker.tasks.calculate_universe_health_task',
            'schedule': crontab(minute=30, hour=14, day_of_week='mon-fri'), # 14:30 UTC / 20:00 IST
        },
        'resolve-realized-forward-returns-daily': {
            'task': 'app.worker.tasks.resolve_realized_forward_returns_task',
            'schedule': crontab(minute=0, hour=15, day_of_week='mon-fri'), # 15:00 UTC / 20:30 IST
        },
        'retrain-momentum-ml-model-weekly': {
            'task': 'app.worker.tasks.retrain_momentum_ml_model_task',
            'schedule': crontab(minute=30, hour=15, day_of_week='sat'), # 15:30 UTC Saturdays
        },
        'audit-shadow-model-probation-weekly': {
            'task': 'app.worker.tasks.audit_shadow_model_performance_task',
            'schedule': crontab(minute=30, hour=16, day_of_week='sat'), # 16:30 UTC Saturdays
        },
        'run-automated-hypothesis-research-daily': {
            'task': 'app.worker.tasks.run_automated_hypothesis_research_task',
            'schedule': crontab(minute=30, hour=17, day_of_week='mon-fri'), # 17:30 UTC / 23:00 IST
        },
        'scan-nse-momentum-daily': {
            'task': 'app.worker.tasks.run_nse_momentum_scan_task',
            'schedule': crontab(minute=30, hour=18, day_of_week='mon-fri'), # 18:30 UTC / 00:00 IST
        },
        'cleanup-old-activity-logs-daily': {
            'task': 'app.worker.tasks.cleanup_old_activity_logs_task',
            'schedule': crontab(minute=0, hour=19), # 19:00 UTC Daily
        },
        'scan-nse-catalysts-live': {
            'task': 'app.worker.tasks.scan_nse_catalysts_live_task',
            # Mon-Fri 07:30-23:29 IST: most filings land after the 15:30 close, so evening coverage gives an earlier heads-up
            'schedule': crontab(minute='*/15', hour='2-17', day_of_week='mon-fri'),
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
        'monitor-momentum-trades': {
            'task': 'app.worker.tasks.monitor_momentum_trades_task',
            # 09:15-15:44 IST every 15 min: targets intraday; the 15:30+ runs apply stop/time-stop on the close
            'schedule': crontab(minute='*/15', hour='3-10', day_of_week='mon-fri'),
        },
        'momentum-scorecard-weekly': {
            'task': 'app.worker.tasks.send_momentum_scorecard_task',
            'schedule': crontab(minute=35, hour=4, day_of_week='sat'),  # Saturday 10:05 IST
        },
        'catalyst-digest-premarket': {
            'task': 'app.worker.tasks.send_catalyst_digest_task',
            'schedule': crontab(minute=15, hour=3, day_of_week='mon-fri'),  # 08:45 IST, before the 09:15 open
        },
        'catalyst-scorecard-weekly': {
            'task': 'app.worker.tasks.send_catalyst_scorecard_task',
            'schedule': crontab(minute=30, hour=4, day_of_week='sat'),  # Saturday 10:00 IST
        },
        'build-catalyst-evidence-weekly': {
            'task': 'app.worker.tasks.build_catalyst_evidence_task',
            'schedule': crontab(minute=0, hour=20, day_of_week='sat'),  # Sunday 01:30 IST
        },
        'pre-release-edge-daily': {
            'task': 'app.worker.tasks.run_pre_release_edge_pipeline_task',
            # After calendar (13:00) and OHLCV (14:00) syncs: 15:15 UTC / 20:45 IST
            'schedule': crontab(minute=15, hour=15, day_of_week='mon-fri'),
        },
        'refresh-impactful-events': {
            'task': 'app.worker.tasks.refresh_impactful_events_task',
            # Mon-Fri 07:30-23:30 IST every 30 min: board-meeting notices and declarations mostly land after the close
            'schedule': crontab(minute='0,30', hour='2-17', day_of_week='mon-fri'),
        },
        'build-corporate-action-evidence-weekly': {
            'task': 'app.worker.tasks.build_corporate_action_evidence_task',
            'schedule': crontab(minute=0, hour=6, day_of_week='sun'),  # Sunday 11:30 IST (after the catalyst build)
        },
        'backfill-earnings-history-weekly': {
            'task': 'app.worker.tasks.backfill_earnings_history_task',
            # Sundays 02:00 UTC: refreshes any company whose results history is older than 20 days
            'schedule': crontab(minute=0, hour=2, day_of_week='sun'),
        },
        'retrain-pre-release-model-weekly': {
            'task': 'app.worker.tasks.retrain_pre_release_model_task',
            'schedule': crontab(minute=0, hour=16, day_of_week='sat'), # 16:00 UTC Saturdays
        },
    }
)

import app.worker.signals
