import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.infrastructure.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)

class Company(Base):
    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    sector = Column(String)
    purpose = Column(String, nullable=True)
    upcoming_date = Column(String, nullable=True)
    
    # Bulk fetched data
    current_price = Column(Float, nullable=True)
    q1_eps = Column(Float, nullable=True)
    q2_eps = Column(Float, nullable=True)
    q3_eps = Column(Float, nullable=True)
    q4_eps = Column(Float, nullable=True)
    q0_eps = Column(Float, nullable=True)
    q1_date = Column(String, nullable=True)
    q2_date = Column(String, nullable=True)
    q3_date = Column(String, nullable=True)
    q4_date = Column(String, nullable=True)
    q1_revenue = Column(Float, nullable=True)
    q2_revenue = Column(Float, nullable=True)
    q3_revenue = Column(Float, nullable=True)
    q4_revenue = Column(Float, nullable=True)
    q0_revenue = Column(Float, nullable=True)
    q1_profit = Column(Float, nullable=True)
    q2_profit = Column(Float, nullable=True)
    q3_profit = Column(Float, nullable=True)
    q4_profit = Column(Float, nullable=True)
    q0_profit = Column(Float, nullable=True)
    historical_trend = Column(String, nullable=True)
    financial_health_score = Column(Float, nullable=True)
    financial_health_grade = Column(String, nullable=True)
    momentum_probability = Column(Float, nullable=True)
    avg_post_earnings_momentum = Column(Float, nullable=True)
    post_release_return = Column(Float, nullable=True)
    
    # Fundamental Snapshot
    market_cap = Column(Float, nullable=True)
    enterprise_value = Column(Float, nullable=True)
    high_52w = Column(Float, nullable=True)
    low_52w = Column(Float, nullable=True)
    all_time_high = Column(Float, nullable=True)
    all_time_low = Column(Float, nullable=True)
    pe_ratio = Column(Float, nullable=True)
    pb_ratio = Column(Float, nullable=True)
    roe = Column(Float, nullable=True)
    roce = Column(Float, nullable=True)
    dividend_yield = Column(Float, nullable=True)
    book_value = Column(Float, nullable=True)
    debt_to_equity = Column(Float, nullable=True)
    promoter_holding = Column(Float, nullable=True)
    fii_holding = Column(Float, nullable=True)
    dii_holding = Column(Float, nullable=True)
    public_holding = Column(Float, nullable=True)
    known_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    period_end = Column(DateTime, nullable=True)

    earnings_reports = relationship("EarningsReport", back_populates="company", cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="company", cascade="all, delete-orphan")
    event_studies = relationship("EventStudyResult", back_populates="company", cascade="all, delete-orphan")
    backtests = relationship("StrategyBacktest", back_populates="company", cascade="all, delete-orphan")
    technical_snapshots = relationship("TechnicalSnapshot", back_populates="company", cascade="all, delete-orphan")
    ai_reports = relationship("AIAnalysisReport", back_populates="company", cascade="all, delete-orphan")
    momentum_signals = relationship("MomentumSignal", back_populates="company", cascade="all, delete-orphan")

class EarningsReport(Base):
    __tablename__ = "earnings_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    fiscal_quarter = Column(String, nullable=False)
    report_date = Column(DateTime)
    eps_estimate = Column(Float)
    eps_actual = Column(Float, nullable=True)
    revenue_actual = Column(Float, nullable=True)
    yoy_revenue_growth = Column(Float, nullable=True)
    yoy_profit_growth = Column(Float, nullable=True)
    eps_beat_miss = Column(String, nullable=True)
    management_guidance = Column(String, nullable=True)
    market_expectation = Column(String, nullable=True)
    overall_rating = Column(String, nullable=True)
    known_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    period_end = Column(DateTime, nullable=True)

    company = relationship("Company", back_populates="earnings_reports")

class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    target_quarter = Column(String, nullable=False)
    predicted_eps = Column(Float, nullable=False)
    confidence_score = Column(Float, nullable=False)
    current_price = Column(Float, nullable=True)
    historical_trend = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="predictions")

class EventStudyResult(Base):
    __tablename__ = "event_studies"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    earnings_report_id = Column(UUID(as_uuid=True), ForeignKey("earnings_reports.id"), nullable=True)
    report_date = Column(DateTime, nullable=False)
    prev_close = Column(Float, nullable=True)
    open_price = Column(Float, nullable=True)
    high_price = Column(Float, nullable=True)
    low_price = Column(Float, nullable=True)
    close_price = Column(Float, nullable=True)
    gap_pct = Column(Float, nullable=True)
    intraday_pct = Column(Float, nullable=True)
    volume_change_pct = Column(Float, nullable=True)
    ret_1d = Column(Float, nullable=True)
    ret_3d = Column(Float, nullable=True)
    ret_5d = Column(Float, nullable=True)
    ret_10d = Column(Float, nullable=True)
    ret_20d = Column(Float, nullable=True)
    ret_30d = Column(Float, nullable=True)
    max_gain = Column(Float, nullable=True)
    max_drawdown = Column(Float, nullable=True)
    company = relationship("Company", back_populates="event_studies")

class StrategyBacktest(Base):
    __tablename__ = "strategy_backtests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    strategy_name = Column(String, nullable=False)
    total_trades = Column(Float, nullable=True)
    winning_trades = Column(Float, nullable=True)
    losing_trades = Column(Float, nullable=True)
    win_rate = Column(Float, nullable=True)
    avg_gain = Column(Float, nullable=True)
    avg_loss = Column(Float, nullable=True)
    max_gain = Column(Float, nullable=True)
    max_drawdown = Column(Float, nullable=True)
    expected_value = Column(Float, nullable=True)
    profit_factor = Column(Float, nullable=True)
    company = relationship("Company", back_populates="backtests")

class TechnicalSnapshot(Base):
    __tablename__ = "technical_snapshots"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    date_calculated = Column(DateTime, default=datetime.utcnow)
    imm_support = Column(Float, nullable=True)
    maj_support = Column(Float, nullable=True)
    imm_resistance = Column(Float, nullable=True)
    maj_resistance = Column(Float, nullable=True)
    trend = Column(String, nullable=True)
    dma_50 = Column(Float, nullable=True)
    dma_100 = Column(Float, nullable=True)
    dma_200 = Column(Float, nullable=True)
    cross_status = Column(String, nullable=True)
    rsi = Column(Float, nullable=True)
    macd = Column(Float, nullable=True)
    adx = Column(Float, nullable=True)
    volume_trend = Column(String, nullable=True)
    vwap_position = Column(String, nullable=True)
    trend_strength = Column(String, nullable=True)
    company = relationship("Company", back_populates="technical_snapshots")

class AIAnalysisReport(Base):
    __tablename__ = "ai_analysis_reports"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    date_generated = Column(DateTime, default=datetime.utcnow)
    statistical_analysis = Column(String, nullable=True)
    pattern_recognition = Column(String, nullable=True)
    risk_assessment = Column(String, nullable=True)
    probability_analysis = Column(String, nullable=True)
    trading_plan = Column(String, nullable=True)
    final_verdict = Column(String, nullable=True)
    overall_rating = Column(String, nullable=True)
    company = relationship("Company", back_populates="ai_reports")

class BackgroundJob(Base):
    __tablename__ = "background_jobs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    celery_task_id = Column(String, unique=True, index=True, nullable=False)
    task_name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="QUEUED")
    queued_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    result = Column(String, nullable=True)
    error_message = Column(String, nullable=True)

class MomentumSignal(Base):
    __tablename__ = "momentum_signals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    date_calculated = Column(DateTime, default=datetime.utcnow)
    fundamental_score = Column(Float, nullable=True)
    technical_score = Column(Float, nullable=True)
    regime_score = Column(Float, nullable=True)
    smart_money_score = Column(Float, nullable=True)
    derivatives_score = Column(Float, nullable=True)
    composite_score = Column(Float, nullable=True)
    signal = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)
    stop_loss_price = Column(Float, nullable=True)
    position_size_pct = Column(Float, nullable=True)
    requires_attention = Column(Boolean, default=False)
    attention_reasons = Column(String, nullable=True)
    known_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    period_end = Column(DateTime, nullable=True)
    company = relationship("Company", back_populates="momentum_signals")


class DailyBhavcopy(Base):
    __tablename__ = "daily_bhavcopy"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker = Column(String, index=True, nullable=False)
    trade_date = Column(DateTime, nullable=False, index=True)
    open_price = Column(Float, nullable=True)
    high_price = Column(Float, nullable=True)
    low_price = Column(Float, nullable=True)
    close_price = Column(Float, nullable=True)
    volume = Column(Float, nullable=True)
    delivery_pct = Column(Float, nullable=True)
    known_at = Column(DateTime, default=datetime.utcnow)


class BulkBlockDeal(Base):
    __tablename__ = "bulk_block_deals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker = Column(String, index=True, nullable=False)
    deal_date = Column(DateTime, nullable=False)
    deal_type = Column(String, nullable=False) # 'BULK' or 'BLOCK'
    client_name = Column(String, nullable=True)
    direction = Column(String, nullable=False) # 'BUY' or 'SELL'
    quantity = Column(Float, nullable=True)
    trade_price = Column(Float, nullable=True)
    known_at = Column(DateTime, default=datetime.utcnow)


class SurveillanceWatchlist(Base):
    __tablename__ = "surveillance_watchlist"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker = Column(String, unique=True, index=True, nullable=False)
    list_type = Column(String, nullable=False) # 'ASM', 'GSM', or 'CIRCUIT_FROZEN'
    stage = Column(String, nullable=True)
    date_added = Column(DateTime, default=datetime.utcnow)
    known_at = Column(DateTime, default=datetime.utcnow)


class ScorePredictionLog(Base):
    __tablename__ = "score_prediction_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    ticker = Column(String, index=True, nullable=False)
    baseline_price = Column(Float, nullable=True)
    date_evaluated = Column(DateTime, default=datetime.utcnow, index=True)
    composite_score = Column(Float, nullable=True)
    prob_gain_3d = Column(Float, nullable=True)
    prob_gain_5d = Column(Float, nullable=True)
    prob_gain_10d = Column(Float, nullable=True)
    signal_emitted = Column(String, nullable=True)
    model_version_id = Column(String, nullable=True, default="production")
    is_shadow = Column(Boolean, default=False)
    realized_3d_return = Column(Float, nullable=True)
    realized_5d_return = Column(Float, nullable=True)
    realized_10d_return = Column(Float, nullable=True)
    known_at = Column(DateTime, default=datetime.utcnow)


class ResearchHypothesis(Base):
    __tablename__ = "research_hypotheses"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True, index=True)
    author = Column(String, default="AI_RESEARCH_AGENT", nullable=False)
    economic_mechanism = Column(String, nullable=False)  # 'BEHAVIORAL', 'RISK_PREMIUM', or 'MICROSTRUCTURE'
    economic_rationale_text = Column(Text, nullable=False)
    alpha_expression = Column(String, nullable=False)    # e.g., "rank(volatility_20) / adv_10"
    normalized_expression = Column(String, unique=True, index=True, nullable=True)
    target_universe = Column(String, default="NIFTY500")
    holding_horizon_days = Column(Integer, default=5)
    current_stage = Column(String, default="DRAFT_HYPOTHESIS", index=True) # FSM Stage
    created_at = Column(DateTime, default=datetime.utcnow)
    decommissioned_at = Column(DateTime, nullable=True)
    decommission_reason = Column(String, nullable=True)
    known_at = Column(DateTime, default=datetime.utcnow)
    experiments = relationship("HypothesisExperiment", back_populates="hypothesis", cascade="all, delete-orphan", order_by="desc(HypothesisExperiment.execution_date)")


class HypothesisExperiment(Base):
    __tablename__ = "hypothesis_experiments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hypothesis_id = Column(UUID(as_uuid=True), ForeignKey("research_hypotheses.id", ondelete="CASCADE"), nullable=False)
    execution_date = Column(DateTime, default=datetime.utcnow)
    test_window_start = Column(DateTime, nullable=True)
    test_window_end = Column(DateTime, nullable=True)
    total_trials_in_family = Column(Integer, default=1)       # Crucial for Deflated Sharpe Ratio calculation
    classic_sharpe = Column(Float, nullable=True)
    deflated_sharpe = Column(Float, nullable=True)
    spearman_ic_mean = Column(Float, nullable=True)
    spearman_ic_tstat = Column(Float, nullable=True)
    max_drawdown_pct = Column(Float, nullable=True)
    turnover_decay_penalty = Column(Float, nullable=True)
    is_statistically_valid = Column(Boolean, default=False)
    failure_mode_tag = Column(String, nullable=True)          # e.g., "HIGH_MULTIPLE_TESTING_PENALTY"
    known_at = Column(DateTime, default=datetime.utcnow)
    hypothesis = relationship("ResearchHypothesis", back_populates="experiments")


class TotalHypothesisTrials(Base):
    __tablename__ = "total_hypothesis_trials"
    id = Column(Integer, primary_key=True, default=1)
    total_count = Column(Integer, default=0, nullable=False)


class HypothesisSignal(Base):
    __tablename__ = "hypothesis_signals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hypothesis_id = Column(UUID(as_uuid=True), ForeignKey("research_hypotheses.id", ondelete="CASCADE"), nullable=False, index=True)
    ticker = Column(String, index=True, nullable=False)
    trade_date = Column(DateTime, nullable=False, index=True)
    factor_score = Column(Float, nullable=True)
    rank_percentile = Column(Float, nullable=True)
    direction = Column(String, nullable=False) # 'LONG' or 'SHORT'
    hypothesis = relationship("ResearchHypothesis")
