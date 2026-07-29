# NSE Multi-Factor Momentum Algorithm — Buildable Spec v1

This is the algorithm, not a critique of one — everything below is meant to be built in the order given. It keeps the original factor taxonomy (it was sound), fixes the parts that weren't implementable, drops the parts that don't survive contact with real NSE data or a real budget, and phases the rest so Phase 1 alone is a complete, shippable thing.

## Scope & assumptions

- **Universe:** NSE-listed, liquid, not under surveillance.
- **Horizon:** swing/positional — signals target 3/5/10-day forward probability of gain, not intraday. This matters: it means you don't need tick data, Level-2 depth, or colocated feeds, all of which are expensive and add little at this horizon.
- **Budget posture:** free/scraped data first; a paid vendor is a Phase 2+ decision, not a Phase 1 requirement.
- **Stack assumption:** this slots into a Postgres + Celery (beat scheduler) + FastAPI setup — Celery beat plays the role Airflow would play elsewhere; no new orchestration tool needed.
- **Explicitly out of scope for v1:** options Greeks/IV surface reconstruction, LSTM/Transformer as standalone models, real-time order-book depth, intraday execution. Reasons are in "What's deferred" below.

---

## 1. Data layer & point-in-time discipline

Every table needs two timestamps, not one: `period_end` (what the data is *about*) and `known_at` (when it was actually published/visible). All feature joins use `known_at <= decision_date`. This single rule prevents the most damaging failure mode: a backtest that looks great because it's quietly using information from the future.

| Input | Source (free) | Lag | Notes |
|---|---|---|---|
| OHLCV | NSE/BSE bhavcopy | same day (EOD) | |
| Delivery % | NSE bhavcopy | T+1 | don't join it as same-day |
| Fundamentals/ratios | Company filings / scraped | 30-45+ days post quarter-end | use `known_at`, not `period_end` |
| Promoter holding/pledge | Shareholding pattern filings | quarterly, lagged | |
| Bulk/block deals | NSE daily disclosure | same day EOD | easy win, don't skip it |
| Insider trades | SEBI/exchange filings | days, unstructured text | needs a parser |
| FII/DII activity | NSE/SEBI daily aggregate | same day EOD | **market-wide only** — there is no free per-stock daily FII feed; per-stock FII holding is quarterly, from shareholding filings |
| Options chain/OI | NSE live chain | real-time/EOD | Greeks/IV history is DIY work, defer |
| India VIX, macro, commodities, bond yield | Public sources | daily | |
| News/sentiment | Scraped headlines | near-real-time | route through an LLM call rather than building separate NLP |

Paid options if you outgrow free sources later: **Kite Connect** (broker-side live/historical data), **TrueData** (NSE market data feeds), **CMIE Prowess** / **Tofler** (deeper fundamentals/ownership). Not needed for Phase 1.

---

## 2. Universe filter

```
eligible = 
    market_cap > MC_MIN
    AND avg_daily_traded_value(20d) > ADV_MIN
    AND NOT in ASM/GSM/surveillance
    AND NOT suspended
    AND NOT in circuit-filter band for the session
```
Start `MC_MIN`/`ADV_MIN` at whatever level gives you a stable few hundred names historically (back-test the filter itself — check it wouldn't have excluded most of your universe in past years), then tune.

---

## 3. Score construction

For v1, every score is a **cross-sectional percentile rank average** — no model needed yet, and it's auditable:

```
score_category(stock, date) = 
    100 × mean( percentile_rank_within_universe(metric_i, date) 
                for metric_i in category_metrics )
```

Categories and what's actually in them (trimmed from the original list — kept what's cheaply available and point-in-time-safe, dropped/deferred what isn't):

- **Fundamental:** revenue/EPS growth (QoQ, YoY), margin trend, ROE/ROCE, debt/equity, interest coverage, cash-flow growth, PEG. All from as-published filings, joined on `known_at`.
- **Technical/Momentum:** EMA distances, higher-highs/lows, N-day-high breakouts, relative volume, delivery % (T+1-joined), RSI/MACD/ADX/ROC (pick 2-3, they're correlated — see feature selection), ATR-based volatility, relative strength vs Nifty/sector.
- **Smart Money:** promoter holding *change* (quarterly, lagged), promoter pledge *reduction*, bulk/block deal net direction, institutional delivery %. FII/DII used only as a **market-wide regime input**, not a per-stock feature (see table above).
- **Derivatives:** OI change, PCR, IV percentile vs history, futures premium — all lagged to the following session since OI reports post-market.
- **Sector:** sector relative strength, sector breadth, sector volume trend.
- **Market Regime:** Nifty/BankNifty trend, advance-decline ratio, India VIX level, 52w high/low ratio. Used as a regime gate, not folded into the per-stock composite.

**Deferred to Phase 4:** News/Catalyst score — this needs NLP, so it comes after the core system is validated (see Phase 4 below).

---

## 4. Feature selection (before any model touches the data)

1. Drop feature pairs with |correlation| > 0.9 — keep the more interpretable one (this alone removes a lot of redundancy from stacking 4 EMAs and 4 momentum oscillators).
2. Compute each feature's Spearman rank correlation (IC) against forward returns in the training window; drop anything with consistently near-zero IC.
3. Train one baseline GBM pass, rank survivors by SHAP importance, keep roughly the top 40-60.

This turns "150+ raw inputs" into a manageable, justified feature set instead of feeding everything to the model and hoping regularization sorts it out.

---

## 5. Modeling

- **Primary model:** one LightGBM (or XGBoost) model per horizon (3d/5d/10d), trained directly on the selected features to output P(gain). Skip stacking 5 models for v1 — one well-validated model beats a badly-validated ensemble.
- **Baseline sanity check, always run alongside it:** plain logistic regression on the same features. If the GBM doesn't clearly beat it out-of-sample, that's a sign of overfitting, not edge — don't ship the GBM until it does.
- **Sequence models (LSTM/Transformer/autoencoder):** not a standalone model in v1. If you want this later, use it only as a feature-embedding generator (train it to compress each stock's recent price/volume history into a vector, feed that vector into the same GBM as extra features) — it gets a feature slot, not a vote. Don't chase headline backtest numbers from single papers on this (a widely-cited 45.9%-annualized autoencoder-momentum result from a 2013 Stanford class project is reported pre-transaction-cost and has been flagged by practitioners as plausible data-mining bias for over a decade — it shows the *technique* is worth exploring eventually, not that it will replicate for you).
- **Validation:** purged, embargoed walk-forward cross-validation. Embargo length ≥ the longest label horizon (10 days) so overlapping-return labels can't leak across folds. No single static train/test split.

---

## 6. Composite scoring & confidence

Skip hand-set weights (30/25/15/10/10/5/5 was never going to be right by construction). Two ways to get real weights, pick one:

- **A — simple, transparent:** feed the 6 sub-scores into a non-negative-least-squares or L2-logistic meta-model against forward returns, refit quarterly on a walk-forward schedule.
- **B — usually stronger:** skip the sub-score bucketing and let the Step 5 GBM train directly on the selected raw features; use SHAP per-prediction to show which factor category drove each signal (recovers the interpretability you'd lose by not hand-weighting).

**Confidence Score**, defined concretely instead of left vague: ensemble agreement (variance across CV-fold models or a few seeded reruns) or the calibrated probability's distance from 0.5. This scales position size in Step 7 — it does not get added into the BUY/WATCH/SELL score.

---

## 7. Decision engine

Replace the six-condition AND-gate with one calibrated threshold plus filters:

```
BUY        if P(gain, 5d) >= threshold_buy   AND regime != Bearish AND liquidity/ASM filters pass
WATCHLIST  if threshold_watch <= P(gain, 5d) < threshold_buy
EXIT       if P(gain, 5d) < threshold_exit  OR stop-loss hit  OR regime flips Bearish
```
`threshold_buy`/`threshold_watch`/`threshold_exit` come from the historical precision-recall curve on validation data — not round numbers picked in advance. Check the resulting signal frequency: if a threshold produces too few trades a year to be statistically meaningful, that's real information, not a config to ignore.

---

## 8. Risk engine

```
position_size = (risk_per_trade_pct × capital) / (ATR × stop_multiple)
stop_loss     = entry − (ATR × stop_multiple)
```
- `risk_per_trade_pct`: start around 0.5-1% of capital, tune by backtest.
- `stop_multiple`: start around 1.5-3× ATR, tune by backtest.
- **Portfolio caps:** max concurrent positions; max weight per name (start ~20%); max sector exposure (start ~30%) — starting conventions, not final numbers.
- **Correlation gate:** reject a new position if correlated with existing holdings above a set threshold and position count is already near cap.
- **Portfolio beta throttle:** compute net portfolio beta vs Nifty; if it's already elevated and Market Regime is weakening, pause new longs — sector diversification alone doesn't protect against a broad market drop.
- **Event-risk blackout:** no new entries immediately ahead of known high-impact events for that stock or the market (earnings date, RBI policy day, Budget day) unless gap risk is explicitly modeled.
- **Kill switch:** automated halt on new orders past a defined drawdown threshold or on data-feed/anomaly failure — don't depend on someone watching a dashboard.
- **Transaction cost model, inside the backtest, not after it:** STT + stamp duty + GST on brokerage + an impact-cost estimate scaled to order size vs. ADV.

---

## 9. Validation & backtesting

**Validate each score before trusting the composite:**
- **Information Coefficient (IC):** per date, Spearman rank correlation between the score and forward return across the universe; average over time and check the sign is consistent. Rough convention: ~0.02-0.05 mean IC is a usable single signal, >0.1 is strong; near-zero or sign-flipping means that score isn't adding information regardless of how intuitive it feels.
- **Quintile spread test:** rank stocks into 5 buckets by score each period, check forward returns are roughly monotonic bucket-to-bucket. Cheapest way to catch a score that's secretly proxying for something else (e.g. size).
- **IC decay:** check how fast the score's predictive power fades — confirms whether it actually matches the 3/5/10-day horizon you're targeting it at.
- Only scores that clear this get weight in Section 6's composite.

**Validate the composite/model:**
- Point-in-time joins everywhere (Section 1) — non-negotiable.
- Purged, embargoed walk-forward CV for every model (Section 5): drop training rows whose label window overlaps the test fold, then skip a buffer ≥ the longest horizon before resuming training.
- **Calibration check:** bucket predicted probabilities and confirm realized outcome rates match (a model saying "70%" should be right ~70% of the time) — the decision thresholds and confidence-based sizing both depend on this holding.
- Beat real baselines: plain momentum alone, logistic regression on the same features, equal-weight sub-score average. If the added complexity doesn't clear these out-of-sample, don't ship it.
- Metrics reported **net of costs**: Sharpe, hit rate, max drawdown, turnover, and capacity.
- Paper-trade before capital.

**Retraining triggers:**
- **Scheduled:** fixed cadence (e.g. quarterly) regardless of anything else, same walk-forward scheme.
- **Drift-triggered:** monitor feature distributions vs. training data (Population Stability Index — >~0.1 mild drift, >~0.2 worth acting on) and rolling live IC/hit-rate vs. backtest expectation. Judge on a persistent multi-week trend, not a single bad week — equity signals are noisy.
- **Shadow mode before swap:** any retrained model runs scoring-only (not driving trades) for a few weeks and must hold up prospectively before it replaces the production model.
- Implementation note: a Postgres table logging daily score/prediction values plus the realized forward return (filled in once it resolves), with a Celery periodic task computing rolling IC/PSI off that table and flagging "retrain due" past threshold, needs no new tooling beyond what's already in the stack.

---

## 10. Deployment (mapped to your existing stack)

- **Celery beat, nightly:** pull bhavcopy, corporate actions, filings → Postgres, with `known_at` stamped at ingestion.
- **Celery task, nightly:** compute features and scores → a Postgres feature-store table.
- **Celery task, nightly:** run inference → signals table (score, probability, confidence, stop, target, position size).
- **FastAPI/GraphQL:** serve signals to the frontend as already set up.
- **Phase 4 sentiment scoring:** reuse the existing Gemini call already in the pipeline for equity research — same call, different prompt — instead of standing up a separate NLP stack.
- **Monitoring:** rolling live-vs-backtest performance comparison; monthly feature-drift check (e.g. population stability index on top features); retrain on a fixed cadence (e.g. quarterly) using the same walk-forward scheme.

---

## What's deferred, and why

| Cut from original | Why |
|---|---|
| LSTM/Transformer as standalone ensemble members | Not enough clean, leak-free NSE data to justify the added overfitting risk vs. a GBM |
| Options Greeks/IV surface | No free historical source; DIY reconstruction is a project on its own |
| Real-time order-book depth, tick data | Not needed at a 3-10 day horizon; expensive for retail anyway |
| Social/Twitter sentiment as a separate pipeline | Reuse the existing LLM call over scraped news instead — cheaper, one system instead of two |
| Hand-set composite weights (30/25/15/10/10/5/5) | Replaced with learned weights (Section 6) |
| Six-condition AND-gate for BUY | Replaced with one calibrated threshold (Section 7) |

---

## Phased build roadmap

Each phase has a gate — don't start the next until the current one clears it net of costs, out-of-sample.

1. **Phase 1 — Core, free data only.** Universe filter → Fundamental + Technical + Market-Regime scores (percentile-rank method, Section 3) → simple equal-weight composite → walk-forward backtest with real costs → paper trade. **Gate:** positive net-of-cost Sharpe out-of-sample. If this fails, nothing downstream is worth building yet.
2. **Phase 2 — Smart Money + Derivatives.** Add these scores once Phase 1 clears. **Gate:** measurable incremental improvement over Phase 1 alone — if adding them doesn't move the needle, don't carry the added data-pipeline complexity forward.
3. **Phase 3 — ML layer.** Replace the rule-based composite with the Section 5 GBM + Section 6 learned weights, using the reduced feature set and purged walk-forward CV. **Gate:** beats both the logistic-regression baseline and the Phase 2 rule-based composite, net of costs.
4. **Phase 4 — Catalyst/Sentiment.** Add via the existing LLM call over scraped news. **Gate:** measurable incremental lift again — sentiment signals are typically weaker and noisier than the others, so verify it's earning its complexity.
5. **Phase 5 (optional) — Sequence-model embeddings.** Only if Phase 3 is solid and you have enough clean per-stock history. **Gate:** an ablation showing the embeddings improve the GBM's out-of-sample performance — not just a vibe that "deep learning should help."
