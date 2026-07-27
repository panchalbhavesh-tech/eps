from app.infrastructure.database import SessionLocal
from app.infrastructure.models import Company
from app.services.prediction_service import PredictionService
from app.worker.tasks import sync_nse_calendar_task
import yfinance as yf

def populate_top_5():
    print("Syncing calendar...")
    sync_nse_calendar_task()
    print("Done. Populating top 5 companies...")
    
    db = SessionLocal()
    companies = db.query(Company).filter(Company.sector == "NSE").limit(5).all()
    pred_svc = PredictionService()
    
    for company in companies:
        print(f"Fetching data for {company.ticker}...")
        try:
            data = pred_svc.generate_prediction(company.ticker)
            company.current_price = data.get("current_price")
            company.historical_trend = data.get("historical_trend")
            
            yf_ticker = f"{company.ticker}.NS"
            stock_data = yf.Ticker(yf_ticker)
            inc = stock_data.quarterly_income_stmt
            if not inc.empty and 'Basic EPS' in inc.index:
                eps_series = inc.loc['Basic EPS'].dropna()
                if len(eps_series) >= 4:
                    company.q1_eps = float(eps_series.iloc[3])
                    company.q2_eps = float(eps_series.iloc[2])
                    company.q3_eps = float(eps_series.iloc[1])
                    company.q4_eps = float(eps_series.iloc[0])
            
            if company.current_price in (0, 0.0, None):
                hist = stock_data.history(period="1d")
                if not hist.empty:
                    company.current_price = round(float(hist['Close'].iloc[-1]), 2)
            
            db.commit()
            print(f"Success for {company.ticker}")
        except Exception as e:
            print(f"Error for {company.ticker}: {e}")
            db.rollback()
            
    db.close()
    print("Top 5 populated!")

if __name__ == "__main__":
    populate_top_5()
