import os
import sys
import requests
import json
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.config import settings

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
payload = {
    "contents": [{"parts": [{"text": "Hello"}]}],
    "generationConfig": {"temperature": 0.0, "topK": 10, "topP": 0.95}
}
resp = requests.post(url, json=payload)
print(resp.status_code)
print(resp.text)
