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
            
            # Calculate UP/DOWN trend using rigorous point-to-point momentum
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
            
            # Rigorous Linear Regression Prediction for EPS
            import numpy as np
            y = np.array(historical_eps)
            x = np.arange(len(y))
            
            if len(y) > 1:
                # OLS Regression: slope (m) and intercept (c)
                m, c = np.polyfit(x, y, 1)
                # Predict next quarter (x = len(y))
                predicted = m * len(y) + c
                
                # Calculate R-squared for confidence
                y_pred = m * x + c
                ss_res = np.sum((y - y_pred)**2)
                ss_tot = np.sum((y - np.mean(y))**2)
                r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
                
                # Confidence scales with R-squared and sample size
                confidence = min(0.95, 0.5 + (r_squared * 0.4) + (len(historical_eps) * 0.01))
            else:
                predicted = y[0] if len(y) > 0 else 0.0
                confidence = 0.5
            
            result["predicted_eps"] = round(predicted, 2)
            result["confidence_score"] = round(confidence, 2)
            
        except Exception as e:
            print(f"Error generating prediction for {yf_ticker}: {e}")
            
        return result
