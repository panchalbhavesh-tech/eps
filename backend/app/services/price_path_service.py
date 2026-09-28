"""
Price Path Simulator
====================
Forecasts the *range* of prices a stock is likely to trade at, day by day, from the live price through its
results announcement, by simulating thousands of paths that behave like the stock itself:

  * Ordinary days - Filtered Historical Simulation (FHS): the stock's own standardised daily returns
    (results days removed) are bootstrapped and rescaled by an EWMA volatility that evolves along each
    path (lambda = 0.94, RiskMetrics), so calm and turbulent spells cluster like in the real market.
  * Pre-results drift - the validated evidence-bucket run-up is spread over the final 5 sessions only.
  * Results day - a jump drawn from the stock's own past results-day moves (shrunk toward the whole
    market's), re-centred on the evidence-bucket reaction and re-scaled to the options-implied move
    when the stock is in F&O.

From the simulated paths we derive the plan directly:
  * smart stop   : price that only ~20% of normal paths touch before the exit, snapped just below support
  * Target 1/2/3 : prices touched by 50% / 30% / 15% of paths before the exit
  * a probability for every chart level (support / resistance) being touched

`calibrate_paths` backtests the whole procedure on past results events so the popup can report how often
reality actually stayed inside the forecast band.

All moves assume the Nifty is flat (they are stock-specific).
"""
import math
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

EWMA_LAMBDA = 0.94
N_PATHS = 5000
SHRINK_K = 6.0
STOP_TOUCH_PROB = 0.20
LIMIT_FILL_PROB = 0.60      # buy-the-dip limit: filled in ~6 of 10 paths before the entry deadline
TARGET_TOUCH_PROBS = (0.50, 0.30, 0.15)
BANDS = (10, 25, 50, 75, 90)
POST_RESULTS_SESSIONS = 3      # trade-plan window after results (validated reaction window)
DISPLAY_POST_SESSIONS = 15     # forecast shown ~3 weeks past results; no drift assumed (none was reliable)
OUTLOOK_MOVE_PCT = 3.0
ROUND_TRIP_COST_PCT = 0.3      # delivery brokerage + STT + charges + slippage, both legs
MIN_SCHEDULE_EDGE_PCT = 0.5    # a "best day" must beat costs by at least this much to be worth naming
MIN_DIP_PCT = 0.5              # a "cheapest day" must be at least this much below today's price         # "if you buy after results": chance of +3% vs -3% first


def ewma_sigma(returns: np.ndarray, lam: float = EWMA_LAMBDA) -> np.ndarray:
    """EWMA volatility *before* each return (sigma_t uses returns up to t-1)."""
    var = np.empty(len(returns))
    var[0] = np.var(returns[:30]) if len(returns) >= 30 else np.var(returns)
    for i in range(1, len(returns)):
        var[i] = lam * var[i - 1] + (1 - lam) * returns[i - 1] ** 2
    return np.sqrt(np.maximum(var, 1e-10))


def standardised_residuals(close: np.ndarray, exclude_idx: Optional[set] = None, lookback: int = 500) -> Dict[str, Any]:
    """Standardised daily log-return residuals and the current EWMA volatility."""
    c = close[-(lookback + 1):]
    r = np.diff(np.log(c))
    sig = ewma_sigma(r)
    keep = np.ones(len(r), dtype=bool)
    if exclude_idx:
        offset = len(close) - len(c)  # position of c[0] in the full series
        for i in exclude_idx:
            j = i - offset - 1           # return ending at bar i
            if 0 <= j < len(r):
                keep[j] = False
    z = ((r - r.mean()) / sig)[keep]
    z = np.clip(z[30:] if len(z) > 60 else z, -6, 6)
    sigma_now = math.sqrt(EWMA_LAMBDA * sig[-1] ** 2 + (1 - EWMA_LAMBDA) * r[-1] ** 2)
    return {"z": z, "sigma_now": sigma_now}


def results_jump_pool(own_moves: np.ndarray, universe_moves: np.ndarray, reaction_mean_pct: Optional[float],
                      implied_move_pct: Optional[float], rng: np.random.Generator, size: int) -> np.ndarray:
    """Results-day log moves: own history shrunk to the market's, re-centred and optionally re-scaled."""
    own = np.log1p(np.asarray(own_moves, dtype=float)[np.isfinite(own_moves)] / 100.0)
    uni = np.log1p(np.asarray(universe_moves, dtype=float)[np.isfinite(universe_moves)] / 100.0)
    if len(uni) == 0:
        uni = rng.normal(0, 0.04, 1000)
    w_own = len(own) / (len(own) + SHRINK_K)
    use_own = rng.random(size) < w_own if len(own) else np.zeros(size, dtype=bool)
    draws = np.where(use_own, rng.choice(own, size) if len(own) else 0.0, rng.choice(uni, size))
    centred = draws - draws.mean()
    if implied_move_pct and implied_move_pct > 0:
        mad = np.mean(np.abs(centred))
        if mad > 0:
            centred *= (implied_move_pct / 100.0) / mad
    target_mean = math.log1p((reaction_mean_pct or 0.0) / 100.0)
    return centred + target_mean


def simulate(price: float, z_pool: np.ndarray, sigma_now: float, n_pre: int, runup_mean_pct: Optional[float],
             jumps: Optional[np.ndarray], n_post: int, n_paths: int = N_PATHS, seed: int = 7) -> np.ndarray:
    """
    Price paths, shape (n_paths, n_pre + n_post + 1); column 0 is today's price.
    Columns 1..n_pre are sessions up to and including the last pre-results close; column n_pre+1 is the
    first session that trades on the results (if jumps is given).
    """
    rng = np.random.default_rng(seed)
    steps = n_pre + n_post
    drift = np.zeros(steps)
    if runup_mean_pct and n_pre > 0:
        k = min(5, n_pre)  # validated run-up window: final 5 pre-results sessions
        drift[n_pre - k:n_pre] = math.log1p(runup_mean_pct / 100.0) / k
    log_p = np.zeros((n_paths, steps + 1))
    log_p[:, 0] = math.log(price)
    var = np.full(n_paths, sigma_now ** 2)
    for s in range(steps):
        if jumps is not None and s == n_pre:
            r = jumps[rng.integers(0, len(jumps), n_paths)]
        else:
            r = np.sqrt(var) * z_pool[rng.integers(0, len(z_pool), n_paths)] + drift[s]
        log_p[:, s + 1] = log_p[:, s] + r
        var = EWMA_LAMBDA * var + (1 - EWMA_LAMBDA) * r ** 2
    return np.exp(log_p)


def touch_probability(paths: np.ndarray, level: float, horizon: int) -> float:
    window = paths[:, 1:horizon + 1]
    if window.size == 0:
        return 0.0
    price = paths[0, 0]
    hit = window.min(axis=1) <= level if level < price else window.max(axis=1) >= level
    return round(float(hit.mean()), 3)


def first_touch(paths: np.ndarray, level: float, horizon: int) -> Dict[str, Any]:
    """Probability a level is touched by `horizon`, and when (session index) it typically happens first."""
    window = paths[:, 1:horizon + 1]
    if window.size == 0:
        return {"prob": 0.0, "session": None, "early": None, "late": None}
    price = paths[0, 0]
    hits = window <= level if level < price else window >= level
    touched = hits.any(axis=1)
    if not touched.any():
        return {"prob": 0.0, "session": None, "early": None, "late": None}
    first = hits[touched].argmax(axis=1) + 1
    return {"prob": round(float(touched.mean()), 3), "session": int(np.median(first)),
            "early": int(np.percentile(first, 25)), "late": int(np.percentile(first, 75))}


def entry_advice(paths: np.ndarray, deadline: int) -> Dict[str, Any]:
    """
    Best entry inside sessions 1..deadline: the day with the lowest expected (median) price, and a
    buy-the-dip limit price filled in ~LIMIT_FILL_PROB of paths before the deadline.
    """
    deadline = max(1, min(deadline, paths.shape[1] - 1))
    price = float(paths[0, 0])
    med = np.median(paths[:, 1:deadline + 1], axis=0)
    day = int(med.argmin()) + 1
    best = float(med[day - 1])
    if best >= price * (1 - MIN_DIP_PCT / 100):   # no meaningful dip expected: waiting doesn't help
        day, best = 0, price
    limit = float(np.quantile(paths[:, 1:deadline + 1].min(axis=1), LIMIT_FILL_PROB))
    limit = min(limit, price)
    fill = first_touch(paths, limit, deadline) if limit < price else {"prob": 1.0, "session": 0}
    return {"best_session": day, "best_price": round(best, 2), "best_vs_now_pct": round((best / price - 1) * 100, 2),
            "limit_price": round(limit, 2), "limit_vs_now_pct": round((limit / price - 1) * 100, 2),
            "limit_fill_prob": fill["prob"], "limit_fill_session": fill.get("session"), "deadline_session": deadline}


def entry_schedule(paths: np.ndarray, n_pre: int, dates: List[date]) -> Dict[str, Any]:
    """
    For each possible entry day from today to the last pre-results session: buy at that close, sell at the
    last close before results. Expected profit (net of costs), typical profit and chance of profit.
    """
    if n_pre < 1:
        return {}
    exit_px = paths[:, n_pre]
    rows = []
    for i in range(0, n_pre):
        r = (exit_px / paths[:, i] - 1) * 100 - ROUND_TRIP_COST_PCT
        rows.append({
            "session": i, "date": str(dates[i]),
            "buy": round(float(np.median(paths[:, i])), 2), "sell": round(float(np.median(exit_px)), 2),
            "exp_pct": round(float(r.mean()), 2), "median_pct": round(float(np.median(r)), 2),
            "win_prob": round(float((r > 0).mean()), 3),
        })
    best = max(rows, key=lambda row: (round(row["exp_pct"], 1), row["win_prob"], row["session"]))
    # Only name a best day if it is a real edge: clears the minimum after costs AND stands out from
    # the other days by more than the simulation's own sampling noise (2 standard errors).
    r_best = (exit_px / paths[:, best["session"]] - 1) * 100 - ROUND_TRIP_COST_PCT
    noise = 2 * float(np.std(r_best)) / math.sqrt(len(r_best))
    spread = best["exp_pct"] - min(row["exp_pct"] for row in rows)
    meaningful = best["exp_pct"] >= MIN_SCHEDULE_EDGE_PCT and (len(rows) == 1 or spread > noise)
    return {"exit_session": n_pre, "exit_date": str(dates[n_pre]), "cost_pct": ROUND_TRIP_COST_PCT,
            "rows": rows, "best_session": best["session"] if meaningful else None, "meaningful": bool(meaningful),
            "best_exp_pct": best["exp_pct"], "noise_pct": round(noise, 2), "min_edge_pct": MIN_SCHEDULE_EDGE_PCT}


def post_results_outlook(paths: np.ndarray, results_idx: int, dates: List[date]) -> Dict[str, Any]:
    """
    If you buy at the close of the first session after results and hold up to ~3 weeks:
    chance the price reaches +X% before -X% (and vice versa), and where it is expected to end.
    """
    if results_idx >= paths.shape[1] - 1:
        return {}
    entry = paths[:, results_idx]
    rel = paths[:, results_idx + 1:] / entry[:, None]
    up = rel >= 1 + OUTLOOK_MOVE_PCT / 100
    down = rel <= 1 - OUTLOOK_MOVE_PCT / 100
    first_up = np.where(up.any(axis=1), up.argmax(axis=1), 10 ** 6)
    first_down = np.where(down.any(axis=1), down.argmax(axis=1), 10 ** 6)
    end = paths[:, -1] / entry
    return {
        "entry_date": str(dates[results_idx]), "entry_price": round(float(np.median(entry)), 2),
        "end_date": str(dates[-1]), "sessions": int(paths.shape[1] - 1 - results_idx),
        "move_pct": OUTLOOK_MOVE_PCT,
        "up_first_prob": round(float((first_up < first_down).mean()), 3),
        "down_first_prob": round(float((first_down < first_up).mean()), 3),
        "end_median_pct": round(float((np.median(end) - 1) * 100), 2),
        "end_up_prob": round(float((end > 1).mean()), 3),
    }


def plan_from_paths(paths: np.ndarray, horizon: int, levels: List[Dict[str, Any]], atr_pct: Optional[float]) -> Dict[str, Any]:
    """Smart stop and targets read straight off the simulated distribution of path extremes."""
    price = float(paths[0, 0])
    window = paths[:, 1:horizon + 1]
    mins, maxs = window.min(axis=1), window.max(axis=1)
    atr = price * (atr_pct or 2.0) / 100.0

    stop = float(np.quantile(mins, STOP_TOUCH_PROB))
    stop_basis = f"only {int(STOP_TOUCH_PROB * 100)}% of simulated paths dip this low before the exit"
    # Snap just below a nearby support: a close below support is a real signal, a dip above it is noise.
    supports = [lv for lv in levels if lv.get("kind") == "support" and stop < lv["price"] < price and lv["price"] - stop <= 0.75 * atr]
    if supports:
        sup = max(supports, key=lambda lv: lv["price"])
        stop = sup["price"] - 0.25 * atr
        stop_basis = f"just below {sup['name']} support ({sup['price']:,.2f})"
    targets = [float(np.quantile(maxs, 1 - p)) for p in TARGET_TOUCH_PROBS]
    out = {
        "price": round(price, 2),
        "stop": round(stop, 2), "stop_pct": round((stop / price - 1) * 100, 2),
        "stop_touch_prob": touch_probability(paths, stop, horizon), "stop_basis": stop_basis,
        "targets": [{"name": f"Target {i + 1}", "price": round(t, 2), "pct": round((t / price - 1) * 100, 2),
                     "touch_prob": touch_probability(paths, t, horizon),
                     "hit": first_touch(paths, t, horizon)} for i, t in enumerate(targets)],
    }
    out["stop_hit"] = first_touch(paths, stop, horizon)
    risk = price - stop
    out["reward_risk"] = round((targets[0] - price) / risk, 2) if risk > 0 else None
    out["expected_exit_pct"] = round(float(np.median(paths[:, horizon]) / price - 1) * 100, 2)
    return out


def band_table(paths: np.ndarray, dates: List[date]) -> List[Dict[str, Any]]:
    q = np.percentile(paths, BANDS, axis=0)
    return [{"date": str(d), **{f"p{b}": round(float(q[i, j]), 2) for i, b in enumerate(BANDS)}}
            for j, d in enumerate(dates)]


def session_dates(start: date, n: int) -> List[date]:
    """Today followed by the next n weekday sessions (exchange holidays not modelled)."""
    out = [start]
    d = np.datetime64(start)
    for _ in range(n):
        d = np.busday_offset(d, 1, roll="forward")
        out.append(pd.Timestamp(d).date())
    return out


def build_price_path(prices: pd.DataFrame, live_price: Optional[float], today: date, baseline: date,
                     strategy: str, runup_mean_pct: Optional[float], reaction_mean_pct: Optional[float],
                     own_moves: np.ndarray, universe_moves: np.ndarray, implied_move_pct: Optional[float],
                     levels: List[Dict[str, Any]], atr_pct: Optional[float], exclude_idx: Optional[set] = None,
                     seed: int = 7) -> Dict[str, Any]:
    close = prices["close"].to_numpy(dtype=float)
    last_bar = prices.index[-1].date()
    price = float(live_price) if live_price else float(close[-1])
    origin = max(today, last_bar)
    n_pre = int(np.busday_count(origin + timedelta(days=1), baseline + timedelta(days=1))) if baseline > origin else 0
    res = standardised_residuals(close, exclude_idx)
    rng = np.random.default_rng(seed + 1)
    jumps = results_jump_pool(own_moves, universe_moves, reaction_mean_pct, implied_move_pct, rng, 20000)
    n_post = POST_RESULTS_SESSIONS
    paths = simulate(price, res["z"], res["sigma_now"], n_pre, runup_mean_pct, jumps, DISPLAY_POST_SESSIONS, seed=seed)
    dates = session_dates(origin, n_pre + DISPLAY_POST_SESSIONS)
    # Run-up trades exit on the last pre-results close; everything else is judged through the results window.
    horizon = max(n_pre, 1) if strategy == "RUNUP" else n_pre + n_post
    plan = plan_from_paths(paths, horizon, levels, atr_pct)

    def when(i):
        return str(dates[i]) if i is not None and 0 <= i < len(dates) else None
    for t in plan["targets"]:
        h = t["hit"]
        t.update(hit_date=when(h["session"]), hit_early=when(h["early"]), hit_late=when(h["late"]))
    plan["stop_hit_date"] = when(plan["stop_hit"]["session"])
    # Entry window: run-up trades must be in by T-5 (validated window); otherwise anytime through the forecast.
    deadline = max(1, n_pre - 5) if strategy == "RUNUP" and n_pre > 5 else max(1, n_pre) if strategy == "RUNUP" else n_pre + n_post
    entry = entry_advice(paths, deadline)
    entry.update(best_date=when(entry["best_session"]), limit_fill_date=when(entry["limit_fill_session"]),
                 deadline_date=when(entry["deadline_session"]),
                 after_results=entry["best_session"] > n_pre)
    for lv in levels:
        lv["touch_prob"] = touch_probability(paths, lv["price"], horizon)
    recent = prices.iloc[-40:]
    return {
        "as_of": str(origin), "price": round(price, 2), "price_source": "live" if live_price else "last close",
        "daily_vol_pct": round(res["sigma_now"] * 100, 2),
        "results_index": n_pre + 1, "exit_index": horizon, "horizon_sessions": horizon,
        "history": [{"date": str(i.date()), "close": round(float(v), 2)} for i, v in recent["close"].items()],
        "bands": band_table(paths, dates),
        "plan": plan,
        "entry": entry,
        "after_results": post_results_outlook(paths, n_pre + 1, dates),
        "entry_schedule": entry_schedule(paths, n_pre, dates),
        "levels": levels,
        "results_move_p10_p90": [round(float(np.percentile(np.expm1(jumps) * 100, 10)), 2),
                                 round(float(np.percentile(np.expm1(jumps) * 100, 90)), 2)],
    }


def calibrate_paths(panel: pd.DataFrame, load_prices, n_events: int = 300, origin_offset: int = 10, seed: int = 11) -> Dict[str, Any]:
    """
    Backtest: from 10 sessions before past results, simulate with only information available then,
    and check how often reality landed inside the bands and touched the stop / Target 1.
    """
    rng = np.random.default_rng(seed)
    done = panel[panel["ar_3d"].notna() & panel["ret_1d"].notna()].copy()
    if done.empty:
        return {}
    tickers = rng.permutation(done["ticker"].unique())
    checks = {"inside_80_pre": [], "inside_80_post": [], "inside_50_pre": [], "stop_touched": [], "t1_touched": []}
    date_err: List[int] = []
    limit_filled: List[bool] = []
    used = 0
    for tk in tickers:
        if used >= n_events:
            break
        px = load_prices(tk)
        if px is None or len(px) < 400:
            continue
        evs = done[done["ticker"] == tk].sort_values("baseline_date")
        for ev in evs.sample(min(2, len(evs)), random_state=int(rng.integers(0, 1_000_000))).itertuples(index=False):
            b = px.index.searchsorted(pd.Timestamp(ev.baseline_date))
            if b >= len(px) or px.index[b] != pd.Timestamp(ev.baseline_date).normalize():
                continue
            o = b - origin_offset
            if o < 300 or b + DISPLAY_POST_SESSIONS >= len(px):
                continue
            hist = px.iloc[:o + 1]
            prior = done[done["baseline_date"] < pd.Timestamp(px.index[o])]
            own = prior[prior["ticker"] == tk]["ret_1d"].to_numpy()
            uni = prior["ret_1d"].to_numpy()
            res = standardised_residuals(hist["close"].to_numpy(dtype=float))
            jumps = results_jump_pool(own, uni, float(prior["ar_3d"].mean()) if len(prior) else 0.0, None, rng, 20000)
            paths = simulate(float(hist["close"].iloc[-1]), res["z"], res["sigma_now"], origin_offset, None, jumps,
                             DISPLAY_POST_SESSIONS, n_paths=2000, seed=int(rng.integers(0, 1_000_000)))
            actual = px["close"].to_numpy(dtype=float)[o:b + DISPLAY_POST_SESSIONS + 1]
            q = np.percentile(paths, (10, 25, 75, 90), axis=0)
            pre, post = origin_offset, origin_offset + POST_RESULTS_SESSIONS
            checks["inside_80_pre"].append(q[0, pre] <= actual[pre] <= q[3, pre])
            checks["inside_50_pre"].append(q[1, pre] <= actual[pre] <= q[2, pre])
            checks["inside_80_post"].append(q[0, post] <= actual[post] <= q[3, post])
            far = origin_offset + DISPLAY_POST_SESSIONS
            checks.setdefault("inside_80_3w", []).append(q[0, far] <= actual[far] <= q[3, far])
            # did the post-results outlook's +3%/-3% race go the way it was expected to?
            out = post_results_outlook(paths, pre + 1, [date.today()] * paths.shape[1])
            rel = actual[pre + 2:] / actual[pre + 1]
            hit_up = np.argmax(rel >= 1 + OUTLOOK_MOVE_PCT / 100) if (rel >= 1 + OUTLOOK_MOVE_PCT / 100).any() else 10 ** 6
            hit_dn = np.argmax(rel <= 1 - OUTLOOK_MOVE_PCT / 100) if (rel <= 1 - OUTLOOK_MOVE_PCT / 100).any() else 10 ** 6
            if hit_up != hit_dn:
                checks.setdefault("outlook_pred_up", []).append(out["up_first_prob"])
                checks.setdefault("outlook_real_up", []).append(hit_up < hit_dn)
            plan = plan_from_paths(paths, pre, [], None)
            window = actual[1:pre + 1]  # closing prices, matching the "if it closes below the stop" rule
            checks["stop_touched"].append(float(window.min()) <= plan["stop"])
            adv = entry_advice(paths, pre)
            if adv["limit_price"] < float(hist["close"].iloc[-1]):
                limit_filled.append(float(window.min()) <= adv["limit_price"])
            t1 = plan["targets"][0]
            checks["t1_touched"].append(float(window.max()) >= t1["price"])
            if float(window.max()) >= t1["price"] and t1["hit"]["session"]:
                actual_first = int(np.argmax(window >= t1["price"])) + 1
                date_err.append(abs(actual_first - t1["hit"]["session"]))
            used += 1
    if not used:
        return {}
    out = {k: round(float(np.mean(v)), 3) for k, v in checks.items()}
    if limit_filled:
        out["limit_filled"] = round(float(np.mean(limit_filled)), 3)
    if date_err:
        out["t1_date_within_2_sessions"] = round(float(np.mean(np.array(date_err) <= 2)), 3)
        out["t1_date_median_error_sessions"] = float(np.median(date_err))
    out.update({"n": used, "designed": {"inside_80": 0.80, "inside_50": 0.50, "stop_touched": STOP_TOUCH_PROB,
                                        "t1_touched": TARGET_TOUCH_PROBS[0], "limit_filled": LIMIT_FILL_PROB}})
    return out
