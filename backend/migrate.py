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
        ("companies", "post_release_return", "FLOAT"),
        ("companies", "enterprise_value", "FLOAT"),
        ("companies", "high_52w", "FLOAT"),
        ("companies", "low_52w", "FLOAT"),
        ("companies", "all_time_high", "FLOAT"),
        ("companies", "all_time_low", "FLOAT"),
        ("companies", "pe_ratio", "FLOAT"),
        ("companies", "pb_ratio", "FLOAT"),
        ("companies", "roe", "FLOAT"),
        ("companies", "roce", "FLOAT"),
        ("companies", "dividend_yield", "FLOAT"),
        ("companies", "book_value", "FLOAT"),
        ("companies", "debt_to_equity", "FLOAT"),
        ("companies", "promoter_holding", "FLOAT"),
        ("companies", "fii_holding", "FLOAT"),
        ("companies", "dii_holding", "FLOAT"),
        ("companies", "public_holding", "FLOAT"),
        ("companies", "known_at", "TIMESTAMP"),
        ("companies", "period_end", "TIMESTAMP"),
        ("earnings_reports", "known_at", "TIMESTAMP"),
        ("earnings_reports", "period_end", "TIMESTAMP"),
        ("momentum_signals", "known_at", "TIMESTAMP"),
        ("momentum_signals", "period_end", "TIMESTAMP"),
        ("daily_bhavcopy", "known_at", "TIMESTAMP"),
        ("bulk_block_deals", "known_at", "TIMESTAMP"),
        ("surveillance_watchlist", "known_at", "TIMESTAMP"),
        ("score_prediction_logs", "known_at", "TIMESTAMP"),
        ("event_studies", "ar_1d", "FLOAT"),
        ("event_studies", "ar_5d", "FLOAT"),
        ("event_studies", "ar_10d", "FLOAT"),
        ("event_studies", "ar_30d", "FLOAT"),
        ("event_studies", "car_30d", "FLOAT"),
        ("event_studies", "car_pvalue", "FLOAT"),
        ("event_studies", "max_gain", "FLOAT"),
        ("event_studies", "max_drawdown", "FLOAT"),
        ("research_hypotheses", "normalized_expression", "VARCHAR(500)"),
    ]

    for table, column, datatype in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {datatype};")
            print(f"Checked/Added {column} on {table}")
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
            cursor.execute(f"ALTER TABLE momentum_signals ADD COLUMN IF NOT EXISTS {col_name} {col_type};")
            print(f"Checked/Added {col_name} on momentum_signals.")
        except psycopg2.errors.DuplicateColumn:
            conn.rollback()
            print(f"Column {col_name} already exists in momentum_signals, skipping.")
        except Exception as e:
            conn.rollback()
            print(f"Error adding {col_name} to momentum_signals: {e}")

    try:
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_bhavcopy_ticker_date
            ON daily_bhavcopy (ticker, trade_date);
        """)
        print("Ensured unique index on daily_bhavcopy.")
    except Exception as e:
        conn.rollback()
        print(f"Error creating index on daily_bhavcopy: {e}")

    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS research_hypotheses (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                author VARCHAR(100) DEFAULT 'AI_RESEARCH_AGENT',
                economic_mechanism VARCHAR(100) NOT NULL,
                economic_rationale_text TEXT NOT NULL,
                alpha_expression VARCHAR(500) NOT NULL,
                normalized_expression VARCHAR(500) UNIQUE,
                target_universe VARCHAR(100) DEFAULT 'NIFTY500',
                holding_horizon_days INTEGER DEFAULT 5,
                current_stage VARCHAR(50) DEFAULT 'DRAFT_HYPOTHESIS',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                decommissioned_at TIMESTAMP,
                decommission_reason VARCHAR(255),
                known_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        print("Ensured research_hypotheses table exists.")
    except Exception as e:
        conn.rollback()
        print(f"Error creating research_hypotheses table: {e}")

    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hypothesis_experiments (
                id UUID PRIMARY KEY,
                hypothesis_id UUID NOT NULL REFERENCES research_hypotheses(id) ON DELETE CASCADE,
                execution_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                test_window_start TIMESTAMP,
                test_window_end TIMESTAMP,
                total_trials_in_family INTEGER DEFAULT 1,
                classic_sharpe FLOAT,
                deflated_sharpe FLOAT,
                spearman_ic_mean FLOAT,
                spearman_ic_tstat FLOAT,
                max_drawdown_pct FLOAT,
                turnover_decay_penalty FLOAT,
                is_statistically_valid BOOLEAN DEFAULT FALSE,
                failure_mode_tag VARCHAR(100),
                known_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        print("Ensured hypothesis_experiments table exists.")
    except Exception as e:
        conn.rollback()
        print(f"Error creating hypothesis_experiments table: {e}")

    cursor.close()
    conn.close()
    print("Database upgrade complete.")

if __name__ == "__main__":
    upgrade_db()
