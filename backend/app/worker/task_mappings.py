TASK_MAP = {
    "app.worker.tasks.generate_prediction_task": {"event_name": "Prediction Generation", "event_type": "ML"},
    "app.worker.tasks.populate_companies_data_task": {"event_name": "Sync & Populate Universe DB", "event_type": "DATABASE"},
    "app.worker.tasks.sync_nse_calendar_task": {"event_name": "Sync NSE Calendar", "event_type": "DATA_SYNC"},
    "app.worker.tasks.generate_deep_research_report_task": {"event_name": "Deep Research Report", "event_type": "CALCULATION"},
    "app.worker.tasks.mass_calculate_financial_health_task": {"event_name": "Calculate Health", "event_type": "CALCULATION"},
    "app.worker.tasks.run_nse_momentum_scan_task": {"event_name": "Momentum Scan", "event_type": "SCAN"},
    "app.worker.tasks.evaluate_single_hypothesis_task": {"event_name": "Hypothesis Registration & Evaluation", "event_type": "ML"},
    "app.worker.tasks.run_automated_hypothesis_research_task": {"event_name": "Automated Hypothesis Research", "event_type": "ML"},
    "app.worker.tasks.sync_nse_market_data_task": {"event_name": "Sync NSE Market Data", "event_type": "DATA_SYNC"},
    "app.worker.tasks.resolve_realized_forward_returns_task": {"event_name": "Resolve Realized Forward Returns", "event_type": "CALCULATION"},
    "app.worker.tasks.retrain_momentum_ml_model_task": {"event_name": "Retrain Momentum ML Model", "event_type": "ML"},
    "app.worker.tasks.audit_shadow_model_performance_task": {"event_name": "Audit Shadow Model Performance", "event_type": "ML"},
    "app.worker.tasks.sync_ohlcv_cache_task": {"event_name": "Sync OHLCV Cache", "event_type": "DATABASE"},
    "app.worker.tasks.cleanup_old_activity_logs_task": {"event_name": "Cleanup Old Admin Logs", "event_type": "SYSTEM"},
    "app.worker.tasks.run_pre_release_edge_pipeline_task": {"event_name": "Pre-Release Edge Forecasts", "event_type": "ML"},
    "app.worker.tasks.backfill_earnings_history_task": {"event_name": "Backfill Results History", "event_type": "DATA_SYNC"},
    "app.worker.tasks.retrain_pre_release_model_task": {"event_name": "Retrain Pre-Release Model", "event_type": "ML"},
}

def get_task_metadata(task_name: str) -> dict:
    if task_name in TASK_MAP:
        return TASK_MAP[task_name]
    return {"event_name": f"Worker: {task_name.split('.')[-1]}", "event_type": "WORKER"}
