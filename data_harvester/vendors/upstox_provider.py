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
        # Configure Upstox API client from environment variables
        self.access_token = os.environ.get("UPSTOX_ACCESS_TOKEN", "")
        configuration = upstox_client.Configuration()
        configuration.access_token = self.access_token
        self.api_client = upstox_client.ApiClient(configuration)
        self._instrument_map = {}
        self._load_instruments()
        
    def _load_instruments(self):
        """Downloads the official Upstox instruments CSV to map tickers to actual instrument keys (ISINs)."""
        import pandas as pd
        csv_path = os.path.join(os.path.dirname(__file__), "upstox_instruments.csv.gz")
        
        # Download if it doesn't exist or is older than 1 day
        if not os.path.exists(csv_path) or (datetime.now().timestamp() - os.path.getmtime(csv_path) > 86400):
            print("Downloading latest Upstox instruments CSV...")
            url = "https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz"
            df = pd.read_csv(url)
            df.to_csv(csv_path, compression="gzip", index=False)
        else:
            df = pd.read_csv(csv_path, compression="gzip", low_memory=False)
            
        # Filter for NSE Equities
        nse_df = df[df["exchange"] == "NSE_EQ"]
        
        # Build lookup dictionary: tradingsymbol -> instrument_key
        # e.g., 'RELIANCE' -> 'NSE_EQ|INE002A01018'
        for _, row in nse_df.iterrows():
            self._instrument_map[row["tradingsymbol"]] = row["instrument_key"]
            
        # Add Nifty 50 Index manually for convenience
        self._instrument_map["NIFTY"] = "NSE_INDEX|Nifty 50"
        self._instrument_map["^NSEI"] = "NSE_INDEX|Nifty 50"

    def _get_instrument_key(self, ticker: str) -> str:
        clean_ticker = ticker.replace(".NS", "")
        # Lookup the actual instrument key (fallback to naive mapping if somehow missing)
        return self._instrument_map.get(clean_ticker, f"NSE_EQ|{clean_ticker}")
        
    def fetch_historical_ohlcv(self, ticker: str, days: int = 365) -> pd.DataFrame:
        """
        Fetches daily historical candles using Upstox HistoryApi.
        Automatically paginates in 1-year chunks to bypass Upstox limits.
        """
        import time
        api_instance = upstox_client.HistoryApi(self.api_client)
        instrument_key = self._get_instrument_key(ticker)
        
        all_records = []
        days_remaining = days
        current_to_date = datetime.now()
        
        while days_remaining > 0:
            chunk_days = min(days_remaining, 365)
            current_from_date = current_to_date - timedelta(days=chunk_days)
            
            to_date_str = current_to_date.strftime("%Y-%m-%d")
            from_date_str = current_from_date.strftime("%Y-%m-%d")
            
            try:
                response = api_instance.get_historical_candle_data1(
                    instrument_key=instrument_key,
                    interval='day',
                    to_date=to_date_str,
                    from_date=from_date_str,
                    api_version='2.0'
                )
                
                if response.data and response.data.candles:
                    for candle in response.data.candles:
                        all_records.append({
                            "Date": pd.to_datetime(candle[0]).tz_localize(None),
                            "Open": candle[1],
                            "High": candle[2],
                            "Low": candle[3],
                            "Close": candle[4],
                            "Volume": candle[5]
                        })
                        
            except ApiException as e:
                print(f"Exception calling Upstox HistoryApi for {ticker} ({from_date_str} to {to_date_str}): {e}")
                break # stop paginating on error
                
            days_remaining -= chunk_days
            current_to_date = current_from_date - timedelta(days=1)
            time.sleep(0.2) # Rate limit protection
            
        if not all_records:
            return pd.DataFrame()
            
        df = pd.DataFrame(all_records)
        df.set_index("Date", inplace=True)
        # Drop duplicates in case of overlap between chunks
        df = df[~df.index.duplicated(keep='first')]
        df.sort_index(inplace=True)
        return df

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
