import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
import uuid

def seed_nse():
    # Load environment variables if needed (assuming .env is already loaded or DATABASE_URL is set)
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
    
    db_url = os.environ.get("DATABASE_URL", "postgresql://qeps_user:qeps_password@localhost:5432/qeps_db")
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)

    print("Loading Upstox instruments CSV...")
    csv_path = os.path.join(os.path.dirname(__file__), "upstox_instruments.csv.gz")
    
    if not os.path.exists(csv_path):
        print("Downloading latest Upstox instruments CSV...")
        url = "https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz"
        df = pd.read_csv(url)
        df.to_csv(csv_path, compression="gzip", index=False)
    else:
        df = pd.read_csv(csv_path, compression="gzip", low_memory=False)
        
    # Filter for NSE Equities
    nse_df = df[(df["exchange"] == "NSE_EQ") & (df["instrument_type"] == "EQUITY")]
    
    print(f"Found {len(nse_df)} NSE Equities in Upstox data. Inserting into database...")
    
    with Session() as session:
        # Get existing tickers to avoid duplicates
        existing_result = session.execute(text("SELECT ticker FROM companies")).fetchall()
        existing = set(r[0] for r in existing_result)
        
        count = 0
        for _, row in nse_df.iterrows():
            ticker = row["tradingsymbol"]
            name = row["name"]
            
            if pd.isna(name):
                name = ticker
                
            if ticker not in existing:
                session.execute(
                    text("INSERT INTO companies (id, ticker, name, sector) VALUES (:id, :ticker, :name, :sector)"),
                    {"id": str(uuid.uuid4()), "ticker": ticker, "name": name, "sector": "NSE"}
                )
                existing.add(ticker)
                count += 1
                
        session.commit()
        print(f"Successfully inserted {count} new companies! Your total universe is now {len(existing) + count} stocks.")

if __name__ == "__main__":
    seed_nse()
