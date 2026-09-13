import strawberry
from typing import Optional, List

@strawberry.type
class UserType:
    id: str
    email: str
    is_active: bool

@strawberry.type
class HistoricalPriceType:
    date_str: str
    full_date: str
    close_price: float
    volume_str: str
    chg_pct: Optional[float] = None


@strawberry.type
class PredictionType:
    id: str
    target_quarter: str
    predicted_eps: float
    confidence_score: float
    current_price: Optional[float] = None
    historical_trend: Optional[str] = None
    created_at: str

@strawberry.type
class EarningsReportType:
    id: str
    fiscal_quarter: str
    report_date: str
    eps_estimate: Optional[float] = None
    eps_actual: Optional[float] = None
    revenue_actual: Optional[float] = None
    yoy_revenue_growth: Optional[float] = None
    yoy_profit_growth: Optional[float] = None
    eps_beat_miss: Optional[str] = None
    management_guidance: Optional[str] = None
    market_expectation: Optional[str] = None
    overall_rating: Optional[str] = None

@strawberry.type
class EventStudyResultType:
    id: str
    report_date: str
    prev_close: Optional[float] = None
    open_price: Optional[float] = None
    high_price: Optional[float] = None
    low_price: Optional[float] = None
    close_price: Optional[float] = None
    gap_pct: Optional[float] = None
    intraday_pct: Optional[float] = None
    volume_change_pct: Optional[float] = None
    ret_1d: Optional[float] = None
    ret_3d: Optional[float] = None
    ret_5d: Optional[float] = None
    ret_10d: Optional[float] = None
    ret_20d: Optional[float] = None
    ret_30d: Optional[float] = None
    ar_1d: Optional[float] = None
    ar_5d: Optional[float] = None
    ar_10d: Optional[float] = None
    ar_30d: Optional[float] = None
    car_30d: Optional[float] = None
    car_pvalue: Optional[float] = None
    max_gain: Optional[float] = None
    max_drawdown: Optional[float] = None

@strawberry.type
class StrategyBacktestType:
    id: str
    strategy_name: str
    total_trades: Optional[float] = None
    winning_trades: Optional[float] = None
    losing_trades: Optional[float] = None
    win_rate: Optional[float] = None
    avg_gain: Optional[float] = None
    avg_loss: Optional[float] = None
    max_gain: Optional[float] = None
    max_drawdown: Optional[float] = None
    expected_value: Optional[float] = None
    profit_factor: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    sharpe_ci_lower: Optional[float] = None
    sharpe_ci_upper: Optional[float] = None
    sharpe_pvalue: Optional[float] = None

@strawberry.type
class TechnicalSnapshotType:
    id: str
    date_calculated: str
    imm_support: Optional[float] = None
    maj_support: Optional[float] = None
    imm_resistance: Optional[float] = None
    maj_resistance: Optional[float] = None
    trend: Optional[str] = None
    dma_50: Optional[float] = None
    dma_100: Optional[float] = None
    dma_200: Optional[float] = None
    cross_status: Optional[str] = None
    rsi: Optional[float] = None
    macd: Optional[float] = None
    adx: Optional[float] = None
    volume_trend: Optional[str] = None
    vwap_position: Optional[str] = None
    trend_strength: Optional[str] = None

@strawberry.type
class BackgroundJobType:
    id: str
    celery_task_id: str
    task_name: str
    status: str
    queued_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    result: Optional[str] = None
    error_message: Optional[str] = None
    duration: Optional[float] = None


@strawberry.type
class BackgroundJobLiveStatusType:
    celery_task_id: str
    status: Optional[str] = None
    progress: Optional[str] = None
    logs: Optional[List[str]] = None

@strawberry.type
class AIAnalysisReportType:
    id: str
    date_generated: str
    statistical_analysis: Optional[str] = None
    pattern_recognition: Optional[str] = None
    risk_assessment: Optional[str] = None
    probability_analysis: Optional[str] = None
    trading_plan: Optional[str] = None
    final_verdict: Optional[str] = None
    overall_rating: Optional[str] = None
    
@strawberry.type
class MomentumSignalType:
    id: str
    date_calculated: str
    fundamental_score: Optional[float] = None
    technical_score: Optional[float] = None
    regime_score: Optional[float] = None
    smart_money_score: Optional[float] = None
    derivatives_score: Optional[float] = None
    composite_score: Optional[float] = None
    signal: Optional[str] = None
    confidence: Optional[float] = None
    stop_loss_price: Optional[float] = None
    position_size_pct: Optional[float] = None
    requires_attention: bool = False
    attention_reasons: Optional[str] = None

@strawberry.type
class MarketRegimeType:
    status: str
    score: float
    reason: str

@strawberry.type
class CompanyType:
    id: str
    ticker: str
    name: str
    sector: str
    purpose: Optional[str] = None
    upcoming_date: Optional[str] = None
    current_price: Optional[float] = None
    q1_eps: Optional[float] = None
    q2_eps: Optional[float] = None
    q3_eps: Optional[float] = None
    q4_eps: Optional[float] = None
    q0_eps: Optional[float] = None
    q1_date: Optional[str] = None
    q2_date: Optional[str] = None
    q3_date: Optional[str] = None
    q4_date: Optional[str] = None
    q1_revenue: Optional[float] = None
    q2_revenue: Optional[float] = None
    q3_revenue: Optional[float] = None
    q4_revenue: Optional[float] = None
    q0_revenue: Optional[float] = None
    q1_profit: Optional[float] = None
    q2_profit: Optional[float] = None
    q3_profit: Optional[float] = None
    q4_profit: Optional[float] = None
    q0_profit: Optional[float] = None
    historical_trend: Optional[str] = None
    financial_health_score: Optional[float] = None
    financial_health_grade: Optional[str] = None
    momentum_probability: Optional[float] = None
    avg_post_earnings_momentum: Optional[float] = None
    post_release_return: Optional[float] = None
    
    # Fundamental Snapshot
    market_cap: Optional[float] = None
    enterprise_value: Optional[float] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    all_time_high: Optional[float] = None
    all_time_low: Optional[float] = None
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    roe: Optional[float] = None
    roce: Optional[float] = None
    dividend_yield: Optional[float] = None
    book_value: Optional[float] = None
    debt_to_equity: Optional[float] = None
    promoter_holding: Optional[float] = None
    fii_holding: Optional[float] = None
    dii_holding: Optional[float] = None
    public_holding: Optional[float] = None

    predictions: Optional[List[PredictionType]] = None
    earnings: Optional[List[EarningsReportType]] = None
    event_studies: Optional[List[EventStudyResultType]] = None
    backtests: Optional[List[StrategyBacktestType]] = None
    technical_snapshots: Optional[List[TechnicalSnapshotType]] = None
    ai_reports: Optional[List[AIAnalysisReportType]] = None
    latest_momentum: Optional[MomentumSignalType] = None

@strawberry.type
class AdminActivityLogType:
    id: str
    user_email: str
    event_type: str
    event_name: str
    event_description: Optional[str] = None
    status: str
    started_at: str
    completed_at: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: str
    metadata_json: Optional[str] = None
    celery_task_id: Optional[str] = None

@strawberry.type
class AuthPayload:
    access_token: str
    token_type: str
    user: UserType

@strawberry.type
class MomentumPerformanceType:
    strategy_name: Optional[str] = "Multi-Factor ML Momentum"
    total_trades: int
    win_rate_pct: float
    net_total_return_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown_pct: float
    ml_hit_rate_pct: float
    brier_score: float
    alpha_vs_nifty_pct: float
    profit_factor: float
    avg_trade_return_pct: Optional[float] = 0.0

@strawberry.type
class IntensiveBacktestReportType:
    ticker: str
    company_name: Optional[str] = None
    status: str
    evaluation_horizon_years: int
    years_tested: int
    total_trading_bars: int
    benchmark_nifty_return_pct: float
    momentum_performance: Optional[MomentumPerformanceType] = None
    event_strategies: Optional[List[StrategyBacktestType]] = None


@strawberry.type
class HypothesisExperimentType:
    id: str
    hypothesis_id: str
    execution_date: str
    total_trials_in_family: int
    classic_sharpe: Optional[float] = None
    deflated_sharpe: Optional[float] = None
    spearman_ic_mean: Optional[float] = None
    spearman_ic_tstat: Optional[float] = None
    is_statistically_valid: bool
    failure_mode_tag: Optional[str] = None


@strawberry.type
class ResearchHypothesisType:
    id: str
    name: str
    author: str
    economic_mechanism: str
    economic_rationale_text: str
    alpha_expression: str
    target_universe: str
    holding_horizon_days: int
    current_stage: str
    created_at: str
    decommissioned_at: Optional[str] = None
    decommission_reason: Optional[str] = None
    experiments: Optional[List[HypothesisExperimentType]] = None


@strawberry.type
class CeleryScheduleType:
    name: str
    task_name: str
    cron_title: str
    interval_seconds: float
    human_readable_interval: str
    category: str
    description: str
    last_run_at: Optional[str] = None
    last_run_status: Optional[str] = None
    last_run_duration: Optional[float] = None
    next_run_at: Optional[str] = None
    last_run_result: Optional[str] = None
    last_run_error: Optional[str] = None

@strawberry.type
class WorkerExecutionHistoryType:
    id: str
    task_name: str
    status: str
    queued_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    duration_ms: Optional[float] = None
    result: Optional[str] = None
    error_message: Optional[str] = None

@strawberry.type
class HypothesisSignalType:
    id: str
    hypothesis_id: str
    ticker: str
    trade_date: str
    factor_score: Optional[float] = None
    rank_percentile: Optional[float] = None
    direction: str

@strawberry.type
class CatalystSourceType:
    id: str
    event_id: str
    source_name: str
    url: Optional[str] = None
    is_primary: bool
    published_at: Optional[str] = None
    created_at: str

@strawberry.type
class CatalystEventType:
    id: str
    ticker: str
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    event_title: str
    event_type: str
    category: str
    impact_score: Optional[float] = None
    early_score: Optional[float] = None
    confidence: str
    status: str
    tier: str
    match_status: str
    why_it_matters: Optional[str] = None
    reaction_pct: Optional[float] = None
    relative_volume: Optional[float] = None
    # Multi-horizon reaction metrics (P1.5)
    gap_reaction_pct: Optional[float] = None
    session_reaction_pct: Optional[float] = None
    reaction_1d: Optional[float] = None
    reaction_3d: Optional[float] = None
    reaction_5d: Optional[float] = None
    pre_event_price: Optional[float] = None
    market_cap_at_event: Optional[float] = None
    sector_at_event: Optional[str] = None
    published_at: Optional[str] = None
    detected_at: Optional[str] = None
    verified_at: Optional[str] = None
    created_at: str
    updated_at: str
    sources: Optional[List[CatalystSourceType]] = None

@strawberry.type
class CatalystPipelineRunType:
    id: str
    source_name: str
    source_status: str
    http_status_code: Optional[int] = None
    raw_fetched: int
    keyword_filtered: int
    symbol_unresolved: int
    auto_created_companies: int
    ai_classified: int
    ai_rejected: int
    duplicates: int
    noise_filtered: int
    saved: int
    execution_time_ms: int
    error_message: Optional[str] = None
    run_at: str

@strawberry.type
class EventAnalogStatsType:
    total_events_analyzed: int
    avg_gap_reaction: float
    avg_session_reaction: float
    avg_1d_return: float
    avg_3d_return: float
    avg_5d_return: float
    win_rate_5d: float

@strawberry.type
class PortfolioSimulationResultType:
    start_date: str
    end_date: str
    equity_curve: List[float]
    sharpe_ratio: float
    max_drawdown_pct: float
