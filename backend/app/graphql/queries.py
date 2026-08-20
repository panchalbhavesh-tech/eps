import strawberry
from typing import List, Optional
from strawberry.types import Info
from app.graphql.types import BackgroundJobLiveStatusType, CompanyType, UserType, BackgroundJobType, HistoricalPriceType, MomentumSignalType, MarketRegimeType, IntensiveBacktestReportType, MomentumPerformanceType, StrategyBacktestType, ResearchHypothesisType, HypothesisExperimentType, CeleryScheduleType, HypothesisSignalType, AdminActivityLogType, CatalystEventType, CatalystSourceType, CatalystPipelineRunType, EventAnalogStatsType, WorkerExecutionHistoryType
from app.services.company_service import CompanyService
from app.graphql.context import Context
import uuid
from sqlalchemy.orm import Session

def get_latest_momentum_type(c):
    if hasattr(c, "momentum_signals") and c.momentum_signals:
        try:
            sorted_sigs = sorted(c.momentum_signals, key=lambda s: str(s.date_calculated or ''), reverse=True)
            s = sorted_sigs[0]
            return MomentumSignalType(
                id=str(s.id),
                date_calculated=str(s.date_calculated),
                fundamental_score=s.fundamental_score,
                technical_score=s.technical_score,
                regime_score=s.regime_score,
                smart_money_score=getattr(s, "smart_money_score", None),
                derivatives_score=getattr(s, "derivatives_score", None),
                composite_score=s.composite_score,
                signal=s.signal,
                confidence=s.confidence,
                stop_loss_price=s.stop_loss_price,
                position_size_pct=s.position_size_pct,
                requires_attention=bool(s.requires_attention),
                attention_reasons=s.attention_reasons
            )
        except Exception:
            pass
    return None


def get_company_momentum_stats(c):
    prob = getattr(c, "momentum_probability", None)
    avg_mom = getattr(c, "avg_post_earnings_momentum", None)
    if prob is not None and avg_mom is not None:
        return float(prob), float(avg_mom)

    momentums = []
    if hasattr(c, "event_studies") and c.event_studies:
        for es in c.event_studies:
            ret = getattr(es, "ret_5d", None) or getattr(es, "ret_3d", None) or getattr(es, "gap_pct", None)
            if ret is not None:
                try:
                    momentums.append(float(ret))
                except (ValueError, TypeError):
                    pass

    if len(momentums) < 4:
        momentums = []
        pairs = [
            (getattr(c, "q0_eps", None), getattr(c, "q1_eps", None), getattr(c, "q0_profit", None), getattr(c, "q1_profit", None)),
            (getattr(c, "q1_eps", None), getattr(c, "q2_eps", None), getattr(c, "q1_profit", None), getattr(c, "q2_profit", None)),
            (getattr(c, "q2_eps", None), getattr(c, "q3_eps", None), getattr(c, "q2_profit", None), getattr(c, "q3_profit", None)),
            (getattr(c, "q3_eps", None), getattr(c, "q4_eps", None), getattr(c, "q3_profit", None), getattr(c, "q4_profit", None))
        ]
        trends = getattr(c, "historical_trend", "UP,UP,UP,UP")
        trend_list = trends.split(",") if trends and trends != "N/A" else ["UP", "UP", "UP", "UP"]

        def is_valid(num):
            return num is not None and not (isinstance(num, float) and (num != num or num == float('inf') or num == float('-inf')))

        for idx, (p_eps, c_eps, p_prof, c_prof) in enumerate(pairs):
            pct_change = 0.0
            has_data = False
            if is_valid(p_eps) and is_valid(c_eps) and p_eps != 0:
                pct_change = ((c_eps - p_eps) / abs(p_eps)) * 100
                has_data = True
            elif is_valid(p_prof) and is_valid(c_prof) and p_prof != 0:
                pct_change = ((c_prof - p_prof) / abs(p_prof)) * 100
                has_data = True

            if has_data:
                mom = max(-18.0, min(18.0, round(pct_change * 0.35, 2)))
            else:
                tr = trend_list[idx] if idx < len(trend_list) else "UP"
                mom = 4.2 if tr == "UP" else (-2.8 if tr == "DOWN" else 0.5)
            momentums.append(mom)

    if not momentums:
        return 0.0, 0.0

    last_4 = momentums[-4:]
    pos_count = sum(1 for m in last_4 if m >= 0)
    prob = round((pos_count / len(last_4)) * 100, 1)
    avg_mom = round(sum(last_4) / len(last_4), 2)
    return float(prob), float(avg_mom)

@strawberry.type
class Query:
    @strawberry.field
    def me(self, info: Info[Context, None]) -> Optional[UserType]:
        user = info.context.user
        if not user:
            return None
        return UserType(id=str(user.id), email=user.email, is_active=user.is_active)

    @strawberry.field
    def latest_live_signals(self, info: Info[Context, None]) -> List[HypothesisSignalType]:
        db = info.context.db
        from app.infrastructure.models import HypothesisSignal
        signals = db.query(HypothesisSignal).order_by(HypothesisSignal.trade_date.desc()).limit(100).all()
        return [
            HypothesisSignalType(
                id=str(s.id),
                hypothesis_id=str(s.hypothesis_id),
                ticker=s.ticker,
                trade_date=str(s.trade_date),
                factor_score=s.factor_score,
                rank_percentile=s.rank_percentile,
                direction=s.direction
            ) for s in signals
        ]

    @strawberry.field
    def historical_prices(self, info: Info[Context, None], ticker: str, years: int = 2) -> List[HistoricalPriceType]:
        from app.services.quant_service import QuantService
        import pandas as pd
        
        quant = QuantService()
        df = quant.fetch_historical_ohlcv(ticker, years=years)
        
        if df.empty:
            return []
            
        result = []
        prev_close = None
        
        df = df.sort_index()
        
        for date_idx, row in df.iterrows():
            try:
                close_val = row['Close']
                if isinstance(close_val, pd.Series):
                    close_val = close_val.iloc[0]
                close = float(close_val)

                vol_val = row['Volume']
                if isinstance(vol_val, pd.Series):
                    vol_val = vol_val.iloc[0]
                vol = float(vol_val)
            except Exception:
                continue
                
            if pd.isna(close) or close <= 0:
                continue
                
            dt = pd.to_datetime(date_idx)
            full_date = dt.strftime('%Y-%m-%d')
            date_str = dt.strftime('%d %b')
            
            if vol >= 1_000_000_000:
                vol_str = f"{vol / 1_000_000_000:.2f}B"
            elif vol >= 1_000_000:
                vol_str = f"{vol / 1_000_000:.2f}M"
            elif vol >= 1_000:
                vol_str = f"{vol / 1_000:.2f}K"
            else:
                vol_str = str(int(vol))
                
            chg_pct = None
            if prev_close and prev_close > 0:
                chg_pct = round(((close - prev_close) / prev_close) * 100, 2)
                
            result.append(HistoricalPriceType(
                date_str=date_str,
                full_date=full_date,
                close_price=round(close, 2),
                volume_str=vol_str,
                chg_pct=chg_pct
            ))
            prev_close = close
            
        return result


    @strawberry.field
    def companies(self, info: Info[Context, None]) -> List[CompanyType]:
        db = info.context.db
        service = CompanyService(db)
        companies = service.get_all_companies()
        result_list = []
        for c in companies:
            prob, avg_mom = get_company_momentum_stats(c)
            result_list.append(
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
                    financial_health_grade=c.financial_health_grade,
                    momentum_probability=prob,
                    avg_post_earnings_momentum=avg_mom,
                    post_release_return=getattr(c, "post_release_return", None),
                    latest_momentum=get_latest_momentum_type(c)
                )
            )
        return result_list

    @strawberry.field
    def company(self, info: Info[Context, None], id: str) -> Optional[CompanyType]:
        from app.infrastructure.models import Company, Prediction, EarningsReport
        from sqlalchemy.orm import selectinload
        db = info.context.db
        c = db.query(Company).options(
            selectinload(Company.predictions),
            selectinload(Company.earnings_reports),
            selectinload(Company.event_studies),
            selectinload(Company.backtests),
            selectinload(Company.technical_snapshots),
            selectinload(Company.ai_reports),
            selectinload(Company.momentum_signals)
        ).filter(Company.id == id).first()
        if not c:
            return None
            
        # Automatically upgrade stored month-year dates to true historical announcement release dates
        dates_to_check = [c.q1_date, c.q2_date, c.q3_date, c.q4_date]
        needs_upgrade = any(d and len(d) <= 8 for d in dates_to_check) or any(d and d[:2].isalpha() for d in dates_to_check)
        if needs_upgrade:
            try:
                import pandas as pd
                from app.services.data.data_manager import UnifiedDataManager
                dm = UnifiedDataManager()
                
                release_dates_raw = dm.get_earnings_calendar(c.ticker)
                if release_dates_raw:
                    release_dates = pd.Series(release_dates_raw)
                    
                    def resolve_date(old_dt):
                        if not old_dt: return old_dt
                        try:
                            if len(str(old_dt).split('-')) == 2 and not str(old_dt).startswith('20'):
                                dt = pd.to_datetime(old_dt, format='%b-%Y') + pd.offsets.MonthEnd(1)
                            else:
                                dt = pd.to_datetime(old_dt)
                            dt_naive = dt.tz_localize(None) if dt.tz is not None else dt
                            cands = [rd for rd in release_dates if (dt_naive - pd.Timedelta(days=7)) <= rd <= (dt_naive + pd.Timedelta(days=100))]
                            if cands:
                                return cands[0].strftime("%Y-%m-%d")
                        except Exception:
                            pass
                        return old_dt

                    c.q4_date = resolve_date(c.q4_date)
                    c.q3_date = resolve_date(c.q3_date)
                    c.q2_date = resolve_date(c.q2_date)
                    c.q1_date = resolve_date(c.q1_date)
                    db.commit()
            except Exception as e:
                print(f"Error enriching release dates for {c.ticker}: {e}")

        from app.graphql.types import PredictionType, EarningsReportType, EventStudyResultType, StrategyBacktestType, TechnicalSnapshotType, AIAnalysisReportType
        predictions = [PredictionType(id=str(p.id), target_quarter=p.target_quarter, predicted_eps=p.predicted_eps, confidence_score=p.confidence_score or 0, created_at=str(p.created_at)) for p in c.predictions]
        earnings = [EarningsReportType(id=str(e.id), fiscal_quarter=e.fiscal_quarter, report_date=str(e.report_date)) for e in c.earnings_reports]
        event_studies = [EventStudyResultType(**{k: v for k, v in e.__dict__.items() if not k.startswith('_') and k not in ('company_id', 'company', 'earnings_report_id')}) for e in c.event_studies]
        backtests = [StrategyBacktestType(**{k: v for k, v in b.__dict__.items() if not k.startswith('_') and k not in ('company_id', 'company')}) for b in c.backtests]
        techs = [TechnicalSnapshotType(**{k: v for k, v in t.__dict__.items() if not k.startswith('_') and k not in ('company_id', 'company')}) for t in c.technical_snapshots]
        ai_reports = [AIAnalysisReportType(**{k: v for k, v in a.__dict__.items() if not k.startswith('_') and k not in ('company_id', 'company')}) for a in c.ai_reports]
        prob, avg_mom = get_company_momentum_stats(c)
        
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
            momentum_probability=prob,
            avg_post_earnings_momentum=avg_mom,
            post_release_return=getattr(c, "post_release_return", None),
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
            ai_reports=ai_reports,
            latest_momentum=get_latest_momentum_type(c)
        )

    @strawberry.field
    def background_job_live_status(self, info: Info[Context, None], celery_task_id: str) -> BackgroundJobLiveStatusType:
        import os, redis
        from app.graphql.types import BackgroundJobLiveStatusType
        redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        
        logs_bytes = r.lrange(f"worker_logs:{celery_task_id}", 0, -1)
        logs = [x.decode("utf-8") for x in logs_bytes] if logs_bytes else []
        
        progress_bytes = r.get(f"worker_progress:{celery_task_id}")
        progress = progress_bytes.decode("utf-8") if progress_bytes else None
        
        return BackgroundJobLiveStatusType(
            celery_task_id=celery_task_id,
            progress=progress,
            logs=logs
        )

    @strawberry.field
    def background_jobs(self, info: Info[Context, None], limit: int = 100) -> List[BackgroundJobType]:
        from app.infrastructure.models import BackgroundJob
        from app.graphql.types import BackgroundJobType, BackgroundJobLiveStatusType
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

    @strawberry.field
    def market_regime_status(self, info: Info[Context, None]) -> MarketRegimeType:
        from app.services.momentum_service import MomentumService
        db = info.context.db
        reg_data = MomentumService(db).get_market_regime()
        return MarketRegimeType(
            status=str(reg_data.get("status", "Neutral")),
            score=float(reg_data.get("score", 50.0)),
            reason=str(reg_data.get("reason", "No Nifty benchmark data"))
        )

    @strawberry.field
    def momentum_scanner(self, info: Info[Context, None], signal_filter: Optional[str] = None, only_attention: bool = False) -> List[CompanyType]:
        db = info.context.db
        service = CompanyService(db)
        companies = service.get_all_companies()
        result_list = []
        for c in companies:
            prob, avg_mom = get_company_momentum_stats(c)
            lat_mom = get_latest_momentum_type(c)
            
            if only_attention and (not lat_mom or not lat_mom.requires_attention):
                continue
            if signal_filter and signal_filter != "ALL" and (not lat_mom or lat_mom.signal != signal_filter):
                continue
                
            result_list.append(
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
                    financial_health_grade=c.financial_health_grade,
                    momentum_probability=prob,
                    avg_post_earnings_momentum=avg_mom,
                    post_release_return=getattr(c, "post_release_return", None),
                    latest_momentum=lat_mom
                )
            )
        result_list.sort(key=lambda x: (x.latest_momentum.composite_score if x.latest_momentum and x.latest_momentum.composite_score is not None else -1), reverse=True)
        return result_list

    @strawberry.field
    def get_intensive_backtest(self, info: Info, ticker: str, years: int = 3) -> IntensiveBacktestReportType:
        db: Session = info.context.db
        from app.services.backtest_service import IntensiveBacktestEngine
        engine = IntensiveBacktestEngine(db)
        res = engine.run_intensive_backtest(ticker, years=years)
        
        event_strats = []
        for b in res.get("event_strategies", []):
            event_strats.append(StrategyBacktestType(
                id=str(uuid.uuid4()),
                strategy_name=b['strategy_name'],
                total_trades=b['total_trades'],
                winning_trades=b['winning_trades'],
                losing_trades=b['losing_trades'],
                win_rate=b['win_rate'],
                avg_gain=b['avg_gain'],
                avg_loss=b['avg_loss'],
                max_gain=b['max_gain'],
                max_drawdown=b['max_drawdown'],
                expected_value=b.get('expected_value', 0.0),
                profit_factor=b.get('profit_factor', 0.0)
            ))
            
        mom_perf = None
        p = res.get("momentum_performance")
        if p and "win_rate_pct" in p:
            mom_perf = MomentumPerformanceType(
                total_trades=int(p.get("total_trades", 0)),
                win_rate_pct=float(p.get("win_rate_pct", 0.0)),
                net_total_return_pct=float(p.get("net_total_return_pct", 0.0)),
                sharpe_ratio=float(p.get("sharpe_ratio", 0.0)),
                sortino_ratio=float(p.get("sortino_ratio", 0.0)),
                max_drawdown_pct=float(p.get("max_drawdown_pct", 0.0)),
                ml_hit_rate_pct=float(p.get("ml_hit_rate_pct", 0.0)),
                brier_score=float(p.get("brier_score", 0.25)),
                alpha_vs_nifty_pct=float(p.get("alpha_vs_nifty_pct", 0.0)),
                profit_factor=float(p.get("profit_factor", 0.0)),
                avg_trade_return_pct=float(p.get("avg_trade_return_pct", 0.0))
            )
            
        from app.infrastructure.models import Company
        company = db.query(Company).filter(Company.ticker == ticker).first()
        
        return IntensiveBacktestReportType(
            ticker=ticker,
            company_name=company.name if company else ticker,
            status=res.get("status", "Success"),
            evaluation_horizon_years=years,
            years_tested=years,
            total_trading_bars=res.get("total_bars", 0),
            benchmark_nifty_return_pct=res.get("nifty_return", 0.0),
            momentum_performance=mom_perf,
            event_strategies=event_strats
        )

    @strawberry.field
    def research_hypotheses(self, info: Info[Context, None], stage_filter: Optional[str] = None) -> List[ResearchHypothesisType]:
        from app.infrastructure.models import ResearchHypothesis
        db = info.context.db
        query = db.query(ResearchHypothesis)
        if stage_filter:
            query = query.filter(ResearchHypothesis.current_stage == stage_filter)
        hyps = query.order_by(ResearchHypothesis.created_at.desc()).all()
        
        result = []
        for h in hyps:
            exps = [
                HypothesisExperimentType(
                    id=str(e.id),
                    hypothesis_id=str(e.hypothesis_id),
                    execution_date=e.execution_date.isoformat() if e.execution_date else "",
                    total_trials_in_family=e.total_trials_in_family or 1,
                    classic_sharpe=e.classic_sharpe,
                    deflated_sharpe=e.deflated_sharpe,
                    spearman_ic_mean=e.spearman_ic_mean,
                    spearman_ic_tstat=e.spearman_ic_tstat,
                    is_statistically_valid=e.is_statistically_valid or False,
                    failure_mode_tag=e.failure_mode_tag
                ) for e in (h.experiments or [])
            ]
            result.append(
                ResearchHypothesisType(
                    id=str(h.id),
                    name=h.name,
                    author=h.author or "AI_RESEARCH_AGENT",
                    economic_mechanism=h.economic_mechanism,
                    economic_rationale_text=h.economic_rationale_text,
                    alpha_expression=h.alpha_expression,
                    target_universe=h.target_universe or "NIFTY500",
                    holding_horizon_days=h.holding_horizon_days or 5,
                    current_stage=h.current_stage or "DRAFT_HYPOTHESIS",
                    created_at=h.created_at.isoformat() if h.created_at else "",
                    decommissioned_at=h.decommissioned_at.isoformat() if h.decommissioned_at else None,
                    decommission_reason=h.decommission_reason,
                    experiments=exps
                )
            )
        return result

    @strawberry.field
    def celery_schedules(self, info: Info[Context, None]) -> List[CeleryScheduleType]:
        from app.worker.celery_app import celery_app
        from app.infrastructure.models import BackgroundJob
        db = info.context.db
        
        schedule_metadata = {
            'sync-nse-daily': {
                'cron_title': 'EVENT: Sync NSE Daily',
                'category': 'EVENT',
                'description': 'Pulls new NSE corporate announcements and updates the Events dataset.'
            },
            'sync-nse-universe-daily': {
                'cron_title': 'MARKET DATA: Sync NSE Universe',
                'category': 'MARKET DATA',
                'description': 'Synchronizes and populates the NSE stock universe used by the Events system.'
            },
            'calculate-universe-health-daily': {
                'cron_title': 'QUANT / HEALTH: Calculate Universe Health',
                'category': 'QUANT / HEALTH',
                'description': 'Calculates and updates the existing health metrics for the NSE universe.'
            },
            'sync-nse-market-data-daily': {
                'cron_title': 'MARKET DATA: Sync NSE Market Data',
                'category': 'MARKET DATA',
                'description': 'Ingests overnight NSE Bhavcopy daily price volume snapshots and exchange surveillance indicators.'
            },
            'scan-nse-momentum-daily': {
                'cron_title': 'MOMENTUM: Daily NSE Momentum Scan',
                'category': 'MOMENTUM',
                'description': 'Scans the NSE universe for cross-sectional momentum anomalies after market close.'
            },
            'resolve-realized-forward-returns-daily': {
                'cron_title': 'QUANT: Resolve Forward Returns',
                'category': 'QUANT',
                'description': 'Calculates realized forward returns and rolling Information Coefficient for signals.'
            },
            'retrain-momentum-ml-model-weekly': {
                'cron_title': 'ML: Retrain Momentum Model',
                'category': 'ML',
                'description': 'Performs weekly walk-forward supervised retraining of the momentum ML model.'
            },
            'audit-shadow-model-probation-weekly': {
                'cron_title': 'ML: Audit Shadow Model',
                'category': 'ML',
                'description': 'Reviews 14-day shadow probation performance of candidate models to evaluate promotion.'
            },
            'sync-ohlcv-cache-daily': {
                'cron_title': 'MARKET DATA: Sync OHLCV Cache',
                'category': 'MARKET DATA',
                'description': 'Incrementally updates the historical OHLCV candlestick cache for fast access.'
            },
            'run-automated-hypothesis-research-daily': {
                'cron_title': 'RESEARCH: Automated Hypothesis Research',
                'category': 'RESEARCH',
                'description': 'Executes the nightly AI factor discovery loop and evaluates strategies via deflated Sharpe.'
            },
            'cleanup-old-activity-logs-daily': {
                'cron_title': 'SYSTEM: Cleanup Activity Logs',
                'category': 'SYSTEM',
                'description': 'Removes old admin activity logs to keep the database size manageable.'
            },
            'scan-nse-catalysts-live': {
                'cron_title': 'CATALYST: Scan NSE Catalysts',
                'category': 'CATALYST',
                'description': 'Detects potentially market-moving NSE announcements and generates trading catalysts.'
            },
            'update-catalyst-outcomes-daily': {
                'cron_title': 'CATALYST: Update Catalyst Outcomes',
                'category': 'CATALYST',
                'description': 'Tracks and updates the historical post-event outcomes of generated catalysts.'
            },
            'scan-pre-catalyst-anomalies-daily': {
                'cron_title': 'CATALYST: Scan Pre-Catalyst Anomalies',
                'category': 'CATALYST',
                'description': 'Identifies unusual volume or price action preceding a potential catalyst event.'
            },
            'scan-insider-trades-daily': {
                'cron_title': 'CATALYST: Scan Insider Trades',
                'category': 'CATALYST',
                'description': 'Monitors the NSE for major promoter buying and insider transactions.'
            },
        }
        
        beat_schedule = getattr(celery_app.conf, "beat_schedule", {}) or {}
        
        jobs = db.query(BackgroundJob).order_by(BackgroundJob.queued_at.desc()).limit(200).all()
        job_map = {}
        for j in jobs:
            if j.task_name and j.task_name not in job_map:
                job_map[j.task_name] = j

        from celery.schedules import crontab
        import pytz
        from datetime import datetime, timedelta
        try:
            from croniter import croniter
        except ImportError:
            croniter = None

        result = []
        for sched_name, config in beat_schedule.items():
            task_name = config.get("task", "")
            sched_obj = config.get("schedule", 0.0)

            if isinstance(sched_obj, crontab):
                interval = 0.0
                
                try:
                    minutes = sorted(list(sched_obj.minute))
                    hours = sorted(list(sched_obj.hour))
                    is_every_minute = len(minutes) == 60
                    
                    if len(minutes) == 1 and len(hours) == 1:
                        human_interval = f"Daily at {hours[0]:02d}:{minutes[0]:02d}"
                    elif len(hours) < 24 and not is_every_minute and len(minutes) > 1:
                        diffs = set(minutes[i] - minutes[i-1] for i in range(1, len(minutes)))
                        if len(diffs) == 1:
                            human_interval = f"Every {diffs.pop()} minutes"
                        else:
                            human_interval = f"Custom Cron"
                    else:
                        human_interval = f"Custom Cron"
                except Exception:
                    human_interval = f"Cron Schedule"
            else:
                interval = float(sched_obj)
                if interval == 86400.0:
                    human_interval = "Daily (24 hours)"
                elif interval == 604800.0:
                    human_interval = "Weekly (7 days)"
                elif interval > 3600.0:
                    human_interval = f"Every {round(interval / 3600.0, 1)} hours"
                elif interval >= 60.0:
                    human_interval = f"Every {round(interval / 60.0, 1)} minutes"
                else:
                    human_interval = f"Every {int(interval)} seconds"

            meta = schedule_metadata.get(sched_name, {
                "cron_title": f"SYSTEM: {task_name}",
                "category": "SYSTEM",
                "description": f"Automated recurring execution of {task_name}."
            })

            last_run_at = None
            last_run_status = "NEVER_RUN"
            last_run_duration = None
            last_run_result = None
            last_run_error = None

            if task_name in job_map:
                latest_job = job_map[task_name]
                last_run_at = str(latest_job.started_at or latest_job.queued_at or "")
                last_run_status = str(latest_job.status or "QUEUED").upper()
                last_run_result = latest_job.result
                last_run_error = latest_job.error_message
                if latest_job.started_at and latest_job.finished_at:
                    last_run_duration = (latest_job.finished_at - latest_job.started_at).total_seconds()

            # Calculate next_run_at
            next_run_at = None
            ist_tz = pytz.timezone("Asia/Kolkata")
            ist_now = datetime.now(ist_tz)
            
            reference_time = ist_now
            if last_run_at and last_run_status != "NEVER_RUN":
                try:
                    parsed_last_run = datetime.fromisoformat(last_run_at)
                    if parsed_last_run.tzinfo is None:
                        parsed_last_run = pytz.utc.localize(parsed_last_run)
                    reference_time = parsed_last_run.astimezone(ist_tz)
                except Exception:
                    reference_time = ist_now

            if isinstance(sched_obj, crontab):
                # croniter needs a standard cron string: min hr dom mon dow
                if croniter:
                    try:
                        cron_expr = f"{getattr(sched_obj, '_orig_minute', '*')} {getattr(sched_obj, '_orig_hour', '*')} {getattr(sched_obj, '_orig_day_of_month', '*')} {getattr(sched_obj, '_orig_month_of_year', '*')} {getattr(sched_obj, '_orig_day_of_week', '*')}"
                        cron = croniter(cron_expr, reference_time)
                        next_dt = cron.get_next(datetime)
                        if next_dt < ist_now:
                            cron = croniter(cron_expr, ist_now)
                            next_dt = cron.get_next(datetime)
                        next_run_at = str(next_dt)
                    except Exception:
                        pass
            else:
                if interval > 0:
                    next_dt = reference_time + timedelta(seconds=interval)
                    while next_dt < ist_now:
                        next_dt += timedelta(seconds=interval)
                    next_run_at = str(next_dt)

            result.append(
                CeleryScheduleType(
                    name=sched_name,
                    task_name=task_name,
                    cron_title=meta.get("cron_title", f"SYSTEM: {task_name}"),
                    interval_seconds=interval,
                    human_readable_interval=human_interval,
                    category=meta.get("category", "SYSTEM"),
                    description=meta.get("description", ""),
                    last_run_at=last_run_at,
                    last_run_status=last_run_status,
                    last_run_duration=last_run_duration,
                    next_run_at=next_run_at,
                    last_run_result=last_run_result,
                    last_run_error=last_run_error
                )
            )
        return result


    @strawberry.field
    def worker_execution_history(self, info: Info[Context, None], task_name: str, limit: int = 20) -> List[WorkerExecutionHistoryType]:
        from app.infrastructure.models import BackgroundJob
        db = info.context.db
        jobs = db.query(BackgroundJob).filter(BackgroundJob.task_name == task_name).order_by(BackgroundJob.queued_at.desc()).limit(limit).all()
        
        result = []
        for j in jobs:
            dur = None
            if j.started_at and j.finished_at:
                dur = (j.finished_at - j.started_at).total_seconds()
            result.append(
                WorkerExecutionHistoryType(
                    id=str(j.id),
                    task_name=j.task_name,
                    status=str(j.status or "QUEUED").upper(),
                    queued_at=str(j.queued_at) if j.queued_at else None,
                    started_at=str(j.started_at) if j.started_at else None,
                    finished_at=str(j.finished_at) if j.finished_at else None,
                    duration_ms=dur,
                    result=j.result,
                    error_message=j.error_message
                )
            )
        return result

    @strawberry.field
    def admin_activity_logs(self, info: Info[Context, None], limit: int = 50, offset: int = 0, user_email: Optional[str] = None, event_type: Optional[str] = None, status: Optional[str] = None) -> List[AdminActivityLogType]:
        from app.infrastructure.models import AdminActivityLog
        db = info.context.db
        query = db.query(AdminActivityLog)
        
        if user_email and user_email != "All Users":
            query = query.filter(AdminActivityLog.user_email == user_email)
        if event_type and event_type != "All":
            query = query.filter(AdminActivityLog.event_type == event_type)
        if status and status != "All":
            query = query.filter(AdminActivityLog.status == status)
            
        logs = query.order_by(AdminActivityLog.created_at.desc()).offset(offset).limit(limit).all()
        
        return [
            AdminActivityLogType(
                id=str(log.id),
                user_email=log.user_email,
                event_type=log.event_type,
                event_name=log.event_name,
                event_description=log.event_description,
                status=log.status,
                started_at=str(log.started_at),
                completed_at=str(log.completed_at) if log.completed_at else None,
                duration_ms=log.duration_ms,
                created_at=str(log.created_at),
                metadata_json=log.metadata_json,
                celery_task_id=log.celery_task_id
            ) for log in logs
        ]

    @strawberry.field
    def latest_admin_activity(self, info: Info[Context, None], event_name: str) -> Optional[AdminActivityLogType]:
        from app.infrastructure.models import AdminActivityLog
        from datetime import datetime, timedelta
        db = info.context.db
        
        # Look for the last execution of this event name within today
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        log = db.query(AdminActivityLog).filter(
            AdminActivityLog.event_name == event_name,
            AdminActivityLog.created_at >= today_start
        ).order_by(AdminActivityLog.created_at.desc()).first()
        
        if not log:
            return None
            
        return AdminActivityLogType(
            id=str(log.id),
            user_email=log.user_email,
            event_type=log.event_type,
            event_name=log.event_name,
            event_description=log.event_description,
            status=log.status,
            started_at=str(log.started_at),
            completed_at=str(log.completed_at) if log.completed_at else None,
            duration_ms=log.duration_ms,
            created_at=str(log.created_at),
            metadata_json=log.metadata_json,
            celery_task_id=log.celery_task_id
        )

    @strawberry.field
    def catalyst_events(
        self, 
        info: Info[Context, None], 
        limit: int = 100, 
        offset: int = 0,
        tier: Optional[str] = None,
        status: Optional[str] = None,
        category: Optional[str] = None,
        search_query: Optional[str] = None
    ) -> List[CatalystEventType]:
        from app.infrastructure.models import CatalystEvent
        db = info.context.db
        query = db.query(CatalystEvent)
        
        if tier and tier != "ALL":
            query = query.filter(CatalystEvent.tier == tier)
        if status and status != "ALL":
            query = query.filter(CatalystEvent.status == status)
        if category and category != "ALL":
            query = query.filter(CatalystEvent.category == category)
        if search_query:
            search = f"%{search_query}%"
            query = query.filter(
                (CatalystEvent.ticker.ilike(search)) |
                (CatalystEvent.event_title.ilike(search))
            )
            
        events = query.order_by(CatalystEvent.detected_at.desc()).offset(offset).limit(limit).all()
        
        # --- BATCH MARKET CAP RESOLUTION ---
        missing_mcap_events = []
        for e in events:
            val = getattr(e, 'market_cap_at_event', None)
            if not val or val == 0:
                missing_mcap_events.append(e)

        if missing_mcap_events:
            from app.infrastructure.models import Company
            from sqlalchemy import or_

            # 1. Fallback to existing e.company relation
            for e in missing_mcap_events:
                if getattr(e, 'company', None) and getattr(e.company, 'market_cap', None):
                    e.market_cap_at_event = e.company.market_cap

            # 2. Batch lookup by Ticker / BSE Code
            still_missing = [e for e in missing_mcap_events if not getattr(e, 'market_cap_at_event', None)]
            if still_missing:
                unmapped_tickers = list(set(e.ticker for e in still_missing if getattr(e, 'ticker', None)))
                bse_codes = [t.split('.')[0] for t in unmapped_tickers if t.endswith('.BO')]
                
                filters = []
                if unmapped_tickers:
                    filters.append(Company.ticker.in_(unmapped_tickers))
                if bse_codes:
                    filters.append(Company.bse_scrip_code.in_(bse_codes))
                
                if filters:
                    found = db.query(Company).filter(or_(*filters)).all()
                    ticker_map = {c.ticker: c.market_cap for c in found if getattr(c, 'market_cap', None)}
                    bse_map = {f"{c.bse_scrip_code}.BO": c.market_cap for c in found if getattr(c, 'bse_scrip_code', None) and getattr(c, 'market_cap', None)}
                    
                    for e in still_missing:
                        mcap = ticker_map.get(e.ticker) or bse_map.get(e.ticker)
                        if mcap:
                            e.market_cap_at_event = mcap

            # 3. Batch lookup by Company Name
            final_missing = [e for e in still_missing if not getattr(e, 'market_cap_at_event', None)]
            if final_missing:
                unmapped_names = list(set(e.company_name for e in final_missing if getattr(e, 'company_name', None)))
                if unmapped_names:
                    found_by_name = db.query(Company).filter(Company.name.in_(unmapped_names)).all()
                    name_map = {c.name: c.market_cap for c in found_by_name if getattr(c, 'name', None) and getattr(c, 'market_cap', None)}
                    for e in final_missing:
                        mcap = name_map.get(e.company_name)
                        if mcap:
                            e.market_cap_at_event = mcap

            # 4. External Market Cap Provider (Async Fallback)
            unresolved = [e for e in final_missing if not getattr(e, 'market_cap_at_event', None)]
            if unresolved:
                try:
                    from app.worker.observability import get_redis_client
                    redis_client = get_redis_client()
                    
                    external_needed_tickers = set()
                    for e in unresolved:
                        if not getattr(e, 'ticker', None):
                            continue
                            
                        cache_key = f"mcap_enrich:{e.ticker}"
                        cached_val = redis_client.get(cache_key)
                        
                        if cached_val:
                            decoded = cached_val.decode('utf-8')
                            if decoded != "NOT_FOUND":
                                try:
                                    e.market_cap_at_event = float(decoded)
                                except ValueError:
                                    pass
                        else:
                            external_needed_tickers.add(e.ticker)
                            
                    if external_needed_tickers:
                        from app.worker.tasks import enrich_external_market_cap_task
                        enrich_external_market_cap_task.delay(list(external_needed_tickers))
                        
                except Exception as ex:
                    import logging
                    logging.getLogger(__name__).warning(f"[MARKET_CAP] Redis/Celery fallback error: {ex}")
        # -----------------------------------
        
        result = []
        for e in events:
            sources = []
            if getattr(e, "sources", None):
                for s in e.sources:
                    sources.append(CatalystSourceType(
                        id=str(s.id),
                        event_id=str(s.event_id),
                        source_name=s.source_name,
                        url=s.url,
                        is_primary=bool(s.is_primary),
                        published_at=str(s.published_at) if s.published_at else None,
                        created_at=str(s.created_at) if s.created_at else ""
                    ))
                    
            result.append(CatalystEventType(
                id=str(e.id),
                ticker=e.ticker,
                company_id=str(e.company_id) if e.company_id else None,
                company_name=e.company.name if e.company else None,
                event_title=e.event_title,
                event_type=e.event_type,
                category=e.category,
                impact_score=e.impact_score,
                early_score=e.early_score,
                confidence=e.confidence,
                status=e.status,
                tier=e.tier,
                match_status=e.match_status,
                why_it_matters=e.why_it_matters,
                reaction_pct=e.reaction_pct,
                relative_volume=e.relative_volume,
                gap_reaction_pct=getattr(e, 'gap_reaction_pct', None),
                session_reaction_pct=getattr(e, 'session_reaction_pct', None),
                reaction_1d=getattr(e, 'reaction_1d', None),
                reaction_3d=getattr(e, 'reaction_3d', None),
                reaction_5d=getattr(e, 'reaction_5d', None),
                pre_event_price=getattr(e, 'pre_event_price', None),
                market_cap_at_event=getattr(e, 'market_cap_at_event', None),
                sector_at_event=getattr(e, 'sector_at_event', None),
                published_at=str(e.published_at) if e.published_at else None,
                detected_at=str(e.detected_at) if e.detected_at else None,
                verified_at=str(e.verified_at) if e.verified_at else None,
                created_at=str(e.created_at) if e.created_at else "",
                updated_at=str(e.updated_at) if e.updated_at else "",
                sources=sources
            ))
            
        return result

    @strawberry.field
    def catalyst_pipeline_health_logs(self, info: Info[Context, None], limit: int = 50) -> List[CatalystPipelineRunType]:
        from app.infrastructure.models import CatalystPipelineRun
        db = info.context.db
        runs = db.query(CatalystPipelineRun).order_by(CatalystPipelineRun.run_at.desc()).limit(limit).all()
        
        return [
            CatalystPipelineRunType(
                id=str(r.id),
                source_name=r.source_name,
                source_status=r.source_status,
                http_status_code=r.http_status_code,
                raw_fetched=r.raw_fetched,
                keyword_filtered=r.keyword_filtered,
                symbol_unresolved=r.symbol_unresolved,
                auto_created_companies=r.auto_created_companies,
                ai_classified=r.ai_classified,
                ai_rejected=r.ai_rejected,
                duplicates=r.duplicates,
                noise_filtered=r.noise_filtered,
                saved=r.saved,
                execution_time_ms=r.execution_time_ms,
                error_message=r.error_message,
                run_at=str(r.run_at)
            ) for r in runs
        ]

    @strawberry.field
    def pre_market_catalysts(self, info: Info[Context, None], limit: int = 10) -> List[CatalystEventType]:
        """
        P2.3: Pre-Market Briefing. Returns overnight catalysts ranked by priority.
        Gets catalysts from the last 18 hours (e.g. yesterday post-market + this morning).
        """
        from app.infrastructure.models import CatalystEvent, CatalystSource
        from datetime import datetime, timedelta
        
        db = info.context.db
        lookback_time = datetime.utcnow() - timedelta(hours=18)
        
        # We need to compute the rank in python since early_score and impact_score are columns
        # but weighting is a business rule. We will fetch recent ones and sort.
        events = db.query(CatalystEvent).filter(
            CatalystEvent.published_at >= lookback_time,
            CatalystEvent.tier.in_(["S-TIER", "A-TIER", "B-TIER"])
        ).all()
        
        # Sort manually by priority: (Impact * 0.6) + (Early * 0.4)
        def get_priority(e):
            impact = e.impact_score or 0
            early = e.early_score or 0
            return (impact * 0.6) + (early * 0.4)
            
        events.sort(key=get_priority, reverse=True)
        events = events[:limit]
        
        result = []
        for e in events:
            # Reconstruct sources
            db_sources = db.query(CatalystSource).filter(CatalystSource.event_id == e.id).all()
            sources = [
                CatalystSourceType(
                    id=str(s.id),
                    event_id=str(s.event_id),
                    source_name=s.source_name,
                    url=s.url,
                    is_primary=s.is_primary,
                    published_at=str(s.published_at) if s.published_at else "",
                    created_at=str(s.created_at) if getattr(s, 'created_at', None) else ""
                ) for s in db_sources
            ]
            
            result.append(CatalystEventType(
                id=str(e.id),
                ticker=e.ticker,
                company_id=str(e.company_id),
                event_title=e.event_title,
                event_type=e.event_type,
                category=e.category,
                impact_score=e.impact_score,
                early_score=e.early_score,
                confidence=e.confidence,
                status=e.status,
                tier=e.tier,
                match_status=e.match_status,
                why_it_matters=e.why_it_matters,
                reaction_pct=e.reaction_pct,
                relative_volume=e.relative_volume,
                gap_reaction_pct=getattr(e, 'gap_reaction_pct', None),
                session_reaction_pct=getattr(e, 'session_reaction_pct', None),
                reaction_1d=getattr(e, 'reaction_1d', None),
                reaction_3d=getattr(e, 'reaction_3d', None),
                reaction_5d=getattr(e, 'reaction_5d', None),
                pre_event_price=getattr(e, 'pre_event_price', None),
                market_cap_at_event=getattr(e, 'market_cap_at_event', None),
                sector_at_event=getattr(e, 'sector_at_event', None),
                published_at=str(e.published_at) if e.published_at else None,
                detected_at=str(e.detected_at) if e.detected_at else None,
                verified_at=str(e.verified_at) if e.verified_at else None,
                created_at=str(e.created_at) if e.created_at else "",
                updated_at=str(e.updated_at) if e.updated_at else "",
                sources=sources
            ))
            
        return result

    @strawberry.field
    def historical_event_analog(self, info: Info[Context, None], category: str, event_type: Optional[str] = None) -> Optional[EventAnalogStatsType]:
        """
        P3.1: Historical Analog Engine.
        Returns the expected value (EV) and historical stats for a given catalyst category/type.
        """
        from app.services.quant_service import QuantService
        
        db = info.context.db
        quant = QuantService()
        stats = quant.calculate_event_analog_stats(db, category, event_type)
        
        if not stats:
            return None
            
        return EventAnalogStatsType(
            total_events_analyzed=stats["total_events_analyzed"],
            avg_gap_reaction=stats["avg_gap_reaction"],
            avg_session_reaction=stats["avg_session_reaction"],
            avg_1d_return=stats["avg_1d_return"],
            avg_3d_return=stats["avg_3d_return"],
            avg_5d_return=stats["avg_5d_return"],
            win_rate_5d=stats["win_rate_5d"]
        )
