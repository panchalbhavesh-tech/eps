"""
Momentum trade alerts
=====================
Turns the momentum scan into a trade lifecycle on Discord instead of general per-stock alerts:

  BUY      model says BUY *and* a stock-specific trigger fired (breakout, volume spike, golden cross, top-tier
           momentum). Sent once per setup with entry, stop (2 x ATR, as the scan computes), Target 1 (1.5R) and
           Target 2 (3R). Recorded as an open trade.
  TARGET 1 price reached T1: book partial profit; the stop moves up to the entry so the rest can't lose.
  EXIT     only for trades we alerted: Target 2 reached, stop hit on a closing basis, the model flipped to EXIT,
           or no progress within 20 sessions.

Plus one daily "keep an eye" watchlist message, and one message when the portfolio kill switch changes state.
"""
import re
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

T1_R, T2_R = 1.5, 3.0
TIME_STOP_SESSIONS = 20
REALERT_DAYS = 10
KILL_STATE_KEY = "momentum:kill_switch_state"
_EMOJI = re.compile(r"[\U0001F000-\U0001FAFF☀-➿⬀-⯿️‍]+")


def clean(text: str) -> str:
    """Strip decorative emojis from trigger texts."""
    return re.sub(r"\s+", " ", _EMOJI.sub("", text or "")).strip(" -|")


def plan_levels(entry: float, stop: float) -> Dict[str, float]:
    risk = max(entry - stop, entry * 0.01)
    return {"stop": round(entry - risk, 2), "t1": round(entry + T1_R * risk, 2), "t2": round(entry + T2_R * risk, 2)}


def _pct(a: float, b: float) -> float:
    return (a / b - 1) * 100 if b else 0.0


def _send(embed: Dict[str, Any]) -> bool:
    try:
        from app.services.notifier import DiscordNotifier
        return DiscordNotifier().send_embed(embed)
    except Exception as e:
        logger.error(f"Momentum Discord alert failed: {e}")
        return False


def can_alert_buy(db, ticker: str) -> bool:
    from app.infrastructure.models import MomentumTradeAlert as T
    if db.query(T).filter(T.ticker == ticker, T.status == "OPEN").first():
        return False
    recent = db.query(T).filter(T.ticker == ticker, T.opened_at >= datetime.utcnow() - timedelta(days=REALERT_DAYS)).first()
    return recent is None


def open_trade(db, comp, price: float, stop: float, triggers: List[str], score: float, prob5: float, regime: str) -> Optional[Any]:
    from app.infrastructure.models import MomentumTradeAlert as T
    lv = plan_levels(price, stop)
    trig = [clean(t) for t in triggers if clean(t)]
    trade = T(company_id=comp.id, ticker=comp.ticker, entry_price=round(price, 2), initial_stop=lv["stop"], stop_price=lv["stop"],
              target1=lv["t1"], target2=lv["t2"], max_price=price, composite_score=score, prob_gain_5d=prob5, triggers=" · ".join(trig))
    db.add(trade)
    db.commit()
    _send({
        "title": f"BUY · {comp.ticker} · ₹{price:,.2f}",
        "description": "\n".join([
            " · ".join(trig) or "Momentum setup",
            f"Model: {round(prob5 * 100)}% chance of a gain in 5 days · score {score:.0f}/100 · market {regime}",
            f"Plan: stop ₹{lv['stop']:,.2f} ({_pct(lv['stop'], price):+.1f}%) · T1 ₹{lv['t1']:,.2f} ({_pct(lv['t1'], price):+.1f}%) · "
            f"T2 ₹{lv['t2']:,.2f} ({_pct(lv['t2'], price):+.1f}%) · review in {TIME_STOP_SESSIONS} sessions",
        ]),
        "color": 0x20C997,
        "footer": {"text": (comp.name or comp.ticker)[:80]},
    })
    return trade


def close_trade(db, trade, price: float, reason: str) -> None:
    trade.status = "CLOSED"
    trade.closed_at = datetime.utcnow()
    trade.exit_price = round(price, 2)
    trade.exit_reason = reason
    trade.return_pct = round(_pct(price, trade.entry_price), 2)
    db.commit()
    held = int(np.busday_count(trade.opened_at.date(), datetime.utcnow().date()))
    _send({
        "title": f"EXIT · {trade.ticker} · ₹{price:,.2f} · {trade.return_pct:+.1f}%",
        "description": f"{reason}\nBought {trade.opened_at:%d %b} at ₹{trade.entry_price:,.2f} · held {held} sessions",
        "color": 0x20C997 if trade.return_pct >= 0 else 0xF05A67,
    })


def on_scan_signal(db, comp, signal: str, price: float) -> None:
    """Called by the momentum scan for every stock: close open trades whose momentum broke."""
    from app.infrastructure.models import MomentumTradeAlert as T
    if signal != "EXIT":
        return
    trade = db.query(T).filter(T.ticker == comp.ticker, T.status == "OPEN").first()
    if trade:
        close_trade(db, trade, price, "Momentum broke: the model flipped to EXIT")


def evaluate_trade(trade, price: float, is_close: bool, sessions_held: int) -> Optional[str]:
    """Pure decision for one open trade. Returns an action: T1, T2, STOP, TIME or None."""
    if price >= trade.target2:
        return "T2"
    if trade.t1_hit_at is None and price >= trade.target1:
        return "T1"
    if is_close and price <= trade.stop_price:
        return "STOP"
    if is_close and trade.t1_hit_at is None and sessions_held >= TIME_STOP_SESSIONS:
        return "TIME"
    return None


def monitor_open_trades(db, now_ist: Optional[datetime] = None) -> Dict[str, int]:
    """
    Intraday: targets (a limit order would fill intraday). After 15:30 IST: stop and time-stop on the close,
    so a brief intraday dip doesn't shake you out.
    """
    from app.infrastructure.models import MomentumTradeAlert as T
    from app.services.data.data_manager import UnifiedDataManager
    from app.services.pre_release_edge_service import live_price
    now_ist = now_ist or (datetime.utcnow() + timedelta(hours=5, minutes=30))
    is_close = (now_ist.hour, now_ist.minute) >= (15, 30)
    dm = UnifiedDataManager(db)
    counts = {"checked": 0, "t1": 0, "closed": 0}
    for trade in db.query(T).filter(T.status == "OPEN").all():
        price = live_price(db, trade.ticker)
        if price is None:
            df = dm.get_ohlcv(trade.ticker, days=5)
            if df is None or df.empty:
                continue
            price = float(df["close" if "close" in df.columns else "Close"].iloc[-1])
        counts["checked"] += 1
        trade.max_price = max(trade.max_price or price, price)
        held = int(np.busday_count(trade.opened_at.date(), now_ist.date()))
        action = evaluate_trade(trade, price, is_close, held)
        if action == "T1":
            trade.t1_hit_at = datetime.utcnow()
            trade.stop_price = max(trade.stop_price, trade.entry_price)
            db.commit()
            counts["t1"] += 1
            _send({"title": f"TARGET 1 · {trade.ticker} · ₹{price:,.2f} · {_pct(price, trade.entry_price):+.1f}%",
                   "description": f"Book partial profit. Stop moved up to your entry ₹{trade.entry_price:,.2f}, so the rest can't lose.\n"
                                  f"Next: T2 ₹{trade.target2:,.2f} ({_pct(trade.target2, trade.entry_price):+.1f}%)",
                   "color": 0x20C997})
        elif action == "T2":
            close_trade(db, trade, price, f"Target 2 reached (₹{trade.target2:,.2f})")
            counts["closed"] += 1
        elif action == "STOP":
            why = "Closed at breakeven after Target 1" if trade.t1_hit_at else f"Stop hit: closed below ₹{trade.stop_price:,.2f}"
            close_trade(db, trade, price, why)
            counts["closed"] += 1
        elif action == "TIME":
            close_trade(db, trade, price, f"Time stop: no Target 1 within {TIME_STOP_SESSIONS} sessions")
            counts["closed"] += 1
        else:
            db.commit()
    return counts


def send_watchlist(rows: List[Dict[str, Any]]) -> None:
    """One daily 'keep an eye' message: WATCHLIST stocks with a breakout/volume trigger."""
    if not rows:
        return
    rows = sorted(rows, key=lambda r: -r["score"])[:15]
    lines = [f"**{r['ticker']}** ₹{r['price']:,.2f} · {' · '.join(clean(t) for t in r['triggers'][:2])} · score {r['score']:.0f}" for r in rows]
    _send({"title": f"Momentum watchlist · {len(rows)} stocks near a setup",
           "description": "\n".join(lines)[:4000], "color": 0x3B82F6,
           "footer": {"text": "Not a buy signal yet. A BUY alert follows only if the setup confirms."}})


def notify_kill_switch_change(active: bool, mdd: Optional[float], limit: Optional[float]) -> None:
    """Single message when the portfolio kill switch turns on/off (not stamped on every stock)."""
    try:
        from app.worker.observability import get_redis_client
        r = get_redis_client()
        prev = r.get(KILL_STATE_KEY)
        prev = prev.decode() if prev else None
        state = "ON" if active else "OFF"
        if prev == state or (prev is None and not active):
            r.set(KILL_STATE_KEY, state)
            return
        r.set(KILL_STATE_KEY, state)
    except Exception:
        return
    if active:
        _send({"title": "RISK · Momentum kill switch ON",
               "description": f"Recent BUY picks are in a {mdd:.1f}% drawdown (limit {limit:.0f}%). New BUY alerts are paused until it recovers."
               if mdd is not None else "New BUY alerts are paused for safety.", "color": 0xF05A67})
    else:
        _send({"title": "RISK · Momentum kill switch OFF", "description": "Drawdown recovered. BUY alerts resume.", "color": 0x20C997})


def weekly_scorecard(db) -> str:
    from app.infrastructure.models import MomentumTradeAlert as T
    since = datetime.utcnow() - timedelta(days=8)
    closed = db.query(T).filter(T.status == "CLOSED", T.closed_at >= since).all()
    open_n = db.query(T).filter(T.status == "OPEN").count()
    if not closed and not open_n:
        return "No momentum trades."
    wins = [t for t in closed if (t.return_pct or 0) > 0]
    avg = sum(t.return_pct or 0 for t in closed) / len(closed) if closed else 0.0
    lines = [f"Closed: {len(closed)} · winners: **{len(wins)}/{len(closed) or 0}** · avg **{avg:+.1f}%** · still open: {open_n}"]
    for t in sorted(closed, key=lambda t: -(t.return_pct or 0))[:10]:
        lines.append(f"{'✓' if (t.return_pct or 0) > 0 else '✕'} {t.ticker} {t.return_pct:+.1f}% · {t.exit_reason}")
    _send({"title": "Momentum · last week's scorecard", "description": "\n".join(lines)[:4000], "color": 0x8B949E})
    return lines[0]
