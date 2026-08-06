import pandas as pd
import pandas_ta as ta
from typing import Dict, Any

class TechnicalIndicatorService:
    def __init__(self):
        pass

    def calculate_technicals(self, df: pd.DataFrame) -> Dict[str, Any]:
        if df.empty or len(df) < 20:
            return {}
        
        # Calculate Indicators
        df['SMA_50'] = ta.sma(df['Close'], length=50)
        df['SMA_100'] = ta.sma(df['Close'], length=100)
        df['SMA_200'] = ta.sma(df['Close'], length=200)
        df['RSI'] = ta.rsi(df['Close'], length=14)
        
        macd = ta.macd(df['Close'])
        df['MACD'] = macd['MACD_12_26_9'] if macd is not None and not macd.empty else None
        
        adx = ta.adx(df['High'], df['Low'], df['Close'])
        df['ADX'] = adx['ADX_14'] if adx is not None and not adx.empty else None
        
        # Pivot Points for Support/Resistance
        last_high = df['High'].iloc[-2]
        last_low = df['Low'].iloc[-2]
        last_close = df['Close'].iloc[-2]
        pivot = (last_high + last_low + last_close) / 3
        imm_support = (2 * pivot) - last_high
        maj_support = pivot - (last_high - last_low)
        imm_resistance = (2 * pivot) - last_low
        maj_resistance = pivot + (last_high - last_low)
        
        latest = df.iloc[-1]
        
        # Golden Cross / Death Cross
        cross_status = "Neutral"
        if not pd.isna(latest['SMA_50']) and not pd.isna(latest['SMA_200']):
            if latest['SMA_50'] > latest['SMA_200'] and df['SMA_50'].iloc[-2] <= df['SMA_200'].iloc[-2]:
                cross_status = "Golden Cross"
            elif latest['SMA_50'] < latest['SMA_200'] and df['SMA_50'].iloc[-2] >= df['SMA_200'].iloc[-2]:
                cross_status = "Death Cross"
            
        ref_sma = latest['SMA_200'] if not pd.isna(latest['SMA_200']) else (latest['SMA_50'] if not pd.isna(latest['SMA_50']) else df['Close'].rolling(10).mean().iloc[-1])
        trend = "Bullish" if not pd.isna(ref_sma) and latest['Close'] > ref_sma else "Bearish"
        vol_trend = "Increasing" if latest['Volume'] > df['Volume'].rolling(20).mean().iloc[-1] else "Decreasing"
        trend_strength = "Strong" if latest['ADX'] and latest['ADX'] > 25 else "Weak"
        
        return {
            "imm_support": float(imm_support),
            "maj_support": float(maj_support),
            "imm_resistance": float(imm_resistance),
            "maj_resistance": float(maj_resistance),
            "trend": trend,
            "dma_50": float(latest['SMA_50']) if not pd.isna(latest['SMA_50']) else None,
            "dma_100": float(latest['SMA_100']) if not pd.isna(latest['SMA_100']) else None,
            "dma_200": float(latest['SMA_200']) if not pd.isna(latest['SMA_200']) else None,
            "cross_status": cross_status,
            "rsi": float(latest['RSI']) if not pd.isna(latest['RSI']) else None,
            "macd": float(latest['MACD']) if not pd.isna(latest['MACD']) else None,
            "adx": float(latest['ADX']) if not pd.isna(latest['ADX']) else None,
            "volume_trend": vol_trend,
            "vwap_position": "N/A", # Intraday VWAP needs intraday data
            "trend_strength": trend_strength
        }
