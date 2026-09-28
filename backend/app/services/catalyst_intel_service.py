"""
Catalyst Intelligence
=====================
Turns a classified filing into a graded, tradable alert.

  1. Evidence   - how this filing type (and size bucket) actually moved stocks historically:
                  abnormal return vs Nifty over 1/3/5 sessions (catalyst_evidence_events).
  2. Grade      - INSTANT only when the evidence is large (|avg 3-day move| >= 1%), significant (|t| >= 2.5),
                  consistent across both halves of history, the stock is liquid, and it hasn't already moved.
                  DIGEST for weaker-but-real evidence or severe red flags with little history. Otherwise NONE.
  3. Context    - price now vs the last close before the news, today's volume vs normal, liquidity.
  4. Plan       - stop / targets / hold window from the same simulator used by Pre-Release Edge,
                  drifting by the evidence-based expected move.
"""
import json
import logging
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.services.catalyst_classifier import LABELS, SUBTYPE_HINTS

logger = logging.getLogger(__name__)

MIN_EVENTS = 25              # evidence needs at least this many past events
INSTANT_MEAN_PCT = 1.0       # |avg 3-day abnormal move| to alert instantly
INSTANT_T = 2.5
DIGEST_MEAN_PCT = 0.5
DIGEST_T = 2.0
MIN_TURNOVER_CR = 3.0        # ₹ crore/day average traded value; below this, slippage eats the edge
SEVERE_RED_FLAGS = {"AUDITOR_EXIT", "DEFAULT_INSOLVENCY", "USFDA_ADVERSE", "RATING_DOWNGRADE"}
HOLD_SESSIONS = 3


def _stats(y: np.ndarray) -> Dict[str, Any]:
    y = y[np.isfinite(y)]
    n = len(y)
    if n == 0:
        return {"n": 0}
    sd = float(np.std(y, ddof=1)) if n > 1 else 0.0
    return {"n": int(n), "mean": round(float(y.mean()), 3), "median": round(float(np.median(y)), 3),
            "hit": round(float((y > 0).mean()), 3), "t": round(float(y.mean() / (sd / math.sqrt(n))) if sd > 0 else 0.0, 2),
            "p10": round(float(np.percentile(y, 10)), 2), "p90": round(float(np.percentile(y, 90)), 2)}


def compute_evidence(df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """
    Per (subtype, size bucket) and per subtype: measured reaction stats on liquid, non-results-day events,
    with a stability check (same sign in both halves of history).
    """
    if df is None or df.empty:
        return {}
    d = df[(~df["results_overlap"].fillna(False).astype(bool)) & (df["turnover_cr"].fillna(0) >= MIN_TURNOVER_CR)].copy()
    d["published_at"] = pd.to_datetime(d["published_at"])
    out: Dict[str, Dict[str, Any]] = {}

    def add(key: str, g: pd.DataFrame):
        if len(g) < 5:
            return
        split = g["published_at"].sort_values().iloc[len(g) // 2]
        first, second = g[g["published_at"] < split], g[g["published_at"] >= split]
        rec = {h: _stats(g[f"ar_{h}d"].to_numpy(dtype=float)) for h in (1, 3, 5)}
        m1 = _stats(first["ar_3d"].to_numpy(dtype=float)).get("mean")
        m2 = _stats(second["ar_3d"].to_numpy(dtype=float)).get("mean")
        rec["stable"] = bool(m1 is not None and m2 is not None and np.sign(m1) == np.sign(m2) and m1 != 0)
        rec["mean_first_half"], rec["mean_second_half"] = m1, m2
        out[key] = rec

    for sub, g in d.groupby("subtype"):
        add(f"{sub}|ALL", g)
        for bucket, gb in g.groupby(g["size_bucket"].fillna("UNKNOWN")):
            if bucket != "UNKNOWN":
                add(f"{sub}|{bucket}", gb)
    return out


def evidence_for(evidence: Dict[str, Dict[str, Any]], subtype: str, bucket: Optional[str]) -> Tuple[Optional[Dict[str, Any]], str]:
    """Most specific evidence with enough history: (subtype, size bucket) first, then the whole subtype."""
    keys = ([f"{subtype}|{bucket}"] if bucket and bucket != "UNKNOWN" else []) + [f"{subtype}|ALL"]
    for key in keys:
        rec = evidence.get(key)
        if rec and rec[3].get("n", 0) >= MIN_EVENTS:
            return rec, key
    return None, ""


_EVIDENCE_CACHE: Dict[str, Any] = {"at": None, "evidence": {}}


def cached_evidence(db) -> Dict[str, Dict[str, Any]]:
    from app.services.catalyst_evidence_service import load_evidence
    now = datetime.utcnow()
    if _EVIDENCE_CACHE["at"] is None or now - _EVIDENCE_CACHE["at"] > timedelta(hours=1):
        try:
            _EVIDENCE_CACHE.update(at=now, evidence=compute_evidence(load_evidence(db)))
        except Exception as e:
            logger.warning(f"Catalyst evidence load failed: {e}")
            db.rollback()
    return _EVIDENCE_CACHE["evidence"]


def grade(subtype: str, ev: Optional[Dict[str, Any]], turnover_cr: Optional[float], move_since_pct: Optional[float]) -> Dict[str, Any]:
    """Decide INSTANT / DIGEST / NONE with plain-language reasons."""
    reasons: List[str] = []
    liquid = turnover_cr is not None and turnover_cr >= MIN_TURNOVER_CR
    if not liquid:
        reasons.append(f"illiquid (₹{turnover_cr or 0:.1f} Cr/day traded)")
    if ev is None:
        if subtype in SEVERE_RED_FLAGS and liquid:
            return {"grade": "DIGEST", "direction": "BEARISH", "reasons": ["serious red flag, too few past cases to measure"]}
        return {"grade": "NONE", "direction": SUBTYPE_HINTS.get(subtype, "MIXED"), "reasons": reasons + ["no measured edge for this filing type"]}
    e3 = ev[3]
    direction = "BULLISH" if e3["mean"] > 0 else "BEARISH"
    strong = abs(e3["mean"]) >= INSTANT_MEAN_PCT and abs(e3["t"]) >= INSTANT_T and ev.get("stable")
    real = abs(e3["mean"]) >= DIGEST_MEAN_PCT and abs(e3["t"]) >= DIGEST_T
    late = move_since_pct is not None and (move_since_pct * np.sign(e3["mean"])) >= max(1.0, abs(e3["mean"]) * 1.5)
    if late:
        reasons.append(f"already moved {move_since_pct:+.1f}% since the news")
    if strong and liquid and not late:
        g = "INSTANT"
    elif (strong or real) and liquid:
        g = "DIGEST"
    else:
        g = "NONE"
        if not real:
            reasons.append("historical effect too small or inconsistent")
    return {"grade": g, "direction": direction, "reasons": reasons, "late": bool(late)}


def market_context(prices: pd.DataFrame, published_at: datetime, live_price: Optional[float]) -> Dict[str, Any]:
    """Price before the news, price now, move since, today's volume vs normal, liquidity."""
    if prices is None or prices.empty:
        return {}
    idx = prices.index
    before = idx.searchsorted(pd.Timestamp(published_at.date()), side="left") - 1
    if published_at.hour * 60 + published_at.minute > 15 * 60 + 30:   # after-market filing: that day's close is still "before"
        before = idx.searchsorted(pd.Timestamp(published_at.date()), side="right") - 1
    before = max(0, before)
    pre = float(prices["close"].iloc[before])
    now = float(live_price) if live_price else float(prices["close"].iloc[-1])
    vol = prices["volume"].to_numpy(dtype=float)
    avg20 = float(np.nanmean(vol[-21:-1])) if len(vol) > 21 else float(np.nanmean(vol))
    turnover = float((prices["close"].iloc[-20:] * prices["volume"].iloc[-20:]).mean()) / 1e7
    return {"pre_event_price": round(pre, 2), "price": round(now, 2), "move_since_pct": round((now / pre - 1) * 100, 2) if pre else None,
            "rel_volume": round(float(vol[-1]) / avg20, 2) if avg20 > 0 else None, "turnover_cr": round(turnover, 2)}


def trade_plan(prices: pd.DataFrame, price: float, expected_pct: float, direction: str) -> Dict[str, Any]:
    """Stop / targets / hold window from simulated paths drifting by the evidence-based move."""
    from app.services.price_path_service import standardised_residuals, simulate, plan_from_paths, first_touch
    from app.services.pre_release_edge_service import key_levels
    res = standardised_residuals(prices["close"].to_numpy(dtype=float))
    paths = simulate(price, res["z"], res["sigma_now"], n_pre=HOLD_SESSIONS, runup_mean_pct=expected_pct,
                     jumps=None, n_post=2, n_paths=4000, seed=11)
    atr = float((prices["high"] - prices["low"]).iloc[-14:].mean() / prices["close"].iloc[-1] * 100)
    plan = plan_from_paths(paths, HOLD_SESSIONS + 2, key_levels(prices), atr)
    downside = float(np.median(paths[:, HOLD_SESSIONS]))
    return {"stop": plan["stop"], "stop_pct": plan["stop_pct"], "t1": plan["targets"][0]["price"], "t1_pct": plan["targets"][0]["pct"],
            "t2": plan["targets"][1]["price"], "t2_pct": plan["targets"][1]["pct"], "hold": f"{HOLD_SESSIONS}-5 days",
            "expected_price": round(downside, 2), "t1_hit_session": first_touch(paths, plan["targets"][0]["price"], HOLD_SESSIONS + 2)["session"]}


def _fmt_pct(v: Optional[float]) -> str:
    return "n/a" if v is None else f"{v:+.1f}%"


def build_embed(ticker: str, name: str, subtype: str, title: str, url: str, g: Dict[str, Any], ev: Optional[Dict[str, Any]],
                ctx: Dict[str, Any], plan: Dict[str, Any], size: Dict[str, Any], amount_cr: Optional[float],
                mcap_cr: Optional[float], published_at: datetime, why: Optional[str] = None,
                amount_is_estimate: bool = False) -> Dict[str, Any]:
    """Compact Discord embed: verdict line, the facts, the evidence, the plan. No decorative emojis."""
    direction = g["direction"]
    color = 0x20C997 if direction == "BULLISH" else 0xF05A67 if direction == "BEARISH" else 0x8B949E
    label = LABELS.get(subtype, subtype.replace("_", " ").title())
    price = ctx.get("price")
    head = f"{direction} · {label} · {ticker}"
    lines = []
    lines.append(f"**₹{price:,.2f}** ({_fmt_pct(ctx.get('move_since_pct'))} since news) · Vol {ctx.get('rel_volume') or 0:.1f}x normal"
                 if price else "Price unavailable")
    facts = []
    if amount_cr:
        rel = f" = {size['size_rev_pct']:.1f}% of annual revenue" if size.get("size_rev_pct") is not None else (
            f" = {size['size_mcap_pct']:.1f}% of market cap" if size.get("size_mcap_pct") is not None else "")
        facts.append(f"{'~' if amount_is_estimate else ''}₹{amount_cr:,.0f} Cr{' (AI est.)' if amount_is_estimate else ''}{rel}")
    if mcap_cr:
        facts.append(f"M-cap ₹{mcap_cr:,.0f} Cr")
    facts.append(f"Filed {published_at:%d %b %H:%M} IST")  # exchange timestamps are IST
    lines.append(" · ".join(facts))
    if why:
        lines.append(why)
    if ev:
        e3 = ev[3]
        lines.append(f"Past similar filings: **{e3['mean']:+.1f}%** vs Nifty in 3 days, {round(e3['hit'] * 100)}% rose ({e3['n']} cases)")
    if plan and direction == "BULLISH":
        lines.append(f"Plan: buy near ₹{price:,.2f} · stop ₹{plan['stop']:,.2f} ({plan['stop_pct']:+.1f}%) · "
                     f"T1 ₹{plan['t1']:,.2f} ({plan['t1_pct']:+.1f}%) · T2 ₹{plan['t2']:,.2f} · hold {plan['hold']}")
    elif plan and direction == "BEARISH":
        lines.append(f"If you hold: consider exiting; expected ~₹{plan['expected_price']:,.2f} in 3 days · avoid fresh buys")
    if g.get("reasons"):
        lines.append("Note: " + "; ".join(g["reasons"]))
    embed = {"title": head, "description": "\n".join(lines), "color": color,
             "footer": {"text": f"{name[:60]} · {title[:120]}"}}
    if url:
        embed["url"] = url
    return embed


def digest_line(ev_row) -> str:
    """One compact watchlist line: ticker · event · price (move since news) · plan · historical edge."""
    d = json.loads(ev_row.details_json or "{}")
    ev = d.get("evidence") or {}
    e3 = ev.get("3") or ev.get(3) or {}
    ctx = d.get("context") or {}
    plan = d.get("plan") or {}
    parts = [f"**{ev_row.ticker}** {LABELS.get(ev_row.subtype or '', ev_row.category)}"]
    if ctx.get("price"):
        parts.append(f"₹{ctx['price']:,.2f} ({_fmt_pct(ctx.get('move_since_pct'))} since news)")
    if plan and ev_row.direction == "BULLISH":
        parts.append(f"stop ₹{plan['stop']:,.2f} · T1 ₹{plan['t1']:,.2f}")
    if e3:
        parts.append(f"hist {e3.get('mean', 0):+.1f}%/3d")
    if d.get("reasons"):
        parts.append(d["reasons"][-1])
    return " · ".join(parts)
