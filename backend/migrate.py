import psycopg2
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://qeps_user:secret@postgres:5432/qeps_db")

def upgrade_db():
    print("Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cursor = conn.cursor()

    columns_to_add = [
        ("companies", "purpose", "VARCHAR"),
        ("companies", "upcoming_date", "VARCHAR"),
        ("companies", "current_price", "FLOAT"),
        ("companies", "market_cap", "FLOAT"),
        ("companies", "q1_eps", "FLOAT"),
        ("companies", "q2_eps", "FLOAT"),
        ("companies", "q3_eps", "FLOAT"),
        ("companies", "q4_eps", "FLOAT"),
        ("companies", "q0_eps", "FLOAT"),
        ("companies", "q1_date", "VARCHAR"),
        ("companies", "q2_date", "VARCHAR"),
        ("companies", "q3_date", "VARCHAR"),
        ("companies", "q4_date", "VARCHAR"),
        ("companies", "q1_revenue", "FLOAT"),
        ("companies", "q2_revenue", "FLOAT"),
        ("companies", "q3_revenue", "FLOAT"),
        ("companies", "q4_revenue", "FLOAT"),
        ("companies", "q0_revenue", "FLOAT"),
        ("companies", "q1_profit", "FLOAT"),
        ("companies", "q2_profit", "FLOAT"),
        ("companies", "q3_profit", "FLOAT"),
        ("companies", "q4_profit", "FLOAT"),
        ("companies", "q0_profit", "FLOAT"),
        ("companies", "historical_trend", "VARCHAR"),
        ("predictions", "current_price", "FLOAT"),
        ("predictions", "historical_trend", "VARCHAR"),
        ("companies", "financial_health_score", "FLOAT"),
        ("companies", "financial_health_grade", "VARCHAR"),
        ("companies", "momentum_probability", "FLOAT"),
        ("companies", "avg_post_earnings_momentum", "FLOAT"),
    ]

    for table, column, datatype in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {datatype};")
            print(f"Added {column} to {table}")
        except psycopg2.errors.DuplicateColumn:
            print(f"Column {column} already exists in {table}, skipping.")
        except Exception as e:
            print(f"Error adding {column} to {table}: {e}")

    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS momentum_signals (
                id UUID PRIMARY KEY,
                company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                date_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fundamental_score FLOAT,
                technical_score FLOAT,
                regime_score FLOAT,
                smart_money_score FLOAT,
                derivatives_score FLOAT,
                composite_score FLOAT,
                signal VARCHAR(50),
                confidence FLOAT,
                stop_loss_price FLOAT,
                position_size_pct FLOAT,
                requires_attention BOOLEAN DEFAULT FALSE,
                attention_reasons VARCHAR(1000)
            );
        """)
        print("Ensured momentum_signals table exists.")
    except Exception as e:
        print(f"Error creating momentum_signals table: {e}")

    # Ensure Phase 2 columns exist on momentum_signals
    for col_name, col_type in [("smart_money_score", "FLOAT"), ("derivatives_score", "FLOAT")]:
        try:
            cursor.execute(f"ALTER TABLE momentum_signals ADD COLUMN {col_name} {col_type};")
            print(f"Added {col_name} to momentum_signals.")
        except psycopg2.errors.DuplicateColumn:
            conn.rollback()
            print(f"Column {col_name} already exists in momentum_signals, skipping.")
        except Exception as e:
            conn.rollback()
            print(f"Error adding {col_name} to momentum_signals: {e}")

    cursor.close()
    conn.close()
    print("Database upgrade complete.")

if __name__ == "__main__":
    upgrade_db()
