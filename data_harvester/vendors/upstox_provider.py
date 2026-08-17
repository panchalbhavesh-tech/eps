import os
import pandas as pd
from typing import List, Dict, Any
from datetime import datetime, timedelta
import upstox_client
from upstox_client.rest import ApiException
from .base import DataProvider

class UpstoxProvider(DataProvider):
    """
    Upstox API v2 implementation of the DataProvider.
    Requires UPSTOX_ACCESS_TOKEN in environment.
    """
    
    def __init__(self):
        self.access_token = os.environ.get("UPSTOX_ACCESS_TOKEN")
        if not self.access_token:
            print("Warning: UPSTOX_ACCESS_TOKEN not found in environment.")
            
        self.configuration = upstox_client.Configuration()
        self.configuration.access_token = self.access_token
        self.api_client = upstox_client.ApiClient(self.configuration)
        
    def _get_instrument_key(self, ticker: str) -> str:
        # Simplistic mapping: NIFTY/NSEI -> index, else equity
        if ticker in ["^NSEI", "NIFTY"]:
            return "NSE_INDEX|Nifty 50"
        # Clean ticker (remove .NS if present)
        clean_ticker = ticker.replace(".NS", "")
        # Real mapping requires downloading the instrument list CSV.
        # ponytail: keeping it abstract for the skeleton. Real impl would load mapping from DB/CSV.
        return f"NSE_EQ|{clean_ticker}"
        
    def fetch_historical_ohlcv(self, ticker: str, days: int = 365) -> pd.DataFrame:
        """
        Fetches daily historical candles using Upstox HistoryApi.
        Upstox limits daily data to ~1 year for this endpoint without pagination.
        """
        api_instance = upstox_client.HistoryApi(self.api_client)
        instrument_key = self._get_instrument_key(ticker)
        
        to_date = datetime.now().strftime("%Y-%m-%d")
        from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        
        try:
            # interval = 'day'
            response = api_instance.get_historical_candle_data1(
                instrument_key=instrument_key,
                interval='day',
                to_date=to_date,
                from_date=from_date,
                api_version='2.0'
            )
            
            if not response.data or not response.data.candles:
                return pd.DataFrame()
                
            # Candles are lists: [timestamp, open, high, low, close, volume, open_interest]
            records = []
            for candle in response.data.candles:
                records.append({
                    "Date": pd.to_datetime(candle[0]).tz_localize(None),
                    "Open": candle[1],
                    "High": candle[2],
                    "Low": candle[3],
                    "Close": candle[4],
                    "Volume": candle[5]
                })
                
            df = pd.DataFrame(records)
            df.set_index("Date", inplace=True)
            df.sort_index(inplace=True)
            return df
            
        except ApiException as e:
            print(f"Exception calling Upstox HistoryApi for {ticker}: {e}")
            return pd.DataFrame()

    def fetch_bulk_market_quotes(self, tickers: List[str]) -> List[Dict[str, Any]]:
        """
        Fetches live market quotes (LTP) for a bulk list of tickers.
        """
        api_instance = upstox_client.MarketQuoteApi(self.api_client)
        instrument_keys = [self._get_instrument_key(t) for t in tickers]
        
        # Upstox supports comma separated instrument keys
        keys_str = ",".join(instrument_keys)
        
        try:
            response = api_instance.get_market_quote_ohlc(
                instrument_key=keys_str,
                api_version='2.0'
            )
            
            results = []
            if response.data:
                for key, data in response.data.items():
                    # extract the clean ticker from key (e.g. NSE_EQ|RELIANCE -> RELIANCE)
                    clean_ticker = key.split("|")[-1]
                    results.append({
                        "ticker": clean_ticker,
                        "price": data.last_price,
                        "timestamp": datetime.now()
                    })
            return results
            
        except ApiException as e:
            print(f"Exception calling Upstox MarketQuoteApi: {e}")
            return []

    def fetch_derivatives_data(self, ticker: str) -> Dict[str, Any]:
        """
        Fetches PCR and OI data if available.
        # ponytail: Upstox /market/pcr requires specific derivative keys.
        """
        return {"pcr": 1.0, "oi_change": 0.0}
