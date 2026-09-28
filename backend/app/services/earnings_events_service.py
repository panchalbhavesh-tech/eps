"""
Earnings Events Service
=======================
Builds the historical results-event dataset that powers the Pre-Release Edge engine.

For every NSE-listed company it:
  1. Pulls historical results board-meeting dates (NSE event calendar) and the exact
     exchange broadcast timestamp (NSE corporate announcements / financial-results filings).
  2. Classifies each announcement into the trading session it fell in (PRE / MARKET / POST),
     which decides which close is the last "clean" pre-information price (the baseline).
  3. Runs a market-model event study (beta vs Nifty 50) around the baseline:
     pre-release run-up, gap, 1/3/5/10/20/30-day raw and abnormal returns.
  4. Snapshots point-in-time price/volume/regime features at two decision points
     (run-up entry = baseline-5 sessions, hold-through entry = baseline), using only
     data available at that moment.

All returns are expressed in percent.
"""
import json
import math
import re
import time
import logging
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MARKET_OPEN = (9, 15)
MARKET_CLOSE = (15, 30)
RUNUP_OFFSETS = (3, 5, 7, 10)
POST_HORIZONS = (1, 3, 5, 10, 20, 30)
BETA_WINDOW = 250
MIN_HISTORY_BARS = 60
RESULT_KEYWORDS = ("financial result", "quarterly result", "audited result", "unaudited result")
ANNOUNCEMENTS_FROM = date(2024, 10, 1)
RESULT_ANNOUNCEMENT_DESCS = ("outcome of board meeting", "financial result updates", "financial results", "integrated filing")


# ─── NSE client ────────────────────────────────────────────────────────────────

class NseClient:
    """Cookie-warmed, rate-limited NSE JSON client (NSE blocks plain HTTP clients)."""

    BASE = "https://www.nseindia.com"

    def __init__(self, min_interval: float = 0.35):
        from curl_cffi import requests as curl_requests
        self._curl = curl_requests
        self.min_interval = min_interval
        self._last_call = 0.0
        self._calls_since_warm = 0
        self._new_session()

    def _new_session(self):
        self.session = self._curl.Session(impersonate="chrome110")
        self.session.headers.update({
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.nseindia.com/",
        })
        try:
            self.session.get(self.BASE, timeout=15)
        except Exception as e:
            logger.warning(f"NSE session warm-up failed: {e}")
        self._calls_since_warm = 0

    def get_json(self, path: str, retries: int = 2) -> Any:
        for attempt in range(retries + 1):
            wait = self.min_interval - (time.time() - self._last_call)
            if wait > 0:
                time.sleep(wait)
            if self._calls_since_warm >= 150:
                self._new_session()
            try:
                self._last_call = time.time()
                self._calls_since_warm += 1
                r = self.session.get(f"{self.BASE}{path}", timeout=25)
                if r.status_code in (401, 403):
                    self._new_session()
                    continue
                if r.status_code != 200:
                    return None
                return r.json()
            except Exception as e:
                logger.warning(f"NSE GET {path} failed (attempt {attempt + 1}): {e}")
                time.sleep(1.5 * (attempt + 1))
                self._new_session()
        return None

    def event_calendar(self, symbol: str, from_d: date, to_d: date) -> List[dict]:
        path = f"/api/event-calendar?index=equities&symbol={symbol}&from_date={from_d:%d-%m-%Y}&to_date={to_d:%d-%m-%Y}"
        data = self.get_json(path)
        return data if isinstance(data, list) else []

    def announcements(self, symbol: str, from_d: date, to_d: date) -> List[dict]:
        path = f"/api/corporate-announcements?index=equities&symbol={symbol}&from_date={from_d:%d-%m-%Y}&to_date={to_d:%d-%m-%Y}"
        data = self.get_json(path)
        return data if isinstance(data, list) else []

    def financial_results(self, symbol: str) -> List[dict]:
        data = self.get_json(f"/api/corporates-financial-results?index=equities&symbol={symbol}&period=Quarterly")
        return data if isinstance(data, list) else []

    def option_contract_info(self, symbol: str) -> dict:
        data = self.get_json(f"/api/option-chain-contract-info?symbol={symbol}")
        return data if isinstance(data, dict) else {}

    def option_chain(self, symbol: str, expiry: str) -> dict:
        data = self.get_json(f"/api/option-chain-v3?type=Equity&symbol={symbol}&expiry={expiry}")
        return data if isinstance(data, dict) else {}


def fetch_industry_map() -> Dict[str, str]:
    """Symbol -> NSE industry from the Nifty Total Market constituents (~750 stocks)."""
    from curl_cffi import requests as curl_requests
    import csv
    import io
    urls = [
        "https://niftyindices.com/IndexConstituent/ind_niftytotalmarket_list.csv",
        "https://nsearchives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv",
    ]
    for url in urls:
        try:
            r = curl_requests.get(url, impersonate="chrome110", timeout=25)
            if r.status_code == 200 and "Industry" in r.text[:200]:
                rows = csv.DictReader(io.StringIO(r.text))
                return {row["Symbol"].strip(): row["Industry"].strip() for row in rows if row.get("Symbol") and row.get("Industry")}
        except Exception as e:
            logger.warning(f"Industry map fetch failed from {url}: {e}")
    return {}


# ─── Pure helpers (unit-tested) ────────────────────────────────────────────────

def classify_session(ts: Optional[datetime]) -> str:
    """Trading session (IST) in which an exchange broadcast landed."""
    if ts is None:
        return "UNKNOWN"
    hm = (ts.hour, ts.minute)
    if hm < MARKET_OPEN:
        return "PRE"
    if hm <= MARKET_CLOSE:
        return "MARKET"
    return "POST"


def parse_nse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    value = str(value).strip()
    for fmt in ("%d-%b-%Y %H:%M:%S", "%d-%b-%Y %H:%M", "%d-%b-%Y"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def is_results_purpose(purpose: str) -> bool:
    p = (purpose or "").lower()
    return any(k in p for k in RESULT_KEYWORDS)


def normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    out = df.copy()
    out.columns = [str(c).lower() for c in out.columns]
    if "close" not in out.columns:
        return pd.DataFrame()
    out.index = pd.to_datetime(out.index)
    if out.index.tz is not None:
        out.index = out.index.tz_localize(None)
    out.index = out.index.normalize()
    out = out[~out.index.duplicated(keep="last")].sort_index()
    for col in ("open", "high", "low", "volume"):
        if col not in out.columns:
            out[col] = out["close"] if col != "volume" else 0.0
    out = out[["open", "high", "low", "close", "volume"]].astype(float)
    return out[out["close"] > 0]


def align_benchmark(bench: pd.DataFrame, index: pd.DatetimeIndex) -> np.ndarray:
    """Benchmark closes on the stock's trading calendar (forward-filled)."""
    if bench is None or bench.empty:
        return np.full(len(index), np.nan)
    return bench["close"].reindex(bench.index.union(index)).ffill().reindex(index).to_numpy(dtype=float)


def locate_baseline(index: pd.DatetimeIndex, event_date: date, session: str) -> Optional[int]:
    """Position of the last close that did NOT yet contain the results information."""
    ev = pd.Timestamp(event_date)
    if session == "POST":
        pos = index.searchsorted(ev, side="right") - 1   # close of the announcement day
    else:
        pos = index.searchsorted(ev, side="left") - 1    # close of the previous session
    return int(pos) if pos >= 0 else None


def _pct(a: float, b: float) -> float:
    if a is None or b is None or not np.isfinite(a) or not np.isfinite(b) or b <= 0:
        return float("nan")
    return (a / b - 1.0) * 100.0


def estimate_beta(close: np.ndarray, bench: np.ndarray, end: int, window: int = BETA_WINDOW) -> float:
    start = max(1, end - window)
    if end - start < 40:
        return 1.0
    s = np.diff(close[start - 1:end + 1]) / close[start - 1:end]
    m = np.diff(bench[start - 1:end + 1]) / bench[start - 1:end]
    mask = np.isfinite(s) & np.isfinite(m)
    if mask.sum() < 40:
        return 1.0
    var = np.var(m[mask])
    if var <= 0:
        return 1.0
    beta = np.cov(s[mask], m[mask])[0, 1] / var
    return float(np.clip(beta, 0.2, 2.5))


def abnormal_return(close: np.ndarray, bench: np.ndarray, beta: float, i_from: int, i_to: int) -> float:
    if i_from < 0 or i_to >= len(close) or i_from >= i_to:
        return float("nan")
    raw = _pct(close[i_to], close[i_from])
    mkt = _pct(bench[i_to], bench[i_from])
    if not np.isfinite(mkt):
        return raw
    return raw - beta * mkt


def stock_features(df: pd.DataFrame, bench: np.ndarray, vix: np.ndarray, i: int) -> Dict[str, Optional[float]]:
    """Point-in-time price/volume/regime features using bars [0..i] only."""
    c = df["close"].to_numpy(dtype=float)
    h = df["high"].to_numpy(dtype=float)
    lo = df["low"].to_numpy(dtype=float)
    v = df["volume"].to_numpy(dtype=float)
    if i < MIN_HISTORY_BARS or i >= len(c):
        return {}
    beta = estimate_beta(c, bench, i)
    f: Dict[str, float] = {"beta": beta}
    for k in (5, 20, 60):
        f[f"abn_ret_{k}"] = abnormal_return(c, bench, beta, i - k, i) if i - k >= 0 else float("nan")

    diffs = np.diff(c[max(0, i - 100):i + 1])
    if len(diffs) >= 14:
        gains = pd.Series(np.clip(diffs, 0, None)).ewm(alpha=1 / 14, adjust=False).mean().iloc[-1]
        losses = pd.Series(np.clip(-diffs, 0, None)).ewm(alpha=1 / 14, adjust=False).mean().iloc[-1]
        f["rsi_14"] = 100.0 if losses == 0 else 100.0 - 100.0 / (1.0 + gains / losses)

    hi_window = h[max(0, i - 249):i + 1]
    f["dist_52w_high"] = _pct(c[i], np.nanmax(hi_window))
    f["ma50_dist"] = _pct(c[i], np.nanmean(c[i - 49:i + 1]))

    recent_vol = np.nanmean(v[i - 4:i + 1])
    base_vol = np.nanmean(v[i - 24:i - 4])
    f["vol_ratio"] = recent_vol / base_vol if base_vol and base_vol > 0 else float("nan")

    prev_c = c[i - 14:i]
    tr = np.maximum.reduce([h[i - 13:i + 1] - lo[i - 13:i + 1], np.abs(h[i - 13:i + 1] - prev_c), np.abs(lo[i - 13:i + 1] - prev_c)])
    f["atr_pct"] = float(np.nanmean(tr) / c[i] * 100.0)
    dret = np.diff(c[i - 20:i + 1]) / c[i - 20:i]
    f["rv_20"] = float(np.nanstd(dret) * math.sqrt(252) * 100.0)
    f["log_turnover"] = float(math.log10(np.nanmean(c[i - 19:i + 1] * v[i - 19:i + 1]) + 1.0))

    if np.isfinite(bench[i]):
        f["nifty_ret_20"] = _pct(bench[i], bench[i - 20])
        f["nifty_above_50dma"] = 1.0 if bench[i] > np.nanmean(bench[i - 49:i + 1]) else 0.0
    if vix is not None and np.isfinite(vix[i]):
        f["vix_level"] = float(vix[i])
        f["vix_chg_5"] = _pct(vix[i], vix[i - 5])
    return {k: (round(float(val), 4) if val is not None and np.isfinite(val) else None) for k, val in f.items()}


def compute_event_study(df: pd.DataFrame, bench: np.ndarray, vix: np.ndarray, event_date: date, session: str) -> Optional[Dict[str, Any]]:
    """Market-model event study around one results announcement."""
    if df.empty:
        return None
    b = locate_baseline(df.index, event_date, session)
    if b is None or b < MIN_HISTORY_BARS:
        return None
    c = df["close"].to_numpy(dtype=float)
    o = df["open"].to_numpy(dtype=float)
    h = df["high"].to_numpy(dtype=float)
    lo = df["low"].to_numpy(dtype=float)
    v = df["volume"].to_numpy(dtype=float)
    n = len(c)
    beta = estimate_beta(c, bench, b)

    res: Dict[str, Any] = {
        "baseline_idx": b,
        "baseline_date": df.index[b].to_pydatetime(),
        "beta": beta,
        "prev_close": c[b],
        "complete": b + 5 < n,
    }
    for k in RUNUP_OFFSETS:
        res[f"runup_ar_{k}d"] = abnormal_return(c, bench, beta, b - k, b)
    base_vol = np.nanmean(v[b - 24:b - 4])
    res["pre_volume_ratio"] = float(np.nanmean(v[b - 4:b + 1]) / base_vol) if base_vol and base_vol > 0 else None

    r = b + 1
    if r < n:
        res.update({
            "open_price": o[r], "high_price": h[r], "low_price": lo[r], "close_price": c[r],
            "gap_pct": _pct(o[r], c[b]),
            "intraday_pct": _pct(c[r], o[r]),
            "volume_change_pct": _pct(v[r], np.nanmean(v[b - 19:b + 1])),
        })
        end = min(b + 5, n - 1)
        res["max_gain"] = _pct(np.nanmax(h[r:end + 1]), c[b])
        res["max_drawdown"] = _pct(np.nanmin(lo[r:end + 1]), c[b])
    for k in POST_HORIZONS:
        if b + k < n:
            res[f"ret_{k}d"] = _pct(c[b + k], c[b])
            res[f"ar_{k}d"] = abnormal_return(c, bench, beta, b, b + k)

    features = {
        "runup": stock_features(df, bench, vix, b - 5) if b - 5 >= MIN_HISTORY_BARS else {},
        "reaction": stock_features(df, bench, vix, b),
    }
    res["features"] = features
    return {k: (None if isinstance(val, float) and not np.isfinite(val) else val) for k, val in res.items()}


def match_broadcast_time(event_date: date, stamps: List[Tuple[datetime, str]]) -> Optional[datetime]:
    """Earliest results-related broadcast on the meeting day (or just after midnight)."""
    same_day = [ts for ts, _ in stamps if ts.date() == event_date]
    if same_day:
        return min(same_day)
    next_morning = [ts for ts, _ in stamps if ts.date() == event_date + timedelta(days=1) and ts.hour < 6]
    if next_morning:
        # Filed after midnight: information reached the market after the meeting-day close.
        return datetime.combine(event_date, datetime.min.time()).replace(hour=23, minute=59)
    return None


def summarize_events(studies: List[Dict[str, Any]], last_n: int = 8) -> Dict[str, Optional[float]]:
    """Historical reaction stats used for the Events grid (probability of a positive 3-day abnormal reaction)."""
    done = [s for s in studies if s.get("ar_3d") is not None]
    done.sort(key=lambda s: s["baseline_date"])
    recent = done[-last_n:]
    if len(recent) < 2:
        return {"momentum_probability": None, "avg_post_earnings_momentum": None}
    vals = [s["ar_3d"] for s in recent]
    return {
        "momentum_probability": round(100.0 * sum(1 for x in vals if x > 0) / len(vals), 1),
        "avg_post_earnings_momentum": round(float(np.mean(vals)), 2),
    }


# ─── Service ───────────────────────────────────────────────────────────────────

class EarningsEventsService:
    HISTORY_YEARS = 4

    def __init__(self, db, nse: Optional[NseClient] = None):
        from app.services.data.data_manager import UnifiedDataManager
        self.db = db
        self.nse = nse or NseClient()
        self.dm = UnifiedDataManager(db)
        self._bench: Optional[pd.DataFrame] = None
        self._vix: Optional[pd.DataFrame] = None
        self._industry: Optional[Dict[str, str]] = None

    # Shared market series
    def benchmark(self) -> pd.DataFrame:
        if self._bench is None:
            self._bench = normalize_ohlcv(self.dm.get_ohlcv("^NSEI", days=365 * (self.HISTORY_YEARS + 2), use_cache=True))
        return self._bench

    def vix(self) -> pd.DataFrame:
        if self._vix is None:
            self._vix = normalize_ohlcv(self.dm.get_ohlcv("^INDIAVIX", days=365 * (self.HISTORY_YEARS + 2), use_cache=True))
        return self._vix

    def industry_map(self) -> Dict[str, str]:
        if self._industry is None:
            self._industry = fetch_industry_map()
        return self._industry

    def load_prices(self, ticker: str) -> pd.DataFrame:
        return normalize_ohlcv(self.dm.get_ohlcv(ticker, days=365 * (self.HISTORY_YEARS + 1)))

    # Historical event discovery
    def discover_events(self, symbol: str) -> List[Dict[str, Any]]:
        today = datetime.utcnow().date()
        start = today - timedelta(days=365 * self.HISTORY_YEARS)
        dates = set()
        for item in self.nse.event_calendar(symbol, start, today):
            if is_results_purpose(item.get("purpose", "")):
                d = parse_nse_datetime(item.get("date"))
                if d and d.date() <= today:
                    dates.add(d.date())

        stamps: List[Tuple[datetime, str]] = []
        # Broadcast times up to Jan-2025 come from the financial-results filings feed below; newer filings
        # (NSE integrated filing era) only appear in announcements. Pulled in yearly windows so busy filers
        # are not truncated.
        window_start = max(start, ANNOUNCEMENTS_FROM)
        while window_start < today:
            window_end = min(today, window_start + timedelta(days=365))
            for a in self.nse.announcements(symbol, window_start, window_end):
                desc = (a.get("desc") or "").lower()
                text = (a.get("attchmntText") or "").lower()
                if desc.startswith(RESULT_ANNOUNCEMENT_DESCS) and ("result" in text or "result" in desc):
                    ts = parse_nse_datetime(a.get("an_dt"))
                    if ts:
                        stamps.append((ts, "NSE_ANNOUNCEMENT"))
            window_start = window_end + timedelta(days=1)
        for fr in self.nse.financial_results(symbol):
            ts = parse_nse_datetime(fr.get("broadCastDate"))
            if ts and ts.date() >= start:
                stamps.append((ts, "NSE_FINANCIAL_RESULTS"))
                # Filings-only history (no calendar row) still counts as an event.
                if not any(abs((ts.date() - d).days) <= 1 for d in dates):
                    dates.add(ts.date())

        events = []
        for d in sorted(dates):
            ts = match_broadcast_time(d, stamps)
            events.append({
                "event_date": d,
                "announced_at": ts,
                "session": classify_session(ts),
                "source": "NSE_CALENDAR+BROADCAST" if ts else "NSE_CALENDAR",
            })
        return events

    def _upsert_report(self, company, ev: Dict[str, Any]):
        from app.infrastructure.models import EarningsReport
        d = ev["event_date"]
        lo = datetime.combine(d - timedelta(days=3), datetime.min.time())
        hi = datetime.combine(d + timedelta(days=3), datetime.max.time())
        report = self.db.query(EarningsReport).filter(
            EarningsReport.company_id == company.id,
            EarningsReport.report_date >= lo,
            EarningsReport.report_date <= hi,
        ).first()
        if report is None:
            report_dt = datetime.combine(d, datetime.min.time())
            report = EarningsReport(
                company_id=company.id,
                fiscal_quarter=f"Q{(report_dt.month - 1) // 3 + 1} {report_dt.year}",
                report_date=report_dt,
            )
            self.db.add(report)
            self.db.flush()
        report.announced_at = ev.get("announced_at")
        report.announcement_session = ev.get("session")
        report.date_source = ev.get("source")
        return report

    def _upsert_study(self, company, report, ev: Dict[str, Any], study: Dict[str, Any]):
        from app.infrastructure.models import EventStudyResult
        row = self.db.query(EventStudyResult).filter(EventStudyResult.earnings_report_id == report.id).first()
        if row is None:
            row = EventStudyResult(company_id=company.id, earnings_report_id=report.id,
                                   report_date=datetime.combine(ev["event_date"], datetime.min.time()))
            self.db.add(row)
        row.announcement_session = ev.get("session")
        for field in ("baseline_date", "beta", "prev_close", "open_price", "high_price", "low_price", "close_price",
                      "gap_pct", "intraday_pct", "volume_change_pct", "max_gain", "max_drawdown", "pre_volume_ratio",
                      "runup_ar_3d", "runup_ar_5d", "runup_ar_7d", "runup_ar_10d",
                      "ret_1d", "ret_3d", "ret_5d", "ret_10d", "ret_20d", "ret_30d",
                      "ar_1d", "ar_3d", "ar_5d", "ar_10d", "ar_30d"):
            val = study.get(field)
            setattr(row, field, round(float(val), 4) if isinstance(val, (float, np.floating)) else val)
        row.features_json = json.dumps(study.get("features") or {})
        return row

    def backfill_company(self, company) -> Dict[str, Any]:
        symbol = company.ticker
        if symbol.endswith((".BO", ".NS")) or symbol.isdigit():
            return {"ticker": symbol, "status": "SKIPPED_NON_NSE"}

        industry = self.industry_map().get(symbol)
        if industry:
            company.industry = industry

        events = self.discover_events(symbol)
        if not events:
            self.db.commit()
            return {"ticker": symbol, "status": "NO_EVENTS"}

        prices = self.load_prices(symbol)
        if prices.empty:
            for ev in events:
                self._upsert_report(company, ev)
            self.db.commit()
            return {"ticker": symbol, "status": "NO_PRICES", "events": len(events)}

        bench = align_benchmark(self.benchmark(), prices.index)
        vix = align_benchmark(self.vix(), prices.index)
        studies = []
        for ev in events:
            report = self._upsert_report(company, ev)
            study = compute_event_study(prices, bench, vix, ev["event_date"], ev["session"])
            if study:
                self._upsert_study(company, report, ev, study)
                studies.append({**study, "event_date": ev["event_date"]})

        summary = summarize_events(studies)
        company.momentum_probability = summary["momentum_probability"]
        company.avg_post_earnings_momentum = summary["avg_post_earnings_momentum"]
        company.post_release_return = self.latest_release_reaction(studies)
        self.db.commit()
        return {"ticker": symbol, "status": "OK", "events": len(events), "studies": len(studies),
                "timed": sum(1 for e in events if e["announced_at"])}

    @staticmethod
    def latest_release_reaction(studies: List[Dict[str, Any]], max_age_days: int = 30) -> Optional[float]:
        """Abnormal reaction to the most recent release, if it happened recently."""
        if not studies:
            return None
        latest = max(studies, key=lambda s: s["event_date"])
        if (datetime.utcnow().date() - latest["event_date"]).days > max_age_days:
            return None
        for key in ("ar_3d", "ar_1d"):
            if latest.get(key) is not None:
                return round(float(latest[key]), 2)
        return None


# ─── Refresh selection ─────────────────────────────────────────────────────────

BACKFILL_MARKER_KEY = "pre_release:backfilled_at"


def select_companies_for_refresh(db, mode: str, redis_client=None, full_refresh_days: int = 20,
                                 upcoming_refresh_days: int = 7) -> List[Any]:
    """
    mode="full"  : every NSE-listed company not refreshed in `full_refresh_days`, upcoming reporters first.
    mode="recent": companies reporting in the next 45 days (refreshed weekly) plus every company that
                   reported in the last 15 days (always, so post-results reactions complete and get graded).
    """
    from app.infrastructure.models import Company, EarningsReport
    now = datetime.utcnow()
    markers = {}
    if redis_client is not None:
        try:
            markers = {k.decode(): v.decode() for k, v in (redis_client.hgetall(BACKFILL_MARKER_KEY) or {}).items()}
        except Exception:
            markers = {}

    def refreshed_within(ticker: str, days: int) -> bool:
        ts = markers.get(ticker)
        return bool(ts) and datetime.fromisoformat(ts) >= now - timedelta(days=days)

    nse_companies = [c for c in db.query(Company).all()
                     if not (c.ticker.endswith((".BO", ".NS")) or c.ticker.isdigit())]

    def upcoming(c) -> Optional[date]:
        d = parse_nse_datetime(c.upcoming_date) if c.upcoming_date else None
        return d.date() if d else None

    if mode == "full":
        todo = [c for c in nse_companies if not refreshed_within(c.ticker, full_refresh_days)]
        return sorted(todo, key=lambda c: (upcoming(c) is None, upcoming(c) or date.max))

    recent_ids = {cid for (cid,) in db.query(EarningsReport.company_id).filter(
        EarningsReport.report_date >= now - timedelta(days=15),
        EarningsReport.report_date <= now).all()}
    horizon = now.date() + timedelta(days=45)
    todo = []
    for c in nse_companies:
        up = upcoming(c)
        if c.id in recent_ids:
            todo.append(c)
        elif up and now.date() <= up <= horizon and not refreshed_within(c.ticker, upcoming_refresh_days):
            todo.append(c)
    return todo


def mark_refreshed(redis_client, ticker: str):
    if redis_client is None:
        return
    try:
        redis_client.hset(BACKFILL_MARKER_KEY, ticker, datetime.utcnow().isoformat())
    except Exception:
        pass
