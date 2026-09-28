"""
Pre-Release Edge Engine
=======================
For every company with results due in the next 30 days, forecasts two windows
(market-model abnormal returns vs Nifty 50, see earnings_events_service):

  * RUN-UP   : 5 sessions before the last pre-results close -> that close (enter early, exit BEFORE results)
  * REACTION : last pre-results close -> 3 sessions later (holding THROUGH results)

Research on the event panel (scripts/pre_release_research*.py) showed the edge lives in average
returns and hit-rates *relative to base rates*, not in coin-flip probabilities: results reactions
are reliably negative (~-1% vs a stock's ordinary 3-day window) and cross-sectional signals rank
which stocks fare better or worse.

So a LightGBM ranking model is trained walk-forward; its out-of-sample scores are cut into quintiles
("evidence buckets") and each bucket keeps the realised record of its past events. A live stock
inherits its bucket's record, and verdicts fire only when that record clears costs, is significant
(t >= 2.5) and points the same way in both halves of history.

Every live prediction is persisted, frozen once the results information is public, and graded.
"""
import json
import math
import os
import logging
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.services.earnings_events_service import (
    EarningsEventsService, NseClient, align_benchmark, stock_features, parse_nse_datetime,
    RUNUP_OFFSETS,
)

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.environ.get("MODEL_DIR", "/app/models"), "pre_release_edge.joblib")
PRICE_FEATURES = ["beta", "abn_ret_5", "abn_ret_20", "abn_ret_60", "rsi_14", "dist_52w_high", "ma50_dist",
                  "vol_ratio", "atr_pct", "rv_20", "log_turnover", "nifty_ret_20", "nifty_above_50dma",
                  "vix_level", "vix_chg_5"]
HISTORY_FEATURES = ["n_prior", "prior_ar3_mean", "prior_ar3_hit", "prior_abs_move", "prior_runup_mean",
                    "prior_runup_hit", "last_ar3", "last_gap", "shrunk_react", "shrunk_runup"]
PEER_FEATURES = ["peer_n", "peer_ar3_mean", "peer_ar3_hit", "peer_runup_mean", "season_n", "season_ar3_mean"]
EVENT_FEATURES = ["session_post", "result_quarter"]
ALL_FEATURES = PRICE_FEATURES + HISTORY_FEATURES + PEER_FEATURES + EVENT_FEATURES
TARGETS = {"runup": "runup_ar_5d", "reaction": "ar_3d"}
SHRINK_K = 6.0              # prior strength (in events) when shrinking own history to the universe
PEER_WINDOW_DAYS = 45
SEASON_WINDOW_DAYS = 30
MIN_EVENTS_FOR_ML = 300
EVIDENCE_BUCKETS = 5        # quintiles of the walk-forward ranking score
PREDICTION_HORIZON_DAYS = 30
IV_RV_PREMIUM = 1.2
MIN_RUNUP_EDGE_PCT = 0.75   # ~3x round-trip costs (brokerage + STT + slippage)
MIN_HOLD_EDGE_PCT = 1.0     # hold-through also carries results-day gap risk
AVOID_EDGE_PCT = 0.9        # expected underperformance that justifies selling before results
MIN_EVIDENCE_T = 2.5        # out-of-sample t-stat a bucket needs before we act on it

DRIVER_GROUPS = {
    "own_history": ["n_prior", "prior_ar3_mean", "prior_ar3_hit", "prior_abs_move", "prior_runup_mean",
                    "prior_runup_hit", "shrunk_react", "shrunk_runup"],
    "last_result": ["last_ar3", "last_gap"],
    "peers": ["peer_n", "peer_ar3_mean", "peer_ar3_hit", "peer_runup_mean"],
    "season": ["season_n", "season_ar3_mean"],
    "momentum": ["abn_ret_5", "abn_ret_20", "abn_ret_60", "ma50_dist", "rsi_14", "dist_52w_high"],
    "volume": ["vol_ratio", "log_turnover"],
    "volatility": ["atr_pct", "rv_20", "beta"],
    "regime": ["nifty_ret_20", "nifty_above_50dma", "vix_level", "vix_chg_5"],
    "timing": ["session_post", "result_quarter"],
}


def _f(x) -> Optional[float]:
    try:
        x = float(x)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _nan(x) -> float:
    v = _f(x)
    return np.nan if v is None else v


# ─── Point-in-time history / peer features ─────────────────────────────────────

def history_features(prior: pd.DataFrame, universe_react: float, universe_runup: float) -> Dict[str, float]:
    """Own-company stats from events whose reaction was complete before the decision date."""
    n = len(prior)
    out = {k: np.nan for k in HISTORY_FEATURES}
    out["n_prior"] = float(n)
    react = prior["ar_3d"].dropna().to_numpy(dtype=float) if n else np.array([])
    runup = prior["runup_ar_5d"].dropna().to_numpy(dtype=float) if n else np.array([])
    if len(react):
        out["prior_ar3_mean"] = float(react.mean())
        out["prior_ar3_hit"] = float((react > 0).mean())
        out["prior_abs_move"] = float(np.abs(react).mean())
        out["last_ar3"] = float(react[-1])
    if n and prior["gap_pct"].notna().any():
        out["last_gap"] = float(prior["gap_pct"].dropna().iloc[-1])
    if len(runup):
        out["prior_runup_mean"] = float(runup.mean())
        out["prior_runup_hit"] = float((runup > 0).mean())
    out["shrunk_react"] = float((react.sum() + SHRINK_K * universe_react) / (len(react) + SHRINK_K))
    out["shrunk_runup"] = float((runup.sum() + SHRINK_K * universe_runup) / (len(runup) + SHRINK_K))
    return out


class PanelIndex:
    """Fast point-in-time lookups over the historical event panel."""

    def __init__(self, panel: pd.DataFrame):
        self.panel = panel.sort_values("baseline_date").reset_index(drop=True)
        done = self.panel[self.panel["ar_3d"].notna()]
        self._done_dates = done["baseline_date"].to_numpy(dtype="datetime64[ns]")
        self._cum_react = np.concatenate([[0.0], np.cumsum(done["ar_3d"].to_numpy(dtype=float))])
        runup = done["runup_ar_5d"].fillna(0.0).to_numpy(dtype=float)
        self._cum_runup = np.concatenate([[0.0], np.cumsum(runup)])
        self._by_company = {cid: g for cid, g in done.groupby("company_id")}
        self._by_industry = {}
        for ind, g in done[done["industry"].notna()].groupby("industry"):
            self._by_industry[ind] = (
                g["baseline_date"].to_numpy(dtype="datetime64[ns]"),
                g["ar_3d"].to_numpy(dtype=float),
                g["runup_ar_5d"].to_numpy(dtype=float),
                g["company_id"].to_numpy(),
                g["ticker"].to_numpy(),
            )

    def universe_means(self, asof: pd.Timestamp) -> Tuple[float, float]:
        k = np.searchsorted(self._done_dates, np.datetime64(asof - pd.Timedelta(days=8)), side="right")
        if k < 30:
            return 0.0, 0.0
        return self._cum_react[k] / k, self._cum_runup[k] / k

    def features(self, company_id, industry: Optional[str], asof: pd.Timestamp) -> Dict[str, float]:
        u_react, u_runup = self.universe_means(asof)
        g = self._by_company.get(company_id)
        prior = g[g["baseline_date"] <= asof - pd.Timedelta(days=8)] if g is not None else pd.DataFrame(
            columns=["ar_3d", "runup_ar_5d", "gap_pct"])
        feats = history_features(prior, u_react, u_runup)

        feats.update({"peer_n": 0.0, "peer_ar3_mean": np.nan, "peer_ar3_hit": np.nan, "peer_runup_mean": np.nan})
        if industry and industry in self._by_industry:
            dates, react, runup, cids, _ = self._by_industry[industry]
            lo = np.searchsorted(dates, np.datetime64(asof - pd.Timedelta(days=PEER_WINDOW_DAYS)), side="left")
            hi = np.searchsorted(dates, np.datetime64(asof - pd.Timedelta(days=5)), side="right")
            mask = cids[lo:hi] != company_id
            r = react[lo:hi][mask]
            if len(r):
                feats["peer_n"] = float(len(r))
                feats["peer_ar3_mean"] = float(r.mean())
                feats["peer_ar3_hit"] = float((r > 0).mean())
                ru = runup[lo:hi][mask]
                ru = ru[np.isfinite(ru)]
                feats["peer_runup_mean"] = float(ru.mean()) if len(ru) else np.nan

        lo = np.searchsorted(self._done_dates, np.datetime64(asof - pd.Timedelta(days=SEASON_WINDOW_DAYS)), side="left")
        hi = np.searchsorted(self._done_dates, np.datetime64(asof - pd.Timedelta(days=5)), side="right")
        feats["season_n"] = float(max(0, hi - lo))
        feats["season_ar3_mean"] = float((self._cum_react[hi] - self._cum_react[lo]) / (hi - lo)) if hi > lo else np.nan
        return feats

    def peer_list(self, company_id, industry: Optional[str], asof: pd.Timestamp, limit: int = 8) -> List[dict]:
        if not industry or industry not in self._by_industry:
            return []
        dates, react, runup, cids, tickers = self._by_industry[industry]
        lo = np.searchsorted(dates, np.datetime64(asof - pd.Timedelta(days=PEER_WINDOW_DAYS)), side="left")
        hi = np.searchsorted(dates, np.datetime64(asof - pd.Timedelta(days=2)), side="right")
        out = []
        for j in range(hi - 1, lo - 1, -1):
            if cids[j] == company_id:
                continue
            out.append({"ticker": str(tickers[j]), "date": str(pd.Timestamp(dates[j]).date()),
                        "reaction3d": round(float(react[j]), 2),
                        "runup5d": _f(round(float(runup[j]), 2)) if np.isfinite(runup[j]) else None})
            if len(out) >= limit:
                break
        return out

    def company_events(self, company_id) -> pd.DataFrame:
        return self.panel[self.panel["company_id"] == company_id]


def load_event_panel(db) -> pd.DataFrame:
    from app.infrastructure.models import EventStudyResult, Company
    rows = db.query(
        EventStudyResult.company_id, Company.ticker, Company.industry, EventStudyResult.report_date,
        EventStudyResult.baseline_date, EventStudyResult.announcement_session, EventStudyResult.gap_pct,
        EventStudyResult.ar_1d, EventStudyResult.ar_3d, EventStudyResult.ar_5d, EventStudyResult.ret_1d,
        EventStudyResult.runup_ar_3d, EventStudyResult.runup_ar_5d, EventStudyResult.runup_ar_7d,
        EventStudyResult.runup_ar_10d, EventStudyResult.features_json,
    ).join(Company, Company.id == EventStudyResult.company_id).filter(EventStudyResult.baseline_date.isnot(None)).all()
    cols = ["company_id", "ticker", "industry", "event_date", "baseline_date", "session", "gap_pct", "ar_1d", "ar_3d",
            "ar_5d", "ret_1d", "runup_ar_3d", "runup_ar_5d", "runup_ar_7d", "runup_ar_10d", "features_json"]
    df = pd.DataFrame(rows, columns=cols)
    if df.empty:
        return df
    df["baseline_date"] = pd.to_datetime(df["baseline_date"])
    df["event_date"] = pd.to_datetime(df["event_date"])
    for c in cols[6:15]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def event_features(session: Optional[str], event_date: pd.Timestamp) -> Dict[str, float]:
    return {
        "session_post": 1.0 if session == "POST" else (0.5 if session in (None, "UNKNOWN") else 0.0),
        "result_quarter": float((event_date.month - 1) // 3 + 1),
    }


def build_training_frame(panel: pd.DataFrame) -> pd.DataFrame:
    """One row per historical event with point-in-time features for both decision points."""
    idx = PanelIndex(panel)
    records = []
    for r in idx.panel.itertuples(index=False):
        try:
            snap = json.loads(r.features_json or "{}")
        except ValueError:
            snap = {}
        base = pd.Timestamp(r.baseline_date)
        ev = event_features(r.session, pd.Timestamp(r.event_date))
        rec = {"company_id": r.company_id, "ticker": r.ticker, "baseline_date": base,
               "runup_ar_5d": r.runup_ar_5d, "ar_3d": r.ar_3d}
        for target, asof, key in (("runup", base - pd.Timedelta(days=7), "runup"), ("reaction", base, "reaction")):
            feats = {k: _nan(v) for k, v in (snap.get(key) or {}).items()}
            feats.update(idx.features(r.company_id, r.industry, asof))
            feats.update(ev)
            for k in ALL_FEATURES:
                rec[f"{target}__{k}"] = feats.get(k, np.nan)
        records.append(rec)
    return pd.DataFrame(records)


# ─── Models ────────────────────────────────────────────────────────────────────

def _lgb_params(objective: str, **extra) -> dict:
    params = dict(objective=objective, n_estimators=350, learning_rate=0.03, num_leaves=15, max_depth=5,
                  min_child_samples=40, subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                  reg_lambda=2.0, verbose=-1, random_state=42)
    params.update(extra)
    return params


def walk_forward_folds(dates: pd.Series, n_folds: int = 5, embargo_days: int = 10):
    """Expanding-window folds by time with an embargo gap (no look-ahead leakage)."""
    qs = dates.quantile(np.linspace(0, 1, n_folds + 1)).to_list()
    for k in range(1, n_folds):
        start, end = qs[k], qs[k + 1]
        train = dates < start - pd.Timedelta(days=embargo_days)
        test = (dates >= start) & (dates <= end) if k == n_folds - 1 else (dates >= start) & (dates < end)
        if train.sum() >= 100 and test.sum() >= 30:
            yield train.to_numpy(), test.to_numpy()


def bucket_evidence(y: np.ndarray) -> Dict[str, Any]:
    """What actually happened to a group of past events (abnormal %, vs Nifty)."""
    y = np.asarray(y, dtype=float)
    y = y[np.isfinite(y)]
    n = len(y)
    if n == 0:
        return {"n": 0}
    wins, losses = y[y > 0], y[y <= 0]
    sd = float(np.std(y, ddof=1)) if n > 1 else 0.0
    return {
        "n": int(n), "mean": round(float(y.mean()), 3), "median": round(float(np.median(y)), 3),
        "hit": round(float((y > 0).mean()), 3), "t": round(float(y.mean() / (sd / math.sqrt(n))) if sd > 0 else 0.0, 2),
        "p10": round(float(np.percentile(y, 10)), 2), "p90": round(float(np.percentile(y, 90)), 2),
        "win_avg": round(float(wins.mean()), 2) if len(wins) else None,
        "loss_avg": round(float(losses.mean()), 2) if len(losses) else None,
    }


def train_target(frame: pd.DataFrame, target: str) -> Optional[Dict[str, Any]]:
    """
    Walk-forward LightGBM ranking model. Out-of-sample scores are cut into quintiles and each quintile
    carries the realised track record of its events; live verdicts are read from that evidence only.
    """
    import lightgbm as lgb

    label_col = TARGETS[target]
    data = frame[frame[label_col].notna()].sort_values("baseline_date").reset_index(drop=True)
    if len(data) < MIN_EVENTS_FOR_ML:
        return None
    X = data[[f"{target}__{k}" for k in ALL_FEATURES]].astype(float)
    X.columns = ALL_FEATURES
    y_ret = data[label_col].to_numpy(dtype=float)
    lo, hi = np.percentile(y_ret, [2, 98])
    y_fit = np.clip(y_ret, lo, hi)  # winsorised so a few multi-baggers don't dominate the fit
    dates = data["baseline_date"]

    oof = np.full(len(data), np.nan)
    for tr, te in walk_forward_folds(dates):
        m = lgb.LGBMRegressor(**_lgb_params("huber", alpha=2.0, n_estimators=250)).fit(X[tr], y_fit[tr])
        oof[te] = m.predict(X[te])
    ok = ~np.isnan(oof)
    if ok.sum() < 250:
        return None

    cutoffs = np.quantile(oof[ok], np.linspace(0, 1, EVIDENCE_BUCKETS + 1)[1:-1])
    bucket = np.searchsorted(cutoffs, oof[ok], side="right")
    y_ok, d_ok = y_ret[ok], dates[ok].to_numpy()
    split = np.sort(d_ok)[len(d_ok) // 2]   # median OOF date: evidence must hold in both halves
    evidence = []
    for b in range(EVIDENCE_BUCKETS):
        ev = bucket_evidence(y_ok[bucket == b])
        first, second = bucket_evidence(y_ok[(bucket == b) & (d_ok < split)]), bucket_evidence(y_ok[(bucket == b) & (d_ok >= split)])
        ev["mean_first_half"], ev["mean_second_half"] = first.get("mean"), second.get("mean")
        ev["stable"] = bool(first.get("n") and second.get("n") and np.sign(first["mean"]) == np.sign(second["mean"]))
        ev["bucket"] = b
        evidence.append(ev)

    metrics = {
        "n_events": int(len(data)), "n_oof": int(ok.sum()),
        "rank_ic": round(float(pd.Series(oof[ok]).corr(pd.Series(y_ok), method="spearman")), 4),
        "base": bucket_evidence(y_ret),
        "buckets": evidence,
    }
    final = lgb.LGBMRegressor(**_lgb_params("huber", alpha=2.0, n_estimators=250)).fit(X, y_fit)
    return {"regressor": final, "cutoffs": cutoffs.tolist(), "evidence": evidence, "metrics": metrics}


def train_models(db) -> Dict[str, Any]:
    import joblib
    panel = load_event_panel(db)
    if panel.empty or panel["ar_3d"].notna().sum() < MIN_EVENTS_FOR_ML:
        return {"status": "INSUFFICIENT_DATA", "events": int(len(panel))}
    frame = build_training_frame(panel)
    runup, reaction = train_target(frame, "runup"), train_target(frame, "reaction")
    if runup is None or reaction is None:
        return {"status": "INSUFFICIENT_DATA", "events": int(len(panel))}
    from app.services.price_path_service import calibrate_paths
    try:
        path_calibration = calibrate_paths(panel, EarningsEventsService(db, nse=_OfflineNse()).load_prices)
    except Exception as e:
        logger.warning(f"Price path calibration failed: {e}")
        path_calibration = {}
    bundle = {
        "version": datetime.utcnow().strftime("pre-release-%Y%m%d-%H%M"),
        "trained_at": datetime.utcnow().isoformat(),
        "features": ALL_FEATURES,
        "runup": runup,
        "reaction": reaction,
        "path_calibration": path_calibration,
    }
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)
    return {"status": "OK", "version": bundle["version"],
            "runup": runup["metrics"], "reaction": reaction["metrics"], "path_calibration": path_calibration}


def load_models() -> Optional[Dict[str, Any]]:
    import joblib
    if not os.path.exists(MODEL_PATH):
        return None
    try:
        bundle = joblib.load(MODEL_PATH)
    except Exception as e:
        logger.error(f"Failed to load pre-release model: {e}")
        return None
    return bundle if "regressor" in (bundle.get("runup") or {}) else None  # ignore pre-evidence model files


def predict_target(model: Dict[str, Any], feats: Dict[str, float]) -> Dict[str, Any]:
    """Ranking score -> evidence bucket (realised track record of similar past setups) + driver contributions."""
    X = pd.DataFrame([{k: _nan(feats.get(k)) for k in ALL_FEATURES}])
    score = float(model["regressor"].predict(X)[0])
    b = int(np.searchsorted(model["cutoffs"], score, side="right"))
    ev = model["evidence"][b]
    contrib = model["regressor"].booster_.predict(X, pred_contrib=True)[0][:-1]
    contributions = dict(zip(ALL_FEATURES, map(float, contrib)))
    grouped = {}
    for group, members in DRIVER_GROUPS.items():
        val = sum(contributions.get(m, 0.0) for m in members)
        if abs(val) > 1e-6:
            grouped[group] = val
    return {"score": round(score, 3), "bucket": b, "evidence": ev,
            "p": ev["hit"], "p10": ev["p10"], "p50": ev["mean"], "p90": ev["p90"], "drivers": grouped}


# ─── Driver narration ──────────────────────────────────────────────────────────

def describe_driver(group: str, f: Dict[str, float], ctx: Dict[str, Any]) -> str:
    def fmt(x, spec="+.1f"):
        return "n/a" if x is None or (isinstance(x, float) and not math.isfinite(x)) else format(x, spec)
    n = int(f.get("n_prior") or 0)
    if group == "own_history":
        hit = f.get("prior_ar3_hit")
        return (f"Own history: {fmt((hit or 0) * 100, '.0f')}% of last {n} results got a positive 3-day reaction "
                f"(avg {fmt(f.get('prior_ar3_mean'))}%); pre-results run-up avg {fmt(f.get('prior_runup_mean'))}%") if n else \
            "No prior results history for this stock (falls back to universe base rates)"
    if group == "last_result":
        return f"Last result: {fmt(f.get('last_ar3'))}% 3-day reaction, {fmt(f.get('last_gap'))}% opening gap"
    if group == "peers":
        pn = int(f.get("peer_n") or 0)
        return (f"{pn} {ctx.get('industry') or 'sector'} peers already reported: avg reaction {fmt(f.get('peer_ar3_mean'))}%, "
                f"{fmt((f.get('peer_ar3_hit') or 0) * 100, '.0f')}% positive") if pn else "No sector peers have reported yet this season"
    if group == "season":
        return f"Market is rewarding results this season: avg 3-day reaction {fmt(f.get('season_ar3_mean'))}% across {int(f.get('season_n') or 0)} reports"
    if group == "momentum":
        return (f"Positioning: {fmt(f.get('abn_ret_20'))}% vs Nifty in 20 days, {fmt(f.get('abn_ret_5'))}% in 5 days, "
                f"RSI {fmt(f.get('rsi_14'), '.0f')}, {fmt(f.get('dist_52w_high'))}% from 52w high")
    if group == "volume":
        return f"Volume {fmt(f.get('vol_ratio'), '.2f')}x its normal level over the last 5 sessions"
    if group == "volatility":
        return f"Volatility: ATR {fmt(f.get('atr_pct'), '.1f')}% per day, beta {fmt(f.get('beta'), '.2f')}"
    if group == "regime":
        return f"Market regime: Nifty {fmt(f.get('nifty_ret_20'))}% in 20 days, India VIX {fmt(f.get('vix_level'), '.1f')}"
    if group == "timing":
        return f"Timing: Q{int(f.get('result_quarter') or 0)} calendar-quarter results, {'after-market' if f.get('session_post') == 1 else 'in/pre-market or unknown'} release"
    return group


def narrate_drivers(drivers: Dict[str, float], feats: Dict[str, float], ctx: Dict[str, Any], top: int = 5) -> List[dict]:
    ranked = sorted(drivers.items(), key=lambda kv: abs(kv[1]), reverse=True)[:top]
    total = sum(abs(v) for _, v in ranked) or 1.0
    return [{"group": g, "direction": "UP" if v > 0 else "DOWN", "weight": round(abs(v) / total, 3),
             "text": describe_driver(g, feats, ctx)} for g, v in ranked]


# ─── Trade plan ────────────────────────────────────────────────────────────────

def business_days_between(a: date, b: date) -> int:
    return int(np.busday_count(a, b))


def shift_business_days(d: date, n: int) -> date:
    return pd.Timestamp(np.busday_offset(np.datetime64(d), n, roll="backward" if n <= 0 else "forward")).date()


def expected_baseline_date(event_date: date, session: str) -> date:
    """Last clean pre-results close for an upcoming event."""
    if session == "POST" and np.is_busday(np.datetime64(event_date)):
        return event_date
    return shift_business_days(event_date, -1)


def shrunk_mean(values: pd.Series, prior: float) -> float:
    v = values.dropna().to_numpy(dtype=float)
    return float((v.sum() + SHRINK_K * prior) / (len(v) + SHRINK_K))


def best_runup_entry(company_events: pd.DataFrame, panel: pd.DataFrame) -> Tuple[int, Dict[int, float]]:
    stats = {}
    for k in RUNUP_OFFSETS:
        col = f"runup_ar_{k}d"
        prior = float(panel[col].mean()) if col in panel and panel[col].notna().any() else 0.0
        stats[k] = round(shrunk_mean(company_events[col], prior), 3) if col in company_events else prior
    best = max(RUNUP_OFFSETS, key=lambda k: (round(stats[k], 1), -k))
    return best, stats


def best_hold_exit(company_events: pd.DataFrame, panel: pd.DataFrame) -> Tuple[int, Dict[int, float]]:
    stats = {}
    for h in (1, 3, 5):
        col = f"ar_{h}d"
        prior = float(panel[col].mean()) if col in panel and panel[col].notna().any() else 0.0
        stats[h] = round(shrunk_mean(company_events[col], prior), 3) if col in company_events else prior
    best = max((1, 3, 5), key=lambda h: (round(stats[h], 1), -h))
    return best, stats


def decide_verdict(runup: Dict[str, Any], reaction: Dict[str, Any], runup_available: bool, n_prior: int) -> Dict[str, Any]:
    """
    Verdicts come only from the out-of-sample track record of the stock's evidence bucket:
    the bucket must clear costs, be statistically significant, and point the same way in both halves of history.
    """
    er, ec = runup["evidence"], reaction["evidence"]
    # Only the extreme groups carry the model's skill; a middle group clearing the bar is noise.
    top, bottom = EVIDENCE_BUCKETS - 1, 0
    runup_ok = (runup.get("bucket") == top and runup_available and er.get("stable") and er.get("mean", 0) >= MIN_RUNUP_EDGE_PCT
                and er.get("t", 0) >= MIN_EVIDENCE_T)
    hold_ok = (reaction.get("bucket") == top and ec.get("stable") and ec.get("mean", 0) >= MIN_HOLD_EDGE_PCT and ec.get("t", 0) >= MIN_EVIDENCE_T
               and ec.get("hit", 0) >= 0.5)
    avoid = reaction.get("bucket") == bottom and ec.get("stable") and ec.get("mean", 0) <= -AVOID_EDGE_PCT and ec.get("t", 0) <= -MIN_EVIDENCE_T

    if runup_ok:
        high = er["t"] >= 4 and er["hit"] >= 0.52 and n_prior >= 4
        verdict, strategy, t = "RUN-UP PLAY", "RUNUP", er["t"]
    elif hold_ok:
        high = ec["t"] >= 4 and ec["hit"] >= 0.55 and n_prior >= 4
        verdict, strategy, t = "HOLD-THROUGH PLAY", "HOLD", ec["t"]
    elif avoid:
        high = ec["t"] <= -4 and ec["hit"] <= 0.36
        verdict, strategy, t = "AVOID", "NONE", ec["t"]
    else:
        return {"verdict": "NO EDGE", "strategy": "NONE", "confidence": "LOW", "conviction": 0.0,
                "skip_results": bool(avoid)}
    return {"verdict": verdict, "strategy": strategy, "confidence": "HIGH" if high else "MEDIUM",
            "conviction": round(min(99.0, 50.0 + abs(t) * 5.0), 1), "skip_results": bool(avoid)}


def build_trade_plan(strategy: str, confidence: str, price: Optional[float], atr_pct: Optional[float],
                     runup: Dict[str, Any], reaction: Dict[str, Any], entry_date: Optional[date],
                     exit_date: Optional[date]) -> Dict[str, Any]:
    if not price or strategy == "NONE":
        return {}
    atr = atr_pct or 2.0
    if strategy == "RUNUP":
        stop_pct = -1.5 * atr
        target_pct = max(runup["p50"], 0.5 * atr)
        stretch_pct = max(runup["p90"], target_pct)
    else:
        # Results gaps jump through stops: size the stop off the realistic downside (P10).
        stop_pct = min(reaction["p10"], -1.5 * atr)
        target_pct = max(reaction["p50"], 0.5 * atr)
        stretch_pct = max(reaction["p90"], target_pct)
    risk_budget = 1.0  # % of capital risked per trade
    size = min(15.0, risk_budget / (abs(stop_pct) / 100.0)) * (1.0 if confidence == "HIGH" else 0.6)
    target2_pct = (target_pct + stretch_pct) / 2.0
    return {
        "entry_date": entry_date, "exit_date": exit_date, "entry_price_ref": round(price, 2),
        "stop_price": round(price * (1 + stop_pct / 100), 2), "stop_pct": round(stop_pct, 2),
        "target_price": round(price * (1 + target_pct / 100), 2), "target_pct": round(target_pct, 2),
        "target2_price": round(price * (1 + target2_pct / 100), 2), "target2_pct": round(target2_pct, 2),
        "stretch_target": round(price * (1 + stretch_pct / 100), 2), "stretch_pct": round(stretch_pct, 2),
        "position_size_pct": round(size, 1),
    }


def key_levels(prices: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Chart levels where price often stalls (resistance above) or finds buyers (support below):
    recent 20-day high/low, 50/200-day averages and the 52-week high/low. Near-duplicates are merged.
    """
    if prices is None or len(prices) < 20:
        return []
    c = prices["close"]
    last = float(c.iloc[-1])
    cands = [
        ("20-day high", float(prices["high"].iloc[-20:].max())),
        ("20-day low", float(prices["low"].iloc[-20:].min())),
        ("50-day average", float(c.iloc[-50:].mean()) if len(c) >= 50 else None),
        ("200-day average", float(c.iloc[-200:].mean()) if len(c) >= 200 else None),
        ("52-week high", float(prices["high"].iloc[-250:].max())),
        ("52-week low", float(prices["low"].iloc[-250:].min())),
    ]
    levels: List[Dict[str, Any]] = []
    for name, price in sorted([x for x in cands if x[1]], key=lambda x: x[1]):
        if levels and abs(price / levels[-1]["price"] - 1) < 0.005:
            levels[-1]["name"] += f" / {name}"
            continue
        levels.append({"name": name, "price": round(price, 2)})
    for lv in levels:
        lv["pct"] = round((lv["price"] / last - 1) * 100, 2)
        lv["kind"] = "resistance" if lv["price"] > last * 1.001 else "support" if lv["price"] < last * 0.999 else "at_price"
    return levels


def exit_rules(plan: Dict[str, Any], strategy: str, levels: List[Dict[str, Any]], atr_pct: Optional[float]) -> List[str]:
    """Plain-language entry/exit playbook tied to concrete prices."""
    if not plan:
        return []

    def rs(x):
        return f"₹{x:,.2f}"
    entry, stop, t1 = plan["entry_price_ref"], plan["stop_price"], plan["target_price"]
    t2, t3 = plan.get("target2_price", t1), plan["stretch_target"]
    entry_day = plan["entry_date"].strftime("%d %b") if plan.get("entry_date") else "the entry day"
    exit_day = plan["exit_date"].strftime("%d %b") if plan.get("exit_date") else "the exit day"
    chase = entry * (1 + (atr_pct or 2.0) / 100)
    rules = []
    if strategy == "RUNUP":
        rules.append(f"Buy on or after {entry_day} near {rs(entry)}. If it has already jumped above {rs(chase)}, don't chase it.")
    else:
        rules.append(f"Buy near the close on {entry_day}, the last session before results, around {rs(entry)}.")
    rules.append(f"If it closes below {rs(stop)} (stop-loss), sell everything. No second chances.")
    rules.append(f"At {rs(t1)} (Target 1): sell half and move your stop-loss up to your buy price. Now the trade can't lose money.")
    rules.append(f"At {rs(t2)} (Target 2): sell most of what's left.")
    above = [lv for lv in levels if lv["kind"] == "resistance"]
    blocking = [lv for lv in above if entry < lv["price"] < t1]
    if blocking:
        lv = blocking[0]
        rules.append(f"Heads-up: {lv['name']} at {rs(lv['price'])} sits below Target 1. Price often stalls there, so consider booking some profit at that level.")
    nxt = next((lv for lv in above if lv["price"] >= t2), None)
    if nxt:
        rules.append(f"Keep a small part for {rs(t3)} (best case) only if price closes above {rs(nxt['price'])} ({nxt['name']}), a breakout.")
    else:
        rules.append(f"Keep a small part for {rs(t3)} (best case). There's no major chart resistance in the way.")
    if strategy == "RUNUP":
        rules.append(f"Sell everything by the close on {exit_day}, before the results come out, even if no target is hit.")
    else:
        rules.append(f"Sell everything by the close on {exit_day}. The post-results move is mostly done by then.")
    return rules


# ─── Options, smart money, fundamentals context ────────────────────────────────

def implied_move_from_chain(chain: dict, event_date: date) -> Dict[str, Optional[float]]:
    """ATM straddle / spot for the first expiry on/after the event (approximate expected move)."""
    data = (chain.get("records") or {}).get("data") or []
    if not data:
        return {}
    spot = None
    strikes = {}
    ce_oi = pe_oi = 0.0
    for row in data:
        ce, pe = row.get("CE") or {}, row.get("PE") or {}
        spot = spot or ce.get("underlyingValue") or pe.get("underlyingValue")
        k = row.get("strikePrice")
        ce_oi += float(ce.get("openInterest") or 0)
        pe_oi += float(pe.get("openInterest") or 0)

        def mid(leg):
            # A live two-sided quote beats a possibly stale last trade.
            bid, ask = float(leg.get("buyPrice1") or 0), float(leg.get("sellPrice1") or 0)
            if bid > 0 and ask > 0 and ask / bid < 1.5:
                return (bid + ask) / 2
            lp = float(leg.get("lastPrice") or 0)
            return lp if lp > 0 else None
        if k is not None:
            strikes[float(k)] = (mid(ce), mid(pe))
    if not spot or not strikes:
        return {}
    atm = min(strikes, key=lambda k: abs(k - float(spot)))
    ce_p, pe_p = strikes[atm]
    out = {"spot": float(spot), "atm_strike": atm, "put_call_ratio": round(pe_oi / ce_oi, 2) if ce_oi > 0 else None}
    if ce_p and pe_p:
        out["implied_move_pct"] = round((ce_p + pe_p) / float(spot) * 100.0, 2)
    return out


def event_implied_move(straddle_pct: float, daily_vol_pct: Optional[float], sessions_to_expiry: int) -> Optional[float]:
    """
    Strip the ordinary (non-event) volatility out of an ATM straddle.
    ATM straddle ~= 0.798 * total sd; total variance = event variance + daily variance * (non-event sessions).
    Returns the expected absolute results-day move (comparable to a historical mean |1-day reaction|).
    """
    if straddle_pct is None or straddle_pct <= 0:
        return None
    total_sd = straddle_pct / 0.798
    # Implied vol normally runs ~20% above realised vol (variance risk premium) on non-event days too.
    base_var = ((daily_vol_pct or 0.0) * IV_RV_PREMIUM) ** 2 * max(0, sessions_to_expiry - 1)
    event_var = total_sd ** 2 - base_var
    if event_var <= 0:
        return 0.0
    return round(0.798 * math.sqrt(event_var), 2)


def fetch_options_context(nse: NseClient, symbol: str, event_date: date, daily_vol_pct: Optional[float] = None) -> Dict[str, Any]:
    info = nse.option_contract_info(symbol)
    expiries = [parse_nse_datetime(e) for e in info.get("expiryDates", [])]
    expiries = sorted(e.date() for e in expiries if e)
    target = next((e for e in expiries if e >= event_date), None)
    if not target:
        return {"fno": bool(expiries)}
    ctx = implied_move_from_chain(nse.option_chain(symbol, target.strftime("%d-%b-%Y")), event_date)
    ctx.update({"fno": True, "expiry": str(target)})
    if ctx.get("implied_move_pct") is not None:
        sessions = business_days_between(datetime.utcnow().date(), target) + 1
        ctx["straddle_pct"] = ctx["implied_move_pct"]
        ctx["sessions_to_expiry"] = sessions
        ctx["implied_move_pct"] = event_implied_move(ctx["straddle_pct"], daily_vol_pct, sessions)
    return ctx


def smart_money_context(db, ticker: str) -> Dict[str, Any]:
    from app.infrastructure.models import DailyBhavcopy, BulkBlockDeal
    out: Dict[str, Any] = {}
    since = datetime.utcnow() - timedelta(days=40)
    rows = db.query(DailyBhavcopy.trade_date, DailyBhavcopy.delivery_pct).filter(
        DailyBhavcopy.ticker == ticker, DailyBhavcopy.trade_date >= since).order_by(DailyBhavcopy.trade_date).all()
    vals = [r[1] for r in rows if r[1] is not None]
    if len(vals) >= 10:
        out["delivery_pct_5d"] = round(float(np.mean(vals[-5:])), 1)
        out["delivery_pct_prior"] = round(float(np.mean(vals[:-5])), 1)
    deals = db.query(BulkBlockDeal).filter(BulkBlockDeal.ticker == ticker,
                                           BulkBlockDeal.deal_date >= datetime.utcnow() - timedelta(days=30)).all()
    if deals:
        buy = sum((d.quantity or 0) * (d.trade_price or 0) for d in deals if d.direction == "BUY")
        sell = sum((d.quantity or 0) * (d.trade_price or 0) for d in deals if d.direction == "SELL")
        out["bulk_deals_30d"] = len(deals)
        out["bulk_net_value_cr"] = round((buy - sell) / 1e7, 2)
    return out


def fundamentals_context(c) -> Dict[str, Any]:
    def growth(cur, prev):
        cur, prev = _f(cur), _f(prev)
        return round((cur - prev) / abs(prev) * 100, 1) if cur is not None and prev not in (None, 0) else None
    return {
        "latest_quarter": c.q4_date,
        "profit_yoy": growth(c.q4_profit, c.q0_profit),
        "profit_qoq": growth(c.q4_profit, c.q3_profit),
        "revenue_yoy": growth(c.q4_revenue, c.q0_revenue),
        "eps_latest": _f(c.q4_eps),
        "eps_year_ago": _f(c.q0_eps),
        "health_score": _f(c.financial_health_score),
        "health_grade": c.financial_health_grade,
    }


def parse_upcoming_date(value: Optional[str]) -> Optional[date]:
    if not value or value == "N/A":
        return None
    d = parse_nse_datetime(value)
    if d:
        return d.date()
    try:
        return pd.to_datetime(value).date()
    except (ValueError, TypeError):
        return None


# ─── Price path (simulated forecast cone) ──────────────────────────────────────

class _OfflineNse:
    """Placeholder so price-only work never opens an NSE session."""


_UNIVERSE_MOVES: Dict[str, Any] = {"at": None, "moves": np.array([])}


def universe_results_moves(db) -> np.ndarray:
    """All past results-day moves (raw %), cached for an hour."""
    from app.infrastructure.models import EventStudyResult
    now = datetime.utcnow()
    if _UNIVERSE_MOVES["at"] is None or now - _UNIVERSE_MOVES["at"] > timedelta(hours=1):
        vals = [v for (v,) in db.query(EventStudyResult.ret_1d).filter(EventStudyResult.ret_1d.isnot(None)).all()]
        _UNIVERSE_MOVES.update(at=now, moves=np.array(vals, dtype=float))
    return _UNIVERSE_MOVES["moves"]


def live_price(db, ticker: str) -> Optional[float]:
    """Latest intraday quote from the harvester's live_quotes table, if it is from the last day."""
    from sqlalchemy import text
    try:
        row = db.execute(text("SELECT price, timestamp FROM live_quotes WHERE ticker = :t"), {"t": ticker}).first()
    except Exception:
        db.rollback()
        return None
    if not row or row[0] is None:
        return None
    ts = row[1]
    if ts is not None and getattr(ts, "tzinfo", None) is not None:
        ts = ts.replace(tzinfo=None)
    if ts is not None and datetime.utcnow() - ts > timedelta(days=1):
        return None
    return float(row[0])


def compute_price_path(db, company, prices: pd.DataFrame, details: Dict[str, Any], strategy: str,
                       implied_move_pct: Optional[float], use_live: bool = False) -> Dict[str, Any]:
    from app.infrastructure.models import EventStudyResult
    from app.services.price_path_service import build_price_path
    timing = details.get("timing") or {}
    baseline = parse_upcoming_date(timing.get("baseline_date"))
    if prices is None or prices.empty or baseline is None:
        return {}
    own = db.query(EventStudyResult.ret_1d, EventStudyResult.baseline_date).filter(
        EventStudyResult.company_id == company.id, EventStudyResult.ret_1d.isnot(None)).all()
    own_moves = np.array([r[0] for r in own], dtype=float)
    reaction_days = {int(prices.index.searchsorted(pd.Timestamp(r[1]))) + 1 for r in own if r[1] is not None}
    levels = [dict(lv) for lv in (details.get("levels") or key_levels(prices))]
    return build_price_path(
        prices=prices, live_price=live_price(db, company.ticker) if use_live else None,
        today=datetime.utcnow().date(), baseline=baseline, strategy=strategy,
        runup_mean_pct=(details.get("runup") or {}).get("p50"),
        reaction_mean_pct=(details.get("reaction") or {}).get("p50"),
        own_moves=own_moves, universe_moves=universe_results_moves(db), implied_move_pct=implied_move_pct,
        levels=levels, atr_pct=(details.get("positioning") or {}).get("atr_pct"),
        exclude_idx=reaction_days, seed=abs(hash(company.ticker)) % 100000,
    )


def plan_from_path(path: Dict[str, Any], strategy: str, confidence: str, entry_date: Optional[date],
                   exit_date: Optional[date]) -> Dict[str, Any]:
    """Trade plan whose stop/targets come from the simulated paths (see price_path_service)."""
    if not path or strategy == "NONE":
        return {}
    pp = path["plan"]
    t1, t2, t3 = (t["price"] for t in pp["targets"])
    price = pp["price"]
    stop_dist = abs(pp["stop_pct"]) or 1.0
    size = min(15.0, 1.0 / (stop_dist / 100.0)) * (1.0 if confidence == "HIGH" else 0.6)
    return {
        "entry_date": entry_date, "exit_date": exit_date, "entry_price_ref": price,
        "stop_price": pp["stop"], "stop_pct": pp["stop_pct"],
        "target_price": t1, "target_pct": pp["targets"][0]["pct"],
        "target2_price": t2, "target2_pct": pp["targets"][1]["pct"],
        "stretch_target": t3, "stretch_pct": pp["targets"][2]["pct"],
        "position_size_pct": round(size, 1),
    }


# ─── Orchestration ─────────────────────────────────────────────────────────────

class PreReleaseEdgeService:
    def __init__(self, db, nse: Optional[NseClient] = None):
        self.db = db
        self.nse = nse or NseClient()
        self.events = EarningsEventsService(db, nse=self.nse)

    def upcoming_companies(self, horizon_days: int = PREDICTION_HORIZON_DAYS) -> List[Tuple[Any, date]]:
        from app.infrastructure.models import Company
        today = datetime.utcnow().date()
        out = []
        for c in self.db.query(Company).filter(Company.upcoming_date.isnot(None)).all():
            d = parse_upcoming_date(c.upcoming_date)
            if d and today <= d <= today + timedelta(days=horizon_days):
                out.append((c, d))
        return sorted(out, key=lambda x: x[1])

    def predict_all(self) -> Dict[str, Any]:
        models = load_models()
        if models is None:
            return {"status": "NO_MODEL"}
        panel = load_event_panel(self.db)
        index = PanelIndex(panel) if not panel.empty else None
        stats = {"predicted": 0, "frozen": 0, "failed": 0}
        for company, event_date in self.upcoming_companies():
            try:
                res = self.predict_company(company, event_date, models, index, panel)
                stats[res] = stats.get(res, 0) + 1
            except Exception as e:
                self.db.rollback()
                stats["failed"] += 1
                logger.exception(f"Pre-release prediction failed for {company.ticker}: {e}")
        return stats

    def predict_company(self, company, event_date: date, models: Dict[str, Any], index: Optional[PanelIndex],
                        panel: pd.DataFrame) -> str:
        from app.infrastructure.models import PreReleasePrediction, EarningsReport
        today = datetime.utcnow().date()
        event_dt = datetime.combine(event_date, datetime.min.time())
        row = self.db.query(PreReleasePrediction).filter(PreReleasePrediction.company_id == company.id,
                                                         PreReleasePrediction.event_date == event_dt).first()

        prices = self.events.load_prices(company.ticker)
        if prices.empty or len(prices) < 80:
            return "no_prices"
        last_bar = prices.index[-1].date()

        sessions = [s for (s,) in self.db.query(EarningsReport.announcement_session).filter(
            EarningsReport.company_id == company.id, EarningsReport.announcement_session.isnot(None)).all()
            if s != "UNKNOWN"]
        session = max(set(sessions), key=sessions.count) if sessions else "UNKNOWN"
        baseline = expected_baseline_date(event_date, session)
        # Freeze once the results information may already be in the price.
        if last_bar > baseline:
            return "frozen"

        bench = align_benchmark(self.events.benchmark(), prices.index)
        vix = align_benchmark(self.events.vix(), prices.index)
        i = len(prices) - 1
        price_feats = stock_features(prices, bench, vix, i)
        asof = pd.Timestamp(last_bar)
        hist_feats = index.features(company.id, company.industry, asof) if index else history_features(pd.DataFrame(columns=["ar_3d", "runup_ar_5d", "gap_pct"]), 0.0, 0.0)
        feats = {**{k: _nan(v) for k, v in price_feats.items()}, **hist_feats, **event_features(session, pd.Timestamp(event_date))}

        company_events = index.company_events(company.id) if index else pd.DataFrame()
        n_prior = int(hist_feats.get("n_prior") or 0)
        runup = predict_target(models["runup"], feats)
        reaction = predict_target(models["reaction"], feats)

        sessions_to_baseline = business_days_between(last_bar, baseline)
        # Entry/exit windows match exactly what the models were validated on (T-5 run-up, 3-session reaction).
        _, runup_by_offset = best_runup_entry(company_events, panel) if not panel.empty else (5, {})
        _, hold_by_exit = best_hold_exit(company_events, panel) if not panel.empty else (3, {})
        best_k, best_h = 5, 3
        runup_available = sessions_to_baseline >= 2
        decision = decide_verdict(runup, reaction, runup_available, n_prior)

        if decision["strategy"] == "RUNUP":
            planned_entry = shift_business_days(baseline, -best_k)
            entry_date = max(planned_entry, shift_business_days(last_bar, 1))
            exit_date = baseline
        elif decision["strategy"] == "HOLD":
            entry_date, exit_date = baseline, shift_business_days(baseline, best_h)
        else:
            entry_date = exit_date = None
        levels = key_levels(prices)

        options = {}
        if (event_date - today).days <= PREDICTION_HORIZON_DAYS:
            try:
                rv = price_feats.get("rv_20")
                options = fetch_options_context(self.nse, company.ticker, event_date, rv / math.sqrt(252) if rv else None)
            except Exception as e:
                logger.warning(f"Options context failed for {company.ticker}: {e}")
        hist_moves = company_events["ret_1d"].dropna().abs() if not company_events.empty else pd.Series(dtype=float)
        hist_avg_move = round(float(hist_moves.mean()), 2) if len(hist_moves) else None

        ctx = {"industry": company.industry}
        headline = "runup" if decision["strategy"] == "RUNUP" else "reaction"
        drivers = narrate_drivers((runup if headline == "runup" else reaction)["drivers"], feats, ctx)
        past = []
        if not company_events.empty:
            for r in company_events.sort_values("event_date", ascending=False).head(12).itertuples(index=False):
                past.append({"date": str(pd.Timestamp(r.event_date).date()), "session": r.session,
                             "gap": _f(r.gap_pct), "ar1": _f(r.ar_1d), "ar3": _f(r.ar_3d), "ar5": _f(r.ar_5d),
                             "runup5": _f(r.runup_ar_5d)})
        details = {
            "runup": {k: runup[k] for k in ("p", "p10", "p50", "p90", "score", "bucket", "evidence")},
            "reaction": {k: reaction[k] for k in ("p", "p10", "p50", "p90", "score", "bucket", "evidence")},
            "skip_results": decision.get("skip_results", False),
            "runup_drivers": narrate_drivers(runup["drivers"], feats, ctx),
            "reaction_drivers": narrate_drivers(reaction["drivers"], feats, ctx),
            "timing": {"session_assumed": session, "baseline_date": str(baseline), "sessions_to_baseline": sessions_to_baseline,
                       "entry_window_opens": str(shift_business_days(baseline, -best_k)),
                       "last_price_date": str(last_bar), "best_runup_entry_sessions": best_k, "runup_by_entry_offset": runup_by_offset,
                       "best_hold_exit_sessions": best_h, "hold_by_exit_horizon": hold_by_exit, "runup_available": runup_available},
            "own_history": {"n": n_prior, "hit_rate": _f(hist_feats.get("prior_ar3_hit")), "avg_reaction": _f(hist_feats.get("prior_ar3_mean")),
                            "avg_abs_move": _f(hist_feats.get("prior_abs_move")), "runup_hit_rate": _f(hist_feats.get("prior_runup_hit")),
                            "avg_runup": _f(hist_feats.get("prior_runup_mean")), "events": past},
            "peers": {"industry": company.industry, "n": int(hist_feats.get("peer_n") or 0), "avg_reaction": _f(hist_feats.get("peer_ar3_mean")),
                      "hit_rate": _f(hist_feats.get("peer_ar3_hit")), "reported": index.peer_list(company.id, company.industry, asof) if index else []},
            "season": {"n": int(hist_feats.get("season_n") or 0), "avg_reaction": _f(hist_feats.get("season_ar3_mean"))},
            "positioning": {k: _f(price_feats.get(k)) for k in ("abn_ret_5", "abn_ret_20", "abn_ret_60", "rsi_14", "dist_52w_high", "vol_ratio", "atr_pct", "beta")},
            "regime": {k: _f(price_feats.get(k)) for k in ("nifty_ret_20", "nifty_above_50dma", "vix_level", "vix_chg_5")},
            "options": options,
            "smart_money": smart_money_context(self.db, company.ticker),
            "fundamentals": fundamentals_context(company),
            "levels": levels,
            "model": {"version": models.get("version"), "trained_at": models.get("trained_at"),
                      "runup_metrics": models["runup"]["metrics"], "reaction_metrics": models["reaction"]["metrics"],
                      "path_calibration": models.get("path_calibration") or {}},
        }
        # Simulated price cone -> smart stop / targets; fall back to the quantile plan if simulation isn't possible.
        try:
            path = compute_price_path(self.db, company, prices, details, decision["strategy"], options.get("implied_move_pct"))
        except Exception as e:
            logger.warning(f"Price path simulation failed for {company.ticker}: {e}")
            path = {}
        plan = plan_from_path(path, decision["strategy"], decision["confidence"], entry_date, exit_date) or build_trade_plan(
            decision["strategy"], decision["confidence"], float(prices["close"].iloc[-1]), price_feats.get("atr_pct"),
            runup, reaction, entry_date, exit_date)
        details["plan"] = {k: (str(v) if isinstance(v, date) else v) for k, v in plan.items()}
        details["rules"] = exit_rules(plan, decision["strategy"], levels, price_feats.get("atr_pct"))
        details["path"] = path

        if row is None:
            row = PreReleasePrediction(company_id=company.id, ticker=company.ticker, event_date=event_dt,
                                       first_predicted_at=datetime.utcnow())
            self.db.add(row)
        history = json.loads(row.history_json) if row.history_json else []
        history = [h for h in history if h.get("d") != str(last_bar)][-40:]
        history.append({"d": str(last_bar), "pr": runup["p"], "pc": reaction["p"], "v": decision["verdict"]})

        row.event_session = session
        row.as_of_date = datetime.combine(last_bar, datetime.min.time())
        row.updated_at = datetime.utcnow()
        row.engine = f"EVIDENCE Q{runup['bucket'] + 1}/Q{reaction['bucket'] + 1}"
        row.model_version = models.get("version")
        row.n_prior_events = n_prior
        row.p_runup, row.runup_p10, row.runup_p50, row.runup_p90 = runup["p"], runup["p10"], runup["p50"], runup["p90"]
        row.p_reaction, row.reaction_p10, row.reaction_p50, row.reaction_p90 = reaction["p"], reaction["p10"], reaction["p50"], reaction["p90"]
        row.verdict, row.strategy, row.confidence, row.conviction_score = decision["verdict"], decision["strategy"], decision["confidence"], decision["conviction"]
        row.entry_date = datetime.combine(plan["entry_date"], datetime.min.time()) if plan.get("entry_date") else None
        row.exit_date = datetime.combine(plan["exit_date"], datetime.min.time()) if plan.get("exit_date") else None
        row.entry_price_ref = plan.get("entry_price_ref") or round(float(prices["close"].iloc[-1]), 2)
        row.stop_price, row.target_price, row.stretch_target = plan.get("stop_price"), plan.get("target_price"), plan.get("stretch_target")
        row.position_size_pct = plan.get("position_size_pct")
        row.implied_move_pct = options.get("implied_move_pct")
        row.put_call_ratio = options.get("put_call_ratio")
        row.hist_avg_move_pct = hist_avg_move
        row.drivers_json = json.dumps(drivers)
        row.details_json = json.dumps(details, default=str)
        row.history_json = json.dumps(history)
        self.db.commit()
        return "predicted"

    def grade(self) -> Dict[str, Any]:
        """Score frozen predictions against realised event-study outcomes."""
        from app.infrastructure.models import PreReleasePrediction, EventStudyResult
        today = datetime.utcnow()
        pending = self.db.query(PreReleasePrediction).filter(
            PreReleasePrediction.graded.is_(False),
            PreReleasePrediction.event_date <= today - timedelta(days=3)).all()
        graded = 0
        for p in pending:
            study = self.db.query(EventStudyResult).filter(
                EventStudyResult.company_id == p.company_id,
                EventStudyResult.report_date >= p.event_date - timedelta(days=3),
                EventStudyResult.report_date <= p.event_date + timedelta(days=3)).first()
            if study is None or study.ar_3d is None:
                if p.event_date < today - timedelta(days=30):
                    p.graded, p.graded_at = True, today   # event never materialised / no data: close it out ungraded
                continue
            if study.ar_5d is None and p.event_date > today - timedelta(days=12):
                continue
            details = json.loads(p.details_json or "{}")
            timing = details.get("timing") or {}
            k = int(timing.get("best_runup_entry_sessions") or 5)
            h = int(timing.get("best_hold_exit_sessions") or 3)
            p.realized_runup = study.runup_ar_5d
            p.realized_reaction_3d = study.ar_3d
            p.realized_reaction_5d = study.ar_5d
            if p.strategy == "RUNUP":
                p.realized_trade_return = getattr(study, f"runup_ar_{k}d", None)
                p.hit = p.realized_trade_return is not None and p.realized_trade_return > 0
            elif p.strategy == "HOLD":
                exit_ret = getattr(study, f"ar_{h}d", None)
                p.realized_trade_return = exit_ret if exit_ret is not None else study.ar_3d
                p.hit = p.realized_trade_return is not None and p.realized_trade_return > 0
            elif p.verdict == "AVOID":
                p.realized_trade_return = -study.ar_3d
                p.hit = study.ar_3d < 0
            else:
                p.hit = None
            p.graded, p.graded_at = True, today
            graded += 1
        self.db.commit()
        return {"graded": graded, "pending": len(pending) - graded}


def track_record(db, company_id=None) -> Dict[str, Any]:
    from app.infrastructure.models import PreReleasePrediction
    q = db.query(PreReleasePrediction).filter(PreReleasePrediction.graded.is_(True), PreReleasePrediction.hit.isnot(None))
    if company_id is not None:
        q = q.filter(PreReleasePrediction.company_id == company_id)
    rows = q.all()
    out: Dict[str, Any] = {"n": len(rows), "hits": sum(1 for r in rows if r.hit)}
    out["hit_rate"] = round(out["hits"] / out["n"], 3) if out["n"] else None
    rets = [r.realized_trade_return for r in rows if r.realized_trade_return is not None]
    out["avg_return"] = round(float(np.mean(rets)), 2) if rets else None
    by = {}
    for r in rows:
        key = f"{r.verdict}|{r.confidence}"
        b = by.setdefault(key, {"verdict": r.verdict, "confidence": r.confidence, "n": 0, "hits": 0})
        b["n"] += 1
        b["hits"] += 1 if r.hit else 0
    out["buckets"] = sorted(by.values(), key=lambda b: (b["verdict"], b["confidence"]))
    return out
