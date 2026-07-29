import sys
import json
import argparse
from typing import List
from datetime import datetime

# Setup path for internal imports
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.infrastructure.database import SessionLocal
from app.infrastructure.models import Company
from app.services.backtest_service import IntensiveBacktestEngine

def run_suite(limit: int = 20, years: int = 3, ticker_filter: str = None, export_json: str = None):
    print("=" * 80)
    print(f"🚀 ANTIMATRIX & NSE INTENSIVE STRATEGY BACKTEST SUITE ({years}-Year Horizon)")
    print(f"Net of 0.20% Round-Trip Transaction Friction (STT, Stamp Duty, Brokerage, GST)")
    print("=" * 80)

    db = SessionLocal()
    try:
        engine = IntensiveBacktestEngine(db)
        
        tickers_to_test = []
        if ticker_filter:
            tickers_to_test.append(ticker_filter.upper())
        else:
            companies = db.query(Company).limit(limit).all()
            if companies:
                tickers_to_test = [c.ticker for c in companies]
            
            if not tickers_to_test:
                # Fallback to liquid prominent Nifty 50 constituents if DB is initializing
                tickers_to_test = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "TATAMOTORS", "SBIN", "ITC", "BHARTIARTL"][:limit]

        results_summary = []
        total_trades = 0
        winning_trades_all = 0
        total_sharpe = 0.0
        total_alpha = 0.0
        valid_count = 0

        for t in tickers_to_test:
            try:
                res = engine.run_intensive_backtest(t, years=years)
                perf = res.get("momentum_performance", {})
                if perf and perf.get("total_trades", 0) > 0:
                    results_summary.append({
                        "ticker": t,
                        "trades": perf.get("total_trades", 0),
                        "win_rate_pct": perf.get("win_rate_pct", 0.0),
                        "net_ret_pct": perf.get("net_total_return_pct", 0.0),
                        "sharpe": perf.get("sharpe_ratio", 0.0),
                        "profit_factor": perf.get("profit_factor", 0.0),
                        "alpha": perf.get("alpha_vs_nifty_pct", 0.0),
                        "ml_hit_rate": perf.get("ml_hit_rate_pct", 0.0)
                    })
                    total_trades += perf.get("total_trades", 0)
                    winning_trades_all += int((perf.get("win_rate_pct", 0.0) / 100.0) * perf.get("total_trades", 0))
                    total_sharpe += perf.get("sharpe_ratio", 0.0)
                    total_alpha += perf.get("alpha_vs_nifty_pct", 0.0)
                    valid_count += 1
            except Exception as e:
                print(f"Skipping {t} due to error: {e}")

        # Print Executive Table
        print("\n" + "-" * 95)
        print(f"{'TICKER':<12} {'TRADES':<8} {'WIN RATE':<11} {'NET RETURN':<12} {'SHARPE':<9} {'PROFIT FACTOR':<15} {'NIFTY ALPHA':<12}")
        print("-" * 95)
        for r in results_summary:
            print(f"{r['ticker']:<12} {r['trades']:<8} {r['win_rate_pct']:>5.1f}%     {r['net_ret_pct']:>7.1f}%     {r['sharpe']:>5.2f}    {r['profit_factor']:>9.2f}       {r['alpha']:>8.1f}%")
        print("-" * 95)

        if valid_count > 0:
            avg_win_rate = round((winning_trades_all / total_trades) * 100.0, 2) if total_trades > 0 else 0.0
            avg_sharpe = round(total_sharpe / valid_count, 2)
            avg_alpha = round(total_alpha / valid_count, 2)
            print(f"\n📊 AGGREGATE PERFORMANCE SUMMARY across {valid_count} tested assets:")
            print(f"   • Overall Net Win Rate : {avg_win_rate}% (Net of 0.20% cost friction per trade)")
            print(f"   • Mean Sharpe Ratio    : {avg_sharpe}")
            print(f"   • Mean Nifty Alpha     : {avg_alpha}%")
        else:
            print("\n⚠️ No complete historical trades generated for the selected subset.")

        if export_json:
            export_data = {
                "timestamp": str(datetime.utcnow()),
                "horizon_years": years,
                "summary": results_summary
            }
            with open(export_json, "w") as f:
                json.dump(export_data, f, indent=2)
            print(f"\n📁 Saved detailed backtest JSON report to: {export_json}")

    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Intensive Strategy & Momentum Backtest Suite Runner")
    parser.add_argument("--limit", type=int, default=20, help="Maximum number of stocks to evaluate")
    parser.add_argument("--years", type=int, default=3, help="Historical evaluation window in years")
    parser.add_argument("--ticker", type=str, default=None, help="Evaluate a single specific ticker")
    parser.add_argument("--export-json", type=str, default=None, help="File path to save JSON summary report")
    args = parser.parse_args()

    run_suite(limit=args.limit, years=args.years, ticker_filter=args.ticker, export_json=args.export_json)
