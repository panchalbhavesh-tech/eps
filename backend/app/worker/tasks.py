from celery import shared_task, group, current_task
from sqlalchemy.exc import IntegrityError
from app.infrastructure.database import SessionLocal
from app.services.prediction_service import PredictionService
from app.services.quant_service import QuantService
from app.services.technical_indicator_service import TechnicalIndicatorService
from app.services.event_study_service import EventStudyService
from app.services.ai_analyst_service import AIAnalystService
from app.services.nse_service import NSEService
from app.worker.observability import TaskObserver
from app.infrastructure.models import (
    Company, EarningsReport, Prediction,
    EventStudyResult, StrategyBacktest, TechnicalSnapshot, AIAnalysisReport
)
from datetime import datetime
import dateutil.parser
import time
import pandas as pd

@shared_task
def pre_warm_ohlcv_cache_task():
    """
    Runs overnight to refresh OHLCV cache before the morning momentum scan, 
    preventing API rate limits and long delays during market hours.
    """
    db = SessionLocal()
    try:
        from app.services.ohlcv_cache_service import OHLCVCacheService
        cache_svc = OHLCVCacheService(db)
        
        # Get active universe
        companies = db.query(Company).all()
        for comp in companies:
            try:
                # This fetches and caches
                cache_svc.get_ohlcv(comp.ticker)
            except Exception as e:
                pass
    finally:
        db.close()

@shared_task
def sync_nse_calendar_task():
    db = SessionLocal()
    try:
        nse = NSEService()
        upcoming = nse.get_upcoming_results()
        
        for item in upcoming:
            ticker = item.get("ticker", "").strip()
            date_str = item.get("date")
            
            if not ticker or not date_str:
                continue
                
            try:
                # Ensure company exists and update details
                company = db.query(Company).filter(Company.ticker == ticker).first()
                if not company:
                    company = Company(
                        ticker=ticker,
                        name=item.get("company_name", ticker),
                        sector="NSE",
                        purpose=item.get("purpose", ""),
                        upcoming_date=date_str
                    )
                    db.add(company)
                    try:
                        db.commit()
                        db.refresh(company)
                    except IntegrityError:
                        # Handle race condition where another task inserted the ticker simultaneously
                        db.rollback()
                        company = db.query(Company).filter(Company.ticker == ticker).first()

                if company:
                    # Update latest purpose and date
                    company.purpose = item.get("purpose", "")
                    company.upcoming_date = date_str
                    db.commit()
                    db.refresh(company)
            except Exception as e:
                db.rollback()
                print(f"Failed to create or update company {ticker}: {e}")
                continue
                
            # Parse date (Format usually 'DD-MMM-YYYY')
            try:
                report_date = dateutil.parser.parse(date_str)
                fiscal_quarter = f"Q{(report_date.month - 1) // 3 + 1} {report_date.year}"
                
                # Check if report already exists
                existing_report = db.query(EarningsReport).filter(
                    EarningsReport.company_id == company.id,
                    EarningsReport.fiscal_quarter == fiscal_quarter
                ).first()
                
                if not existing_report:
                    report = EarningsReport(
                        company_id=company.id,
                        fiscal_quarter=fiscal_quarter,
                        report_date=report_date
                    )
                    db.add(report)
                    try:
                        db.commit()
                    except IntegrityError:
                        db.rollback()
            except Exception as e:
                db.rollback()
                print(f"Failed to parse date or create report for {ticker} ({date_str}): {e}")
                
        # Clear expired dates
        now = datetime.utcnow()
        all_comps = db.query(Company).filter(Company.upcoming_date.isnot(None)).all()
        for c in all_comps:
            try:
                dt = dateutil.parser.parse(c.upcoming_date)
                # clear if it's more than 1 day in the past
                if (now.date() - dt.date()).days > 1:
                    c.upcoming_date = None
            except Exception:
                pass
        db.commit()

        return f"Synced {len(upcoming)} upcoming earnings."
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


@shared_task
def generate_prediction_task(company_id: str):
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            return "Company not found"
            
        pred_svc = PredictionService()
        prediction_data = pred_svc.generate_prediction(company.ticker)
            
        # Create new prediction
        prediction = Prediction(
            company_id=company.id,
            target_quarter="Upcoming",
            predicted_eps=prediction_data.get("predicted_eps", 0.0),
            confidence_score=prediction_data.get("confidence_score", 0.0),
            current_price=prediction_data.get("current_price", None),
            historical_trend=prediction_data.get("historical_trend", None)
        )
        
        db.add(prediction)
        db.commit()
        
        return f"Generated prediction for {company.ticker}: EPS {prediction.predicted_eps}"
    finally:
        db.close()

def enrich_single_company(company, db):
    from app.services.prediction_service import PredictionService
    try:
        pred_svc = PredictionService()
        data = pred_svc.generate_prediction(company.ticker)
        company.current_price = data.get("current_price")
        company.historical_trend = data.get("historical_trend")
    except Exception as e:
        print(f"Prediction fallback for {company.ticker}: {e}")
        
    import pandas as pd
    from app.services.data.data_manager import UnifiedDataManager
    dm = UnifiedDataManager()

    # 1. Fetch Market Cap
    try:
        info = dm.get_company_info(company.ticker)
        mcap = info.get("market_cap")
        if mcap is not None and mcap > 0:
            company.market_cap = float(mcap)
    except Exception as ex:
        print(f"Error fetching market cap for {company.ticker}: {ex}")

    # 2. Fetch Quarterly Financials & True Release Dates
    inc = dm.get_financials(company.ticker)
    if inc is None or inc.empty:
        inc = pd.DataFrame()
    
    release_dates = []
    try:
        release_dates = dm.get_earnings_calendar(company.ticker)
    except Exception as ex:
        print(f"Error fetching earnings_dates for {company.ticker}: {ex}")

    def find_true_release_date(fiscal_val):
        fallback = str(fiscal_val)[:10]
        try:
            ts = pd.to_datetime(fiscal_val)
            fallback = ts.strftime("%Y-%m-%d")
            if release_dates is not None and len(release_dates) > 0:
                ts_naive = ts.tz_localize(None) if ts.tz is not None else ts
                cands = [rd for rd in release_dates if (ts_naive - pd.Timedelta(days=7)) <= rd <= (ts_naive + pd.Timedelta(days=100))]
                if cands:
                    return cands[0].strftime("%Y-%m-%d")
        except Exception:
            pass
        return fallback

    if not inc.empty:
        if len(inc.columns) >= 4:
            company.q4_date = find_true_release_date(inc.columns[0])
            company.q3_date = find_true_release_date(inc.columns[1])
            company.q2_date = find_true_release_date(inc.columns[2])
            company.q1_date = find_true_release_date(inc.columns[3])

        def get_series(*row_names):
            for name in row_names:
                if name in inc.index:
                    s = inc.loc[name].dropna()
                    if not s.empty:
                        return s
            return None

        eps_series = get_series('Basic EPS', 'Diluted EPS')
        if eps_series is not None and len(eps_series) > 0:
            company.q4_eps = float(eps_series.iloc[0]) if len(eps_series) > 0 else None
            company.q3_eps = float(eps_series.iloc[1]) if len(eps_series) > 1 else None
            company.q2_eps = float(eps_series.iloc[2]) if len(eps_series) > 2 else None
            company.q1_eps = float(eps_series.iloc[3]) if len(eps_series) > 3 else None
            company.q0_eps = float(eps_series.iloc[4]) if len(eps_series) > 4 else None

        rev_series = get_series('Total Revenue', 'Operating Revenue', 'Total Operating Income As Reported')
        if rev_series is not None and len(rev_series) > 0:
            company.q4_revenue = float(rev_series.iloc[0]) if len(rev_series) > 0 else None
            company.q3_revenue = float(rev_series.iloc[1]) if len(rev_series) > 1 else None
            company.q2_revenue = float(rev_series.iloc[2]) if len(rev_series) > 2 else None
            company.q1_revenue = float(rev_series.iloc[3]) if len(rev_series) > 3 else None
            company.q0_revenue = float(rev_series.iloc[4]) if len(rev_series) > 4 else None

        prof_series = get_series('Net Income', 'Net Income Common Stockholders', 'Operating Income')
        if prof_series is not None and len(prof_series) > 0:
            company.q4_profit = float(prof_series.iloc[0]) if len(prof_series) > 0 else None
            company.q3_profit = float(prof_series.iloc[1]) if len(prof_series) > 1 else None
            company.q2_profit = float(prof_series.iloc[2]) if len(prof_series) > 2 else None
            company.q1_profit = float(prof_series.iloc[3]) if len(prof_series) > 3 else None
            company.q0_profit = float(prof_series.iloc[4]) if len(prof_series) > 4 else None
    
    if company.current_price in (0, 0.0, None):
        try:
            hist = stock_data.history(period="1d")
            if not hist.empty:
                company.current_price = round(float(hist['Close'].iloc[-1]), 2)
        except Exception:
            pass
    return company

@shared_task(bind=True, name="app.worker.tasks.sync_nse_universe_task")
def sync_nse_universe_task(self):
    task_id = self.request.id if self.request and self.request.id else "sync_nse_universe_local"
    obs = TaskObserver(task_id)
    obs.update(log_msg="Starting NSE calendar sync...")

    try:
        sync_nse_calendar_task()
        obs.update(log_msg="NSE calendar sync completed.")
    except Exception as e:
        obs.update(log_msg=f"Error syncing NSE calendar: {e}", log_level="ERROR")
        print(f"Error syncing NSE calendar: {e}")

    db = SessionLocal()
    try:
        from app.services.universe_service import UniverseService
        obs.update(log_msg="Starting historical constituents sync (full NSE universe)...")
        try:
            UniverseService(db).sync_historical_constituents()
            obs.update(log_msg="NSE universe constituents sync completed.")
        except Exception as e:
            obs.update(log_msg=f"Error syncing NSE universe constituents: {e}", log_level="ERROR")
            print(f"Error syncing NSE universe constituents: {e}")

        company_ids = [c.id for c in db.query(Company.id).filter(Company.is_active == True).all()]
        total = len(company_ids)
        updated = 0
        failed = 0
        obs.update(log_msg=f"Found {total} companies in NSE universe.", progress={"total": total, "processed": 0, "saved": 0, "failed": 0, "percentage": 0, "current_step": "Enriching company data"}, force=True)

        for i, cid in enumerate(company_ids):
            try:
                company = db.query(Company).filter(Company.id == cid).with_for_update(skip_locked=True).first()
                if not company:
                    continue
                if company.current_price not in (0, 0.0, None) and company.market_cap not in (0, 0.0, None) and company.q4_revenue not in (0, 0.0, None) and company.q4_date is not None:
                    db.rollback()
                    continue
                
                enrich_single_company(company, db)
                db.commit()
                updated += 1
                time.sleep(1.5)
            except Exception as e:
                print(f"Failed to populate data for company {cid}: {e}")
                db.rollback()
                
        return f"Populated data for {updated} companies."
    finally:
        db.close()

@shared_task
def generate_deep_research_report_task(company_id: str):
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company: return "Company not found"
        
        quant = QuantService()
        df = quant.fetch_historical_ohlcv(company.ticker)
        
        # 0. Fetch Fundamental Snapshot with BSE/NSE Fallbacks
        import yfinance as yf
        symbols_to_try = []
        if company.ticker.endswith(".NS") or company.ticker.endswith(".BO"):
            symbols_to_try.append(company.ticker)
        else:
            symbols_to_try.extend([f"{company.ticker}.NS", f"{company.ticker}.BO", company.ticker])

        info = {}
        for yf_ticker in symbols_to_try:
            try:
                stock = yf.Ticker(yf_ticker)
                temp_info = stock.info
                if temp_info and (temp_info.get("marketCap") or temp_info.get("currentPrice") or temp_info.get("regularMarketPrice")):
                    info = temp_info
                    break
            except Exception:
                continue
        
        try:
            if info:
                company.current_price = info.get("currentPrice", info.get("regularMarketPrice", company.current_price))
                company.market_cap = info.get("marketCap", company.market_cap)
                company.enterprise_value = info.get("enterpriseValue", company.enterprise_value)
                company.pe_ratio = info.get("trailingPE", info.get("forwardPE", company.pe_ratio))
                company.pb_ratio = info.get("priceToBook", company.pb_ratio)
                company.roe = info.get("returnOnEquity", company.roe)
                company.roce = info.get("returnOnAssets", company.roce) # approximation
                company.dividend_yield = info.get("dividendYield", company.dividend_yield)
                company.high_52w = info.get("fiftyTwoWeekHigh", company.high_52w)
                company.low_52w = info.get("fiftyTwoWeekLow", company.low_52w)
                company.book_value = info.get("bookValue", company.book_value)
                company.debt_to_equity = info.get("debtToEquity", company.debt_to_equity)
                company.promoter_holding = info.get("heldPercentInsiders", company.promoter_holding)
                company.fii_holding = info.get("heldPercentInstitutions", company.fii_holding)
        except Exception as e:
            print(f"Failed to populate info fields for {company.ticker}: {e}")
        
        # 1. Technicals
        tech_svc = TechnicalIndicatorService()
        techs = {}
        if not df.empty:
            techs = tech_svc.calculate_technicals(df)
            if techs:
                db.query(TechnicalSnapshot).filter(TechnicalSnapshot.company_id == company.id).delete()
                tech_snap = TechnicalSnapshot(company_id=company.id, **techs)
                db.add(tech_snap)
        
        # 2. Event Study & Backtests
        event_svc = EventStudyService()
        backtests = []
        if not df.empty:
            dates = [company.upcoming_date] if company.upcoming_date else []
            for d in dates:
                if d:
                    es = event_svc.calculate_event_study(df, d)
                    if es:
                        db.query(EventStudyResult).filter(EventStudyResult.company_id == company.id).delete()
                        es_db = EventStudyResult(
                            company_id=company.id,
                            report_date=pd.to_datetime(d),
                            **es
                        )
                        db.add(es_db)
                        
            backtests = quant.run_strategy_backtests(df, company.ticker)
            db.query(StrategyBacktest).filter(StrategyBacktest.company_id == company.id).delete()
            for b in backtests:
                db.add(StrategyBacktest(company_id=company.id, **b))
            
        # 3. AI Analyst Report
        ai = AIAnalystService()
        q_data = {
            "ticker": company.ticker,
            "name": company.name,
            "sector": company.sector,
            "current_price": company.current_price,
            "market_cap": company.market_cap,
            "enterprise_value": company.enterprise_value,
            "pe_ratio": company.pe_ratio,
            "pb_ratio": company.pb_ratio,
            "roe": company.roe,
            "roce": company.roce,
            "dividend_yield": company.dividend_yield,
            "high_52w": company.high_52w,
            "low_52w": company.low_52w,
            "book_value": company.book_value,
            "debt_to_equity": company.debt_to_equity,
            "promoter_holding": company.promoter_holding,
            "fii_holding": company.fii_holding,
            "q1_eps": company.q1_eps,
            "q1_revenue": company.q1_revenue,
            "q1_profit": company.q1_profit,
            "historical_trend": company.historical_trend,
            "technicals": techs,
            "backtests": backtests
        }
        report_data = ai.generate_analysis_report(company.ticker, q_data)
        
        if report_data:
            db.query(AIAnalysisReport).filter(AIAnalysisReport.company_id == company.id).delete()
            ai_data = {k: v for k, v in report_data.items() if k not in ("financial_health_score", "financial_health_grade")}
            db.add(AIAnalysisReport(company_id=company.id, **ai_data))
            if report_data.get("financial_health_score") is not None:
                company.financial_health_score = report_data.get("financial_health_score")
            if report_data.get("financial_health_grade") is not None:
                company.financial_health_grade = report_data.get("financial_health_grade")
            
        db.commit()
        return f"Generated deep report for {company.ticker}"
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

@shared_task(bind=True, name="app.worker.tasks.calculate_universe_health_task")
def calculate_universe_health_task(self):
    task_id = self.request.id if self.request and self.request.id else "calculate_health_local"
    obs = TaskObserver(task_id)
    obs.update(log_msg="Starting universe health calculation...")

    db = SessionLocal()
    try:
        companies = db.query(Company).all()
        total = len(companies)
        ai = AIAnalystService()
        updated = 0
        failed = 0
        
        obs.update(log_msg=f"Loaded {total} companies for health analysis.", progress={"total": total, "processed": 0, "saved": 0, "failed": 0, "percentage": 0, "current_step": "Calculating financial health"}, force=True)
        
        for i, company in enumerate(companies):
            try:
                q_data = {
                    "ticker": company.ticker,
                    "name": company.name,
                    "sector": company.sector,
                    "current_price": company.current_price,
                    "market_cap": company.market_cap,
                    "enterprise_value": company.enterprise_value,
                    "pe_ratio": company.pe_ratio,
                    "pb_ratio": company.pb_ratio,
                    "roe": company.roe,
                    "roce": company.roce,
                    "dividend_yield": company.dividend_yield,
                    "high_52w": company.high_52w,
                    "low_52w": company.low_52w,
                    "book_value": company.book_value,
                    "debt_to_equity": company.debt_to_equity,
                    "promoter_holding": company.promoter_holding,
                    "fii_holding": company.fii_holding,
                    "q1_eps": company.q1_eps,
                    "q1_revenue": company.q1_revenue,
                    "q1_profit": company.q1_profit,
                    "historical_trend": company.historical_trend,
                    "technicals": {},
                    "backtests": []
                }
                report_data = ai.generate_analysis_report(company.ticker, q_data)
                if report_data:
                    ai_data = {k: v for k, v in report_data.items() if k not in ("financial_health_score", "financial_health_grade")}
                    db.query(AIAnalysisReport).filter(AIAnalysisReport.company_id == company.id).delete()
                    db.add(AIAnalysisReport(company_id=company.id, **ai_data))
                    if report_data.get("financial_health_score") is not None:
                        company.financial_health_score = report_data.get("financial_health_score")
                    if report_data.get("financial_health_grade") is not None:
                        company.financial_health_grade = report_data.get("financial_health_grade")
                db.commit()
                updated += 1
            except Exception as ex:
                print(f"Failed financial health mass calculation for {company.ticker}: {ex}")
                db.rollback()
        return f"Mass calculated financial health for {updated} stocks."
    finally:
        db.close()


@shared_task
def run_nse_momentum_scan_task(limit: int = None):
    from app.services.momentum_service import MomentumService
    db = SessionLocal()
    try:
        service = MomentumService(db)
        result = service.scan_and_rank_universe(limit=limit)
        return f"Momentum universe scan completed: {result}"
    except Exception as e:
        db.rollback()
        print(f"Error during NSE momentum scan task: {e}")
    finally:
        db.close()


@shared_task(bind=True, max_retries=2, time_limit=1800)
def scan_nse_catalysts_live_task(self):
    """
    Background worker to poll the NSE Corporate Announcements API,
    filter for potentially material catalysts (M&A, Orders, Resignations),
    classify them with Gemini AI, and measure market reaction.
    Also processes bulk/block deals as catalyst signals (P1.2).
    """
    db = SessionLocal()
    try:
        from app.services.catalyst_pipeline_service import CatalystPipelineService
        svc = CatalystPipelineService(db)
        
        # Main NSE announcement pipeline
        nse_result = svc.run_pipeline()
        
        # P1.2: Bulk/block deal catalyst pipeline
        bulk_result = {}
        try:
            bulk_result = svc.run_bulk_deal_catalyst_pipeline()
        except Exception as e:
            print(f"Bulk deal catalyst pipeline error: {e}")
        
        return {
            "nse_pipeline": nse_result,
            "bulk_deal_pipeline": bulk_result
        }
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


@shared_task
def retrain_momentum_ml_model_task(force_retrain: bool = True):
    from app.services.ml_service import MomentumMLService
    from app.infrastructure.models import ScorePredictionLog
    from datetime import datetime, timedelta
    db = SessionLocal()
    try:
        ml_service = MomentumMLService(db)
        
        cutoff = datetime.utcnow() - timedelta(days=60)
        logs = db.query(ScorePredictionLog).filter(
            ScorePredictionLog.date_evaluated >= cutoff,
            ScorePredictionLog.composite_score != None
        ).order_by(ScorePredictionLog.date_evaluated.desc()).all()
        
        psi_val = 0.0
        if len(logs) > 200:
            half = len(logs) // 2
            current_scores = [float(l.composite_score) for l in logs[:half]]
            expected_scores = [float(l.composite_score) for l in logs[half:]]
            psi_val = ml_service.calculate_psi_drift(expected_scores, current_scores)
            
            if psi_val < 0.20 and not force_retrain:
                return f"No drift detected (PSI: {psi_val:.4f}). Skipping retrain."
        
        # Train into shadow slot with date cutoff to prevent data leakage
        import os
        probation_days = int(os.environ.get("SHADOW_PROBATION_DAYS", 14))
        cutoff_date = datetime.utcnow() - timedelta(days=probation_days)
        
        model = ml_service.train_or_load_model(
            force_retrain=force_retrain,
            model_type="shadow",
            train_cutoff_date=cutoff_date
        )
        
        # Run instant historical probation
        probation_result = ml_service.run_historical_probation()
        
        return f"Phase 3 ML Model Retrained: {model is not None} (PSI: {psi_val:.4f}) | Probation: {probation_result}"
    except Exception as e:
        print(f"Error during ML model retraining: {e}")
        raise e
    finally:
        db.close()


@shared_task
def sync_nse_market_data_task():
    from app.services.nse_data_service import NseDataService
    db = SessionLocal()
    try:
        service = NseDataService(db)
        bhav_res = service.sync_daily_bhavcopy()
        surv_res = service.sync_surveillance_watchlists()
        return f"NSE Market Data Synced -> Bhavcopy: {bhav_res}, Surveillance: {surv_res}"
    except Exception as e:
        db.rollback()
        print(f"Error syncing NSE market data: {e}")
    finally:
        db.close()


@shared_task
def resolve_realized_forward_returns_task():
    from app.services.validation_service import ValidationService
    db = SessionLocal()
    try:
        val_svc = ValidationService(db)
        res = val_svc.resolve_realized_forward_returns()
        ic_res = val_svc.compute_rolling_ic()
        return f"Forward Return Resolution: {res} | Rolling IC: {ic_res}"
    except Exception as e:
        db.rollback()
        print(f"Error resolving forward returns: {e}")
    finally:
        db.close()


@shared_task
def audit_shadow_model_performance_task(model_id: str = "latest_shadow"):
    from app.services.validation_service import ValidationService
    from app.services.ml_service import MomentumMLService
    db = SessionLocal()
    try:
        val_svc = ValidationService(db)
        res = val_svc.evaluate_model_probation(new_model_id=model_id)
        
        # If live probation passes, promote the shadow model
        if res.get("promoted_to_live"):
            ml_svc = MomentumMLService(db)
            promo = ml_svc.promote_shadow_model()
            res["promotion_result"] = promo
        
        return f"Shadow Model Probation Audit: {res}"
    except Exception as e:
        print(f"Error evaluating model probation: {e}")
    finally:
        db.close()


@shared_task(time_limit=60)
def sync_single_ohlcv_task(ticker: str):
    """Sub-task to sync OHLCV for a single ticker with a strict 60s kill switch."""
    from app.services.ohlcv_cache_service import OHLCVCacheService
    db = SessionLocal()
    try:
        svc = OHLCVCacheService(db)
        rows = svc.sync_ticker(ticker)
        return {"ticker": ticker, "rows_synced": rows}
    except Exception as e:
        print(f"OHLCV cache sync failed for {ticker}: {e}")
        return {"ticker": ticker, "rows_synced": 0, "error": str(e)}
    finally:
        db.close()


from celery import chord

@shared_task(bind=True, time_limit=300)
def sync_ohlcv_cache_task(self):
    """Nightly master task: Fans out OHLCV sync to individual micro-tasks."""
    db = SessionLocal()
    try:
        companies = db.query(Company).all()
        tickers = [c.ticker for c in companies]
        
        # Dispatch individual celery tasks using a chord to aggregate results
        if tickers:
            callback = sync_ohlcv_cache_callback.s(self.request.id)
            job = chord((sync_single_ohlcv_task.s(ticker) for ticker in tickers), callback)
            job.apply_async()
            
        return f"Dispatched {len(tickers)} OHLCV sync sub-tasks. Awaiting aggregation..."
    finally:
        db.close()

@shared_task(time_limit=300)
def sync_ohlcv_cache_callback(results, parent_task_id):
    """Callback after all OHLCV sub-tasks finish. Aggregates results and updates parent job."""
    successes = 0
    failures = 0
    failed_tickers = []
    
    for r in results:
        if isinstance(r, dict) and r.get("error"):
            failures += 1
            failed_tickers.append(r.get("ticker", "Unknown"))
        else:
            successes += 1
            
    result_str = f"Completed OHLCV Sync. Successes: {successes}, Failures: {failures}"
    if failed_tickers:
        sample = ", ".join(failed_tickers[:10])
        result_str += f". Failed Tickers: {sample}" + ("..." if len(failed_tickers) > 10 else "")
        
    db = SessionLocal()
    try:
        from app.infrastructure.models import BackgroundJob
        job = db.query(BackgroundJob).filter(BackgroundJob.celery_task_id == parent_task_id).first()
        if job:
            job.result = result_str
            db.commit()
    except Exception as e:
        print(f"Error updating parent task in callback: {e}")
    finally:
        db.close()
        
    return result_str


@shared_task
def evaluate_single_hypothesis_task(hypothesis_id: str):
    """Worker task: executes Deflated Sharpe & IC evaluation for a single candidate hypothesis."""
    from app.services.hypothesis_service import HypothesisService
    db = SessionLocal()
    try:
        svc = HypothesisService(db)
        res = svc.evaluate_hypothesis(hypothesis_id)
        return f"Hypothesis Evaluation Result: {res}"
    finally:
        db.close()


@shared_task
def run_automated_hypothesis_research_task():
    """Worker task: runs scheduled FSM lifecycle transitions and deploys Gemini AI to generate new orthogonal hypotheses."""
    from app.services.hypothesis_service import HypothesisService
    
    db = SessionLocal()
    try:
        svc = HypothesisService(db)
        # 1. Evolve current state transitions
        res = svc.check_and_evolve_all_hypotheses()
        
        # 2. Autonomous AI Alpha Proposal if live stream is low
        ai_action = svc.execute_autonomous_ai_research_cycle()
                        
        return f"Automated QHLM FSM Research Cycle complete: {res} | AI Action: {ai_action}"
    finally:
        db.close()

@shared_task
def generate_live_signals_task():
    from app.core.config import settings
    if not settings.QHLM_LIVE_TRADING_ENABLED:
        return "Live trading feature flag QHLM_LIVE_TRADING_ENABLED is disabled. Skipping."
        
    from app.services.hypothesis_service import HypothesisService, SafeASTEvaluator
    from app.infrastructure.models import ResearchHypothesis, HypothesisSignal, Company, DailyBhavcopy
    import pandas as pd
    import uuid
    import numpy as np
    
    db = SessionLocal()
    try:
        lives = db.query(ResearchHypothesis).filter(ResearchHypothesis.current_stage == "LIVE_ALPHA_STREAM").all()
        if not lives:
            return "No LIVE_ALPHA_STREAM hypotheses found."
            
        companies = db.query(Company).limit(50).all()
        tickers = [c.ticker for c in companies]
        
        # Load recent bars for rolling calcs using LIVE intraday 5m data
        import yfinance as yf
        yf_tickers = [f"{t}.NS" for t in tickers]
        df_yf = yf.download(yf_tickers, period="5d", interval="5m", progress=False)
        
        if df_yf.empty:
            return "No live price data from yfinance."
            
        # Reshape to match the expected multi-index: ['Date', 'Ticker']
        if isinstance(df_yf.columns, pd.MultiIndex):
            df = df_yf.stack(level=1, future_stack=True).reset_index()
        else:
            df = df_yf.reset_index()
            df['Ticker'] = yf_tickers[0]
            
        date_col = 'Datetime' if 'Datetime' in df.columns else 'Date'
        df.rename(columns={date_col: 'Date'}, inplace=True)
        df['Ticker'] = df['Ticker'].str.replace('.NS', '', regex=False)
        df.rename(columns={'Close': 'close', 'Volume': 'volume', 'High': 'high', 'Low': 'low', 'Open': 'open'}, inplace=True)
        df.set_index(['Date', 'Ticker'], inplace=True)
        df.sort_index(inplace=True)
        
        grouped = df.groupby(level='Ticker')
        df['volume_5d'] = grouped['volume'].transform(lambda x: x.rolling(5).mean())
        df['volatility_20d'] = grouped['close'].transform(lambda x: x.pct_change().rolling(20).std())
        df['volatility_20'] = df['volatility_20d']
        df['high_low_spread_10d'] = (df['high'] - df['low']).groupby(level='Ticker').transform(lambda x: x.rolling(10).mean())
        df['adv_10'] = grouped['volume'].transform(lambda x: x.rolling(10).mean())
        
        # Fetch daily data for daily ATR calculations to align with backtest
        df_daily = yf.download(yf_tickers, period="30d", interval="1d", progress=False)
        if not df_daily.empty:
            if isinstance(df_daily.columns, pd.MultiIndex):
                df_daily = df_daily.stack(level=1, future_stack=True).reset_index()
            else:
                df_daily = df_daily.reset_index()
                df_daily['Ticker'] = yf_tickers[0]
            
            date_col_daily = 'Datetime' if 'Datetime' in df_daily.columns else 'Date'
            df_daily.rename(columns={date_col_daily: 'Date', 'High': 'high', 'Low': 'low', 'Close': 'close'}, inplace=True)
            df_daily['Ticker'] = df_daily['Ticker'].str.replace('.NS', '', regex=False)
            
            # Calculate ATR for daily data
            df_daily.set_index(['Date', 'Ticker'], inplace=True)
            df_daily.sort_index(inplace=True)
            daily_grouped = df_daily.groupby(level='Ticker')
            df_daily['prev_close'] = daily_grouped['close'].shift(1)
            df_daily['tr1'] = df_daily['high'] - df_daily['low']
            df_daily['tr2'] = (df_daily['high'] - df_daily['prev_close']).abs()
            df_daily['tr3'] = (df_daily['low'] - df_daily['prev_close']).abs()
            df_daily['true_range'] = df_daily[['tr1', 'tr2', 'tr3']].max(axis=1)
            df_daily['atr_14'] = daily_grouped['true_range'].transform(lambda x: x.rolling(14).mean())
            
            # Get latest daily ATR per ticker
            latest_atr = df_daily['atr_14'].groupby(level='Ticker').last()
            
            # Map back to intraday dataframe
            df['atr_14'] = df.index.get_level_values('Ticker').map(latest_atr)
        
        last_date = df.index.get_level_values('Date').max()
        
        generated = 0
        for hyp in lives:
            ev = SafeASTEvaluator(df)
            try:
                df['factor'] = ev.evaluate(hyp.alpha_expression.lower())
                factors_today = df.xs(last_date, level='Date')['factor'].dropna()
                if factors_today.empty:
                    continue
                    
                pct_ranks = factors_today.rank(pct=True)
                for ticker, score in factors_today.items():
                    rank = pct_ranks[ticker]
                    if rank >= 0.90:
                        direction = 'LONG'
                    elif rank <= 0.10:
                        direction = 'SHORT'
                    else:
                        continue
                        
                    sig = HypothesisSignal(
                        id=uuid.uuid4(),
                        hypothesis_id=hyp.id,
                        ticker=ticker,
                        trade_date=last_date,
                        factor_score=float(score),
                        rank_percentile=float(rank),
                        direction=direction
                    )
                    db.add(sig)
                    generated += 1
            except Exception as e:
                print(f"Error evaluating live hypothesis {hyp.name}: {e}")
                
        db.commit()
        return f"Generated {generated} live signals for {last_date}"
    finally:
        db.close()


@shared_task
def capture_fundamental_snapshots_task():
    """Nightly task to capture point-in-time fundamentals for all active companies."""
    from app.infrastructure.models import FundamentalSnapshot
    import yfinance as yf
    db = SessionLocal()
    try:
        companies = db.query(Company).filter(Company.sector == "NSE").all()
        captured = 0
        trade_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        from app.services.data.data_manager import UnifiedDataManager
        dm = UnifiedDataManager()
        for comp in companies:
            try:
                financials = dm.get_annual_financials(comp.ticker)
                bs = dm.get_balance_sheet(comp.ticker)
                
                roe, de_ratio, pe_ratio, rev, net_inc = 0.0, 1.0, 30.0, 0.0, 0.0
                
                if not financials.empty and not bs.empty:
                    latest_fin = financials.iloc[:, 0]
                    latest_bs = bs.iloc[:, 0]
                    
                    net_inc = latest_fin.get('Net Income', 0)
                    rev = latest_fin.get('Total Revenue', 0)
                    total_equity = latest_bs.get('Stockholders Equity', 1)
                    total_debt = latest_bs.get('Total Debt', 0)
                    
                    roe = float(net_inc / total_equity) if total_equity > 0 else 0.0
                    de_ratio = float(total_debt / total_equity) if total_equity > 0 else 1.0
                    
                    info = dm.get_company_info(comp.ticker)
                    pe_ratio = float(info.get('pe_ratio', info.get('trailingPE', comp.pe_ratio or 30.0)))
                else:
                    continue
                    
                snap = FundamentalSnapshot(
                    ticker=comp.ticker,
                    trade_date=trade_date,
                    roe=roe,
                    debt_to_equity=de_ratio,
                    pe_ratio=pe_ratio,
                    revenue=float(rev),
                    net_income=float(net_inc)
                )
                db.add(snap)
                try:
                    db.commit()
                    captured += 1
                except IntegrityError:
                    db.rollback()
            except Exception as e:
                db.rollback()
                print(f"Failed to capture snapshot for {comp.ticker}: {e}")
                
        return f"Captured {captured} fundamental snapshots for {trade_date.date()}"
    finally:
        db.close()


@shared_task
def run_weekly_portfolio_stress_test_task():
    from app.services.stress_test_service import StressTestService
    db = SessionLocal()
    try:
        svc = StressTestService(db)
        # Using placeholder for portfolio weights for testing
        # Actual implementation would pull active weights from DB
        weights = {"HDFCBANK.NS": 0.5, "RELIANCE.NS": 0.5}
        res = svc.run_stress_test(weights)
        return f"Weekly Portfolio Stress Test: {res}"
    finally:
        db.close()

@shared_task
def run_weekly_weight_optimization_task():
    from app.services.weight_learning_service import WeightLearningService
    db = SessionLocal()
    try:
        svc = WeightLearningService(db)
        res = svc.learn_weights()
        return f"Weekly Weight Optimization: {res}"
    finally:
        db.close()

@shared_task(name="app.worker.tasks.cleanup_old_activity_logs_task")
def cleanup_old_activity_logs_task():
    from app.infrastructure.database import SessionLocal
    from app.services.activity_logger import cleanup_old_activity_logs
    db = SessionLocal()
    try:
        cleanup_old_activity_logs(db, days=15)
        return "Cleaned up old activity logs (15 days)."
    finally:
        db.close()


@shared_task(name="app.worker.tasks.update_catalyst_outcomes_task")
def update_catalyst_outcomes_task():
    """
    P2.2: Daily sweep to update realized forward returns (1d, 3d, 5d) 
    for Catalyst events published in the last 7 days.
    """
    from app.infrastructure.database import SessionLocal
    from app.infrastructure.models import CatalystEvent
    from app.services.quant_service import QuantService
    from datetime import datetime, timedelta
    
    db = SessionLocal()
    try:
        quant = QuantService()
        cutoff_date = datetime.utcnow() - timedelta(days=7)
        
        # Get unresolved catalysts
        catalysts = db.query(CatalystEvent).filter(
            CatalystEvent.published_at >= cutoff_date
        ).all()
        
        updated = 0
        for cat in catalysts:
            try:
                res = quant.get_recent_price_reaction(cat.ticker, published_at=cat.published_at)
                if isinstance(res, dict):
                    # Only update fields that have realized
                    if res.get("reaction_1d") is not None:
                        cat.reaction_1d = res["reaction_1d"]
                    if res.get("reaction_3d") is not None:
                        cat.reaction_3d = res["reaction_3d"]
                    if res.get("reaction_5d") is not None:
                        cat.reaction_5d = res["reaction_5d"]
                    if res.get("gap_reaction_pct") is not None:
                        cat.gap_reaction_pct = res["gap_reaction_pct"]
                    if res.get("session_reaction_pct") is not None:
                        cat.session_reaction_pct = res["session_reaction_pct"]
                        
                    db.commit()
                    updated += 1
            except Exception as e:
                db.rollback()
                print(f"Failed to update outcomes for {cat.id}: {e}")
                
        return f"Updated outcomes for {updated} recent catalysts."
    finally:
        db.close()

@shared_task
def scan_pre_catalyst_anomalies_task():
    """
    P3.3: Scheduled task to scan for unusual volume breakouts without news.
    """
    db = SessionLocal()
    try:
        from app.services.quant_service import QuantService
        svc = QuantService()
        metrics = svc.scan_for_volume_anomalies(db)
        return f"Pre-Catalyst Anomaly Scan complete: {metrics}"
    except Exception as e:
        db.rollback()
        print(f"Error during pre-catalyst anomaly scan: {e}")
        raise e
    finally:
        db.close()

@shared_task
def scan_insider_trades_task():
    """
    P2.5: Scheduled task to scrape NSE Insider Trading disclosures for massive promoter buying/selling.
    """
    db = SessionLocal()
    try:
        from app.services.sources.insider_trading_service import InsiderTradingService
        svc = InsiderTradingService(db)
        metrics = svc.fetch_latest_insider_trades()
        return f"Insider Trading Scan complete: {metrics}"
    except Exception as e:
        db.rollback()
        print(f"Error during insider trading scan: {e}")
        raise e
    finally:
        db.close()

@shared_task
def enrich_external_market_cap_task(tickers: list):
    """
    P4: Fallback to external market cap provider (yfinance) for unresolved catalysts.
    Caches successful results in Redis with a 24-hour TTL.
    """
    import logging
    from app.services.data.data_manager import UnifiedDataManager
    from app.worker.observability import get_redis_client
    
    logger = logging.getLogger(__name__)
    redis_client = get_redis_client()
    vendor = UnifiedDataManager()
    
    for ticker in tickers:
        try:
            cache_key = f"mcap_enrich:{ticker}"
            if redis_client.get(cache_key):
                continue
            
            logger.info(f"[MARKET_CAP] External lookup required: {ticker}")
            
            info = vendor.get_company_info(ticker)
            market_cap = info.get("market_cap")
            
            if market_cap and market_cap > 0:
                redis_client.setex(cache_key, 86400, str(market_cap))
                logger.info(f"[MARKET_CAP] External match successful: {ticker}. Cached as {cache_key}")
            else:
                redis_client.setex(cache_key, 3600, "NOT_FOUND")
                logger.info(f"[MARKET_CAP] External lookup failed: {ticker}")
        
        except Exception as e:
            logger.error(f"[MARKET_CAP] External lookup exception for {ticker}: {e}")



# ─── Pre-Release Edge ──────────────────────────────────────────────────────────

def _refresh_earnings_history(db, mode: str, obs: TaskObserver, limit: int = None) -> dict:
    from app.services.earnings_events_service import EarningsEventsService, select_companies_for_refresh, mark_refreshed
    from app.worker.observability import get_redis_client
    redis_client = get_redis_client()
    companies = select_companies_for_refresh(db, mode, redis_client)
    if limit:
        companies = companies[:limit]
    svc = EarningsEventsService(db)
    total = len(companies)
    counts = {"OK": 0, "NO_EVENTS": 0, "NO_PRICES": 0, "FAILED": 0}
    obs.update(log_msg=f"Refreshing results history for {total} companies (mode={mode}).",
               progress={"total": total, "processed": 0, "saved": 0, "failed": 0, "percentage": 0,
                         "current_step": "Backfilling results events"}, force=True)
    for i, company in enumerate(companies, start=1):
        try:
            res = svc.backfill_company(company)
            counts[res["status"]] = counts.get(res["status"], 0) + 1
            mark_refreshed(redis_client, company.ticker)
        except Exception as e:
            db.rollback()
            counts["FAILED"] += 1
            obs.update(log_msg=f"{company.ticker}: {e}", log_level="WARNING")
        if i % 10 == 0 or i == total:
            obs.update(progress={"total": total, "processed": i, "saved": counts["OK"], "failed": counts["FAILED"],
                                 "percentage": round(100.0 * i / max(total, 1), 1), "current_step": f"Backfilling {company.ticker}"})
    return counts


@shared_task(bind=True, name="app.worker.tasks.backfill_earnings_history_task", time_limit=6 * 3600)
def backfill_earnings_history_task(self, mode: str = "full", limit: int = None):
    """Builds/refreshes the historical results-event panel (dates, broadcast times, event studies)."""
    obs = TaskObserver(self.request.id if self.request and self.request.id else "backfill_earnings_local")
    db = SessionLocal()
    try:
        counts = _refresh_earnings_history(db, mode, obs, limit)
        return f"Results history refresh ({mode}) complete: {counts}"
    finally:
        db.close()


@shared_task(bind=True, name="app.worker.tasks.retrain_pre_release_model_task", time_limit=3600)
def retrain_pre_release_model_task(self):
    from app.services.pre_release_edge_service import train_models
    obs = TaskObserver(self.request.id if self.request and self.request.id else "retrain_pre_release_local")
    db = SessionLocal()
    try:
        obs.update(log_msg="Training pre-release edge models (walk-forward validated)...")
        result = train_models(db)
        obs.update(log_msg=f"Training result: {result}")
        return f"Pre-release model training: {result}"
    finally:
        db.close()


@shared_task(bind=True, name="app.worker.tasks.run_pre_release_edge_pipeline_task", time_limit=3 * 3600)
def run_pre_release_edge_pipeline_task(self):
    """Daily: refresh recent/upcoming results history -> (re)train if stale -> predict upcoming -> grade past calls."""
    import os
    from app.services.pre_release_edge_service import PreReleaseEdgeService, train_models, MODEL_PATH
    obs = TaskObserver(self.request.id if self.request and self.request.id else "pre_release_pipeline_local")
    db = SessionLocal()
    try:
        counts = _refresh_earnings_history(db, "recent", obs)
        model_age_days = (time.time() - os.path.getmtime(MODEL_PATH)) / 86400 if os.path.exists(MODEL_PATH) else None
        training = None
        if model_age_days is None or model_age_days > 7:
            obs.update(log_msg="Model missing or older than 7 days - retraining.")
            training = train_models(db)
            obs.update(log_msg=f"Training result: {training.get('status')}")
        svc = PreReleaseEdgeService(db)
        obs.update(log_msg="Generating pre-release forecasts for upcoming results...", progress={"current_step": "Predicting", "percentage": 80})
        predictions = svc.predict_all()
        graded = svc.grade()
        obs.update(log_msg=f"Predictions: {predictions} | Grading: {graded}", progress={"current_step": "Done", "percentage": 100})
        return f"Pre-release edge pipeline: history={counts} training={training and training.get('status')} predictions={predictions} grading={graded}"
    finally:
        db.close()


# ─── Catalyst Radar evidence ───────────────────────────────────────────────────

@shared_task(bind=True, name="app.worker.tasks.build_catalyst_evidence_task", time_limit=8 * 3600)
def build_catalyst_evidence_task(self, years: int = 2, limit: int = None):
    """Builds/refreshes the historical filing -> price-reaction evidence base used to grade live catalyst alerts."""
    from app.services.catalyst_evidence_service import CatalystEvidenceService
    obs = TaskObserver(self.request.id if self.request and self.request.id else "catalyst_evidence_local")
    db = SessionLocal()
    try:
        companies = [c for c in db.query(Company).all() if not (c.ticker.endswith((".BO", ".NS")) or c.ticker.isdigit())]
        companies.sort(key=lambda c: -(c.market_cap or 0))
        if limit:
            companies = companies[:limit]
        svc = CatalystEvidenceService(db)
        total, saved, failed = len(companies), 0, 0
        obs.update(log_msg=f"Building catalyst evidence for {total} companies ({years}y of filings).",
                   progress={"total": total, "processed": 0, "saved": 0, "failed": 0, "percentage": 0, "current_step": "Filings"}, force=True)
        for i, c in enumerate(companies, start=1):
            try:
                res = svc.build_company(c, years=years)
                saved += res.get("saved", 0)
            except Exception as e:
                db.rollback()
                failed += 1
                obs.update(log_msg=f"{c.ticker}: {e}", log_level="WARNING")
            if i % 10 == 0 or i == total:
                obs.update(progress={"total": total, "processed": i, "saved": saved, "failed": failed,
                                     "percentage": round(100.0 * i / max(total, 1), 1), "current_step": f"Filings {c.ticker}"})
        return f"Catalyst evidence: {total} companies, {saved} events saved, {failed} failed, PDFs {svc.pdf_used}"
    finally:
        db.close()


@shared_task(name="app.worker.tasks.send_catalyst_digest_task")
def send_catalyst_digest_task():
    """Pre-market watchlist (08:45 IST): every graded catalyst since the last digest, strongest first."""
    import json
    from datetime import timedelta
    from app.infrastructure.models import CatalystEvent
    from app.services.catalyst_intel_service import digest_line
    from app.services.notifier import DiscordNotifier
    db = SessionLocal()
    try:
        since = datetime.utcnow() - timedelta(hours=24)
        rows = db.query(CatalystEvent).filter(CatalystEvent.created_at >= since,
                                              CatalystEvent.alert_grade.in_(["INSTANT", "DIGEST"])).all()
        if not rows:
            return "No graded catalysts in the last 24h; digest skipped."
        rows.sort(key=lambda r: (r.alert_grade != "INSTANT", -(r.impact_score or 0)))
        bull = [r for r in rows if r.direction == "BULLISH"]
        bear = [r for r in rows if r.direction == "BEARISH"]
        other = [r for r in rows if r.direction not in ("BULLISH", "BEARISH")]
        parts = []
        for title, group in (("Bullish", bull), ("Bearish", bear), ("Other", other)):
            if group:
                parts.append(f"**{title}**\n" + "\n".join(("• " if r.alert_grade == "DIGEST" else "• [alerted] ") + digest_line(r) for r in group[:15]))
        embed = {"title": f"Catalyst watchlist · {len(rows)} events before the open",
                 "description": "\n\n".join(parts)[:4000], "color": 0x3B82F6,
                 "footer": {"text": "hist = average move vs Nifty in 3 days after similar past filings"}}
        DiscordNotifier().send_embed(embed)
        return f"Digest sent: {len(rows)} events ({len(bull)} bullish, {len(bear)} bearish)."
    finally:
        db.close()


@shared_task(name="app.worker.tasks.send_catalyst_scorecard_task")
def send_catalyst_scorecard_task():
    """Weekly honesty check: how last week's instant alerts actually played out."""
    from datetime import timedelta
    from app.infrastructure.models import CatalystEvent
    from app.services.notifier import DiscordNotifier
    db = SessionLocal()
    try:
        since = datetime.utcnow() - timedelta(days=8)
        rows = db.query(CatalystEvent).filter(CatalystEvent.alerted_at >= since, CatalystEvent.alert_grade == "INSTANT").all()
        scored = [r for r in rows if r.reaction_3d is not None and r.direction in ("BULLISH", "BEARISH")]
        if not rows:
            return "No instant alerts last week."
        right = [r for r in scored if (r.reaction_3d > 0) == (r.direction == "BULLISH")]
        signed = [r.reaction_3d if r.direction == "BULLISH" else -r.reaction_3d for r in scored]
        avg = sum(signed) / len(signed) if signed else 0.0
        lines = [f"Alerts: {len(rows)} · scored so far: {len(scored)} · right direction: **{len(right)}/{len(scored) or 0}** · "
                 f"avg move in the alert's direction: **{avg:+.1f}%** (3 days)"]
        for r in sorted(scored, key=lambda r: -(r.reaction_3d if r.direction == 'BULLISH' else -r.reaction_3d))[:10]:
            lines.append(f"{'✓' if r in right else '✕'} {r.ticker} · {r.direction.title()} {r.subtype or r.category} · {r.reaction_3d:+.1f}%")
        DiscordNotifier().send_embed({"title": "Catalyst Radar · last week's scorecard", "description": "\n".join(lines)[:4000], "color": 0x8B949E})
        return lines[0]
    finally:
        db.close()


# ─── Momentum trade alerts ─────────────────────────────────────────────────────

@shared_task(name="app.worker.tasks.monitor_momentum_trades_task", time_limit=600)
def monitor_momentum_trades_task():
    """Every 15 min in market hours: Target 1 / Target 2 alerts; after 15:30 IST: stop and time-stop on the close."""
    from app.services.momentum_alerts import monitor_open_trades
    db = SessionLocal()
    try:
        return f"Momentum trades monitored: {monitor_open_trades(db)}"
    finally:
        db.close()


@shared_task(name="app.worker.tasks.send_momentum_scorecard_task")
def send_momentum_scorecard_task():
    from app.services.momentum_alerts import weekly_scorecard
    db = SessionLocal()
    try:
        return weekly_scorecard(db)
    finally:
        db.close()



# ─── Impactful Events (corporate actions) ──────────────────────────────────────

@shared_task(bind=True, name="app.worker.tasks.build_corporate_action_evidence_task", time_limit=8 * 3600)
def build_corporate_action_evidence_task(self, years: int = 5, limit: int = None):
    """Measures how every past dividend / bonus / split / buyback / rights / demerger / fund raise moved the stock."""
    from app.services.corporate_actions_service import CorporateActionsService
    obs = TaskObserver(self.request.id if self.request and self.request.id else "corporate_actions_local")
    db = SessionLocal()
    try:
        companies = [c for c in db.query(Company).all() if not (c.ticker.endswith((".BO", ".NS")) or c.ticker.isdigit())]
        companies.sort(key=lambda c: -(c.market_cap or 0))
        if limit:
            companies = companies[:limit]
        svc = CorporateActionsService(db)
        total, saved, updated, failed = len(companies), 0, 0, 0
        obs.update(log_msg=f"Building corporate-action evidence for {total} companies ({years}y).",
                   progress={"total": total, "processed": 0, "saved": 0, "failed": 0, "percentage": 0, "current_step": "Corporate actions"}, force=True)
        for i, c in enumerate(companies, start=1):
            try:
                res = svc.build_company(c, years=years)
                saved += res.get("saved", 0)
                updated += res.get("updated", 0)
            except Exception as e:
                db.rollback()
                failed += 1
                obs.update(log_msg=f"{c.ticker}: {e}", log_level="WARNING")
            if i % 10 == 0 or i == total:
                obs.update(progress={"total": total, "processed": i, "saved": saved, "failed": failed,
                                     "percentage": round(100.0 * i / max(total, 1), 1), "current_step": f"Corporate actions {c.ticker}"})
        return f"Corporate-action evidence: {total} companies, {saved} new events, {updated} completed, {failed} failed"
    finally:
        db.close()


@shared_task(bind=True, name="app.worker.tasks.refresh_impactful_events_task", time_limit=3600)
def refresh_impactful_events_task(self):
    """Rebuilds the live Impactful Events lists (notices, declarations, ex-dates) and caches them in Redis."""
    from app.services.corporate_actions_service import SnapshotBuilder, save_snapshot
    obs = TaskObserver(self.request.id if self.request and self.request.id else "impactful_local")
    db = SessionLocal()
    try:
        obs.update(log_msg="Refreshing Impactful Events from NSE feeds.", force=True)
        snap = SnapshotBuilder(db).build()
        save_snapshot(snap)
        buys = sum(1 for r in snap["items"] if r["action"] == "BUY")
        return f"Impactful Events: {len(snap['items'])} live events, {buys} BUY, evidence {snap['evidence_events']} past events"
    finally:
        db.close()
