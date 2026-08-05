# QHLM Research Loop — Remediation Plan & Antigravity Prompt (v2)

v2 adds: per-stock live signal generation ("which shares fit this strategy today"), and
three items found by reading the project's own architecture doc (project.md / README.md):
reusing the existing RiskEngine correlation-gate pattern instead of building a new one,
auditing ValidationService's separate 14-day ML shadow probation for the same timer-only
bug found in QHLM's shadow stage, and reconciling two silently different IC significance
thresholds (QHLM: 0.015, ValidationService: 0.03).

## 0. Before anything else: cut the live-capital connection

Every bug below means strategies have likely been (or will be) promoted to `LIVE_ALPHA_STREAM`
without valid statistical support. Feature-flag whatever consumes `LIVE_ALPHA_STREAM`
hypotheses for real trading/capital allocation before touching anything else, so the
pipeline keeps running and producing data without risking capital on invalid signals.

---

## 1. Bug inventory (for reference — Antigravity should re-derive/confirm, not blindly trust)

| # | Severity | Location | Bug |
|---|----------|----------|-----|
| 1 | Critical | `hypothesis_service.py::evaluate_hypothesis` | `alpha_expression` is never parsed/evaluated — substring matching (`"volume" in expr`) collapses almost all formulas into one of 3 hardcoded proxies. The backtested factor is usually not the proposed factor. |
| 2 | Critical | `hypothesis_service.py::calculate_deflated_sharpe` call sites | DSR's trial count (`total_trials`) defaults to 1 in the automated path and is wrongly computed as re-evaluations of one hypothesis (not total hypotheses tested) in the scheduled path. Multiple-testing correction is effectively disabled. |
| 3 | Critical | `hypothesis_service.py::check_and_evolve_all_hypotheses` | 14-day shadow promotion is a pure timer — no performance metric computed during `OUT_OF_SAMPLE_SHADOW`. |
| 4 | Critical | `hypothesis_service.py::check_and_evolve_all_hypotheses` | Decay-detection checks `l.experiments[-1]`, which for a live hypothesis is always the original in-sample record (nothing appends new experiments during shadow/live) — branch can never fire. No `order_by` on the relationship either. |
| 5 | High | `hypothesis_service.py::evaluate_hypothesis` | Per-ticker loop pools scores/returns across tickers as if i.i.d. (ignores cross-sectional correlation), and computes the top/bottom quantile threshold per-ticker instead of cross-sectionally per date — doesn't test the rank()-based long/short portfolio the formulas imply. |
| 6 | High | `ai_analyst_service.py::generate_orthogonal_hypothesis` | Fallback candidate list dedupes by name only; once exhausted, emits the same `alpha_expression` forever under incrementing `V{n}` names. |
| 7 | High | `tasks.py::run_automated_hypothesis_research_task` | Generates exactly 1 hypothesis per run regardless of how far below target the active count is. |
| 8 | Medium | Nowhere | No numeric correlation check between a new hypothesis and active/live hypotheses' actual return series — "orthogonal" is prompt text only, never verified. |
| 9 | Medium | `tasks.py::run_automated_hypothesis_research_task` | `failed`/`active` queries have no `.order_by()`, and `active` lumps `ALPHA_DECAY_ARCHIVE` in with genuinely active hypotheses when building Gemini's context. |
| 10 | Medium | `ai_analyst_service.py::evaluate_multi_source_sentiment` | Prompts Gemini for "Reddit/news sentiment" with no actual news/Reddit data in the payload — output is an LLM prior, not real analysis. Should not feed any live signal until real data sources are wired in. |
| 11 | High | Missing entirely | No task ever runs a `LIVE_ALPHA_STREAM` hypothesis's formula against *today's* data to produce a per-stock list. QHLM validates strategies but never applies them — there is currently no answer to "which shares fit this strategy today." |
| 12 | Unverified | `validation_service.py` (not yet reviewed) | Project docs describe a *second*, separate 14-day shadow probation for ML model retraining, worded identically to QHLM's ("silent background evaluation for 14 days, promote if superior"). Given QHLM's version turned out to be a pure timer with no real evaluation, this sibling system needs the same scrutiny — don't assume it's fine. |
| 13 | Design inconsistency | QHLM vs `ValidationService` | QHLM requires `ic >= 0.015`; ValidationService's momentum/ML system requires `IC > 0.03` for what's conceptually the same statistic. Not necessarily wrong, but currently silently inconsistent rather than a deliberate, documented choice. |

---

## 2. Implementation plan

### Phase 1 — Make the backtest test the actual formula
**Goal:** `alpha_expression` is parsed into real operators and evaluated on a proper
cross-sectional, date-indexed panel. This engine gets reused in Phase 6 for live signals,
so build it generically (accepts a date range, not just "3 years back").
**Tasks:** restricted-grammar parser (no `eval()`/`exec()`) for `rank`, `delta`,
`volatility`, `close`, `volume`, `high`, `low`; wide-format panels (dates x tickers);
cross-sectional `rank()` per date; long/short portfolio construction as one daily return
series; Newey-West or block-resampled standard errors for the 5-day-holding autocorrelation.
**Acceptance criteria:** two formulas that both contain "volume" and "close" but differ
mathematically produce different results; `rank()` output is a valid 0-1 percentile
cross-sectionally on every date with >=30 names; known-answer test on a synthetic panel
with an injected signal.

### Phase 2 — Fix DSR's trial count
**Tasks:** durable, monotonic total-trial counter (every distinct hypothesis ever tested);
thread explicitly into every `calculate_deflated_sharpe` call site; remove the
`trials_in_family=1` default — require callers to pass it explicitly.
**Acceptance criteria:** omitting trial count raises an error rather than defaulting; DSR
score decreases monotonically as trial count increases; after registering N hypotheses,
the N+1th evaluation receives `trials_in_family >= N+1`.

### Phase 3 — Real shadow probation and decay detection (QHLM), then audit the sibling system
**Tasks:** minimum shadow duration 150 trading days (document the reasoning: ~30
independent 5-day return draws); run the Phase 1 engine against realized shadow-period
data and require it to independently clear the DSR/IC bar before promotion; every
evaluation appends a new `HypothesisExperiment` row; fix decay detection to read the most
recent experiment correctly (explicit ordering).
**Additional task:** open `validation_service.py` and check whether
`evaluate_model_probation` (the ML-retraining 14-day shadow) has the same timer-only
pattern as bug #3. If so, apply the same class of fix there (bug #12) — report findings
even if it turns out to already be implemented correctly.
**Acceptance criteria:** hypothesis younger than minimum shadow duration is never promoted
regardless of performance; a hypothesis failing the DSR/IC bar after minimum duration is
archived, not promoted; decay detection fires on synthetic experiment rows with realistic
timestamps; written findings on whether `ValidationService` has the equivalent bug.

### Phase 4 — Correlation gate, dedup, safe fallback, batched generation
**Tasks:** `normalized_expression` column with uniqueness constraint (dedupe by formula
content, not name); cap/alert on fallback exhaustion in `generate_orthogonal_hypothesis`
instead of silently repeating a formula; persist each hypothesis's backtested return
series; correlation gate before `IN_SAMPLE_AUDIT` admission — **reuse the existing
correlation-gating implementation in `RiskEngine`** (180-day Pearson correlation check
already used for portfolio holdings) rather than writing a new one from scratch, adapted
to compare hypothesis-level return series instead of single-stock returns; threshold
0.4-0.5 (looser than RiskEngine's 0.78, since hypothesis returns are portfolio-level, not
single-stock — flag this choice for review rather than assuming it, since it's a judgment
call, not a derived number); fix unordered `failed`/`active` queries, exclude
`ALPHA_DECAY_ARCHIVE` from the "active" context sent to Gemini; batch generation up to
configurable `TARGET_PIPELINE_DEPTH`.
**Additional task:** explicitly reconcile bug #13 — QHLM's `ic >= 0.015` vs
`ValidationService`'s `IC > 0.03`. Don't silently pick one; document why they differ (if
they should) or align them (if they shouldn't), and surface the decision in the plan for
review rather than deciding unilaterally.
**Acceptance criteria:** duplicate-formula registration rejected regardless of name;
fallback exhaustion raises/logs rather than repeating; a full research cycle from
`active_count = 0` generates up to `TARGET_PIPELINE_DEPTH` distinct, non-duplicate,
uncorrelated (by the gate) hypotheses.

### Phase 5 — Live capital re-connection
Remove the Phase 0 feature flag only after Phases 1-4 are verified and have run through at
least one full validation cycle in shadow with results that hold up under manual review.

### Phase 6 — Live per-stock signal generation ("which shares fit this strategy today")
**Goal:** every `LIVE_ALPHA_STREAM` hypothesis produces an actual, current ranked stock
list — this is currently missing entirely (bug #11), not broken.
**Tasks:**
- New task `generate_live_signals_task`: for each `LIVE_ALPHA_STREAM` hypothesis, run the
  Phase 1 factor engine against the most recent trading day's `DailyBhavcopy` data (already
  synced daily by `sync_nse_market_data_task`) to compute today's cross-sectional rank per
  ticker.
- New table, e.g. `HypothesisSignal(hypothesis_id, ticker, trade_date, factor_score,
  rank_percentile, direction)` — store top/bottom N per hypothesis per day, not just the
  single best stock.
- Schedule it to run after `sync_nse_market_data_task` completes each day (dependency
  ordering, not just a separate cron time).
- Follow the project's own documented schema-change procedure (models.py -> Alembic
  migration -> Strawberry GraphQL type in `graphql/types.py` -> resolver in
  `graphql/queries.py` -> Apollo query in the relevant frontend page) rather than
  inventing a different pattern.
- Frontend: show each live strategy's list **separately**, not blended into one combined
  ranking — the correlation gate in Phase 4 exists specifically to keep these strategies
  diversified from each other, and blending their outputs by default would undo that. This
  likely belongs in `HypothesisLaboratory.tsx` (extend the existing `/research` page)
  rather than a new route, but Antigravity should confirm the best fit given the actual
  component structure.
**Acceptance criteria:** for a `LIVE_ALPHA_STREAM` hypothesis, running the task against a
known synthetic day's data produces a ranking matching a hand-computed expected order;
GraphQL query returns per-hypothesis signal lists; frontend renders them as distinct
per-strategy lists, not merged.

---

## 3. Prompt for Antigravity

Paste the block below as-is into a new Antigravity task.

\`\`\`
ROLE & CONTEXT
I'm the maintainer of a quantitative research pipeline (QHLM — Quantitative Hypothesis
Lifecycle Manager) inside a larger app called QEPS (Quantitative Earnings Prediction
System). It's a Celery-scheduled system where Gemini proposes alpha-factor formulas for
NSE (Indian stock exchange) equities, which get backtested and pushed through a 5-stage FSM
(DRAFT_HYPOTHESIS -> IN_SAMPLE_AUDIT -> OUT_OF_SAMPLE_SHADOW -> LIVE_ALPHA_STREAM ->
ALPHA_DECAY_ARCHIVE), gated by a Deflated Sharpe Ratio (Bailey & Lopez de Prado 2014) and
Spearman IC significance test. QEPS also has a separate, pre-existing Momentum Scanner
(MomentumService/MomentumTracker.tsx at /momentum) that is NOT part of QHLM and should not
be modified by this task, and a RiskEngine with an existing correlation-gating
implementation that this task should reuse rather than duplicate.

Primary files (confirm actual paths/names on inspection — may not match exactly):
- app/services/ai_analyst_service.py (Gemini prompt/response handling, hypothesis generation)
- app/services/hypothesis_service.py (DSR/IC calculation, FSM evolution, evaluation)
- app/services/validation_service.py (separate 14-day ML shadow probation — audit only, see below)
- app/services/risk_engine.py or similar (existing correlation-gating pattern to reuse)
- app/worker/tasks.py (Celery tasks, including run_automated_hypothesis_research_task,
  check_and_evolve_all_hypotheses, sync_nse_market_data_task)
- app/infrastructure/models.py (ResearchHypothesis, HypothesisExperiment, DailyBhavcopy)
- app/graphql/types.py, app/graphql/queries.py (Strawberry GraphQL schema/resolvers)
- frontend/src/pages/HypothesisLaboratory.tsx (the /research page)

A code review has confirmed the following issues are real (verify each independently
against current code before fixing — don't assume this list is exhaustive or that any
described line still matches current code):

1. CRITICAL: alpha_expression is never actually parsed/evaluated in evaluate_hypothesis().
   It's substring-matched ("volume" in expr, "close" in expr, etc.) into one of ~3
   hardcoded pandas formulas regardless of what the actual formula specifies. The backtest
   does not test the proposed strategy.

2. CRITICAL: The Deflated Sharpe Ratio's trial count is not tracked correctly. The
   automated path calls evaluate_hypothesis() with no explicit trials_in_family, silently
   defaulting to 1, which disables the multiple-testing correction entirely. The scheduled
   path passes len(hypothesis.experiments) + 1, which counts re-evaluations of ONE
   hypothesis, not the total distinct hypotheses ever tested (which is what N should
   represent per Bailey & Lopez de Prado). Both are wrong.

3. CRITICAL: OUT_OF_SAMPLE_SHADOW -> LIVE_ALPHA_STREAM promotion is a pure elapsed-time
   check (14 days). No performance metric is computed during the shadow period at all.

4. CRITICAL: Alpha-decay detection checks hypothesis.experiments[-1], which for a live
   hypothesis is still the original in-sample record (nothing appends new experiment rows
   during shadow/live), so decay detection can structurally never trigger. No explicit
   ordering on the experiments relationship either.

5. HIGH: evaluate_hypothesis() pools factor scores and forward returns across all sampled
   tickers into flat lists as if independent, ignoring cross-sectional correlation between
   stocks on the same date. The top/bottom quantile threshold is computed per-ticker
   (that ticker's own historical distribution) rather than cross-sectionally per date, so
   it isn't testing the rank()-based long/short portfolio the formulas imply.

6. HIGH: generate_orthogonal_hypothesis()'s fallback path dedupes by NAME only. Once the
   hardcoded candidate list is exhausted, it returns the same alpha_expression forever
   under an incrementing name suffix, silently injecting duplicate formulas as distinct
   trials.

7. MEDIUM: run_automated_hypothesis_research_task() generates exactly one new hypothesis
   per run regardless of how far active_count is below target, and its DB queries for
   failed/active hypotheses have no ORDER BY and lump ALPHA_DECAY_ARCHIVE (retired) into
   the "active" context sent to Gemini.

8. MEDIUM: there is no numeric correlation check between a new hypothesis and existing
   active/live hypotheses' actual backtested return series — "orthogonality" is currently
   enforced only via Gemini prompt instructions.

9. HIGH / MISSING FEATURE: no task ever runs a LIVE_ALPHA_STREAM hypothesis's formula
   against current/live data to produce a per-stock ranked list. QHLM validates strategies
   but never applies them to answer "which stocks fit this strategy today." This is the
   second major goal of this task, not just a bug fix.

10. NEEDS AUDIT: the project's own architecture docs describe validation_service.py as
    implementing a second, separate 14-day shadow probation for ML model retraining,
    described in terms that mirror QHLM's broken one (silent background evaluation, then
    promote after 14 days if superior). Given issue #3 above turned out to be a pure timer
    with no real evaluation, audit validation_service.py for the same pattern. Do NOT
    assume it's fine just because it's a different subsystem - check it, and report
    findings either way.

11. DESIGN DECISION NEEDED, NOT A BUG TO SILENTLY FIX: QHLM requires ic >= 0.015;
    validation_service.py's momentum/ML system requires IC > 0.03 for what's conceptually
    the same statistic (predictive power of a score against forward returns). Surface this
    inconsistency in your plan and propose a resolution (align them, or document why they
    should legitimately differ) rather than picking one silently.

TASK
Fix issues 1-8 and audit/resolve 10-11, in the dependency order below, WITHOUT weakening
any statistical safeguard. Then implement issue 9 as new functionality: for every
LIVE_ALPHA_STREAM hypothesis, generate a real per-stock ranked list from current market
data. Also prepare the system for higher daily hypothesis-generation throughput (target: up
to 15 hypotheses in-flight across all non-terminal FSM stages, up from an effective ~1/day
today) — but only once the validation pipeline underneath it is statistically sound, since
more throughput on top of broken validation just produces more false positives faster.

REQUIRED ORDER (do not reorder or parallelize across phases — each depends on the last
being correct):

Phase 0 (first, before any other change): locate whatever currently consumes
LIVE_ALPHA_STREAM hypotheses for live trading or capital allocation, and put a feature flag
around it so the pipeline keeps running and producing data but nothing gets traded on until
I explicitly re-enable it after reviewing Phases 1-4.

Phase 1: Replace the substring-matching factor construction with a real, restricted-grammar
expression evaluator for the operator vocabulary (rank, delta, volatility, close, volume,
high, low). No eval()/exec() - use a whitelisted AST parse or hand-rolled recursive-descent
parser. Rebuild the backtest around wide-format (dates x tickers) panels so rank() is a
genuine cross-sectional operation per date, and construct the long/short portfolio as a
single per-date return series. Apply Newey-West standard errors (or non-overlapping block
resampling) for the holding-horizon-induced autocorrelation. Build this engine generically
(parameterized date range) since Phase 6 reuses it for live signal generation.

Phase 2: Add a durable, monotonic total-trial counter representing every distinct
hypothesis ever tested. Thread it explicitly into every calculate_deflated_sharpe call site
(remove the trials_in_family=1 default; require callers to pass it explicitly).

Phase 3: Replace the 14-day timer-based promotion in QHLM with a real evaluation: minimum
shadow duration of 150 trading days (document why), running the Phase 1 pipeline against
realized shadow-period data and requiring it to independently pass the DSR/IC bar before
promotion. Every evaluation must append a new HypothesisExperiment row. Fix decay detection
to correctly read the most recent experiment. Then separately audit validation_service.py's
ML-model shadow probation for the same timer-only pattern and report/fix accordingly.

Phase 4: Add a normalized_expression column with a uniqueness constraint. Cap/alert on
fallback-candidate exhaustion instead of silently repeating a formula. Persist each
hypothesis's backtested return series and add a correlation gate before IN_SAMPLE_AUDIT
admission - reuse the existing correlation-gating implementation already in the RiskEngine
rather than writing a new one, adapted for hypothesis-level return series (propose a
threshold, e.g. 0.4-0.5, and flag it as a judgment call for my review rather than deciding
unilaterally). Fix the unordered failed/active queries and exclude ALPHA_DECAY_ARCHIVE from
Gemini's "active" context. Resolve the ic>=0.015 vs IC>0.03 inconsistency explicitly in the
plan. Only then, change generation from one-per-run to a batch loop up to a configurable
TARGET_PIPELINE_DEPTH.

Phase 5: New functionality - build generate_live_signals_task: for each LIVE_ALPHA_STREAM
hypothesis, run the Phase 1 engine against the most recent trading day's data to compute
today's cross-sectional ranking. Store per-stock results (ticker, score, rank percentile,
long/short direction) in a new table, keyed by hypothesis and trade date, keeping top/bottom
N rather than just the single best stock. Schedule it to run after
sync_nse_market_data_task completes each day. Follow the existing documented schema-change
workflow (SQLAlchemy model -> Alembic migration -> Strawberry GraphQL type -> resolver ->
frontend Apollo query) rather than inventing a new pattern. Surface each live strategy's
list SEPARATELY in the frontend (likely an extension of the existing /research page) - do
not blend multiple strategies' picks into one combined list, since the correlation gate
from Phase 4 exists specifically to keep them diversified from each other.

Phase 6 (only after Phases 1-5 are complete and tested): re-enable the live-capital
connection from Phase 0.

For every phase, write unit tests proving the specific issue is fixed, not just that the
code runs - e.g. for Phase 1, a test showing two different formulas that both contain
"volume" and "close" produce different results; for Phase 2, a test that DSR score
decreases as trial count increases and that omitting the trial count raises an error.

PROCESS
Before writing any code, produce your Task List and Implementation Plan artifacts as usual
and let me review them. Flag explicitly if any issue above turns out, on inspection of the
current code, to not match this description, or if you find additional issues in the same
files not listed here. Do not silently fix things outside this list without calling them
out separately. Do not implement the throughput increase in Phase 4 before Phases 1-3 are
complete and their tests pass. Do not modify MomentumService or MomentumTracker.tsx - that
system is intentionally out of scope.
\`\`\`

---

## 4. What to check when Antigravity's plan comes back

- Feature flag on live capital, before anything else?
- Restricted-grammar parser, no `eval()`/`exec()`?
- Trial counter durable (survives restarts/deletions), not just an in-memory or
  `COUNT(*)`-only value?
- 150-day shadow minimum present with the reasoning attached, or silently shortened?
- Did it actually open `validation_service.py` and report back on issue #10, or skip it?
- Does it propose an explicit resolution for the 0.015 vs 0.03 threshold inconsistency, or
  quietly pick one?
- Does Phase 5's live-signal list stay per-strategy, or does it get blended into one
  combined ranking (defeats the point of the correlation gate)?
- Tests per phase, or just "verify build passes"? Push back if it's the latter.
