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
class AuthPayload:
    access_token: str
    token_type: str
    user: UserType

@strawberry.type
class MomentumPerformanceType:
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
    status: str
    years_tested: int
    total_trading_bars: int
    benchmark_nifty_return_pct: float
    momentum_performance: Optional[MomentumPerformanceType] = None
    event_strategies: Optional[List[StrategyBacktestType]] = None
