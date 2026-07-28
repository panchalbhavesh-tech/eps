import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey
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

    earnings_reports = relationship("EarningsReport", back_populates="company", cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="company", cascade="all, delete-orphan")
    event_studies = relationship("EventStudyResult", back_populates="company", cascade="all, delete-orphan")
    backtests = relationship("StrategyBacktest", back_populates="company", cascade="all, delete-orphan")
    technical_snapshots = relationship("TechnicalSnapshot", back_populates="company", cascade="all, delete-orphan")
    ai_reports = relationship("AIAnalysisReport", back_populates="company", cascade="all, delete-orphan")

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

