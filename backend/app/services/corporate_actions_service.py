"""
Impactful Events - corporate actions edge engine
================================================
Dividends, bonus issues, stock splits, buybacks, rights issues, demergers and fund raising, traded the way an
event swing trader does: get in early (board-meeting notice or declaration), ride the run-up, exit before the
ex-date - but only where 5 years of NSE history says the pattern is real.

Data (all free NSE feeds, nothing scraped from third parties):
  * /api/corporates-corporateActions  - ex-date, record date, dividend amount, bonus/split/rights ratio
  * /api/corporate-board-meetings     - meeting date, purpose and the exact notice time (the early signal)
  * /api/event-calendar               - upcoming board meetings
  * /api/corporate-announcements      - buyback price / entitlement ratio (buybacks only)

Storage: one compact evidence table (`corporate_action_events`, one row per past event). The live lists are
computed on a schedule and held in Redis, never stored.

Price history is split- and dividend-adjusted by the data providers; `adjust_for_splits` detects any split
the series is NOT adjusted for, so windows are always measured on a clean series and yields on actual prices.
"""
import json
import math
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.services.earnings_events_service import NseClient, parse_nse_datetime

KINDS = ("DIVIDEND", "BONUS", "SPLIT", "BUYBACK", "RIGHTS", "DEMERGER", "FUNDRAISE")
KIND_LABEL = {"DIVIDEND": "Dividend", "BONUS": "Bonus issue", "SPLIT": "Stock split", "BUYBACK": "Buyback",
              "RIGHTS": "Rights issue", "DEMERGER": "Demerger / scheme", "FUNDRAISE": "Fund raising"}
TAB_OF = {"DIVIDEND": "dividends", "BONUS": "bonus_split", "SPLIT": "bonus_split", "BUYBACK": "buyback",
          "RIGHTS": "rights", "FUNDRAISE": "rights", "DEMERGER": "demerger"}
# When one board meeting has several purposes, the most price-sensitive one leads.
KIND_PRIORITY = ("SPLIT", "BONUS", "BUYBACK", "DEMERGER", "RIGHTS", "DIVIDEND", "FUNDRAISE")

EVIDENCE_YEARS = 5
MIN_N = 20
MIN_T = 2.0
ROUND_TRIP_COST_PCT = 0.3
MIN_ADV_CR = 3.0
SNAPSHOT_KEY = "impactful_events:snapshot"
LIVE_PAST_DAYS = 15          # keep events for this long after the ex-date / meeting (shows what happened)
LIVE_AHEAD_DAYS = 120
YIELD_BUCKETS = [(0, 0.5, "<0.5%"), (0.5, 1.5, "0.5-1.5%"), (1.5, 3.0, "1.5-3%"), (3.0, 1e9, ">3%")]

WINDOWS = {
    "ret_notice": "Notice -> day before meeting",
    "ret_decl": "Declaration reaction (2 sessions)",
    "ret_runup": "Day after declaration -> day before ex-date",
    "ret_pre10": "10 sessions before the ex-date",
    "ret_exday": "Ex-date session",
    "ret_post5": "5 sessions after the ex-date",
}


# ─── Parsing (pure) ────────────────────────────────────────────────────────────

def parse_day(value: Optional[str]) -> Optional[date]:
    if not value or str(value).strip() in ("-", ""):
        return None
    ts = parse_nse_datetime(value)
    return ts.date() if ts else None


def action_kind(subject: str) -> Optional[str]:
    s = (subject or "").lower()
    if re.search(r"ncrps|preference|debenture|\bncd\b|warrant", s):
        return None      # not an equity-share action (e.g. "Bonus NCRPS 4:1")
    if "dividend" in s:
        return "DIVIDEND"
    if "bonus" in s:
        return "BONUS"
    if "split" in s or "sub-division" in s or "subdivision" in s:
        return "SPLIT"
    if "buy back" in s or "buyback" in s or "buy-back" in s:
        return "BUYBACK"
    if "rights" in s:
        return "RIGHTS"
    if "demerger" in s or "scheme of arrangement" in s or "spin off" in s:
        return "DEMERGER"
    return None


def purpose_kinds(text: str) -> List[str]:
    """Corporate-action intents in a board-meeting purpose/description."""
    t = (text or "").lower()
    out = []
    if "dividend" in t:
        out.append("DIVIDEND")
    if re.search(r"\bbonus\b", t):
        out.append("BONUS")
    if "split" in t or "sub-division" in t or "subdivision" in t:
        out.append("SPLIT")
    if "buy back" in t or "buyback" in t or "buy-back" in t:
        out.append("BUYBACK")
    if "rights issue" in t or re.search(r"\brights\b", t):
        out.append("RIGHTS")
    if "demerger" in t or "scheme of arrangement" in t or "amalgamation" in t:
        out.append("DEMERGER")
    if "fund rais" in t or "raising of funds" in t or "qip" in t or "preferential" in t:
        out.append("FUNDRAISE")
    return out


def lead_kind(kinds: List[str]) -> Optional[str]:
    for k in KIND_PRIORITY:
        if k in kinds:
            return k
    return None


_AMOUNT = re.compile(r"(?<![a-z])(?:rs|re|inr|₹)\.?\s*-?\s*(\d+(?:\.\d+)?)", re.I)


def dividend_amount(subject: str) -> Optional[float]:
    """Total Rs per share in a dividend subject ('Interim Dividend - Rs 8 Per Share Special Dividend - Rs 67 Per Share')."""
    s = (subject or "").lower().split("premium")[0]
    vals = [float(x) for x in _AMOUNT.findall(s)]
    vals = [v for v in vals if 0 < v < 100000]
    return round(sum(vals), 4) if vals else None


def dividend_parts(subject: str) -> Dict[str, float]:
    """Regular (interim/final) and special Rs per share, e.g. 'Interim Rs 10 ... Special Rs 66' -> 10 / 66."""
    s = (subject or "").lower().split("premium")[0]
    out = {"regular": 0.0, "special": 0.0}
    marks = list(re.finditer(r"(?:(special|interim|final)\s*)?dividend", s))
    for i, m in enumerate(marks):
        seg = s[m.start(): marks[i + 1].start() if i + 1 < len(marks) else len(s)]
        vals = [float(x) for x in _AMOUNT.findall(seg) if 0 < float(x) < 100000]
        if vals:
            out["special" if m.group(1) == "special" else "regular"] += sum(vals)
    return out


def regular_type(subject: str) -> str:
    return "INTERIM" if "interim" in (subject or "").lower() else "FINAL"


def dividend_type(subject: str) -> str:
    s = (subject or "").lower()
    if "special" in s:
        return "SPECIAL"
    return "INTERIM" if "interim" in s else "FINAL"


def split_factor(kind: str, subject: str) -> Optional[float]:
    """Share multiplier: bonus a:b -> (a+b)/b; split Rs 10 -> Re 1 -> 10."""
    s = (subject or "").lower()
    if kind == "BONUS":
        m = re.search(r"(\d+)\s*:\s*(\d+)", s)
        if m and float(m.group(2)) > 0:
            return round((float(m.group(1)) + float(m.group(2))) / float(m.group(2)), 6)
    if kind == "SPLIT":
        vals = [float(x) for x in _AMOUNT.findall(s)]
        if len(vals) >= 2 and vals[1] > 0 and vals[0] > vals[1]:
            return round(vals[0] / vals[1], 6)
    return None


def rights_terms(subject: str, face_value: Optional[float]) -> Dict[str, Optional[float]]:
    """'Rights 1:5 @ Premium Rs 20/-' -> 1 new share for every 5 held, issue price = face value + premium."""
    s = (subject or "").lower()
    m = re.search(r"(\d+)\s*:\s*(\d+)", s)
    new, held = (float(m.group(1)), float(m.group(2))) if m else (None, None)
    price = None
    pm = re.search(r"premium\s*(?:of\s*)?(?:rs|re|inr|₹)\.?\s*-?\s*(\d+(?:\.\d+)?)", s)
    if pm:
        price = float(pm.group(1)) + (face_value or 0.0)
    elif "par" in s and face_value:
        price = face_value
    return {"new": new, "held": held, "issue_price": price}


def terp(price: float, new: Optional[float], held: Optional[float], issue_price: Optional[float]) -> Optional[float]:
    """Theoretical ex-rights price."""
    if not (price and new and held and issue_price is not None):
        return None
    return (held * price + new * issue_price) / (held + new)


def yield_bucket(y: Optional[float]) -> Optional[str]:
    if y is None or not np.isfinite(y):
        return None
    for lo, hi, name in YIELD_BUCKETS:
        if lo <= y < hi:
            return name
    return None


def parse_buyback(text: str) -> Dict[str, Any]:
    """Buyback price, method and small-shareholder entitlement from filing text / PDF."""
    t = re.sub(r"\s+", " ", (text or "")).lower()
    out: Dict[str, Any] = {"price": None, "method": None, "entitlement": None}
    for pat in (r"buy\s?-?back price[^.]{0,80}?(?:rs|inr|₹)\.?\s*([\d,]+(?:\.\d+)?)",
                r"(?:at|price of|price not exceeding)\s*(?:rs|inr|₹)\.?\s*([\d,]+(?:\.\d+)?)\s*(?:/-)?\s*(?:\(.*?\))?\s*per (?:fully paid[- ]up )?equity share"):
        m = re.search(pat, t)
        if m:
            try:
                v = float(m.group(1).replace(",", ""))
                if v > 0:
                    out["price"] = v
                    break
            except ValueError:
                pass
    if "tender offer" in t or "tender route" in t:
        out["method"] = "TENDER"
    elif "open market" in t:
        out["method"] = "OPEN_MARKET"
    m = re.search(r"small shareholders[^.]{0,200}?(\d+)\s*(?:fully paid[- ]up\s*)?equity shares?\s*(?:out\s*)?(?:for every|of every)\s*(\d+)", t)
    if m and float(m.group(2)) > 0:
        out["entitlement"] = round(float(m.group(1)) / float(m.group(2)), 4)
    return out


def buyback_math(price: float, bb_price: Optional[float], acceptance: Optional[float], post_ex_move_pct: float,
                 cost_pct: float = ROUND_TRIP_COST_PCT) -> Dict[str, Optional[float]]:
    """
    Tender-offer arbitrage: buy at `price`, `acceptance` of the shares are bought back at `bb_price`,
    the rest are sold after the record date at price * (1 + post_ex_move).
    """
    if not (price and bb_price):
        return {"premium_pct": None, "return_pct": None, "breakeven_acceptance": None}
    rest = price * (1 + post_ex_move_pct / 100.0)
    premium = (bb_price / price - 1) * 100
    ret = None
    if acceptance is not None:
        ret = ((acceptance * bb_price + (1 - acceptance) * rest) / price - 1) * 100 - cost_pct
    # acceptance needed to break even after costs
    denom = bb_price - rest
    be = (price * (1 + cost_pct / 100.0) - rest) / denom if denom > 0 else None
    return {"premium_pct": round(premium, 2), "return_pct": round(ret, 2) if ret is not None else None,
            "breakeven_acceptance": round(min(max(be, 0.0), 1.0), 3) if be is not None else None}


# ─── Price series helpers ──────────────────────────────────────────────────────

def adjust_for_splits(prices: pd.DataFrame, splits: List[Tuple[date, float]]) -> Tuple[pd.DataFrame, List[Tuple[date, float]]]:
    """
    Returns a fully split-adjusted copy of `prices` and the list of splits that fall inside the series.
    A split already adjusted by the provider shows no gap on the ex-date; an unadjusted one shows a drop
    close to 1/factor - that one is adjusted here (prices before it divided, volume multiplied).
    """
    df = prices.copy()
    inside = []
    idx = df.index
    for ex, f in sorted(splits):
        if not f or f <= 1.05:
            continue
        k = idx.searchsorted(pd.Timestamp(ex), "left")
        if k <= 0 or k >= len(idx):   # split outside the series: nothing to adjust, never affects its prices
            continue
        inside.append((ex, f))
        ratio = float(df["close"].iloc[k] / df["close"].iloc[k - 1])
        if ratio < (1.0 / f) * 1.3:   # visible gap -> provider did not adjust this split
            for col in ("open", "high", "low", "close"):
                df.iloc[:k, df.columns.get_loc(col)] = df[col].iloc[:k] / f
            if "volume" in df:
                df.iloc[:k, df.columns.get_loc("volume")] = df["volume"].iloc[:k] * f
    return df, inside


def actual_price(adj_close: float, when: date, splits_inside: List[Tuple[date, float]]) -> float:
    """Undo split adjustment: the price that actually traded on `when`."""
    f = 1.0
    for ex, fac in splits_inside:
        if ex > when:
            f *= fac
    return adj_close * f


def dividend_adjustment(w: "Windows", dividends: List[Tuple[date, float]], splits_inside: List[Tuple[date, float]]
                        ) -> Tuple[Dict[date, float], Optional[bool]]:
    """
    Is the series dividend-adjusted? On an unadjusted series the ex-date close drops by about the dividend; on an
    adjusted one it doesn't. Judged on the stock's meaningful dividends (>=0.5% yield).
    Returns ({ex_date: cumulative factor to divide adjusted prices by}, adjusted?) - factors are 1.0 unless adjusted.
    """
    ratios = []
    for ex, amt in dividends:
        pe = w.pos(ex, "after")
        if not pe or pe <= 0 or pe >= len(w.close) or w.idx[pe].date() - ex > timedelta(days=7):
            continue
        px = actual_price(float(w.close[pe - 1]), w.idx[pe - 1].date(), splits_inside)
        y = amt / px * 100 if px else 0
        if y >= 0.5:
            ratios.append((w.close[pe] / w.close[pe - 1] - 1) * 100 / y)
    if len(ratios) < 2:
        return {}, None
    adjusted = bool(np.median(ratios) > -0.5)
    if not adjusted:
        return {}, False
    factors: Dict[date, float] = {}
    F = 1.0
    for ex, amt in sorted(dividends, reverse=True):   # newest first: later dividends scale earlier prices
        pe = w.pos(ex, "after")
        if not pe or pe <= 0:
            continue
        px = actual_price(float(w.close[pe - 1]), w.idx[pe - 1].date(), splits_inside) / F
        factors[ex] = F
        if px and amt < px:
            F *= (1 - amt / px)
    return factors, True


class Windows:
    """The stock's own close-to-close % moves on a clean (split-adjusted) price series."""

    def __init__(self, prices: pd.DataFrame):
        self.idx = prices.index
        self.close = prices["close"].to_numpy(dtype=float)
        self.vol = prices["volume"].to_numpy(dtype=float) if "volume" in prices else np.zeros(len(prices))

    def pos(self, day: date, side: str = "after") -> Optional[int]:
        t = pd.Timestamp(day)
        if side == "after":
            k = self.idx.searchsorted(t, "left")
            return int(k) if k < len(self.idx) else None
        k = self.idx.searchsorted(t, "right") - 1
        return int(k) if k >= 0 else None

    def ar(self, a: Optional[int], z: Optional[int]) -> Optional[float]:
        if a is None or z is None or a < 0 or z >= len(self.close) or z <= a:
            return None
        v = (self.close[z] / self.close[a] - 1) * 100
        return round(float(v), 3) if np.isfinite(v) else None

    def adv_cr(self, end: Optional[int], n: int = 20) -> Optional[float]:
        if end is None or end <= 0:
            return None
        a = max(0, end - n)
        tv = self.close[a:end] * self.vol[a:end]
        tv = tv[np.isfinite(tv) & (tv > 0)]
        return round(float(tv.mean()) / 1e7, 2) if len(tv) else None

    def notice_entry(self, notice: Optional[datetime]) -> Optional[int]:
        """First close you could have bought at after the notice (after-hours notices -> next session)."""
        if notice is None:
            return None
        k = self.pos(notice.date(), "after")
        if k is None:
            return None
        if self.idx[k].date() == notice.date() and notice.hour * 60 + notice.minute >= 15 * 60 + 25:
            k += 1
        return k if k < len(self.idx) else None


PATH_LEN = 31   # sessions stored before the key date (index 30 = exit day, the session before the key date)


def encode_path(w: "Windows", end: Optional[int]) -> Optional[str]:
    """Closes from end-30..end divided by the close on `end` (the exit day); missing leading days left blank."""
    if end is None or end < 1 or end >= len(w.close) or not w.close[end] > 0:
        return None
    vals = []
    for i in range(end - PATH_LEN + 1, end + 1):
        vals.append("" if i < 0 or not np.isfinite(w.close[i]) else f"{w.close[i] / w.close[end]:.4f}")
    return ",".join(vals)


def decode_path(s: Optional[str]) -> np.ndarray:
    out = np.full(PATH_LEN, np.nan)
    if isinstance(s, str) and s:
        parts = s.split(",")
        for i, v in enumerate(parts[:PATH_LEN]):
            if v:
                out[i] = float(v)
    return out


def measure_action(w: Windows, ex: Optional[date], meeting: Optional[date], notice: Optional[datetime]) -> Dict[str, Any]:
    """All evidence windows for one event; any window that cannot be measured is None."""
    out: Dict[str, Any] = {k: None for k in WINDOWS}
    out["sessions_decl_to_ex"] = None
    pm = w.pos(meeting, "after") if meeting else None
    pe = w.pos(ex, "after") if ex else None
    if pe is not None and ex and w.idx[pe].date() - ex > timedelta(days=7):
        pe = None
    if pm is not None and meeting and w.idx[pm].date() - meeting > timedelta(days=7):
        pm = None
    pn = w.notice_entry(notice)
    if pm is not None:
        if pn is not None and pm - 1 > pn:
            out["ret_notice"] = w.ar(pn, pm - 1)
        out["ret_decl"] = w.ar(pm - 1, pm + 1)
    if pe is not None:
        if pm is not None and pe - 1 > pm + 1:
            out["ret_runup"] = w.ar(pm + 1, pe - 1)
            out["sessions_decl_to_ex"] = int(pe - 1 - (pm + 1))
        out["ret_pre10"] = w.ar(pe - 11, pe - 1)
        out["ret_exday"] = w.ar(pe - 1, pe)
        out["ret_post5"] = w.ar(pe, pe + 5)
    elif pm is not None:   # meeting-only events (fund raising): drift after the meeting
        out["ret_post5"] = w.ar(pm + 1, pm + 6)
    out["adv_cr"] = w.adv_cr(pm if pm is not None else pe)
    out["path_ex"] = encode_path(w, pe - 1) if pe is not None else None
    out["path_mtg"] = encode_path(w, pm - 1) if pm is not None else None
    out["sessions_notice_to_mtg"] = int(pm - pn) if pm is not None and pn is not None and pm > pn else None
    return out


# ─── Statistics & gate (pure) ──────────────────────────────────────────────────

def stat(values, dates=None) -> Dict[str, Any]:
    x = np.asarray([v for v in values if v is not None and np.isfinite(v)], dtype=float)
    n = len(x)
    if n == 0:
        return {"n": 0}
    out = {"n": n, "mean": round(float(x.mean()), 2), "median": round(float(np.median(x)), 2),
           "hit": round(float((x > 0).mean() * 100), 0)}
    if n >= 3:
        sd = float(x.std(ddof=1))
        out["t"] = round(float(x.mean() / (sd / math.sqrt(n))), 2) if sd > 0 else 0.0
    # consistency: same sign in the older and the newer half of history
    if dates is not None and n >= 10:
        order = np.argsort(np.asarray([d for v, d in zip(values, dates) if v is not None and np.isfinite(v)], dtype="datetime64[ns]"))
        xs = x[order]
        h = n // 2
        out["halves"] = [round(float(xs[:h].mean()), 2), round(float(xs[h:].mean()), 2)]
    return out


def verdict(st: Dict[str, Any]) -> str:
    """EDGE_UP / EDGE_DOWN only when the pattern is large, significant, typical and stable; else NO_EDGE / THIN."""
    n = st.get("n", 0)
    if n < MIN_N:
        return "THIN"
    t, mean, med = st.get("t", 0.0), st.get("mean", 0.0), st.get("median", 0.0)
    halves = st.get("halves") or [mean, mean]
    if t >= MIN_T and mean >= ROUND_TRIP_COST_PCT and med > 0 and min(halves) > 0:
        return "EDGE_UP"
    if t <= -MIN_T and mean <= -ROUND_TRIP_COST_PCT and med < 0 and max(halves) < 0:
        return "EDGE_DOWN"
    return "NO_EDGE"


def evidence_frame(db) -> pd.DataFrame:
    from app.infrastructure.models import CorporateActionEvent as E
    cols = [E.ticker, E.kind, E.subject, E.ex_date, E.meeting_date, E.with_results, E.amount, E.split_factor, E.yield_pct,
            E.surprise_pct, E.price, E.adv_cr, E.sessions_decl_to_ex, E.ret_notice, E.ret_decl, E.ret_runup, E.ret_pre10,
            E.ret_exday, E.ret_post5, E.path_ex, E.path_mtg, E.sessions_notice_to_mtg]
    rows = db.query(*cols).all()
    df = pd.DataFrame(rows, columns=[c.key for c in cols])
    if df.empty:
        return df
    df["when"] = pd.to_datetime(df["ex_date"].fillna(df["meeting_date"]))
    df["pex"] = df["path_ex"].map(decode_path)
    df["pmt"] = df["path_mtg"].map(decode_path)
    df["ybucket"] = df["yield_pct"].map(yield_bucket)
    # Only liquid events count as evidence for a tradable pattern
    df = df[(df["adv_cr"].isna()) | (df["adv_cr"] >= 1.0)]
    return df


def group_stat(df: pd.DataFrame, col: str) -> Dict[str, Any]:
    if df is None or df.empty or col not in df:
        return {"n": 0, "verdict": "THIN"}
    sub = df[df[col].notna()]
    st = stat(sub[col].tolist(), sub["when"].tolist())
    st["verdict"] = verdict(st)
    return st


def pick_evidence(ev: pd.DataFrame, kind: str, col: str, ybucket: Optional[str] = None,
                  with_results: Optional[bool] = None) -> Dict[str, Any]:
    """Most specific evidence group with enough cases: (yield bucket, with results) -> yield bucket -> kind."""
    base = ev[ev["kind"] == kind] if not ev.empty else ev
    tries = []
    if kind == "DIVIDEND" and ybucket:
        if with_results is not None:
            tries.append((f"{KIND_LABEL[kind]} · yield {ybucket} · {'with' if with_results else 'without'} results",
                          base[(base["ybucket"] == ybucket) & (base["with_results"] == with_results)]))
        tries.append((f"{KIND_LABEL[kind]} · yield {ybucket}", base[base["ybucket"] == ybucket]))
    tries.append((f"All {KIND_LABEL[kind].lower()} events", base))
    for label, sub in tries:
        st = group_stat(sub, col)
        if st.get("n", 0) >= MIN_N * 1.5 or label.startswith("All"):
            st["group"] = label
            st["window"] = WINDOWS.get(col, col)
            return st
    return {"n": 0, "verdict": "THIN", "group": "", "window": WINDOWS.get(col, col)}


def from_here(sub: pd.DataFrame, stage: str, k: Optional[int]) -> Dict[str, Any]:
    """
    Past events seen from today's position: bought `k` sessions before the key date (ex-date for declared events,
    meeting for notices), sold on the close of the session before it. Only events whose news was already public
    at that point count. Returns win rate, typical / best / worst outcome, and history-based target and stop.
    """
    if sub is None or sub.empty or k is None or k < 2:
        return {"n": 0}
    k = min(k, PATH_LEN)
    entry = PATH_LEN - k                     # index of the entry close; the last index is the exit
    if stage == "NOTICE":
        known = sub["sessions_notice_to_mtg"].fillna(-1) >= k
        mats = sub.loc[known, "pmt"]
    else:
        known = sub["sessions_decl_to_ex"].fillna(-1) >= k - 1
        mats = sub.loc[known, "pex"]
    if mats.empty:
        return {"n": 0}
    M = np.vstack(mats.to_numpy())[:, entry:]
    ok = np.isfinite(M).all(axis=1) & (M[:, 0] > 0)
    M, dates = M[ok], sub.loc[known, "when"].to_numpy()[ok]
    if len(M) == 0:
        return {"n": 0}
    base = M[:, :1]
    hold = (M[:, -1:] / base - 1).ravel() * 100
    peak = (M[:, 1:].max(axis=1, keepdims=True) / base - 1).ravel() * 100
    trough = (M[:, 1:].min(axis=1, keepdims=True) / base - 1).ravel() * 100
    st = stat(list(hold), list(dates))
    order = np.argsort(dates)
    return {
        "n": int(len(hold)), "win": round(float((hold > 0).mean() * 100), 0), "median": round(float(np.median(hold)), 2),
        "mean": round(float(hold.mean()), 2), "t": st.get("t"), "verdict": verdict(st),
        "target_pct": round(float(np.quantile(peak, 0.40)), 2),           # reached in ~60% of past cases
        "target_hit": round(float((peak >= np.quantile(peak, 0.40)).mean() * 100), 0),
        "stop_pct": round(float(np.quantile(trough, 0.20)), 2),           # only ~20% of past cases dipped below
        "best_pct": round(float(np.median(peak)), 2),
        "stretch_pct": round(float(np.quantile(peak, 0.70)), 2),          # reached in ~30% of past cases
        "moves": [round(float(v), 1) for v in hold[order][-8:]],
        "peaks": [round(float(v), 1) for v in peak[order][-8:]],
    }


def evidence_summary(ev: pd.DataFrame) -> Dict[str, Any]:
    """Per tab: how each window behaved historically (the page's 'what 5 years say' strip)."""
    out: Dict[str, Any] = {}
    if ev is None or ev.empty:
        return out
    for kind in KINDS:
        sub = ev[ev["kind"] == kind]
        if sub.empty:
            continue
        cols = ["ret_notice", "ret_decl", "ret_post5"] if kind == "FUNDRAISE" else list(WINDOWS)
        out[kind] = {"label": KIND_LABEL[kind], "events": int(len(sub)),
                     "windows": [{"key": c, "label": WINDOWS[c], **group_stat(sub, c)} for c in cols]}
    div = ev[ev["kind"] == "DIVIDEND"]
    if not div.empty:
        out["DIVIDEND"]["by_yield"] = [{"bucket": b, **group_stat(div[div["ybucket"] == b], "ret_runup")} for _, _, b in YIELD_BUCKETS]
    return out


# ─── Evidence builder ──────────────────────────────────────────────────────────

class CorporateActionsService:
    def __init__(self, db, nse: Optional[NseClient] = None):
        from app.services.earnings_events_service import EarningsEventsService
        self.db = db
        self.nse = nse or NseClient()
        self.events = EarningsEventsService(db, self.nse)

    # NSE feeds
    def actions(self, from_d: date, to_d: date, symbol: Optional[str] = None) -> List[dict]:
        sym = f"&symbol={symbol}" if symbol else ""
        data = self.nse.get_json(f"/api/corporates-corporateActions?index=equities{sym}&from_date={from_d:%d-%m-%Y}&to_date={to_d:%d-%m-%Y}")
        rows = data if isinstance(data, list) else []
        return [r for r in rows if (r.get("series") or "EQ").strip() in ("EQ", "BE", "BZ", "SM", "ST", "-", "")]

    def board_meetings(self, from_d: date, to_d: date, symbol: Optional[str] = None) -> List[dict]:
        sym = f"&symbol={symbol}" if symbol else ""
        data = self.nse.get_json(f"/api/corporate-board-meetings?index=equities{sym}&from_date={from_d:%d-%m-%Y}&to_date={to_d:%d-%m-%Y}")
        return data if isinstance(data, list) else []

    def calendar(self) -> List[dict]:
        data = self.nse.get_json("/api/event-calendar?index=equities")
        return data if isinstance(data, list) else []

    @staticmethod
    def meetings_from(bms: List[dict]) -> List[Dict[str, Any]]:
        out = []
        for m in bms:
            md = parse_day(m.get("bm_date"))
            if not md:
                continue
            text = f"{m.get('bm_purpose') or ''} {m.get('bm_desc') or ''}"
            out.append({"date": md, "notice": parse_nse_datetime(m.get("bm_timestamp")), "text": text,
                        "purpose": (m.get("bm_purpose") or "").strip(), "kinds": purpose_kinds(text),
                        "with_results": "result" in text.lower()})
        return out

    @staticmethod
    def match_meeting(meetings: List[Dict[str, Any]], kind: str, ex: date) -> Optional[Dict[str, Any]]:
        """The board meeting that declared this action: the latest one before the ex-date that mentions it."""
        span = {"DIVIDEND": 75, "BONUS": 100, "SPLIT": 100, "BUYBACK": 150, "RIGHTS": 180}.get(kind)
        if span is None:
            return None
        cands = [m for m in meetings if 1 <= (ex - m["date"]).days <= span and
                 (kind in m["kinds"] or (kind == "DIVIDEND" and m["with_results"]))]
        return max(cands, key=lambda m: m["date"]) if cands else None

    def build_company(self, company, years: int = EVIDENCE_YEARS) -> Dict[str, Any]:
        from app.infrastructure.models import CorporateActionEvent as E
        symbol = company.ticker
        today = datetime.utcnow().date()
        start = today - timedelta(days=365 * years)
        acts = self.actions(start, today, symbol)
        bms = self.board_meetings(start - timedelta(days=120), today, symbol)
        meetings = self.meetings_from(bms)
        fund = [m for m in meetings if "FUNDRAISE" in m["kinds"] and m["date"] < today - timedelta(days=9)]
        if not acts and not fund:
            return {"ticker": symbol, "status": "NO_EVENTS", "saved": 0}
        raw = self.events.load_prices(symbol)
        if raw is None or raw.empty or len(raw) < 120:
            return {"ticker": symbol, "status": "NO_PRICES", "saved": 0}

        parsed = []
        for a in acts:
            subj = (a.get("subject") or "").strip()
            kind = action_kind(subj)
            ex = parse_day(a.get("exDate"))
            if not kind or not ex or ex > today - timedelta(days=1):
                continue
            parsed.append({"kind": kind, "subject": subj, "ex": ex, "record": parse_day(a.get("recDate")),
                           "factor": split_factor(kind, subj), "amount": dividend_amount(subj) if kind == "DIVIDEND" else None,
                           "dtype": dividend_type(subj) if kind == "DIVIDEND" else None})
        splits = [(p["ex"], p["factor"]) for p in parsed if p["factor"]]
        prices, inside = adjust_for_splits(raw, splits)
        w = Windows(prices)
        div_factor, div_adjusted = dividend_adjustment(w, [(p["ex"], p["amount"]) for p in parsed if p["kind"] == "DIVIDEND" and p["amount"]], inside)

        existing = {r[0]: r[1] for r in self.db.query(E.event_key, E.ret_post5).filter(E.ticker == symbol).all()}
        saved = updated = 0
        # dividends of the same type ~1 year earlier, split-adjusted, for the surprise measure
        divs = sorted([p for p in parsed if p["kind"] == "DIVIDEND" and p["amount"]], key=lambda p: p["ex"])

        def split_between(a: date, b: date) -> float:
            f = 1.0
            for ex, fac in inside:
                if a < ex <= b:
                    f *= fac
            return f

        def upsert(key: str, fields: Dict[str, Any]):
            nonlocal saved, updated
            if key in existing:
                if existing[key] is None and fields.get("ret_post5") is not None:
                    self.db.query(E).filter(E.event_key == key).update({**fields, "updated_at": datetime.utcnow()})
                    updated += 1
                return
            self.db.add(E(event_key=key, company_id=company.id, ticker=symbol, **fields))
            existing[key] = fields.get("ret_post5")
            saved += 1

        for p in parsed:
            m = self.match_meeting(meetings, p["kind"], p["ex"])
            win = measure_action(w, p["ex"], m["date"] if m else None, m["notice"] if m else None)
            pe = w.pos(p["ex"], "after")
            px = None
            if pe and pe > 0:
                px = actual_price(float(w.close[pe - 1]), w.idx[pe - 1].date(), inside) / div_factor.get(p["ex"], 1.0)
            yld = (p["amount"] / px * 100) if (p["amount"] and px) else None
            if p["kind"] == "DIVIDEND" and div_adjusted is False and yld is not None and win.get("ret_exday") is not None:
                win["ret_exday"] = round(win["ret_exday"] + yld, 3)   # raw prices: add the dividend back (total return)
            surprise = None
            if p["kind"] == "DIVIDEND" and p["amount"]:
                cur = dividend_parts(p["subject"])["regular"]
                prev = [q for q in divs if regular_type(q["subject"]) == regular_type(p["subject"]) and 300 <= (p["ex"] - q["ex"]).days <= 430
                        and dividend_parts(q["subject"])["regular"] > 0]
                if prev and cur > 0:
                    q = prev[-1]
                    prev_amt = dividend_parts(q["subject"])["regular"] / split_between(q["ex"], p["ex"])
                    surprise = round((cur / prev_amt - 1) * 100, 1) if prev_amt > 0 else None
            upsert(f"{symbol}|{p['kind']}|{p['ex']}", dict(
                kind=p["kind"], subject=p["subject"][:200], ex_date=datetime.combine(p["ex"], datetime.min.time()),
                record_date=datetime.combine(p["record"], datetime.min.time()) if p["record"] else None,
                meeting_date=datetime.combine(m["date"], datetime.min.time()) if m else None,
                notice_at=m["notice"] if m else None, with_results=bool(m and m["with_results"]),
                amount=p["amount"], split_factor=p["factor"], yield_pct=round(yld, 3) if yld is not None else None,
                surprise_pct=surprise, price=round(px, 2) if px else None, adv_cr=win.pop("adv_cr"), **win))

        for m in fund:
            win = measure_action(w, None, m["date"], m["notice"])
            pm = w.pos(m["date"], "after")
            px = actual_price(float(w.close[pm - 1]), w.idx[pm - 1].date(), inside) if pm and pm > 0 else None
            upsert(f"{symbol}|FUNDRAISE|{m['date']}", dict(
                kind="FUNDRAISE", subject=m["purpose"][:200], meeting_date=datetime.combine(m["date"], datetime.min.time()),
                notice_at=m["notice"], with_results=m["with_results"], price=round(px, 2) if px else None,
                adv_cr=win.pop("adv_cr"), **win))
        self.db.commit()
        return {"ticker": symbol, "status": "OK", "saved": saved, "updated": updated}


# ─── Trade plan (price-path simulation) ───────────────────────────────────────

def simulate_drift(price: float, z: np.ndarray, sigma_now: float, n: int, drift_pct: float, n_post: int = 0,
                   ex_jump_pct: float = 0.0, post_drift_pct: float = 0.0, n_paths: int = 5000, seed: int = 7) -> np.ndarray:
    """
    Paths like the stock's own (bootstrapped standardised returns, EWMA volatility), with the evidence drift
    spread evenly over the `n` sessions to the exit, then an optional ex-date jump and post-ex drift.
    """
    from app.services.price_path_service import EWMA_LAMBDA
    rng = np.random.default_rng(seed)
    steps = n + n_post
    drift = np.zeros(steps)
    if n > 0 and drift_pct:
        drift[:n] = math.log1p(drift_pct / 100.0) / n
    if n_post > 0 and post_drift_pct:
        drift[n + 1:] = math.log1p(post_drift_pct / 100.0) / max(n_post - 1, 1)
    log_p = np.zeros((n_paths, steps + 1))
    log_p[:, 0] = math.log(price)
    var = np.full(n_paths, sigma_now ** 2)
    for s in range(steps):
        shock = np.sqrt(var) * z[rng.integers(0, len(z), n_paths)]
        r = shock + drift[s]
        if n_post > 0 and s == n:
            r = r + math.log1p(ex_jump_pct / 100.0)   # known ex-date drop: not a volatility shock
        log_p[:, s + 1] = log_p[:, s] + r
        var = EWMA_LAMBDA * var + (1 - EWMA_LAMBDA) * shock ** 2
    return np.exp(log_p)


def build_plan_path(prices: pd.DataFrame, price: float, price_source: str, today: date, n: int, drift_pct: float,
                    event_label_index: int, n_post: int = 0, ex_jump_pct: float = 0.0, post_drift_pct: float = 0.0) -> Dict[str, Any]:
    """Chart + plan in the same shape the Pre-Release Edge popup uses."""
    from app.services.price_path_service import (standardised_residuals, plan_from_paths, band_table, session_dates,
                                                 entry_advice, touch_probability)
    from app.services.pre_release_edge_service import key_levels
    close = prices["close"].to_numpy(dtype=float)
    res = standardised_residuals(close)
    n = max(1, n)
    paths = simulate_drift(price, res["z"], res["sigma_now"], n, drift_pct, n_post, ex_jump_pct, post_drift_pct)
    origin = max(today, prices.index[-1].date())
    dates = session_dates(origin, n + n_post)
    levels = key_levels(prices)
    hl = (prices["high"] - prices["low"]).iloc[-14:]
    atr_pct = float((hl / prices["close"].iloc[-14:]).mean() * 100) if len(hl) else None
    plan = plan_from_paths(paths, n, levels, atr_pct)

    def when(i):
        return str(dates[i]) if i is not None and 0 <= i < len(dates) else None
    for t in plan["targets"]:
        h = t["hit"]
        t.update(hit_date=when(h["session"]), hit_early=when(h["early"]), hit_late=when(h["late"]))
    plan["stop_hit_date"] = when(plan["stop_hit"]["session"])
    entry = entry_advice(paths, max(1, min(3, n - 1)))
    entry.update(best_date=when(entry["best_session"]), limit_fill_date=when(entry["limit_fill_session"]),
                 deadline_date=when(entry["deadline_session"]), after_results=False)
    for lv in levels:
        lv["touch_prob"] = touch_probability(paths, lv["price"], n)
    recent = prices.iloc[-40:]
    return {
        "as_of": str(origin), "price": round(price, 2), "price_source": price_source,
        "daily_vol_pct": round(res["sigma_now"] * 100, 2),
        "results_index": event_label_index, "exit_index": n, "horizon_sessions": n,
        "exit_date": when(n),
        "history": [{"date": str(i.date()), "close": round(float(v), 2)} for i, v in recent["close"].items()],
        "bands": band_table(paths, dates), "plan": plan, "entry": entry, "levels": levels,
        "results_move_p10_p90": [0, 0], "atr_pct": round(atr_pct, 2) if atr_pct else None,
    }


def sessions_until(today: date, day: date) -> int:
    """Trading sessions strictly after today up to and including `day` (weekdays; holidays not modelled)."""
    if day <= today:
        return 0
    return int(np.busday_count(today + timedelta(days=1), day + timedelta(days=1)))




# ─── Live snapshot (computed on a schedule, held in Redis) ────────────────────
# Kept deliberately simple for the page: one action (BUY / SKIP / AVOID / DONE), a 3-6 word reason,
# the stock's own past record, and a one-line plan.

MIN_SHOW_ADV_CR = 0.5        # below this a stock is not tradable for a swing position - not shown at all
MIN_OWN_N = 4                # own-history BUY needs at least this many past events
MIN_GROUP_HIT = 60           # similar-events BUY: at least 6 of 10 rose ...
MIN_GROUP_MEDIAN = 0.5       # ... and the typical (median) case gained at least this much
MIN_EXPECTED_PCT = 1.0       # the move still expected before the exit must beat costs comfortably


def ist_now() -> datetime:
    return datetime.utcnow() + timedelta(hours=5, minutes=30)


def evidence_col(kind: str, stage: str) -> str:
    if stage == "NOTICE":
        return "ret_notice"
    if stage in ("EX_PASSED", "MEETING_DONE"):
        return "ret_post5"
    return "ret_pre10" if kind in ("RIGHTS", "DEMERGER") else "ret_runup"


def own_record(mine: pd.DataFrame, col: str) -> Dict[str, Any]:
    """This stock's own past moves for the same window, oldest -> newest."""
    if mine is None or mine.empty or col not in mine:
        return {"n": 0, "moves": []}
    sub = mine[mine[col].notna()].sort_values("when")
    moves = [round(float(v), 1) for v in sub[col].tolist()]
    if not moves:
        return {"n": 0, "moves": []}
    return {"n": len(moves), "up": int(sum(1 for v in moves if v > 0)), "mean": round(float(np.mean(moves)), 1), "moves": moves[-8:]}


def decide(stage: str, own: Dict[str, Any], grp: Dict[str, Any], sessions_to: Optional[int],
           adv_cr: Optional[float], moved_pct: Optional[float], own_full: Optional[Dict[str, Any]] = None) -> Tuple[str, str, Optional[str]]:
    """
    (action, short reason, basis). `own` / `grp` are `from_here` results: this stock's past events / similar events,
    seen from today's position (bought the same number of sessions before the key date, sold the session before it).
    """
    if stage in ("EX_PASSED", "MEETING_DONE"):
        return "DONE", "Event done", None
    if sessions_to is None or sessions_to < 2:
        return "SKIP", "Too late - event next session", None
    on, gn = own.get("n", 0), grp.get("n", 0)
    wins = lambda st: int(round((st.get("win") or 0) * st.get("n", 0) / 100))
    if on < MIN_OWN_N and gn < MIN_N:
        return "SKIP", "Too few past cases", None
    ref = own if on >= MIN_OWN_N else grp
    if (ref.get("median") or 0) <= -1.0 and (ref.get("win") or 0) <= 40:
        return "AVOID", f"From here fell {ref['n'] - wins(ref)} of {ref['n']} times", "own" if ref is own else "group"
    if on >= 3 and (own.get("win") or 0) <= 50:
        return "SKIP", f"From here rose only {wins(own)} of {on} times", "own"
    of = own_full or {}
    if of.get("n", 0) >= 4 and of.get("up", 0) / of["n"] <= 0.4:   # this stock usually fell into this event
        return "SKIP", f"This stock rose only {of['up']} of {of['n']} times", "own"
    good_own = on >= MIN_OWN_N and (own.get("win") or 0) >= 75 and (own.get("median") or 0) >= 1.5
    good_grp = (gn >= MIN_N and grp.get("verdict") == "EDGE_UP" and (grp.get("win") or 0) >= MIN_GROUP_HIT
                and (grp.get("median") or 0) >= 1.0)
    if not (good_own or good_grp):
        return "SKIP", "No reliable pattern from here", "own" if ref is own else "group"
    basis = "own" if good_own else "group"
    st = own if good_own else grp
    if (st.get("target_pct") or 0) < MIN_EXPECTED_PCT:
        return "SKIP", "Too little left to gain", basis
    if st.get("stop_pct") is not None and (st.get("target_pct") or 0) < 0.5 * abs(st["stop_pct"]):
        return "SKIP", "Risk too big for the gain", basis
    if adv_cr is not None and adv_cr < MIN_ADV_CR:
        return "SKIP", "Low volume", basis
    if moved_pct is not None and moved_pct >= max(3.0, 2 * (st.get("target_pct") or 0)):
        return "SKIP", f"Already up {moved_pct:.0f}%", basis
    if basis == "own":
        return "BUY", f"From here rose {wins(own)} of {on} times", basis
    return "BUY", f"From here rose in {grp['win']:.0f}% of {gn} cases", basis


def similar_events(ev: pd.DataFrame, kind: str, stage: str, k: Optional[int], ybucket: Optional[str],
                   with_results: Optional[bool]) -> Dict[str, Any]:
    """`from_here` on the most specific group of similar events that still has enough cases."""
    base = ev[ev["kind"] == kind] if not ev.empty else ev
    tries = []
    if kind == "DIVIDEND" and ybucket and stage != "NOTICE":
        if with_results is not None:
            tries.append(base[(base["ybucket"] == ybucket) & (base["with_results"] == with_results)])
        tries.append(base[base["ybucket"] == ybucket])
    if kind == "DIVIDEND" and with_results is not None:
        tries.append(base[base["with_results"] == with_results])
    tries.append(base)
    res = {"n": 0}
    for sub in tries:
        res = from_here(sub, stage, k)
        if res.get("n", 0) >= MIN_N * 1.5:
            return res
    return res


def prev_session(d: date) -> date:
    return pd.Timestamp(np.busday_offset(np.datetime64(d), -1, roll="forward")).date()


def event_text(kind: str, stage: str, subject: str, kinds: List[str], row: Dict[str, Any]) -> str:
    if stage == "NOTICE":
        return "Board meeting: " + ", ".join(KIND_LABEL[k].split(" /")[0] for k in kinds)
    if kind == "DIVIDEND":
        amt, y = row.get("dividend"), row.get("yield_pct")
        return f"Dividend ₹{amt:g}" + (f" · {y:.1f}% yield" if y is not None else "") if amt else "Dividend"
    if kind in ("BONUS", "SPLIT"):
        m = re.search(r"(\d+)\s*:\s*(\d+)", subject or "")
        if kind == "BONUS" and m:
            return f"Bonus {m.group(1)}:{m.group(2)}"
        vals = _AMOUNT.findall((subject or "").lower())
        if kind == "SPLIT" and len(vals) >= 2:
            return f"Split ₹{float(vals[0]):g} → ₹{float(vals[1]):g}"
        return KIND_LABEL[kind]
    if kind == "BUYBACK":
        p, prem = row.get("buyback_price"), row.get("bb_premium_pct")
        return f"Buyback ₹{p:,.0f}" + (f" ({prem:+.0f}% vs price)" if prem is not None else "") if p else "Buyback"
    if kind == "RIGHTS":
        r, p = row.get("rights_ratio"), row.get("rights_price")
        return "Rights issue" + (f" {r}" if r else "") + (f" @ ₹{p:g}" if p else "")
    return KIND_LABEL[kind]


def _pdf_text(nse: NseClient, url: str, max_pages: int = 10) -> str:
    from app.services.catalyst_classifier import pdf_text
    if not url:
        return ""
    try:
        r = nse.session.get(url, timeout=30)
        if r.status_code == 200 and r.content[:4] == b"%PDF":
            return pdf_text(r.content, max_pages=max_pages)
    except Exception:
        pass
    return ""


def buyback_details(nse: NseClient, symbol: str, today: date) -> Dict[str, Any]:
    """Buyback price / method / small-shareholder entitlement from the latest buyback filings (cached 1 day)."""
    from app.worker.observability import get_redis_client
    key = f"impactful:buyback:{symbol}:{today}"
    try:
        cached = get_redis_client().get(key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass
    out: Dict[str, Any] = {"price": None, "method": None, "entitlement": None, "source": None}
    anns = [a for a in nse.announcements(symbol, today - timedelta(days=200), today)
            if "buy" in (a.get("desc") or "").lower() and "back" in (a.get("desc") or "").lower().replace("buyback", "buy back")]
    anns.sort(key=lambda a: parse_nse_datetime(a.get("an_dt")) or datetime.min, reverse=True)
    for a in anns[:4]:
        info = parse_buyback(a.get("attchmntText") or "")
        if not info["price"] or not info["entitlement"]:
            pages = 12 if "offer" in (a.get("desc") or "").lower() else 4
            pdf = parse_buyback(_pdf_text(nse, a.get("attchmntFile"), max_pages=pages))
            info = {k: info.get(k) or pdf.get(k) for k in info}
        for k in ("price", "method", "entitlement"):
            if out[k] is None and info.get(k) is not None:
                out[k] = info[k]
                out["source"] = out["source"] or a.get("attchmntFile")
        if out["price"] and out["entitlement"] and out["method"]:
            break
    try:
        get_redis_client().setex(key, 86400, json.dumps(out))
    except Exception:
        pass
    return out


class SnapshotBuilder:
    def __init__(self, db, nse: Optional[NseClient] = None):
        self.db = db
        self.svc = CorporateActionsService(db, nse)
        self.nse = self.svc.nse
        self._prices: Dict[str, pd.DataFrame] = {}

    def prices(self, symbol: str) -> pd.DataFrame:
        if symbol not in self._prices:
            try:
                self._prices[symbol] = self.svc.events.load_prices(symbol)
            except Exception:
                self._prices[symbol] = pd.DataFrame()
        return self._prices[symbol]

    def build(self, limit: Optional[int] = None) -> Dict[str, Any]:
        from app.infrastructure.models import Company
        from app.services.pre_release_edge_service import live_price
        now = ist_now()
        today = now.date()
        ev = evidence_frame(self.db)
        acts = self.svc.actions(today - timedelta(days=LIVE_PAST_DAYS), today + timedelta(days=LIVE_AHEAD_DAYS))
        bms = self.svc.board_meetings(today - timedelta(days=150), today + timedelta(days=90))
        cal = self.svc.calendar()
        companies = {c.ticker: c for c in self.db.query(Company).all()}

        # one entry per (symbol, meeting date): NSE lists the same meeting several times (intimation, revision...)
        meetings: Dict[str, Dict[date, Dict[str, Any]]] = {}
        for m in bms:
            sym = (m.get("bm_symbol") or "").strip()
            for mm in CorporateActionsService.meetings_from([m]):
                prev = meetings.setdefault(sym, {}).get(mm["date"])
                if prev:   # merge purposes, keep the earliest notice
                    prev["kinds"] = sorted(set(prev["kinds"]) | set(mm["kinds"]), key=KIND_PRIORITY.index)
                    prev["with_results"] = prev["with_results"] or mm["with_results"]
                    if mm["notice"] and (prev["notice"] is None or mm["notice"] < prev["notice"]):
                        prev["notice"] = mm["notice"]
                else:
                    meetings[sym][mm["date"]] = mm
        for c in cal:
            sym = (c.get("symbol") or "").strip()
            md = parse_day(c.get("date"))
            if not sym or not md or md in meetings.get(sym, {}):
                continue
            text = f"{c.get('purpose') or ''} {c.get('bm_desc') or ''}"
            meetings.setdefault(sym, {})[md] = {"date": md, "notice": None, "text": text, "purpose": (c.get("purpose") or "").strip(),
                                                "kinds": purpose_kinds(text), "with_results": "result" in text.lower()}

        raw_items: Dict[str, Dict[str, Any]] = {}
        declared = set()
        for a in acts:
            sym = (a.get("symbol") or "").strip()
            subj = (a.get("subject") or "").strip()
            kind = action_kind(subj)
            ex = parse_day(a.get("exDate"))
            if not kind or not ex or sym not in companies:
                continue
            key = f"{sym}|{kind}|{ex}"
            if key in raw_items:
                continue
            m = CorporateActionsService.match_meeting(list(meetings.get(sym, {}).values()), kind, ex)
            raw_items[key] = {"symbol": sym, "kind": kind, "kinds": [kind], "stage": "DECLARED" if ex > today else "EX_PASSED",
                              "subject": subj, "ex": ex, "record": parse_day(a.get("recDate")), "meeting": m,
                              "face": float(a["faceVal"]) if str(a.get("faceVal") or "").replace(".", "", 1).isdigit() else None}
            declared.add((sym, kind))
        for sym, ms in meetings.items():
            if sym not in companies:
                continue
            for m in ms.values():
                lk = lead_kind(m["kinds"])
                if not lk:
                    continue
                key = f"{sym}|{lk}|{m['date']}"
                if key in raw_items:
                    continue
                if m["date"] >= today:
                    if (sym, lk) in declared and lk != "DIVIDEND":
                        continue
                    raw_items[key] = {"symbol": sym, "kind": lk, "kinds": m["kinds"], "stage": "NOTICE", "subject": m["purpose"] or m["text"][:120],
                                      "ex": None, "record": None, "meeting": m, "face": None}
                elif lk == "FUNDRAISE" and (today - m["date"]).days <= LIVE_PAST_DAYS:
                    raw_items[key] = {"symbol": sym, "kind": "FUNDRAISE", "kinds": m["kinds"], "stage": "MEETING_DONE",
                                      "subject": m["purpose"] or m["text"][:120], "ex": None, "record": None, "meeting": m, "face": None}
        todo = list(raw_items.values())[:limit] if limit else list(raw_items.values())

        items = []
        for it in todo:
            try:
                row = self.item(it, companies[it["symbol"]], ev, today, now, live_price)
                if row:
                    items.append(row)
            except Exception as e:  # one bad row must never kill the page
                import logging
                logging.getLogger(__name__).warning(f"impactful item {it['symbol']} {it['kind']}: {e}")
        order = {"BUY": 0, "SKIP": 1, "AVOID": 1, "DONE": 3}
        items.sort(key=lambda r: (order.get(r["action"], 9), r["days_to"] if r.get("days_to") is not None and r["days_to"] >= 0 else 999, r["ticker"]))
        tabs: Dict[str, Dict[str, int]] = {}
        for r in items:
            for tab in {r["tab"]} | ({"early"} if r["stage"] == "NOTICE" and r["action"] == "BUY" else set()):   # Early Radar = BUY notices only
                t = tabs.setdefault(tab, {"total": 0, "buy": 0})
                t["total"] += 1
                t["buy"] += r["action"] == "BUY"
        return {"built_at": now.strftime("%Y-%m-%d %H:%M IST"), "evidence_events": int(len(ev)), "tabs": tabs, "items": items}

    def item(self, it: Dict[str, Any], company, ev: pd.DataFrame, today: date, now: datetime, live_price_fn) -> Optional[Dict[str, Any]]:
        sym, kind, stage = it["symbol"], it["kind"], it["stage"]
        m = it["meeting"]
        ex, meeting = it["ex"], (m["date"] if m else None)
        raw = self.prices(sym)
        if raw is None or raw.empty or len(raw) < 60:
            return None
        splits = [(ex, split_factor(kind, it["subject"]))] if ex and kind in ("BONUS", "SPLIT") else []
        prices, _ = adjust_for_splits(raw, splits)
        w = Windows(prices)
        adv = w.adv_cr(len(w.idx))
        if adv is not None and adv < MIN_SHOW_ADV_CR:
            return None
        lp = live_price_fn(self.db, sym)
        price = float(lp) if lp else float(raw["close"].iloc[-1])

        # how much it already moved since the news (declaration, or the meeting notice)
        anchor = None
        if stage in ("DECLARED", "EX_PASSED") and meeting and meeting <= today:
            anchor = w.pos(meeting, "after")
            anchor = anchor + 1 if anchor is not None and anchor + 1 < len(w.idx) else anchor
        elif stage == "NOTICE" and m and m.get("notice"):
            anchor = w.notice_entry(m["notice"])
        moved_pct = w.ar(anchor, len(w.idx) - 1) if anchor is not None and anchor < len(w.idx) - 1 else None

        target_day = ex if stage == "DECLARED" else meeting if stage == "NOTICE" else None
        sessions_to = sessions_until(today, target_day) if target_day else None
        sessions_to_exit = (sessions_to - 1) if sessions_to is not None else None
        ref_day = target_day or ex or meeting

        row: Dict[str, Any] = {
            "key": f"{sym}|{kind}|{ex or meeting}", "ticker": sym, "name": company.name, "company_id": str(company.id),
            "tab": TAB_OF[kind], "kind": kind, "kind_label": KIND_LABEL[kind], "stage": stage, "subject": it["subject"],
            "meeting_date": str(meeting) if meeting else None, "with_results": bool(m and m["with_results"]),
            "notice_at": m["notice"].strftime("%Y-%m-%d %H:%M") if m and m.get("notice") else None,
            "is_new": bool(m and m.get("notice") and now - m["notice"] <= timedelta(hours=24)),
            "ex_date": str(ex) if ex else None, "record_date": str(it["record"]) if it["record"] else None,
            "days_to": (ref_day - today).days if ref_day else None, "sessions_to_exit": sessions_to_exit,
            "price": round(price, 2), "adv_cr": adv, "moved_pct": moved_pct,
        }
        mine = ev[(ev["ticker"] == sym) & (ev["kind"] == kind)] if not ev.empty else ev
        ybucket = None
        if kind == "DIVIDEND":
            amt = dividend_amount(it["subject"]) if stage != "NOTICE" else None
            yld = round(amt / price * 100, 2) if amt and price else None
            surprise = None
            if stage != "NOTICE" and amt and not mine.empty and ex:
                cur = dividend_parts(it["subject"])["regular"]
                prev = mine[(mine["when"] <= pd.Timestamp(ex - timedelta(days=300))) & (mine["when"] >= pd.Timestamp(ex - timedelta(days=430)))]
                prev = prev[prev["subject"].map(regular_type) == regular_type(it["subject"])]
                if cur > 0 and not prev.empty:
                    p_amt = dividend_parts(prev.sort_values("when")["subject"].iloc[-1])["regular"]
                    fac = ev[(ev["ticker"] == sym) & ev["kind"].isin(["BONUS", "SPLIT"]) & (ev["when"] > prev["when"].max()) &
                             (ev["when"] <= pd.Timestamp(ex))]["split_factor"].dropna()
                    p_amt /= float(np.prod(fac)) if len(fac) else 1.0
                    surprise = round((cur / p_amt - 1) * 100, 0) if p_amt > 0 else None
            ybucket = yield_bucket(yld)
            row.update(dividend=amt, yield_pct=yld, surprise_pct=surprise)
        if kind in ("BONUS", "SPLIT"):
            row["factor"] = split_factor(kind, it["subject"])
        if kind == "RIGHTS" and stage != "NOTICE":
            terms = rights_terms(it["subject"], it["face"])
            tp = terp(price, terms["new"], terms["held"], terms["issue_price"])
            row.update(rights_ratio=f"{int(terms['new'])}:{int(terms['held'])}" if terms["new"] and terms["held"] else None,
                       rights_price=terms["issue_price"],
                       rights_discount_pct=round((1 - terms["issue_price"] / price) * 100, 0) if terms["issue_price"] and price else None,
                       terp_drop_pct=round((tp / price - 1) * 100, 1) if tp else None)
        if kind == "BUYBACK" and stage != "NOTICE":
            bb = buyback_details(self.nse, sym, today)
            exday = group_stat(ev[ev["kind"] == "BUYBACK"], "ret_exday") if not ev.empty else {}
            post_move = exday.get("mean") if exday.get("n", 0) >= 8 else -2.0
            row.update(buyback_price=bb["price"], buyback_method=bb["method"], entitlement=bb["entitlement"],
                       **{f"bb_{k}": v for k, v in buyback_math(price, bb["price"], bb["entitlement"], post_move).items()})

        col = evidence_col(kind, stage)
        own = own_record(mine, col)                                  # whole window (Past record column)
        key_day = ex if stage == "DECLARED" else meeting if stage == "NOTICE" else None
        fh_own = from_here(mine, stage, sessions_to) if key_day else {"n": 0}
        fh_grp = similar_events(ev, kind, stage, sessions_to, ybucket, row["with_results"] if kind == "DIVIDEND" else None) \
            if key_day and not ev.empty else {"n": 0}
        action, why, basis = decide(stage, fh_own, fh_grp, sessions_to, adv, moved_pct, own)
        group = pick_evidence(ev, kind, col, ybucket, row["with_results"] if kind == "DIVIDEND" else None) if not ev.empty else {"n": 0}
        row.update(action=action, why=why, basis=basis, own=own,
                   group={k: group.get(k) for k in ("n", "mean", "median", "hit", "verdict")},
                   what=event_text(kind, stage, it["subject"], it.get("kinds") or [kind], row))
        # "If you buy today": always shown for upcoming events that have history from this point
        ref = fh_own if (basis == "own" or (basis is None and fh_own.get("n", 0) >= MIN_OWN_N)) else fh_grp
        if key_day and ref.get("n", 0) > 0 and sessions_to and sessions_to >= 2:
            row["now"] = {
                "basis": "own" if ref is fh_own else "group", "n": ref["n"], "win": ref["win"],
                "wins": int(round(ref["win"] * ref["n"] / 100)), "median": ref["median"], "best_pct": ref["best_pct"],
                "entry": round(price, 2), "target": round(price * (1 + ref["target_pct"] / 100), 2), "target_pct": ref["target_pct"],
                "target_hit": ref["target_hit"], "stretch": round(price * (1 + ref["stretch_pct"] / 100), 2), "stretch_pct": ref["stretch_pct"],
                "stop": round(price * (1 + ref["stop_pct"] / 100), 2), "stop_pct": ref["stop_pct"],
                "sell_by": str(prev_session(key_day)), "moves": ref["moves"], "peaks": ref["peaks"],
            }
        if stage == "EX_PASSED" and ex:
            pe = w.pos(ex, "after")
            if pe is not None and pe < len(w.idx):
                row["result_pct"] = w.ar(anchor, pe - 1) if anchor is not None and pe - 1 > anchor else None   # news -> day before ex
                row["after_ex_pct"] = w.ar(pe - 1, len(w.idx) - 1)
        return row

    def path_for(self, row: Dict[str, Any], prices: pd.DataFrame, price: float, today: date) -> Optional[Dict[str, Any]]:
        now = row.get("now")
        if not now:
            return None
        n = max(1, (row["sessions_to_exit"] or 1))
        path = build_plan_path(prices, price, "live", today, n, now["median"], n, 0)
        plan = path["plan"]
        t, st = now["target"], now["stop"]
        plan["targets"] = [
            {"name": "Target", "price": t, "pct": now["target_pct"], "touch_prob": now["target_hit"] / 100, "hit_date": None, "hit_early": None, "hit_late": None},
            {"name": "Stretch", "price": now["stretch"], "pct": now["stretch_pct"], "touch_prob": 0.3, "hit_date": None, "hit_early": None, "hit_late": None}]
        plan.update(stop=st, stop_pct=now["stop_pct"], stop_touch_prob=0.2,
                    stop_basis="only ~20% of past cases dipped below this before the sell-by date",
                    reward_risk=round((t - price) / (price - st), 2) if price > st else None)
        path["entry"] = None
        path["levels"] = []
        return path


def save_snapshot(snap: Dict[str, Any]) -> None:
    from app.worker.observability import get_redis_client
    get_redis_client().set(SNAPSHOT_KEY, json.dumps(snap, default=str))


def load_snapshot() -> Optional[Dict[str, Any]]:
    from app.worker.observability import get_redis_client
    try:
        raw = get_redis_client().get(SNAPSHOT_KEY)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def event_detail(db, key: str) -> Optional[Dict[str, Any]]:
    """Popup: the live row, this stock's past events of the same kind (plain % moves) and, for BUYs, the price chart."""
    snap = load_snapshot()
    row = next((r for r in (snap or {}).get("items", []) if r["key"] == key), None)
    if row is None:
        return None
    from app.infrastructure.models import CorporateActionEvent as E
    col = evidence_col(row["kind"], row["stage"] if row["stage"] != "EX_PASSED" else "DECLARED")
    past = db.query(E).filter(E.ticker == row["ticker"], E.kind == row["kind"]).order_by(E.ex_date.desc().nullslast(), E.meeting_date.desc()).limit(10).all()
    k = (row.get("sessions_to_exit") or 0) + 1
    stage = row["stage"]
    history = []
    for p in past:
        fh = from_here(pd.DataFrame([{"pex": decode_path(p.path_ex), "pmt": decode_path(p.path_mtg), "when": p.ex_date or p.meeting_date,
                                      "sessions_decl_to_ex": p.sessions_decl_to_ex, "sessions_notice_to_mtg": p.sessions_notice_to_mtg}]),
                       stage, k) if stage in ("NOTICE", "DECLARED") else {"n": 0}
        history.append({"date": str((p.ex_date or p.meeting_date).date()) if (p.ex_date or p.meeting_date) else None, "subject": p.subject,
                        "yield_pct": p.yield_pct, "move": getattr(p, col),
                        "from_here": fh["moves"][0] if fh.get("n") else None, "best": fh["peaks"][0] if fh.get("n") else None})
    out: Dict[str, Any] = {"row": row, "history": history, "window": WINDOWS.get(col, ""), "k": k}
    if row.get("now"):
        b = SnapshotBuilder(db)
        raw = b.prices(row["ticker"])
        if raw is not None and len(raw) >= 60:
            splits = [(date.fromisoformat(row["ex_date"]), row.get("factor"))] if row.get("factor") and row.get("ex_date") else []
            prices, _ = adjust_for_splits(raw, splits)
            path = b.path_for(row, prices, row["price"], ist_now().date())
            if path:
                path["event_label"] = "SELL"   # exit day: the session before the ex-date / meeting
                out["path"] = path
    return out
