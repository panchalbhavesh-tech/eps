import json
import requests
from app.core.config import settings

class AIAnalystService:
    def __init__(self):
        self.gemini_api_key = settings.GEMINI_API_KEY
        self.model_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_api_key}"

    def generate_analysis_report(self, ticker: str, quantitative_data: dict) -> dict:
        prompt = f"""
You are a Senior Quantitative Equity Research Analyst at a top-tier investment bank.
Analyze the following quantitative data for {ticker} and provide a markdown-formatted report addressing the following sections. 

Do not generate the tabular quantitative sections (1-4, 6-7) as they are already handled by our UI. Focus ONLY on providing deep, data-driven qualitative analysis for Sections 5, 8, 9, 10, and 11.

DATA CONTEXT:
{json.dumps(quantitative_data, indent=2)}

OUTPUT FORMAT (Markdown):
### Section 5 - Pattern Recognition
(Provide analysis on recurring behaviors, earnings run-ups, sell-offs)

### Section 8 - Risk Assessment
(Fundamental, technical, sector, and macro risks)

### Section 9 - Probability Analysis
(Estimates for price movements)

### Section 10 - Trading Plan
(Actionable trading plan with entry, target, stop loss)

### Section 11 - Final Verdict
(Bull/Bear case, Overall Rating: Strong Buy/Buy/Accumulate/Hold/Reduce/Sell)
"""

        try:
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "topK": 40,
                    "topP": 0.95
                }
            }
            
            headers = {"Content-Type": "application/json"}
            response = requests.post(self.model_url, headers=headers, json=payload)
            response.raise_for_status()
            
            data = response.json()
            text_response = data['candidates'][0]['content']['parts'][0]['text']
            
            # Simple parsing of the markdown sections
            sections = {
                "pattern_recognition": "",
                "risk_assessment": "",
                "probability_analysis": "",
                "trading_plan": "",
                "final_verdict": "",
                "overall_rating": "Hold" # Default
            }
            
            current_section = None
            lines = text_response.split('\n')
            for line in lines:
                if "Section 5" in line: current_section = "pattern_recognition"
                elif "Section 8" in line: current_section = "risk_assessment"
                elif "Section 9" in line: current_section = "probability_analysis"
                elif "Section 10" in line: current_section = "trading_plan"
                elif "Section 11" in line: current_section = "final_verdict"
                elif current_section:
                    sections[current_section] += line + "\n"
                    
            # Extract overall rating
            if "Strong Buy" in sections["final_verdict"]: sections["overall_rating"] = "Strong Buy"
            elif "Buy" in sections["final_verdict"]: sections["overall_rating"] = "Buy"
            elif "Sell" in sections["final_verdict"]: sections["overall_rating"] = "Sell"
            
            return sections
        except Exception as e:
            print(f"Error calling Gemini API for {ticker}: {e}")
            return {}
