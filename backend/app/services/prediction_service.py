import requests
from app.core.config import settings

class PredictionService:
    def __init__(self):
        self.fmp_api_key = settings.FMP_API_KEY
        self.fmp_base_url = "https://financialmodelingprep.com/api/v3"

    def generate_prediction(self, ticker: str) -> dict:
        yf_ticker = f"{ticker}.NS" if not ticker.endswith(".NS") else ticker
        
        # Default fallback
        result = {
            "predicted_eps": 0.0,
            "confidence_score": 0.0,
            "current_price": 0.0,
            "historical_trend": "N/A"
        }
        
        try:
            import yfinance as yf
            ticker_obj = yf.Ticker(yf_ticker)
            
            # Fetch current price
            info = ticker_obj.fast_info
            current_price = info.get("last_price", 0.0)
            result["current_price"] = round(current_price, 2)
            
            # Fetch historical EPS
            df = ticker_obj.quarterly_income_stmt
            if df.empty or 'Basic EPS' not in df.index:
                return result
                
            # EPS series (latest first usually, but let's take the first 4)
            eps_series = df.loc['Basic EPS'].dropna().tolist()
            if not eps_series:
                return result
                
            historical_eps = eps_series[:4]
            # Since yfinance returns latest quarter first (Q4, Q3, Q2, Q1)
            # We want chronological order (Q1, Q2, Q3, Q4) to compare 1vs2, 2vs3, etc.
            historical_eps.reverse()
            
            # Calculate UP/DOWN trend
            trend = []
            for i in range(1, len(historical_eps)):
                prev = historical_eps[i-1]
                curr = historical_eps[i]
                if curr > prev:
                    trend.append("UP")
                elif curr < prev:
                    trend.append("DOWN")
                else:
                    trend.append("FLAT")
            
            result["historical_trend"] = ",".join(trend) if trend else "N/A"
            
            # Simple Prediction
            avg_eps = sum(historical_eps) / len(historical_eps)
            growth = historical_eps[-1] - historical_eps[0] if len(historical_eps) > 1 else 0
            predicted = avg_eps + (growth * 0.5)
            confidence = min(0.95, 0.5 + (len(historical_eps) * 0.04))
            
            result["predicted_eps"] = round(predicted, 2)
            result["confidence_score"] = round(confidence, 2)
            
        except Exception as e:
            print(f"Error generating prediction for {yf_ticker}: {e}")
            
        return result
