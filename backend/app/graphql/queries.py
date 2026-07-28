import strawberry
from typing import List, Optional
from strawberry.types import Info
from app.graphql.types import CompanyType, UserType, BackgroundJobType
from app.services.company_service import CompanyService
from app.graphql.context import Context

@strawberry.type
class Query:
    @strawberry.field
    def me(self, info: Info[Context, None]) -> Optional[UserType]:
        user = info.context.user
        if not user:
            return None
        return UserType(id=str(user.id), email=user.email, is_active=user.is_active)

    @strawberry.field
    def companies(self, info: Info[Context, None]) -> List[CompanyType]:
        db = info.context.db
        service = CompanyService(db)
        companies = service.get_all_companies()
        return [
            CompanyType(
                id=str(c.id), 
                ticker=c.ticker, 
                name=c.name, 
                sector=c.sector or "",
                purpose=c.purpose,
                upcoming_date=c.upcoming_date,
                current_price=c.current_price,
                market_cap=c.market_cap,
                q1_eps=c.q1_eps,
                q2_eps=c.q2_eps,
                q3_eps=c.q3_eps,
                q4_eps=c.q4_eps,
                q0_eps=c.q0_eps,
                q1_date=c.q1_date,
                q2_date=c.q2_date,
                q3_date=c.q3_date,
                q4_date=c.q4_date,
                q1_revenue=c.q1_revenue,
                q2_revenue=c.q2_revenue,
                q3_revenue=c.q3_revenue,
                q4_revenue=c.q4_revenue,
                q0_revenue=c.q0_revenue,
                q1_profit=c.q1_profit,
                q2_profit=c.q2_profit,
                q3_profit=c.q3_profit,
                q4_profit=c.q4_profit,
                q0_profit=c.q0_profit,
                historical_trend=c.historical_trend,
                financial_health_score=c.financial_health_score,
                financial_health_grade=c.financial_health_grade
            ) for c in companies
        ]

    @strawberry.field
    def company(self, info: Info[Context, None], id: str) -> Optional[CompanyType]:
        from app.infrastructure.models import Company, Prediction, EarningsReport
        db = info.context.db
        c = db.query(Company).filter(Company.id == id).first()
        if not c:
            return None
            
        from app.graphql.types import PredictionType, EarningsReportType, EventStudyResultType, StrategyBacktestType, TechnicalSnapshotType, AIAnalysisReportType
        predictions = [PredictionType(id=str(p.id), target_quarter=p.target_quarter, predicted_eps=p.predicted_eps, confidence_score=p.confidence_score or 0, created_at=str(p.created_at)) for p in c.predictions]
        earnings = [EarningsReportType(id=str(e.id), fiscal_quarter=e.fiscal_quarter, report_date=str(e.report_date)) for e in c.earnings_reports]
        event_studies = [EventStudyResultType(**{k: v for k, v in e.__dict__.items() if not k.startswith('_') and k not in ('company_id', 'company', 'earnings_report_id')}) for e in c.event_studies]
        backtests = [StrategyBacktestType(**{k: v for k, v in b.__dict__.items() if not k.startswith('_') and k not in ('company_id', 'company')}) for b in c.backtests]
        techs = [TechnicalSnapshotType(**{k: v for k, v in t.__dict__.items() if not k.startswith('_') and k not in ('company_id', 'company')}) for t in c.technical_snapshots]
        ai_reports = [AIAnalysisReportType(**{k: v for k, v in a.__dict__.items() if not k.startswith('_') and k not in ('company_id', 'company')}) for a in c.ai_reports]
        
        return CompanyType(
            id=str(c.id),
            ticker=c.ticker,
            name=c.name,
            sector=c.sector or "",
            purpose=c.purpose,
            upcoming_date=c.upcoming_date,
            current_price=c.current_price,
            q1_eps=c.q1_eps,
            q2_eps=c.q2_eps,
            q3_eps=c.q3_eps,
            q4_eps=c.q4_eps,
            q0_eps=c.q0_eps,
            q1_date=c.q1_date,
            q2_date=c.q2_date,
            q3_date=c.q3_date,
            q4_date=c.q4_date,
            q1_revenue=c.q1_revenue,
            q2_revenue=c.q2_revenue,
            q3_revenue=c.q3_revenue,
            q4_revenue=c.q4_revenue,
            q0_revenue=c.q0_revenue,
            q1_profit=c.q1_profit,
            q2_profit=c.q2_profit,
            q3_profit=c.q3_profit,
            q4_profit=c.q4_profit,
            q0_profit=c.q0_profit,
            historical_trend=c.historical_trend,
            financial_health_score=c.financial_health_score,
            financial_health_grade=c.financial_health_grade,
            market_cap=c.market_cap,
            enterprise_value=c.enterprise_value,
            high_52w=c.high_52w,
            low_52w=c.low_52w,
            all_time_high=c.all_time_high,
            all_time_low=c.all_time_low,
            pe_ratio=c.pe_ratio,
            pb_ratio=c.pb_ratio,
            roe=c.roe,
            roce=c.roce,
            dividend_yield=c.dividend_yield,
            book_value=c.book_value,
            debt_to_equity=c.debt_to_equity,
            promoter_holding=c.promoter_holding,
            fii_holding=c.fii_holding,
            dii_holding=c.dii_holding,
            public_holding=c.public_holding,
            predictions=predictions,
            earnings=earnings,
            event_studies=event_studies,
            backtests=backtests,
            technical_snapshots=techs,
            ai_reports=ai_reports
        )

    @strawberry.field
    def background_jobs(self, info: Info[Context, None], limit: int = 100) -> List[BackgroundJobType]:
        from app.infrastructure.models import BackgroundJob
        from app.graphql.types import BackgroundJobType
        db = info.context.db
        jobs = db.query(BackgroundJob).order_by(BackgroundJob.queued_at.desc()).limit(limit).all()
        
        result = []
        for j in jobs:
            duration = None
            if j.started_at and j.finished_at:
                duration = (j.finished_at - j.started_at).total_seconds()
            elif j.started_at and not j.finished_at:
                from datetime import datetime
                duration = (datetime.utcnow() - j.started_at).total_seconds()
                
            result.append(
                BackgroundJobType(
                    id=str(j.id),
                    celery_task_id=j.celery_task_id,
                    task_name=j.task_name,
                    status=j.status,
                    queued_at=str(j.queued_at),
                    started_at=str(j.started_at) if j.started_at else None,
                    finished_at=str(j.finished_at) if j.finished_at else None,
                    result=j.result,
                    error_message=j.error_message,
                    duration=duration
                )
            )
        return result
