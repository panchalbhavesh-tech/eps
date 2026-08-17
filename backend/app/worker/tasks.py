from celery import shared_task, group
from sqlalchemy.exc import IntegrityError
from app.infrastructure.database import SessionLocal
from app.services.prediction_service import PredictionService
from app.services.quant_service import QuantService
from app.services.technical_indicator_service import TechnicalIndicatorService
from app.services.event_study_service import EventStudyService
from app.services.ai_analyst_service import AIAnalystService
from app.services.nse_service import NSEService
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
        
    import yfinance as yf
    import pandas as pd
    yf_ticker = f"{company.ticker}.NS" if not company.ticker.endswith((".NS", ".BO", ".US", ".L")) else company.ticker
    stock_data = yf.Ticker(yf_ticker)

    # 1. Fetch Market Cap
    try:
        fast_info = getattr(stock_data, "fast_info", {})
        mcap = getattr(fast_info, "market_cap", None)
        if mcap is None and hasattr(fast_info, "get"):
            mcap = fast_info.get("market_cap")
        if mcap is None and hasattr(stock_data, "info"):
            mcap = stock_data.info.get("marketCap")
        if mcap is not None and mcap > 0:
            company.market_cap = float(mcap)
    except Exception as ex:
        print(f"Error fetching market cap for {company.ticker}: {ex}")

    # 2. Fetch Quarterly Financials & True Release Dates
    inc = stock_data.quarterly_income_stmt
    if inc is None or inc.empty:
        inc = getattr(stock_data, "quarterly_financials", pd.DataFrame())
    
    release_dates = []
    try:
        ed = stock_data.earnings_dates
        if ed is not None and not ed.empty:
            release_dates = pd.to_datetime(ed.index).tz_localize(None).sort_values()
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
                    if not s.empty and len(s) >= 4:
                        return s
            return None

        eps_series = get_series('Basic EPS', 'Diluted EPS')
        if eps_series is not None and len(eps_series) >= 4:
            company.q4_eps = float(eps_series.iloc[0])
            company.q3_eps = float(eps_series.iloc[1])
            company.q2_eps = float(eps_series.iloc[2])
            company.q1_eps = float(eps_series.iloc[3])
            if len(eps_series) >= 5:
                company.q0_eps = float(eps_series.iloc[4])

        rev_series = get_series('Total Revenue', 'Operating Revenue', 'Total Operating Income As Reported')
        if rev_series is not None and len(rev_series) >= 4:
            company.q4_revenue = float(rev_series.iloc[0])
            company.q3_revenue = float(rev_series.iloc[1])
            company.q2_revenue = float(rev_series.iloc[2])
            company.q1_revenue = float(rev_series.iloc[3])
            if len(rev_series) >= 5:
                company.q0_revenue = float(rev_series.iloc[4])

        prof_series = get_series('Net Income', 'Net Income Common Stockholders', 'Operating Income')
        if prof_series is not None and len(prof_series) >= 4:
            company.q4_profit = float(prof_series.iloc[0])
            company.q3_profit = float(prof_series.iloc[1])
            company.q2_profit = float(prof_series.iloc[2])
            company.q1_profit = float(prof_series.iloc[3])
            if len(prof_series) >= 5:
                company.q0_profit = float(prof_series.iloc[4])
    
    if company.current_price in (0, 0.0, None):
        try:
            hist = stock_data.history(period="1d")
            if not hist.empty:
                company.current_price = round(float(hist['Close'].iloc[-1]), 2)
        except Exception:
            pass
    return company

@shared_task
def populate_companies_data_task():
    try:
        sync_nse_calendar_task()
    except Exception as e:
        print(f"Error syncing NSE calendar: {e}")

    db = SessionLocal()
    try:
        company_ids = [c.id for c in db.query(Company.id).filter(Company.sector == "NSE").all()]
        updated = 0
        for cid in company_ids:
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

@shared_task
def mass_calculate_financial_health_task():
    db = SessionLocal()
    try:
        companies = db.query(Company).all()
        ai = AIAnalystService()
        updated = 0
        for company in companies:
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
        
        model = ml_service.train_or_load_model(force_retrain=force_retrain)
        return f"Phase 3 ML Model Retrained: {model is not None} (PSI: {psi_val:.4f})"
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
    db = SessionLocal()
    try:
        val_svc = ValidationService(db)
        res = val_svc.evaluate_model_probation(new_model_id=model_id)
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


@shared_task(time_limit=300)
def sync_ohlcv_cache_task():
    """Nightly master task: Fans out OHLCV sync to individual micro-tasks."""
    db = SessionLocal()
    try:
        companies = db.query(Company).all()
        tickers = [c.ticker for c in companies]
        
        # Dispatch individual celery tasks
        if tickers:
            job = group(sync_single_ohlcv_task.s(ticker) for ticker in tickers)
            job.apply_async()
            
        return f"Dispatched {len(tickers)} OHLCV sync sub-tasks to the worker pool."
    finally:
        db.close()


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
        
        for comp in companies:
            try:
                yf_ticker = f"{comp.ticker}.NS" if not comp.ticker.endswith((".NS", ".BO")) else comp.ticker
                tk = yf.Ticker(yf_ticker)
                
                financials = tk.financials
                bs = tk.balance_sheet
                
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
                    
                    info = tk.info
                    pe_ratio = float(info.get('trailingPE', comp.pe_ratio or 30.0))
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
