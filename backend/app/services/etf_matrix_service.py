import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import yfinance as yf
import pandas as pd
from sqlalchemy.orm import Session
from app.infrastructure.models import (
    ETFItem, ETFPosition, ETFTrade, ETFDailyScan, ETFConfig
)

logger = logging.getLogger(__name__)

# Standard liquid Indian ETF basket for ETF Matrix
DEFAULT_ETF_UNIVERSE = [
    {"symbol": "NIFTYBEES", "name": "Nippon India ETF Nifty 50 BeES", "category": "Broad Market", "underlying": "Nifty 50"},
    {"symbol": "BANKBEES", "name": "Nippon India ETF Nifty Bank BeES", "category": "Sectoral", "underlying": "Nifty Bank"},
    {"symbol": "JUNIORBEES", "name": "Nippon India ETF Nifty Next 50", "category": "Broad Market", "underlying": "Nifty Next 50"},
    {"symbol": "MID150BEES", "name": "Nippon India ETF Nifty Midcap 150", "category": "Broad Market", "underlying": "Nifty Midcap 150"},
    {"symbol": "GOLDBEES", "name": "Nippon India ETF Gold BeES", "category": "Commodity", "underlying": "Gold"},
    {"symbol": "SILVERBEES", "name": "Nippon India ETF Silver BeES", "category": "Commodity", "underlying": "Silver"},
    {"symbol": "ITBEES", "name": "Nippon India ETF Nifty IT", "category": "Sectoral", "underlying": "Nifty IT"},
    {"symbol": "PHARMABEES", "name": "Nippon India ETF Nifty Pharma", "category": "Sectoral", "underlying": "Nifty Pharma"},
    {"symbol": "AUTOBEES", "name": "Nippon India ETF Nifty Auto", "category": "Sectoral", "underlying": "Nifty Auto"},
    {"symbol": "CPSEETF", "name": "CPSE ETF (PSU Index)", "category": "Sectoral", "underlying": "CPSE Index"},
    {"symbol": "MON100", "name": "Motilal Oswal Nasdaq 100 ETF", "category": "Global", "underlying": "Nasdaq 100"},
    {"symbol": "CONSUMBEES", "name": "Nippon India ETF Nifty Consumption", "category": "Sectoral", "underlying": "Nifty India Consumption"},
    {"symbol": "INFRAIETF", "name": "ICICI Prudential Nifty Infrastructure ETF", "category": "Sectoral", "underlying": "Nifty Infrastructure"},
    {"symbol": "PSUBNKBEES", "name": "Nippon India ETF Nifty PSU Bank", "category": "Sectoral", "underlying": "Nifty PSU Bank"},
]

DEFAULT_CONFIGS = {
    "slot_capital": "25000",          # Rs. 25,000 per slot
    "target_profit_pct": "6.0",       # 6.0% profit target
    "averaging_dip_pct": "2.5",       # 2.5% dip required to average down
    "max_slots_per_etf": "5",         # Max 5 slots in any single ETF
    "execution_mode": "PAPER",        # PAPER or LIVE
    "total_capital": "500000",        # Rs. 5,00,000 portfolio total
}


class ETFMatrixService:
    def __init__(self, db: Session):
        self.db = db

    def seed_universe_if_empty(self):
        """Ensure the core Indian ETF universe is seeded."""
        count = self.db.query(ETFItem).count()
        if count == 0:
            for item in DEFAULT_ETF_UNIVERSE:
                etf = ETFItem(
                    symbol=item["symbol"],
                    name=item["name"],
                    category=item["category"],
                    underlying_index=item.get("underlying"),
                    current_price=100.0,
                    prev_close=100.0,
                    day_change_pct=0.0,
                    is_active=True
                )
                self.db.add(etf)
            self.db.commit()
            logger.info("Seeded default ETF universe.")

        # Seed configs
        for k, v in DEFAULT_CONFIGS.items():
            cfg = self.db.query(ETFConfig).filter(ETFConfig.key == k).first()
            if not cfg:
                self.db.add(ETFConfig(key=k, value=v))
        self.db.commit()

    def get_config(self, key: str, default: Any = None) -> str:
        cfg = self.db.query(ETFConfig).filter(ETFConfig.key == key).first()
        return cfg.value if cfg else str(default)

    def set_config(self, key: str, value: Any):
        cfg = self.db.query(ETFConfig).filter(ETFConfig.key == key).first()
        if cfg:
            cfg.value = str(value)
        else:
            self.db.add(ETFConfig(key=key, value=str(value)))
        self.db.commit()

    def fetch_live_quotes(self) -> List[Dict[str, Any]]:
        """Fetch latest quotes from Yahoo Finance (.NS) for all active ETFs."""
        self.seed_universe_if_empty()
        etfs = self.db.query(ETFItem).filter(ETFItem.is_active == True).all()
        results = []

        tickers_ns = [f"{etf.symbol}.NS" for etf in etfs]
        try:
            data = yf.download(tickers_ns, period="5d", interval="1d", group_by="ticker", auto_adjust=True, threads=True, progress=False)
            for etf in etfs:
                sym_ns = f"{etf.symbol}.NS"
                try:
                    if sym_ns in data.columns.levels[0]:
                        df = data[sym_ns].dropna()
                        if len(df) >= 2:
                            current_price = float(df['Close'].iloc[-1])
                            prev_close = float(df['Close'].iloc[-2])
                            day_change_pct = ((current_price - prev_close) / prev_close) * 100.0
                            etf.current_price = round(current_price, 2)
                            etf.prev_close = round(prev_close, 2)
                            etf.day_change_pct = round(day_change_pct, 2)
                            etf.updated_at = datetime.utcnow()
                        elif len(df) == 1:
                            current_price = float(df['Close'].iloc[-1])
                            etf.current_price = round(current_price, 2)
                except Exception as e:
                    logger.warning(f"Failed parsing yfinance quote for {etf.symbol}: {e}")
                
                results.append({
                    "symbol": etf.symbol,
                    "name": etf.name,
                    "category": etf.category,
                    "current_price": etf.current_price,
                    "prev_close": etf.prev_close,
                    "day_change_pct": etf.day_change_pct
                })
            self.db.commit()
        except Exception as e:
            logger.error(f"Error fetching batch live quotes: {e}")
            for etf in etfs:
                results.append({
                    "symbol": etf.symbol,
                    "name": etf.name,
                    "category": etf.category,
                    "current_price": etf.current_price,
                    "prev_close": etf.prev_close,
                    "day_change_pct": etf.day_change_pct
                })

        self._sync_position_prices()
        return results

    def _sync_position_prices(self):
        """Update current value, PnL and target prices for all open positions."""
        open_positions = self.db.query(ETFPosition).filter(ETFPosition.status == "OPEN").all()
        for pos in open_positions:
            etf = self.db.query(ETFItem).filter(ETFItem.symbol == pos.symbol).first()
            if etf and etf.current_price > 0:
                pos.current_price = etf.current_price
                pos.current_value = round(pos.total_quantity * pos.current_price, 2)
                pos.unrealized_pnl = round(pos.current_value - pos.invested_amount, 2)
                if pos.average_price > 0:
                    pos.unrealized_pnl_pct = round(((pos.current_price - pos.average_price) / pos.average_price) * 100.0, 2)
                    pos.target_exit_price = round(pos.average_price * (1.0 + (pos.target_profit_pct / 100.0)), 2)
                pos.updated_at = datetime.utcnow()
        self.db.commit()

    def evaluate_exit_signals(self) -> List[Dict[str, Any]]:
        """Check all open positions against their target profit percentage."""
        self._sync_position_prices()
        open_positions = self.db.query(ETFPosition).filter(ETFPosition.status == "OPEN").all()
        exit_signals = []

        for pos in open_positions:
            if pos.unrealized_pnl_pct >= pos.target_profit_pct:
                exit_signals.append({
                    "position_id": str(pos.id),
                    "symbol": pos.symbol,
                    "name": pos.name,
                    "quantity": pos.total_quantity,
                    "average_price": pos.average_price,
                    "current_price": pos.current_price,
                    "target_profit_pct": pos.target_profit_pct,
                    "current_pnl_pct": pos.unrealized_pnl_pct,
                    "unrealized_pnl": pos.unrealized_pnl,
                    "action": "SELL",
                    "reason": "PROFIT_BOOKING"
                })
        return exit_signals

    def evaluate_entry_signals(self) -> Dict[str, Any]:
        """
        Rank all active ETFs by daily % change (lowest first = biggest dip).
        Select top candidate:
        1. If not in portfolio -> Fresh Buy.
        2. If in portfolio -> Check if down by >= averaging_dip_pct from last_buy_price.
           If yes -> Dip Average Buy.
           If no -> Evaluate next biggest falling ETF.
        """
        self._sync_position_prices()
        averaging_dip_pct = float(self.get_config("averaging_dip_pct", 2.5))
        max_slots = int(self.get_config("max_slots_per_etf", 5))

        etfs = self.db.query(ETFItem).filter(ETFItem.is_active == True).order_by(ETFItem.day_change_pct.asc()).all()
        open_positions = {p.symbol: p for p in self.db.query(ETFPosition).filter(ETFPosition.status == "OPEN").all()}

        ranked_candidates = []
        chosen_candidate = None

        for etf in etfs:
            is_held = etf.symbol in open_positions
            candidate_info = {
                "symbol": etf.symbol,
                "name": etf.name,
                "category": etf.category,
                "current_price": etf.current_price,
                "day_change_pct": etf.day_change_pct,
                "is_held": is_held,
                "qualifies": False,
                "action_type": None,
                "reason": ""
            }

            if not is_held:
                candidate_info["qualifies"] = True
                candidate_info["action_type"] = "FRESH_BUY"
                candidate_info["reason"] = f"Top falling ETF ({etf.day_change_pct:+.2f}%) not currently in portfolio."
            else:
                pos = open_positions[etf.symbol]
                if pos.slot_count >= max_slots:
                    candidate_info["qualifies"] = False
                    candidate_info["reason"] = f"Max slot limit reached ({pos.slot_count}/{max_slots})."
                else:
                    if pos.last_buy_price > 0:
                        dip_from_last = ((etf.current_price - pos.last_buy_price) / pos.last_buy_price) * 100.0
                    else:
                        dip_from_last = ((etf.current_price - pos.average_price) / pos.average_price) * 100.0

                    candidate_info["dip_from_last_buy_pct"] = round(dip_from_last, 2)

                    if dip_from_last <= -averaging_dip_pct:
                        candidate_info["qualifies"] = True
                        candidate_info["action_type"] = "DIP_AVERAGING"
                        candidate_info["reason"] = f"Fallen by {abs(dip_from_last):.2f}% since last buy (threshold: {averaging_dip_pct}%)."
                    else:
                        candidate_info["qualifies"] = False
                        candidate_info["reason"] = f"Held but dip ({dip_from_last:+.2f}%) is less than required {averaging_dip_pct}%."

            ranked_candidates.append(candidate_info)
            if candidate_info["qualifies"] and chosen_candidate is None:
                chosen_candidate = candidate_info

        return {
            "chosen_candidate": chosen_candidate,
            "ranked_universe": ranked_candidates,
            "averaging_dip_pct": averaging_dip_pct
        }

    def execute_buy(self, symbol: str, reason: str = "FRESH_BUY", custom_quantity: Optional[int] = None) -> ETFTrade:
        """Execute a buy order (paper or live), updating position and logging trade."""
        etf = self.db.query(ETFItem).filter(ETFItem.symbol == symbol).first()
        if not etf or etf.current_price <= 0:
            raise ValueError(f"Invalid ETF or price for {symbol}")

        slot_capital = float(self.get_config("slot_capital", 25000))
        target_profit_pct = float(self.get_config("target_profit_pct", 6.0))

        if custom_quantity and custom_quantity > 0:
            quantity = custom_quantity
        else:
            quantity = max(1, int(slot_capital // etf.current_price))

        total_amount = round(quantity * etf.current_price, 2)

        pos = self.db.query(ETFPosition).filter(
            ETFPosition.symbol == symbol,
            ETFPosition.status == "OPEN"
        ).first()

        if pos:
            new_qty = pos.total_quantity + quantity
            new_invested = round(pos.invested_amount + total_amount, 2)
            pos.total_quantity = new_qty
            pos.invested_amount = new_invested
            pos.average_price = round(new_invested / new_qty, 2)
            pos.current_price = etf.current_price
            pos.current_value = round(new_qty * etf.current_price, 2)
            pos.last_buy_price = etf.current_price
            pos.slot_count += 1
            pos.last_bought_at = datetime.utcnow()
            pos.unrealized_pnl = round(pos.current_value - pos.invested_amount, 2)
            pos.unrealized_pnl_pct = round(((pos.current_price - pos.average_price) / pos.average_price) * 100.0, 2)
            pos.target_exit_price = round(pos.average_price * (1.0 + (pos.target_profit_pct / 100.0)), 2)
            actual_reason = "DIP_AVERAGING"
        else:
            pos = ETFPosition(
                symbol=symbol,
                name=etf.name,
                category=etf.category,
                total_quantity=quantity,
                average_price=etf.current_price,
                current_price=etf.current_price,
                invested_amount=total_amount,
                current_value=total_amount,
                unrealized_pnl=0.0,
                unrealized_pnl_pct=0.0,
                target_profit_pct=target_profit_pct,
                target_exit_price=round(etf.current_price * (1.0 + (target_profit_pct / 100.0)), 2),
                last_buy_price=etf.current_price,
                slot_count=1,
                status="OPEN",
                first_bought_at=datetime.utcnow(),
                last_bought_at=datetime.utcnow()
            )
            self.db.add(pos)
            actual_reason = "FRESH_BUY"

        trade = ETFTrade(
            symbol=symbol,
            action="BUY",
            quantity=quantity,
            price=etf.current_price,
            total_amount=total_amount,
            reason=actual_reason,
            realized_pnl=0.0,
            executed_at=datetime.utcnow(),
            notes=f"Executed {actual_reason} of {quantity} units @ ₹{etf.current_price}"
        )
        self.db.add(trade)
        self.db.commit()
        self.db.refresh(trade)
        return trade

    def execute_sell(self, symbol: str, reason: str = "PROFIT_BOOKING") -> ETFTrade:
        """Sell entire open position for the symbol at current market price."""
        pos = self.db.query(ETFPosition).filter(
            ETFPosition.symbol == symbol,
            ETFPosition.status == "OPEN"
        ).first()
        if not pos:
            raise ValueError(f"No open position found for {symbol}")

        etf = self.db.query(ETFItem).filter(ETFItem.symbol == symbol).first()
        sell_price = etf.current_price if (etf and etf.current_price > 0) else pos.current_price
        total_revenue = round(pos.total_quantity * sell_price, 2)
        realized_pnl = round(total_revenue - pos.invested_amount, 2)

        pos.status = "CLOSED"
        pos.current_price = sell_price
        pos.current_value = 0.0
        pos.closed_at = datetime.utcnow()
        pos.unrealized_pnl = 0.0
        pos.unrealized_pnl_pct = 0.0

        trade = ETFTrade(
            symbol=symbol,
            action="SELL",
            quantity=pos.total_quantity,
            price=sell_price,
            total_amount=total_revenue,
            reason=reason,
            realized_pnl=realized_pnl,
            executed_at=datetime.utcnow(),
            notes=f"Closed position of {pos.total_quantity} units @ ₹{sell_price} (Realized PnL: ₹{realized_pnl:+.2f})"
        )
        self.db.add(trade)
        self.db.commit()
        self.db.refresh(trade)
        return trade

    def run_daily_cycle(self, auto_execute: bool = False) -> Dict[str, Any]:
        """Execute full ETF Matrix workflow."""
        quotes = self.fetch_live_quotes()
        exit_signals = self.evaluate_exit_signals()
        executed_exits = []

        if auto_execute:
            for exit_sig in exit_signals:
                try:
                    t = self.execute_sell(exit_sig["symbol"], reason="PROFIT_BOOKING")
                    executed_exits.append(exit_sig["symbol"])
                except Exception as e:
                    logger.error(f"Failed executing auto exit for {exit_sig['symbol']}: {e}")

        entry_eval = self.evaluate_entry_signals()
        chosen = entry_eval["chosen_candidate"]
        executed_entry = None

        if auto_execute and chosen and chosen.get("qualifies"):
            try:
                trade = self.execute_buy(chosen["symbol"], reason=chosen["action_type"])
                executed_entry = {
                    "symbol": chosen["symbol"],
                    "action": "BUY",
                    "quantity": trade.quantity,
                    "price": trade.price,
                    "total_amount": trade.total_amount
                }
            except Exception as e:
                logger.error(f"Failed executing auto buy for {chosen['symbol']}: {e}")

        scan_log = ETFDailyScan(
            scanned_at=datetime.utcnow(),
            top_dip_symbol=chosen["symbol"] if chosen else None,
            top_dip_pct=chosen["day_change_pct"] if chosen else None,
            action_recommended=chosen["action_type"] if (chosen and chosen.get("qualifies")) else "WAIT",
            action_executed=bool(executed_entry or executed_exits),
            details=json.dumps({
                "chosen": chosen,
                "exit_signals": exit_signals,
                "executed_exits": executed_exits,
                "executed_entry": executed_entry,
                "top_5_dips": entry_eval["ranked_universe"][:5]
            })
        )
        self.db.add(scan_log)
        self.db.commit()

        return {
            "scanned_at": scan_log.scanned_at.isoformat(),
            "chosen_candidate": chosen,
            "exit_signals": exit_signals,
            "executed_exits": executed_exits,
            "executed_entry": executed_entry,
            "ranked_universe": entry_eval["ranked_universe"]
        }

    def get_portfolio_summary(self) -> Dict[str, Any]:
        """Generate high-level summary metrics for the ETF Matrix dashboard."""
        self.seed_universe_if_empty()
        open_positions = self.db.query(ETFPosition).filter(ETFPosition.status == "OPEN").all()
        trades = self.db.query(ETFTrade).all()

        total_invested = round(sum(p.invested_amount for p in open_positions), 2)
        current_value = round(sum(p.current_value for p in open_positions), 2)
        unrealized_pnl = round(sum(p.unrealized_pnl for p in open_positions), 2)
        unrealized_pnl_pct = round((unrealized_pnl / total_invested * 100.0), 2) if total_invested > 0 else 0.0

        realized_pnl = round(sum(t.realized_pnl for t in trades if t.action == "SELL"), 2)
        winning_trades = [t for t in trades if t.action == "SELL" and t.realized_pnl > 0]
        total_sells = [t for t in trades if t.action == "SELL"]
        win_rate = round((len(winning_trades) / len(total_sells) * 100.0), 1) if total_sells else 100.0

        total_capital = float(self.get_config("total_capital", 500000))
        slot_capital = float(self.get_config("slot_capital", 25000))
        total_slots = int(total_capital // slot_capital)
        used_slots = sum(p.slot_count for p in open_positions)
        available_slots = max(0, total_slots - used_slots)
        available_cash = max(0.0, round(total_capital - total_invested, 2))

        latest_scan = self.db.query(ETFDailyScan).order_by(ETFDailyScan.scanned_at.desc()).first()

        return {
            "total_capital": total_capital,
            "slot_capital": slot_capital,
            "total_slots": total_slots,
            "used_slots": used_slots,
            "available_slots": available_slots,
            "available_cash": available_cash,
            "total_invested": total_invested,
            "current_value": current_value,
            "unrealized_pnl": unrealized_pnl,
            "unrealized_pnl_pct": unrealized_pnl_pct,
            "realized_pnl": realized_pnl,
            "win_rate": win_rate,
            "active_positions_count": len(open_positions),
            "total_trades_count": len(trades),
            "last_scan_time": latest_scan.scanned_at.isoformat() if latest_scan else None,
            "latest_recommendation": latest_scan.action_recommended if latest_scan else "PENDING_SCAN",
            "top_dip_symbol": latest_scan.top_dip_symbol if latest_scan else None,
            "top_dip_pct": latest_scan.top_dip_pct if latest_scan else None,
        }

    def backtest_strategy(
        self,
        lookback_years: int = 2,
        slot_capital: float = 25000.0,
        profit_target_pct: float = 6.0,
        averaging_dip_pct: float = 2.5,
        max_slots_per_etf: int = 5
    ) -> Dict[str, Any]:
        """Historical event-driven backtest of ETF Matrix on standard Indian ETFs."""
        symbols = ["NIFTYBEES.NS", "BANKBEES.NS", "GOLDBEES.NS", "SILVERBEES.NS", "ITBEES.NS", "JUNIORBEES.NS", "CPSEETF.NS"]
        start_date = (datetime.utcnow() - timedelta(days=lookback_years * 365)).strftime("%Y-%m-%d")

        try:
            raw_data = yf.download(symbols, start=start_date, auto_adjust=True, group_by="ticker", threads=True, progress=False)
        except Exception as e:
            return {"error": f"Failed downloading historical backtest data: {e}"}

        daily_close = pd.DataFrame()
        daily_returns = pd.DataFrame()

        for sym in symbols:
            clean_sym = sym.replace(".NS", "")
            if sym in raw_data.columns.levels[0]:
                df = raw_data[sym].dropna()
                if not df.empty and 'Close' in df:
                    daily_close[clean_sym] = df['Close']
                    daily_returns[clean_sym] = df['Close'].pct_change() * 100.0

        daily_close = daily_close.dropna(how='all').ffill()
        daily_returns = daily_returns.dropna(how='all')

        dates = daily_close.index
        cash = 500000.0
        initial_capital = cash
        positions: Dict[str, Dict[str, Any]] = {}
        trade_log = []
        equity_curve = []

        for date in dates:
            if date not in daily_returns.index:
                continue

            closed_symbols = []
            for sym, pos in list(positions.items()):
                if sym not in daily_close.columns:
                    continue
                curr_price = daily_close.loc[date, sym]
                if pd.isna(curr_price) or curr_price <= 0:
                    continue
                gain_pct = ((curr_price - pos['avg_price']) / pos['avg_price']) * 100.0
                if gain_pct >= profit_target_pct:
                    proceeds = pos['qty'] * curr_price
                    pnl = proceeds - pos['invested']
                    cash += proceeds
                    trade_log.append({
                        "date": date.strftime("%Y-%m-%d"),
                        "symbol": sym,
                        "action": "SELL",
                        "price": round(curr_price, 2),
                        "qty": pos['qty'],
                        "pnl": round(pnl, 2),
                        "pnl_pct": round(gain_pct, 2)
                    })
                    closed_symbols.append(sym)
            for sym in closed_symbols:
                del positions[sym]

            day_ret = daily_returns.loc[date].dropna().sort_values()
            for candidate_sym, ret in day_ret.items():
                if candidate_sym not in daily_close.columns:
                    continue
                curr_price = daily_close.loc[date, candidate_sym]
                if pd.isna(curr_price) or curr_price <= 0:
                    continue

                if candidate_sym not in positions:
                    if cash >= slot_capital:
                        qty = int(slot_capital // curr_price)
                        if qty > 0:
                            cost = qty * curr_price
                            cash -= cost
                            positions[candidate_sym] = {
                                "qty": qty,
                                "invested": cost,
                                "avg_price": curr_price,
                                "last_buy_price": curr_price,
                                "slots": 1
                            }
                            trade_log.append({
                                "date": date.strftime("%Y-%m-%d"),
                                "symbol": candidate_sym,
                                "action": "BUY",
                                "price": round(curr_price, 2),
                                "qty": qty,
                                "reason": "FRESH_BUY"
                            })
                    break
                else:
                    pos = positions[candidate_sym]
                    if pos['slots'] < max_slots_per_etf:
                        dip_from_last = ((curr_price - pos['last_buy_price']) / pos['last_buy_price']) * 100.0
                        if dip_from_last <= -averaging_dip_pct and cash >= slot_capital:
                            qty = int(slot_capital // curr_price)
                            if qty > 0:
                                cost = qty * curr_price
                                cash -= cost
                                new_qty = pos['qty'] + qty
                                new_invested = pos['invested'] + cost
                                pos['qty'] = new_qty
                                pos['invested'] = new_invested
                                pos['avg_price'] = new_invested / new_qty
                                pos['last_buy_price'] = curr_price
                                pos['slots'] += 1
                                trade_log.append({
                                    "date": date.strftime("%Y-%m-%d"),
                                    "symbol": candidate_sym,
                                    "action": "BUY",
                                    "price": round(curr_price, 2),
                                    "qty": qty,
                                    "reason": "DIP_AVERAGING"
                                })
                            break

            pos_val = sum(pos['qty'] * daily_close.loc[date, sym] for sym, pos in positions.items() if sym in daily_close.columns and not pd.isna(daily_close.loc[date, sym]))
            total_equity = cash + pos_val
            equity_curve.append({
                "date": date.strftime("%Y-%m-%d"),
                "equity": round(total_equity, 2),
                "cash": round(cash, 2),
                "invested": round(pos_val, 2)
            })

        final_equity = equity_curve[-1]["equity"] if equity_curve else initial_capital
        total_return_pct = round(((final_equity - initial_capital) / initial_capital) * 100.0, 2)
        cagr = round(((final_equity / initial_capital) ** (1.0 / max(lookback_years, 1)) - 1.0) * 100.0, 2)

        peak = initial_capital
        max_dd = 0.0
        for pt in equity_curve:
            if pt["equity"] > peak:
                peak = pt["equity"]
            dd = (peak - pt["equity"]) / peak * 100.0
            if dd > max_dd:
                max_dd = dd

        sell_trades = [t for t in trade_log if t["action"] == "SELL"]
        win_trades = [t for t in sell_trades if t.get("pnl", 0) > 0]
        win_rate = round((len(win_trades) / len(sell_trades) * 100.0), 1) if sell_trades else 100.0
        total_profit = round(sum(t.get("pnl", 0) for t in sell_trades), 2)

        return {
            "initial_capital": initial_capital,
            "final_equity": final_equity,
            "total_return_pct": total_return_pct,
            "cagr": cagr,
            "max_drawdown_pct": round(max_dd, 2),
            "total_trades": len(trade_log),
            "total_closed_positions": len(sell_trades),
            "win_rate": win_rate,
            "total_realized_profit": total_profit,
            "equity_curve": equity_curve[::2],
            "trade_samples": trade_log[-25:]
        }
