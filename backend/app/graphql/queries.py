import strawberry
from typing import List, Optional
from strawberry.types import Info
from app.graphql.types import CompanyType, UserType, BackgroundJobType, HistoricalPriceType, MomentumSignalType, MarketRegimeType, IntensiveBacktestReportType, MomentumPerformanceType, StrategyBacktestType, ResearchHypothesisType, HypothesisExperimentType, CeleryScheduleType, HypothesisSignalType, AdminActivityLogType
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
                import yfinance as yf
                import pandas as pd
                yf_ticker = f"{c.ticker}.NS" if not c.ticker.endswith((".NS", ".BO")) else c.ticker
                stock = yf.Ticker(yf_ticker)
                ed = stock.earnings_dates
                if ed is not None and not ed.empty:
                    release_dates = pd.to_datetime(ed.index).tz_localize(None).sort_values()
                    
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
                'category': 'Market Data Sync',
                'description': 'Daily synchronization of NSE corporate events, earnings calendar, and market action fixtures.'
            },
            'sync-nse-market-data-daily': {
                'category': 'Market Data Sync',
                'description': 'Overnight ingestion of NSE Bhavcopy daily price volume snapshots and exchange surveillance indicators.'
            },
            'scan-nse-momentum-daily': {
                'category': 'Quant Analytics',
                'description': 'Post-market daily execution of cross-sectional momentum anomaly scanner across NIFTY universe.'
            },
            'resolve-realized-forward-returns-daily': {
                'category': 'Quant Analytics',
                'description': 'Daily backfill and attribution calculation of realized forward returns and rolling Information Coefficient (IC).'
            },
            'retrain-momentum-ml-model-weekly': {
                'category': 'ML & AI Engine',
                'description': 'Weekly walk-forward supervised retraining of machine learning momentum classification weights.'
            },
            'audit-shadow-model-probation-weekly': {
                'category': 'ML & AI Engine',
                'description': 'Weekly automated review and evaluation of 14-day shadow probation performance for candidate models.'
            },
            'sync-ohlcv-cache-daily': {
                'category': 'Market Data Sync',
                'description': 'Nightly high-performance incremental synchronization of historical OHLCV candlestick cache.'
            },
            'run-automated-hypothesis-research-daily': {
                'category': 'AI Factor Discovery',
                'description': 'Autonomous nightly QHLM FSM statistical evaluation, deflated Sharpe audit, and AI factor discovery loop.'
            },
        }
        
        beat_schedule = getattr(celery_app.conf, "beat_schedule", {}) or {}
        
        jobs = db.query(BackgroundJob).order_by(BackgroundJob.queued_at.desc()).limit(200).all()
        job_map = {}
        for j in jobs:
            if j.task_name and j.task_name not in job_map:
                job_map[j.task_name] = j

        result = []
        for sched_name, config in beat_schedule.items():
            task_name = config.get("task", "")
            interval = float(config.get("schedule", 0.0))
            
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
                "category": "Scheduled Worker",
                "description": f"Automated recurring execution of {task_name}."
            })

            last_run_at = None
            last_run_status = "NEVER_RUN"
            last_run_duration = None
            
            if task_name in job_map:
                latest_job = job_map[task_name]
                last_run_at = str(latest_job.started_at or latest_job.queued_at or "")
                last_run_status = str(latest_job.status or "QUEUED")
                if latest_job.started_at and latest_job.finished_at:
                    last_run_duration = (latest_job.finished_at - latest_job.started_at).total_seconds()

            result.append(
                CeleryScheduleType(
                    name=sched_name,
                    task_name=task_name,
                    interval_seconds=interval,
                    human_readable_interval=human_interval,
                    category=meta.get("category", "Scheduled Worker"),
                    description=meta.get("description", ""),
                    last_run_at=last_run_at,
                    last_run_status=last_run_status,
                    last_run_duration=last_run_duration
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
