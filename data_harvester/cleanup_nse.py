import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os

def cleanup_nse():
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
    
    db_url = os.environ.get("DATABASE_URL", "postgresql://qeps_user:qeps_password@localhost:5432/qeps_db")
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)

    print("Loading Upstox instruments CSV...")
    csv_path = os.path.join(os.path.dirname(__file__), "upstox_instruments.csv.gz")
    
    df = pd.read_csv(csv_path, compression="gzip", low_memory=False)
    
    # Filter for NSE Equities
    nse_df = df[(df["exchange"] == "NSE_EQ") & (df["instrument_type"] == "EQUITY")]
    
    # Keep only actual corporate equities:
    # 1. Must start with INE
    # 2. Characters 8-9 must be '01' (Standard Equity) or '04' (DVR / Differential Voting Rights)
    # The ISIN is the part after the pipe '|' in instrument_key
    is_corporate = nse_df['instrument_key'].str.contains(r'\|INE.{4}(?:01|04)', na=False)
    
    valid_tickers = set(nse_df[is_corporate]['tradingsymbol'].tolist())
    invalid_tickers = set(nse_df[~is_corporate]['tradingsymbol'].tolist())
    
    print(f"Found {len(valid_tickers)} valid corporate equities.")
    print(f"Found {len(invalid_tickers)} invalid instruments (Bonds, ETFs, SDLs, etc).")
    
    with Session() as session:
        # Get existing in DB
        existing_result = session.execute(text("SELECT ticker FROM companies")).fetchall()
        existing = [r[0] for r in existing_result]
        
        to_delete = [t for t in existing if t in invalid_tickers or t not in valid_tickers]
        
        print(f"Deleting {len(to_delete)} unwanted non-equity instruments from the database...")
        
        if to_delete:
            # Delete in chunks
            chunk_size = 1000
            for i in range(0, len(to_delete), chunk_size):
                chunk = to_delete[i:i+chunk_size]
                session.execute(
                    text("DELETE FROM companies WHERE ticker = ANY(:tickers)"),
                    {"tickers": chunk}
                )
            session.commit()
            
        # Get final count
        final_count = session.execute(text("SELECT COUNT(*) FROM companies")).scalar()
        print(f"Cleanup complete! Your true equity universe is now exactly {final_count} stocks.")

if __name__ == "__main__":
    cleanup_nse()
