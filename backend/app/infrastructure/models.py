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
    bse_scrip_code = Column(String, index=True, nullable=True)
    isin = Column(String, index=True, nullable=True)
    name = Column(String, nullable=False)
    sector = Column(String)
    industry = Column(String, nullable=True, index=True)
    purpose = Column(String, nullable=True)
    upcoming_date = Column(String, nullable=True)
    
    # Lifecycle & Metadata
    ipo_date = Column(DateTime, nullable=True)
    delisted_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    listing_status = Column(String, default="Active")
    
    # Data Availability Metadata
    earliest_historical_date = Column(DateTime, nullable=True)
    latest_historical_date = Column(DateTime, nullable=True)
    historical_years_available = Column(Float, nullable=True)
    total_daily_bars = Column(Integer, nullable=True)
    data_completeness_pct = Column(Float, nullable=True)
    
    # System Tracking
    system_added_date = Column(DateTime, default=datetime.utcnow)
    last_harvested_at = Column(DateTime, nullable=True)
    last_error_log = Column(String, nullable=True)
    
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
    # Exact exchange broadcast time (IST, naive) and trading session it fell in: PRE / MARKET / POST / UNKNOWN
    announced_at = Column(DateTime, nullable=True)
    announcement_session = Column(String, nullable=True)
    date_source = Column(String, nullable=True)

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
    ar_1d = Column(Float, nullable=True)
    ar_5d = Column(Float, nullable=True)
    ar_10d = Column(Float, nullable=True)
    ar_30d = Column(Float, nullable=True)
    car_30d = Column(Float, nullable=True)
    car_pvalue = Column(Float, nullable=True)
    max_gain = Column(Float, nullable=True)
    max_drawdown = Column(Float, nullable=True)
    # Pre-release edge fields: baseline = last close before the information reached the market
    announcement_session = Column(String, nullable=True)
    baseline_date = Column(DateTime, nullable=True)
    beta = Column(Float, nullable=True)
    ar_3d = Column(Float, nullable=True)
    runup_ar_3d = Column(Float, nullable=True)
    runup_ar_5d = Column(Float, nullable=True)
    runup_ar_7d = Column(Float, nullable=True)
    runup_ar_10d = Column(Float, nullable=True)
    pre_volume_ratio = Column(Float, nullable=True)
    features_json = Column(Text, nullable=True)
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
    sharpe_ratio = Column(Float, nullable=True)
    sharpe_ci_lower = Column(Float, nullable=True)
    sharpe_ci_upper = Column(Float, nullable=True)
    sharpe_pvalue = Column(Float, nullable=True)
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

class AdminActivityLog(Base):
    __tablename__ = "admin_activity_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String, index=True, nullable=False)
    event_type = Column(String, index=True, nullable=False)
    event_name = Column(String, index=True, nullable=False)
    event_description = Column(String, nullable=True)
    status = Column(String, index=True, nullable=False, default="RUNNING")
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    metadata_json = Column(String, nullable=True)
    celery_task_id = Column(String, nullable=True, index=True)

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
    raw_dma200_dist = Column(Float, nullable=True)
    raw_rel_vol = Column(Float, nullable=True)
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
    from sqlalchemy import UniqueConstraint
    __table_args__ = (UniqueConstraint('ticker', 'trade_date', name='uq_ticker_trade_date'),)
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
    target_universe = Column(String, default="NSE_ALL")
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
    hypothesis = relationship("ResearchHypothesis", back_populates="experiments")
    execution_date = Column(DateTime, default=datetime.utcnow)
    test_window_start = Column(DateTime, nullable=True)
    test_window_end = Column(DateTime, nullable=True)
    total_trials_in_family = Column(Integer, default=1)       # Crucial for Deflated Sharpe Ratio calculation
    classic_sharpe = Column(Float, nullable=True)
    deflated_sharpe = Column(Float, nullable=True)
    pbo = Column(Float, nullable=True)
    spearman_ic_mean = Column(Float, nullable=True)
    spearman_ic_tstat = Column(Float, nullable=True)
    max_drawdown_pct = Column(Float, nullable=True)
    turnover_decay_penalty = Column(Float, nullable=True)
    is_statistically_valid = Column(Boolean, default=False)
    failure_mode_tag = Column(String, nullable=True)

class HypothesisAuditLog(Base):
    __tablename__ = "hypothesis_audit_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hypothesis_id = Column(UUID(as_uuid=True), ForeignKey("research_hypotheses.id"))
    author = Column(String, index=True)
    action = Column(String)  # e.g., 'CREATED', 'EVALUATED', 'PROMOTED', 'DECOMMISSIONED'
    details = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    known_at = Column(DateTime, default=datetime.utcnow)
    hypothesis = relationship("ResearchHypothesis")


class TotalHypothesisTrials(Base):
    __tablename__ = "total_hypothesis_trials"
    id = Column(Integer, primary_key=True, default=1)
    total_count = Column(Integer, default=0, nullable=False)


class FamaFrenchFactor(Base):
    __tablename__ = "fama_french_factors"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trade_date = Column(DateTime, nullable=False, unique=True, index=True)
    mkt_rf = Column(Float)
    smb = Column(Float)
    hml = Column(Float)
    rf = Column(Float)
    known_at = Column(DateTime, default=datetime.utcnow)


class HistoricalConstituent(Base):
    __tablename__ = "historical_constituents"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    index_name = Column(String, index=True)
    ticker = Column(String, index=True)
    added_date = Column(DateTime)
    removed_date = Column(DateTime, nullable=True)
    removal_reason = Column(String, nullable=True)
    known_at = Column(DateTime, default=datetime.utcnow)

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


class FundamentalSnapshot(Base):
    __tablename__ = "fundamental_snapshots"
    from sqlalchemy import UniqueConstraint
    __table_args__ = (UniqueConstraint('ticker', 'trade_date', name='uq_fund_snapshot_ticker_trade_date'),)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker = Column(String, index=True, nullable=False)
    # trade_date represents the date this information became publicly actionable 
    # (e.g. filing/announcement date), NOT the fiscal period end date.
    trade_date = Column(DateTime, nullable=False, index=True)
    roe = Column(Float, nullable=True)
    debt_to_equity = Column(Float, nullable=True)
    pe_ratio = Column(Float, nullable=True)
    revenue = Column(Float, nullable=True)
    net_income = Column(Float, nullable=True)
    captured_at = Column(DateTime, default=datetime.utcnow)

class CatalystEvent(Base):
    __tablename__ = "catalyst_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker = Column(String, index=True, nullable=False)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    event_title = Column(String, nullable=False)
    event_type = Column(String, index=True, nullable=False)
    category = Column(String, index=True, nullable=False)
    impact_score = Column(Float, nullable=True)
    early_score = Column(Float, nullable=True)
    confidence = Column(String, nullable=False, default="MEDIUM") # HIGH, MEDIUM, LOW
    status = Column(String, index=True, nullable=False, default="EARLY") # EARLY, DEVELOPING, EXTENDED, LATE, INFORMATIONAL
    tier = Column(String, index=True, nullable=False, default="C-TIER") # S-TIER, A-TIER, B-TIER, C-TIER, NOISE
    match_status = Column(String, nullable=False, default="MATCHED") # MATCHED, AMBIGUOUS, UNMATCHED
    why_it_matters = Column(Text, nullable=True)
    reaction_pct = Column(Float, nullable=True)
    relative_volume = Column(Float, nullable=True)
    # Multi-horizon reaction metrics (P1.5)
    gap_reaction_pct = Column(Float, nullable=True)       # (Open on catalyst day - Prev Close) / Prev Close
    session_reaction_pct = Column(Float, nullable=True)    # (Close on catalyst day - Prev Close) / Prev Close
    reaction_1d = Column(Float, nullable=True)
    reaction_3d = Column(Float, nullable=True)
    reaction_5d = Column(Float, nullable=True)
    pre_event_price = Column(Float, nullable=True)         # Close price strictly before publication
    # Catalyst intelligence (classifier + measured evidence)
    subtype = Column(String, nullable=True, index=True)
    direction = Column(String, nullable=True)              # BULLISH / BEARISH / MIXED
    alert_grade = Column(String, nullable=True)            # INSTANT / DIGEST / NONE
    alerted_at = Column(DateTime, nullable=True)
    details_json = Column(Text, nullable=True)
    market_cap_at_event = Column(Float, nullable=True)     # Company market cap at time of catalyst
    sector_at_event = Column(String, nullable=True)        # Sector at time of catalyst
    published_at = Column(DateTime, nullable=True)
    detected_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    company = relationship("Company")
    sources = relationship("CatalystSource", back_populates="event", cascade="all, delete-orphan")

class CatalystEvidenceEvent(Base):
    """Historical classified filing + measured price reaction; the evidence base for catalyst alert quality."""
    __tablename__ = "catalyst_evidence_events"
    from sqlalchemy import UniqueConstraint
    __table_args__ = (UniqueConstraint('ticker', 'published_at', 'subtype', name='uq_catalyst_evidence'),)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    ticker = Column(String, index=True, nullable=False)
    published_at = Column(DateTime, nullable=False, index=True)
    nse_category = Column(String, nullable=True)
    subtype = Column(String, index=True, nullable=False)
    hint = Column(String, nullable=True)
    session = Column(String, nullable=True)
    amount_cr = Column(Float, nullable=True)
    size_rev_pct = Column(Float, nullable=True)
    size_mcap_pct = Column(Float, nullable=True)
    size_bucket = Column(String, nullable=True)
    rating_action = Column(String, nullable=True)
    pdf_parsed = Column(Boolean, default=False)
    results_overlap = Column(Boolean, default=False)
    turnover_cr = Column(Float, nullable=True)
    mcap_cr = Column(Float, nullable=True)
    gap_pct = Column(Float, nullable=True)
    ar_1d = Column(Float, nullable=True)
    ar_3d = Column(Float, nullable=True)
    ar_5d = Column(Float, nullable=True)
    runup_ar_5d = Column(Float, nullable=True)
    text = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CatalystSource(Base):
    __tablename__ = "catalyst_sources"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("catalyst_events.id", ondelete="CASCADE"), nullable=False)
    source_name = Column(String, nullable=False)
    url = Column(String, nullable=True)
    is_primary = Column(Boolean, default=False)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    event = relationship("CatalystEvent", back_populates="sources")


class CatalystPipelineRun(Base):
    """Pipeline observability: tracks every scan execution for health monitoring."""
    __tablename__ = "catalyst_pipeline_runs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_at = Column(DateTime, default=datetime.utcnow, index=True)
    source_name = Column(String, nullable=False, default="NSE")            # NSE, BSE, BULK_BLOCK
    source_status = Column(String, nullable=False, default="UNKNOWN")      # SUCCESS, API_ERROR, TIMEOUT, RATE_LIMITED, EMPTY
    http_status_code = Column(Integer, nullable=True)
    raw_fetched = Column(Integer, default=0)
    keyword_filtered = Column(Integer, default=0)
    symbol_unresolved = Column(Integer, default=0)
    auto_created_companies = Column(Integer, default=0)
    ai_classified = Column(Integer, default=0)
    ai_rejected = Column(Integer, default=0)
    duplicates = Column(Integer, default=0)
    noise_filtered = Column(Integer, default=0)
    saved = Column(Integer, default=0)
    execution_time_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)


class PreReleasePrediction(Base):
    """One pre-release edge forecast per company per upcoming results event, refreshed daily until the event and graded afterwards."""
    __tablename__ = "pre_release_predictions"
    from sqlalchemy import UniqueConstraint
    __table_args__ = (UniqueConstraint('company_id', 'event_date', name='uq_pre_release_company_event'),)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    ticker = Column(String, index=True, nullable=False)
    event_date = Column(DateTime, nullable=False, index=True)
    event_session = Column(String, nullable=True)
    as_of_date = Column(DateTime, nullable=True)
    first_predicted_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    engine = Column(String, nullable=True)            # ML or SCORECARD
    model_version = Column(String, nullable=True)
    n_prior_events = Column(Integer, nullable=True)

    p_runup = Column(Float, nullable=True)
    runup_p10 = Column(Float, nullable=True)
    runup_p50 = Column(Float, nullable=True)
    runup_p90 = Column(Float, nullable=True)
    p_reaction = Column(Float, nullable=True)
    reaction_p10 = Column(Float, nullable=True)
    reaction_p50 = Column(Float, nullable=True)
    reaction_p90 = Column(Float, nullable=True)

    verdict = Column(String, nullable=True)           # RUN-UP PLAY / HOLD-THROUGH PLAY / AVOID / NO EDGE
    strategy = Column(String, nullable=True)          # RUNUP / HOLD / NONE
    confidence = Column(String, nullable=True)        # HIGH / MEDIUM / LOW
    conviction_score = Column(Float, nullable=True)

    entry_date = Column(DateTime, nullable=True)
    exit_date = Column(DateTime, nullable=True)
    entry_price_ref = Column(Float, nullable=True)
    stop_price = Column(Float, nullable=True)
    target_price = Column(Float, nullable=True)
    stretch_target = Column(Float, nullable=True)
    position_size_pct = Column(Float, nullable=True)

    implied_move_pct = Column(Float, nullable=True)
    hist_avg_move_pct = Column(Float, nullable=True)
    put_call_ratio = Column(Float, nullable=True)

    drivers_json = Column(Text, nullable=True)
    details_json = Column(Text, nullable=True)
    history_json = Column(Text, nullable=True)

    graded = Column(Boolean, default=False, index=True)
    graded_at = Column(DateTime, nullable=True)
    realized_runup = Column(Float, nullable=True)
    realized_reaction_3d = Column(Float, nullable=True)
    realized_reaction_5d = Column(Float, nullable=True)
    realized_trade_return = Column(Float, nullable=True)
    hit = Column(Boolean, nullable=True)


class MomentumTradeAlert(Base):
    """A BUY alert sent to Discord and its lifecycle (Target 1 / Target 2 / stop / momentum break / time stop)."""
    __tablename__ = "momentum_trade_alerts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    ticker = Column(String, index=True, nullable=False)
    status = Column(String, index=True, nullable=False, default="OPEN")    # OPEN / CLOSED
    opened_at = Column(DateTime, default=datetime.utcnow, index=True)
    entry_price = Column(Float, nullable=False)
    initial_stop = Column(Float, nullable=False)
    stop_price = Column(Float, nullable=False)
    target1 = Column(Float, nullable=False)
    target2 = Column(Float, nullable=False)
    t1_hit_at = Column(DateTime, nullable=True)
    max_price = Column(Float, nullable=True)
    composite_score = Column(Float, nullable=True)
    prob_gain_5d = Column(Float, nullable=True)
    triggers = Column(Text, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    exit_price = Column(Float, nullable=True)
    exit_reason = Column(String, nullable=True)
    return_pct = Column(Float, nullable=True)


class CorporateActionEvent(Base):
    """
    One past corporate action (dividend, bonus, split, buyback, rights, demerger) or fund-raising board meeting,
    with its measured abnormal returns (vs Nifty) around the notice, declaration and ex-date.
    The evidence base behind the Impactful Events page; live lists are computed on the fly, not stored.
    """
    __tablename__ = "corporate_action_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_key = Column(String, unique=True, nullable=False)          # TICKER|KIND|date
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    ticker = Column(String, index=True, nullable=False)
    kind = Column(String, index=True, nullable=False)                # DIVIDEND BONUS SPLIT BUYBACK RIGHTS DEMERGER FUNDRAISE
    subject = Column(String, nullable=True)
    ex_date = Column(DateTime, nullable=True, index=True)
    record_date = Column(DateTime, nullable=True)
    meeting_date = Column(DateTime, nullable=True)
    notice_at = Column(DateTime, nullable=True)
    with_results = Column(Boolean, default=False)
    amount = Column(Float, nullable=True)                            # dividend Rs per share (at the time)
    split_factor = Column(Float, nullable=True)                      # bonus / split share multiplier
    yield_pct = Column(Float, nullable=True)
    surprise_pct = Column(Float, nullable=True)                      # vs the same dividend ~1 year earlier (split-adjusted)
    price = Column(Float, nullable=True)                             # actual (unadjusted) close before the ex-date / meeting
    adv_cr = Column(Float, nullable=True)                            # 20-session average traded value, Rs crore
    sessions_decl_to_ex = Column(Integer, nullable=True)
    ret_notice = Column(Float, nullable=True)                         # notice -> day before meeting
    ret_decl = Column(Float, nullable=True)                           # day before meeting -> day after meeting
    ret_runup = Column(Float, nullable=True)                          # day after declaration -> day before ex-date
    ret_pre10 = Column(Float, nullable=True)                          # 10 sessions before the ex-date
    ret_exday = Column(Float, nullable=True)                          # ex-date session (total return)
    ret_post5 = Column(Float, nullable=True)                          # ex-date -> 5 sessions later
    # month before the key date as closes / close on the exit day (session before), oldest first - lets the page
    # answer "if I had bought N sessions before the ex-date / meeting, what happened?" for any N
    path_ex = Column(String, nullable=True)
    path_mtg = Column(String, nullable=True)
    sessions_notice_to_mtg = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
