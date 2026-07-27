from celery import shared_task
from sqlalchemy.exc import IntegrityError
from app.infrastructure.database import SessionLocal
from app.services.prediction_service import PredictionService
from app.services.quant_service import QuantService
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

@shared_task
def populate_companies_data_task():
    # Sync NSE dates and purposes first
    try:
        sync_nse_calendar_task()
    except Exception as e:
        print(f"Error syncing NSE calendar: {e}")

    db = SessionLocal()
    try:
        companies = db.query(Company).filter(Company.sector == "NSE").all()
        pred_svc = PredictionService()
        updated = 0
        for company in companies:
            if company.current_price not in (0, 0.0, None) and company.market_cap not in (0, 0.0, None) and company.q4_revenue not in (0, 0.0, None) and company.q4_date is not None:
                continue # Skip if already fetched to save time
                
            try:
                data = pred_svc.generate_prediction(company.ticker)
                company.current_price = data.get("current_price")
                company.historical_trend = data.get("historical_trend")
                
                import yfinance as yf
                import pandas as pd
                yf_ticker = f"{company.ticker}.NS"
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

                # 2. Fetch Quarterly Financials (EPS, Revenue, Profit, Dates)
                inc = stock_data.quarterly_income_stmt
                if inc is None or inc.empty:
                    inc = getattr(stock_data, "quarterly_financials", pd.DataFrame())
                
                if not inc.empty:
                    if len(inc.columns) >= 4:
                        def fmt_dt(val):
                            try:
                                ts = pd.to_datetime(val)
                                return ts.strftime("%b-%Y")
                            except:
                                return str(val)[:7]
                        company.q4_date = fmt_dt(inc.columns[0])
                        company.q3_date = fmt_dt(inc.columns[1])
                        company.q2_date = fmt_dt(inc.columns[2])
                        company.q1_date = fmt_dt(inc.columns[3])

                    def get_series(*row_names):
                        for name in row_names:
                            if name in inc.index:
                                s = inc.loc[name].dropna()
                                if not s.empty and len(s) >= 4:
                                    return s
                        return None

                    # EPS
                    eps_series = get_series('Basic EPS', 'Diluted EPS')
                    if eps_series is not None and len(eps_series) >= 4:
                        company.q4_eps = float(eps_series.iloc[0])
                        company.q3_eps = float(eps_series.iloc[1])
                        company.q2_eps = float(eps_series.iloc[2])
                        company.q1_eps = float(eps_series.iloc[3])
                        if len(eps_series) >= 5:
                            company.q0_eps = float(eps_series.iloc[4])

                    # Revenue
                    rev_series = get_series('Total Revenue', 'Operating Revenue', 'Total Operating Income As Reported')
                    if rev_series is not None and len(rev_series) >= 4:
                        company.q4_revenue = float(rev_series.iloc[0])
                        company.q3_revenue = float(rev_series.iloc[1])
                        company.q2_revenue = float(rev_series.iloc[2])
                        company.q1_revenue = float(rev_series.iloc[3])
                        if len(rev_series) >= 5:
                            company.q0_revenue = float(rev_series.iloc[4])

                    # Net Profit
                    prof_series = get_series('Net Income', 'Net Income Common Stockholders', 'Operating Income')
                    if prof_series is not None and len(prof_series) >= 4:
                        company.q4_profit = float(prof_series.iloc[0])
                        company.q3_profit = float(prof_series.iloc[1])
                        company.q2_profit = float(prof_series.iloc[2])
                        company.q1_profit = float(prof_series.iloc[3])
                        if len(prof_series) >= 5:
                            company.q0_profit = float(prof_series.iloc[4])
                
                # Fallback for current price if PredictionService returned 0
                if company.current_price in (0, 0.0, None):
                    hist = stock_data.history(period="1d")
                    if not hist.empty:
                        company.current_price = round(float(hist['Close'].iloc[-1]), 2)
                        
                db.commit()
                updated += 1
                time.sleep(1.5) # Prevent yfinance rate limiting
            except Exception as e:
                print(f"Failed to populate data for {company.ticker}: {e}")
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
        if df.empty: return "No OHLCV data"
        
        # 0. Fetch Fundamental Snapshot
        import yfinance as yf
        yf_ticker = f"{company.ticker}.NS" if not company.ticker.endswith(".NS") else company.ticker
        stock = yf.Ticker(yf_ticker)
        try:
            info = stock.info
            company.market_cap = info.get("marketCap")
            company.enterprise_value = info.get("enterpriseValue")
            company.pe_ratio = info.get("trailingPE")
            company.pb_ratio = info.get("priceToBook")
            company.roe = info.get("returnOnEquity")
            company.roce = info.get("returnOnAssets") # approximation
            company.dividend_yield = info.get("dividendYield")
            company.high_52w = info.get("fiftyTwoWeekHigh")
            company.low_52w = info.get("fiftyTwoWeekLow")
        except Exception as e:
            print(f"Failed to fetch info for {company.ticker}: {e}")
        
        # 1. Technicals
        techs = quant.calculate_technicals(df)
        if techs:
            # Delete old ones to save space (or keep history)
            db.query(TechnicalSnapshot).filter(TechnicalSnapshot.company_id == company.id).delete()
            tech_snap = TechnicalSnapshot(company_id=company.id, **techs)
            db.add(tech_snap)
        
        # 2. Event Study & Backtests (Using most recent upcoming_date as a proxy if no past earnings)
        # Ideally we fetch past 16 quarters, but for MVP we run event study on a few dates
        dates = [company.upcoming_date] if company.upcoming_date else []
        for d in dates:
            if d:
                es = quant.calculate_event_study(df, d)
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
        q_data = {"ticker": company.ticker, "technicals": techs, "backtests": backtests}
        report_data = ai.generate_analysis_report(company.ticker, q_data)
        
        if report_data:
            db.query(AIAnalysisReport).filter(AIAnalysisReport.company_id == company.id).delete()
            db.add(AIAnalysisReport(company_id=company.id, **report_data))
            
        db.commit()
        return f"Generated deep report for {company.ticker}"
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
