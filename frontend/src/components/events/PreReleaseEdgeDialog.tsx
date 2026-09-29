import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { Box, Button, CircularProgress, Collapse, Dialog, DialogContent, DialogTitle, Grid, Tooltip, Typography } from '@mui/material';
import { useThemeMode } from '../../theme/ThemeContext';
import { PriceForecastChart, PricePath } from './PriceForecastChart';
import { useIsMobile } from '../../hooks/useResponsive';
import {
  GET_PRE_RELEASE_EDGE_DETAIL, GET_PRE_RELEASE_PRICE_PATH, PreReleaseEdge, fmtDate, fmtPct, fmtPrice,
  isTradeVerdict, safeJson, sessionLabel,
} from './preReleaseTypes';

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  companyName?: string;
}

type Dict = Record<string, any>;
type Tone = 'good' | 'bad' | 'neutral';
interface Reason { tone: Tone; text: string; }

const ACTION_TITLE: Record<string, string> = {
  'RUN-UP PLAY': 'Buy before results, sell before the announcement',
  'HOLD-THROUGH PLAY': 'Buy before results and hold through them',
  'AVOID': 'Avoid — likely to fall on results',
  'NO EDGE': 'No clear trade — skip this one',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Share of similar past setups that beat the Nifty (or lagged it), phrased on the more common side. */
const chanceText = (p?: number | null) => {
  if (p == null) return '—';
  return p >= 0.5 ? `Beat the Nifty in ${Math.round(p * 100)}% of similar setups` : `Lagged the Nifty in ${Math.round((1 - p) * 100)}% of similar setups`;
};

/** Plain-language reasons built from the forecast's own evidence (no model jargon). */
const buildReasons = (d: Dict, edge: PreReleaseEdge): Reason[] => {
  const out: Reason[] = [];
  const hist = d.own_history || {};
  const events: Dict[] = hist.events || [];
  const done = events.filter((e) => e.ar3 != null);
  const ups = done.filter((e) => e.ar3 > 0).length;
  const runups = events.filter((e) => e.runup5 != null);
  const runupUps = runups.filter((e) => e.runup5 > 0).length;

  if (runups.length >= 4) {
    const rate = runupUps / runups.length;
    out.push({
      tone: rate >= 0.55 ? 'good' : rate <= 0.45 ? 'bad' : 'neutral',
      text: rate >= 0.55
        ? `Usually rises before results — up in ${runupUps} of ${runups.length} past releases (avg ${fmtPct(hist.avg_runup)})`
        : rate <= 0.45
          ? `Usually weak before results — up in only ${runupUps} of ${runups.length} past releases`
          : `No clear pattern before results (${runupUps} of ${runups.length} up)`,
    });
  }
  if (done.length >= 4) {
    const rate = ups / done.length;
    out.push({
      tone: rate >= 0.55 ? 'good' : rate <= 0.45 ? 'bad' : 'neutral',
      text: rate >= 0.55
        ? `Market usually likes its results — rose after ${ups} of ${done.length} releases (avg ${fmtPct(hist.avg_reaction)})`
        : rate <= 0.45
          ? `Market usually punishes its results — rose after only ${ups} of ${done.length} releases (avg ${fmtPct(hist.avg_reaction)})`
          : `Mixed reactions after results (${ups} of ${done.length} up)`,
    });
  } else {
    out.push({ tone: 'neutral', text: `Only ${plural(done.length, 'past result')} on record — forecast leans on market-wide patterns` });
  }
  const peers = d.peers || {};
  if (peers.n) {
    out.push({
      tone: peers.avg_reaction > 0.5 ? 'good' : peers.avg_reaction < -0.5 ? 'bad' : 'neutral',
      text: `${plural(peers.n, 'sector peer')} already reported this season — their stocks moved ${fmtPct(peers.avg_reaction)} on average`,
    });
  }
  const pos = d.positioning || {};
  if (pos.abn_ret_20 != null && pos.abn_ret_20 > 8) {
    out.push({ tone: 'bad', text: `Already up ${fmtPct(pos.abn_ret_20)} vs the market in 20 days — good news may be priced in` });
  } else if (pos.dist_52w_high != null && pos.dist_52w_high < -25) {
    out.push({ tone: 'neutral', text: `Stock is ${Math.abs(pos.dist_52w_high).toFixed(0)}% below its 52-week high — expectations are low` });
  }
  const nifty = d.regime?.nifty_ret_20;
  if (nifty != null && Math.abs(nifty) >= 3) {
    out.push({ tone: nifty > 0 ? 'good' : 'bad', text: `Overall market is ${nifty > 0 ? 'strong' : 'weak'} (Nifty ${fmtPct(nifty)} in 20 days)` });
  }
  if (edge.impliedMovePct != null && edge.histAvgMovePct != null && edge.impliedMovePct > 0) {
    const bigger = edge.impliedMovePct > edge.histAvgMovePct * 1.25;
    const smaller = edge.impliedMovePct < edge.histAvgMovePct * 0.8;
    out.push({
      tone: 'neutral',
      text: `Options traders expect a ±${edge.impliedMovePct.toFixed(1)}% results-day move${bigger ? ' — bigger than usual' : smaller ? ' — smaller than usual' : ''} (usual ±${edge.histAvgMovePct.toFixed(1)}%)`,
    });
  }
  const base = d.model?.reaction_metrics?.base;
  if (base?.n) {
    out.push({ tone: 'neutral', text: `Across ${base.n.toLocaleString('en-IN')} past results, only ${Math.round(base.hit * 100)}% of stocks beat the Nifty in the 3 days after (avg ${fmtPct(base.mean)}) — results are usually "sell the news"` });
  }
  const rank = { good: 0, bad: 0, neutral: 1 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 5);
};

export const PreReleaseEdgeDialog: React.FC<Props> = ({ open, onClose, companyId, companyName }) => {
  const { tokens } = useThemeMode();
  const isMobile = useIsMobile();
  const [showDetails, setShowDetails] = useState(false);
  const { data, loading, error } = useQuery(GET_PRE_RELEASE_EDGE_DETAIL, {
    variables: { companyId },
    skip: !open || !companyId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: pathData, loading: pathLoading } = useQuery(GET_PRE_RELEASE_PRICE_PATH, {
    variables: { companyId },
    skip: !open || !companyId,
    fetchPolicy: 'network-only',
    pollInterval: open ? 5 * 60 * 1000 : 0,
  });
  const edgeRaw: PreReleaseEdge | undefined = data?.preReleaseEdgeDetail;
  const detailsRaw = safeJson<Dict>(edgeRaw?.detailsJson);
  const livePath = safeJson<PricePath | null>(pathData?.preReleasePricePath, null) || (detailsRaw.path?.bands ? detailsRaw.path as PricePath : null);
  // The live re-simulation refreshes the trade levels from the latest price.
  const edge: PreReleaseEdge | undefined = edgeRaw && livePath?.trade_plan?.stop_price ? {
    ...edgeRaw,
    entryPriceRef: livePath.trade_plan.entry_price_ref, stopPrice: livePath.trade_plan.stop_price,
    targetPrice: livePath.trade_plan.target_price, stretchTarget: livePath.trade_plan.stretch_target,
    positionSizePct: livePath.trade_plan.position_size_pct,
  } : edgeRaw;
  const details: Dict = livePath?.trade_plan?.stop_price
    ? { ...detailsRaw, plan: livePath.trade_plan, rules: livePath.rules || detailsRaw.rules }
    : detailsRaw;
  const record = safeJson<Dict>(edge?.trackRecordJson);

  const green = tokens.status.success.main;
  const red = tokens.status.error.main;
  const amber = tokens.status.warning.main;
  // Readability: informational text uses the brighter secondary tone; the dim tertiary tone is reserved for decoration.
  const muted = tokens.text.secondary;
  const isDarkMode = tokens.mode === 'dark';
  const line = isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';
  const signColor = (v?: number | null) => (v == null ? muted : v >= 0 ? green : red);
  const toneColor = (t: Tone) => (t === 'good' ? green : t === 'bad' ? red : muted);
  const verdictColor = (v?: string | null) => (isTradeVerdict(v) ? green : v === 'AVOID' ? red : tokens.text.secondary);

  const card = { p: { xs: 2, md: 2.75 }, backgroundColor: isDarkMode ? '#16191D' : '#FFFFFF', border: `1px solid ${line}`, borderRadius: '12px', height: '100%' };
  const label = { fontSize: '12px', fontWeight: 800, color: tokens.text.primary, textTransform: 'uppercase' as const, letterSpacing: '0.7px', opacity: 0.85 };
  const big = { fontSize: '17px', fontWeight: 800, color: tokens.text.primary };

  const Title: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1.75, gap: 1 }}>
      <Typography sx={label}>{children}</Typography>
      {hint && <Typography sx={{ fontSize: '12px', color: muted }}>{hint}</Typography>}
    </Box>
  );


  /** One leg of the "what we expect" timeline. */
  const Leg: React.FC<{ title: string; when: string; p?: number | null; p10?: number | null; p50?: number | null; p90?: number | null; highlight: boolean; ev?: Dict }> =
    ({ title, when, p, p10, p50, p90, highlight, ev }) => (
      <Box sx={{ flex: 1, p: 2, borderRadius: '10px', minWidth: 0,
        border: `1px solid ${highlight ? signColor(p50) : tokens.border.main}`,
        backgroundColor: highlight ? ((p50 ?? 0) >= 0 ? tokens.status.success.wash : tokens.status.error.wash) : 'transparent' }}>
        <Typography sx={{ ...label, color: highlight ? signColor(p50) : tokens.text.secondary }}>{title}</Typography>
        <Typography sx={{ fontSize: '12px', color: muted, mb: 1 }}>{when}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography className="mono-font" sx={{ fontSize: '30px', fontWeight: 800, lineHeight: 1, color: signColor(p50) }}>
            {p50 == null ? '—' : `${p50 >= 0 ? '▲' : '▼'} ${fmtPct(p50)}`}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: p != null && p >= 0.5 ? green : red, mt: 1 }}>{chanceText(p)}</Typography>
        <Typography sx={{ fontSize: '13px', color: tokens.text.secondary, mt: 0.5 }}>
          Usually lands between <b>{fmtPct(p10)}</b> and <b>{fmtPct(p90)}</b>
        </Typography>
        {ev?.n ? (
          <Typography sx={{ fontSize: '12px', color: muted, mt: 0.75 }}>
            Based on {ev.n.toLocaleString('en-IN')} similar past setups{ev.win_avg != null && ev.loss_avg != null ? ` · wins avg ${fmtPct(ev.win_avg)}, losses avg ${fmtPct(ev.loss_avg)}` : ''}
          </Typography>
        ) : null}
      </Box>
    );

  const Arrow = () => (
    <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', color: muted, fontSize: '20px', px: 0.5 }}>→</Box>
  );

  const reasons = edge ? buildReasons(details, edge) : [];
  const events: Dict[] = details.own_history?.events || [];
  const done = events.filter((e) => e.ar3 != null);
  const ups = done.filter((e) => e.ar3 > 0).length;
  const maxAbs = Math.max(4, ...done.map((e) => Math.abs(e.ar3)));
  const t = details.timing || {};
  const plan = details.plan || {};
  const trade = edge ? isTradeVerdict(edge.verdict) : false;
  const confDots = edge?.confidence === 'HIGH' ? 3 : edge?.confidence === 'MEDIUM' ? 2 : 1;
  const bt = (k: 'runup' | 'reaction') => details.model?.[`${k}_metrics`] || {};

  const summary = (() => {
    if (!edge) return '';
    const verb = (v: number, up: string, down: string) => `${v >= 0 ? up : down} the Nifty by about ${fmtPct(Math.abs(v), 1, false)}`;
    const before = edge.runupP50 != null ? `${verb(edge.runupP50, 'beat', 'lag')} before results` : '';
    const after = edge.reactionP50 != null ? `${verb(edge.reactionP50, 'beat', 'lag')} after them` : '';
    return `Stocks set up like ${edge.ticker} have tended to ${before}${before && after ? ', and ' : ''}${after}.`;
  })();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth fullScreen={isMobile}
      PaperProps={{ sx: { backgroundColor: isDarkMode ? '#0D0F12' : '#F4F5F7', backgroundImage: 'none', border: `1px solid ${line}`, borderRadius: '14px', boxShadow: tokens.shadows.dropdown } }}>
      <DialogTitle sx={{ borderBottom: `1px solid ${line}`, py: 2, px: { xs: 2, md: 3 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '20px', fontWeight: 800, color: tokens.text.primary }}>
            {companyName || edge?.ticker} {edge && <span style={{ color: muted, fontWeight: 500 }}>({edge.ticker})</span>}
          </Typography>
          {edge && (
            <Typography sx={{ fontSize: '14px', color: tokens.text.secondary, mt: 0.5 }}>
              Results on <b>{new Date(`${edge.eventDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</b>
              {' '}({sessionLabel(edge.eventSession)})
              {!edge.graded && edge.daysToEvent != null && <> · <b>{plural(edge.daysToEvent, 'day')}</b> away</>}
            </Typography>
          )}
        </Box>
        <Button onClick={onClose} sx={{ color: muted, minWidth: 0 }}>✕</Button>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 1.5, md: 3 }, pt: '20px !important' }}>
        {loading && !edge && (
          <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress size={32} sx={{ color: tokens.accent.main }} /></Box>
        )}
        {error && <Typography color="error" sx={{ fontSize: '15px' }}>Failed to load forecast: {error.message}</Typography>}
        {!loading && !error && !edge && (
          <Typography sx={{ fontSize: '15px', color: muted, p: 4, textAlign: 'center' }}>
            No forecast yet. Forecasts are made daily for companies with results in the next 30 days.
          </Typography>
        )}

        {edge && (
          <Grid container spacing={2}>
            {/* 1. The answer */}
            <Grid item xs={12}>
              <Box sx={{ ...card, borderColor: verdictColor(edge.verdict), borderWidth: '1.5px' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={label}>{edge.graded ? 'What we said' : 'What to do'}</Typography>
                    <Typography sx={{ fontSize: '26px', fontWeight: 800, color: verdictColor(edge.verdict), mt: 0.5, lineHeight: 1.2 }}>
                      {ACTION_TITLE[edge.verdict || 'NO EDGE']}
                    </Typography>
                    <Typography sx={{ fontSize: '15px', color: tokens.text.secondary, mt: 0.75 }}>{summary}</Typography>
                    {!edge.graded && (t.sessions_to_baseline ?? 0) > 6 && (
                      <Typography sx={{ fontSize: '13px', color: amber, mt: 0.75 }}>
                        Early read — the final call comes around {fmtDate(t.entry_window_opens)} (5 trading days before results), once the latest price action and peer results are in. Updated daily.
                      </Typography>
                    )}
                  </Box>
                  <Tooltip title="How much the evidence agrees. High = strong, consistent signals backed by a good backtest.">
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography sx={label}>Confidence</Typography>
                      <Box sx={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', mt: 0.75 }}>
                        {[1, 2, 3].map((i) => (
                          <Box key={i} sx={{ width: 22, height: 6, borderRadius: 3, backgroundColor: i <= confDots ? verdictColor(edge.verdict) : tokens.border.main }} />
                        ))}
                      </Box>
                      <Typography sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary, mt: 0.5 }}>{edge.confidence}</Typography>
                    </Box>
                  </Tooltip>
                </Box>

                {trade && !edge.graded && edge.targetPrice != null && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' }, gap: 2, mt: 2.5, pt: 2, borderTop: `1px solid ${line}` }}>
                    {([
                      ['Buy on', fmtDate(edge.entryDate), `around ${fmtPrice(edge.entryPriceRef)}`, tokens.text.primary],
                      ['Sell on', fmtDate(edge.exitDate), edge.strategy === 'RUNUP' ? 'before results come out' : 'after results', tokens.text.primary],
                      ['Stop-loss', fmtPrice(edge.stopPrice), `exit if it falls ${fmtPct(Math.abs(plan.stop_pct ?? 0), 1, false)}`, red],
                      ['Target', fmtPrice(edge.targetPrice), fmtPct(plan.target_pct), green],
                      ['Best case', fmtPrice(edge.stretchTarget), fmtPct(plan.stretch_pct), green],
                      ['Invest', edge.positionSizePct != null ? `${edge.positionSizePct}%` : '—', 'of your capital', tokens.text.primary],
                    ] as const).map(([k, v, sub, color]) => (
                      <Box key={k}>
                        <Typography sx={label}>{k}</Typography>
                        <Typography className="mono-font" sx={{ ...big, color }}>{v}</Typography>
                        <Typography sx={{ fontSize: '12px', color: muted }}>{sub}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}

                {edge.graded && (
                  <Box sx={{ mt: 2, p: 1.5, borderRadius: '8px', backgroundColor: edge.hit ? tokens.status.success.wash : edge.hit === false ? tokens.status.error.wash : tokens.background.cardHover }}>
                    <Typography sx={{ fontSize: '15px', fontWeight: 700, color: edge.hit ? green : edge.hit === false ? red : tokens.text.secondary }}>
                      {edge.hit ? '✓ This call was right' : edge.hit === false ? '✕ This call was wrong' : 'No trade was suggested'}
                      {' — '}before results {fmtPct(edge.realizedRunup)}, after results {fmtPct(edge.realizedReaction3d)}
                    </Typography>
                  </Box>
                )}
                {edge.verdict === 'RUN-UP PLAY' && details.skip_results && !edge.graded && (
                  <Typography sx={{ fontSize: '14px', color: red, mt: 1.5, fontWeight: 600 }}>Important: this setup usually falls after results. Be out before the announcement.</Typography>
                )}
                {edge.verdict === 'AVOID' && !edge.graded && (
                  <Typography sx={{ fontSize: '14px', color: red, mt: 1.5 }}>If you already own it, consider selling before the results.</Typography>
                )}
              </Box>
            </Grid>

            {/* 1b. Price forecast: live price -> simulated cone through results, with smart stop / targets */}
            <Grid item xs={12} md={8}>
              <Box sx={card}>
                <Title hint={livePath ? `${livePath.price_source === 'live' ? 'live price' : 'latest price'} ${fmtPrice(livePath.price)} · refreshes every 5 min` : undefined}>
                  Price forecast to results
                </Title>
                {!livePath && (
                  <Typography sx={{ fontSize: '14px', color: muted, py: 6, textAlign: 'center' }}>
                    {pathLoading ? 'Simulating price paths…' : 'Price forecast not available for this stock.'}
                  </Typography>
                )}
                {livePath && (
                  <>
                    <PriceForecastChart path={livePath} exitLabel={edge.strategy === 'RUNUP' ? 'SELL' : undefined} entryLabel={trade ? 'BUY' : 'CHEAPEST'} />
                    <Typography sx={{ fontSize: '13px', color: muted, mt: 1.25, lineHeight: 1.5 }}>
                      Built from 5,000 simulations of how {edge.ticker} normally moves, including its past results-day jumps.
                      {livePath.calibration?.n ? ` In tests on ${livePath.calibration.n} past results, the real price stayed inside the shaded range ${Math.round(livePath.calibration.inside_80_pre * 100)}% of the time` : ''}
                      {livePath.calibration?.t1_date_within_2_sessions != null ? `, and target dates were right within ±2 trading days ${Math.round(livePath.calibration.t1_date_within_2_sessions * 100)}% of the time.` : livePath.calibration?.n ? '.' : ''}
                    </Typography>
                  </>
                )}
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={card}>
                <Title>Key prices</Title>
                {livePath && (() => {
                  const ri = Math.min(livePath.results_index, livePath.bands.length - 1);
                  const resultsDay = livePath.bands[ri];
                  const after = livePath.bands[Math.min(ri + 2, livePath.bands.length - 1)];
                  const far = livePath.bands[livePath.bands.length - 1];
                  const ar = livePath.after_results;
                  const [t1, t2] = livePath.plan.targets;
                  const Line: React.FC<{ k: string; v: number; sub?: string; c?: string; tag?: string; big?: boolean }> = ({ k, v, sub, c, tag, big: isBig }) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: `1px solid ${line}` }}>
                      <Box>
                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: tokens.text.primary }}>{k}</Typography>
                        {sub && <Typography sx={{ fontSize: '12px', color: muted }}>{sub}</Typography>}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {tag && <Box sx={{ px: 0.75, py: '1px', borderRadius: '4px', fontSize: '11px', fontWeight: 800, color: c, border: `1px solid ${c}` }}>{tag}</Box>}
                        <Typography className="mono-font tabular-nums" sx={{ fontSize: isBig ? '15px' : '13px', fontWeight: 800, color: c || tokens.text.primary }}>{fmtPrice(v)}</Typography>
                      </Box>
                    </Box>
                  );
                  const en = livePath.entry;
                  const hitText = (t: Dict) => (t.hit_date ? `hit around ${fmtDate(t.hit_date)}` : 'unlikely in this window');
                  return (
                    <>
                      {en && (
                        <Box sx={{ p: 1.5, mb: 1.5, borderRadius: '8px', border: `1px solid ${green}`, backgroundColor: tokens.status.success.wash }}>
                          <Typography sx={{ ...label, color: green, mb: 0.75 }}>{trade ? 'Best entry' : 'If you want to buy it'}</Typography>
                          <Typography sx={{ fontSize: '14px', color: tokens.text.primary, lineHeight: 1.55 }}>
                            {en.best_session > 0
                              ? <>{trade ? 'Best day' : 'Cheapest expected day'}: <b>{fmtDate(en.best_date)}</b>{en.after_results ? ' (after results)' : ''}, expected <b>{fmtPrice(en.best_price)}</b> ({fmtPct(en.best_vs_now_pct)} vs now).{!trade && ' A cheaper price only, not a signal it will rise.'}</>
                              : <>Best day: <b>now</b>. No dip is expected before {fmtDate(en.deadline_date)}.</>}
                          </Typography>
                          {en.limit_vs_now_pct < -0.3 && (
                            <Typography sx={{ fontSize: '14px', color: tokens.text.primary, lineHeight: 1.55, mt: 0.5 }}>
                              Or buy on a dip: limit order at <b>{fmtPrice(en.limit_price)}</b> ({fmtPct(en.limit_vs_now_pct)}). Fills about {Math.round((livePath.calibration?.limit_filled ?? en.limit_fill_prob) * 10)} in 10 times by {fmtDate(en.deadline_date)}{livePath.calibration?.limit_filled != null ? ' (tested on past results)' : ''}.
                            </Typography>
                          )}
                          {trade && edge.strategy === 'RUNUP' && (
                            <Typography sx={{ fontSize: '13px', color: tokens.text.secondary, mt: 0.5 }}>Latest entry: {fmtDate(edge.entryDate)} at market.</Typography>
                          )}
                        </Box>
                      )}
                      <Line k="Price now" v={livePath.price} big />
                      <Line k={`Expected on ${fmtDate(resultsDay.date)}`} sub="results day" v={resultsDay.p50} c={amber} big />
                      <Line k={`Expected on ${fmtDate(after.date)}`} sub="3 days after results" v={after.p50} c={amber} />
                      <Line k={`Expected on ${fmtDate(far.date)}`} sub="about 3 weeks after results" v={far.p50} c={amber} />
                      <Box sx={{ height: 10 }} />
                      <Line k="Target 2" sub={`${fmtPct(t2.pct)} · ${hitText(t2)}`} v={t2.price} c={green} tag="POSSIBLE" />
                      <Line k="Target 1" sub={`${fmtPct(t1.pct)} · ${hitText(t1)}`} v={t1.price} c={green} tag="LIKELY" />
                      <Line k="Smart stop-loss" sub={`${fmtPct(livePath.plan.stop_pct)} · exit if it closes below`} v={livePath.plan.stop} c={red} tag="EXIT" />
                      {ar && (
                        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '8px', border: `1px solid ${line}` }}>
                          <Typography sx={{ ...label, mb: 0.75 }}>If you buy after results ({fmtDate(ar.entry_date)})</Typography>
                          <Box sx={{ display: 'flex', gap: 1, mb: 0.75 }}>
                            <Box sx={{ flex: 1, textAlign: 'center', p: 0.75, borderRadius: '6px', backgroundColor: tokens.status.success.wash }}>
                              <Typography className="mono-font" sx={{ fontSize: '18px', fontWeight: 800, color: green }}>{Math.round(ar.up_first_prob * 100)}%</Typography>
                              <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>rises +{ar.move_pct}% first</Typography>
                            </Box>
                            <Box sx={{ flex: 1, textAlign: 'center', p: 0.75, borderRadius: '6px', backgroundColor: tokens.status.error.wash }}>
                              <Typography className="mono-font" sx={{ fontSize: '18px', fontWeight: 800, color: red }}>{Math.round(ar.down_first_prob * 100)}%</Typography>
                              <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>falls −{ar.move_pct}% first</Typography>
                            </Box>
                          </Box>
                          <Typography sx={{ fontSize: '13px', color: tokens.text.secondary, lineHeight: 1.5 }}>
                            {ar.up_first_prob >= ar.down_first_prob + 0.08
                              ? `Better odds of a gain than a loss over the next ~3 weeks.`
                              : ar.down_first_prob >= ar.up_first_prob + 0.08
                                ? `A loss is more likely than a gain. Not a good swing buy after results.`
                                : `About a coin flip. No clear edge for a swing trade after results.`}
                          </Typography>
                        </Box>
                      )}
                      <Typography sx={{ fontSize: '14px', color: tokens.text.secondary, mt: 1.5, lineHeight: 1.5 }}>
                        {edge.verdict === 'AVOID' ? 'Better not to hold through results. If you do hold, exit below the stop-loss.'
                          : trade ? `Buy near ${fmtPrice(livePath.price)} on ${fmtDate(edge.entryDate)}, sell by ${fmtDate(edge.exitDate)}. Book profit at the targets.`
                            : 'No trade suggested. These prices are for reference if you already hold it.'}
                      </Typography>
                    </>
                  );
                })()}
              </Box>
            </Grid>
            {/* Best day to enter between now and results (sell before the announcement) */}
            {livePath?.entry_schedule?.rows?.length ? (
              <Grid item xs={12}>
                <Box sx={card}>
                  {(() => {
                    const sch = livePath.entry_schedule!;
                    const best = sch.rows.find((r) => r.session === sch.best_session) || sch.rows[0];
                    const maxAbs = Math.max(0.5, ...sch.rows.map((r) => Math.abs(r.exp_pct)));
                    // A best day is only named when it is a real edge (backend: clears costs and beats simulation noise).
                    const profitable = sch.meaningful ?? best.exp_pct > 0;
                    return (
                      <>
                        <Title hint={`sell on ${fmtDate(sch.exit_date)}, the last close before results · after ~${sch.cost_pct}% costs`}>Best day to enter before results</Title>
                        <Box sx={{ p: 1.5, mb: 1.5, borderRadius: '8px', backgroundColor: profitable ? tokens.status.success.wash : tokens.background.cardHover, border: `1px solid ${profitable ? green : tokens.border.main}` }}>
                          <Typography sx={{ fontSize: '15px', color: tokens.text.primary, lineHeight: 1.6 }}>
                            {profitable ? (
                              <>Best day: <b>{best.session === 0 ? 'today' : fmtDate(best.date)}</b>. Buy around <b>{fmtPrice(best.buy)}</b>, sell around <b>{fmtPrice(best.sell)}</b> on {fmtDate(sch.exit_date)}.
                                Expected profit <b style={{ color: green }}>{fmtPct(best.exp_pct)}</b> after costs, profitable in <b>{Math.round(best.win_prob * 100)}%</b> of cases.</>
                            ) : (
                              <>No entry day gives a real edge for this stock. Expected profit is about <b>{fmtPct(sch.best_exp_pct ?? best.exp_pct)}</b> on the best day, which is too small to beat the noise.
                                {' '}<b>Skip the pre-results trade.</b> The table below is for reference only.</>
                            )}
                          </Typography>
                          {profitable && edge.verdict !== 'RUN-UP PLAY' && (
                            <Typography sx={{ fontSize: '13px', color: amber, mt: 0.5 }}>
                              This stock isn't in the proven run-up group right now, so this profit isn't statistically reliable. Trade small or skip.
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ overflowX: 'auto', opacity: profitable ? 1 : 0.55 }}>
                          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& td, & th': { fontSize: '13px', py: '5px', px: '8px', textAlign: 'right', borderBottom: `1px solid ${line}` }, '& th': { color: muted, fontWeight: 700 }, '& td:first-of-type, & th:first-of-type': { textAlign: 'left' } }}>
                            <thead><tr><th>Enter on</th><th>Buy around</th><th>Sell around ({fmtDate(sch.exit_date)})</th><th>Expected profit</th><th>Chance of profit</th><th style={{ width: 120 }} /></tr></thead>
                            <tbody>
                              {sch.rows.map((r) => {
                                const isBest = r.session === sch.best_session && profitable;
                                return (
                                  <tr key={r.date} style={{ backgroundColor: isBest ? tokens.status.success.wash : 'transparent' }}>
                                    <td style={{ color: tokens.text.primary, fontWeight: isBest ? 800 : 500 }}>{r.session === 0 ? 'Today' : fmtDate(r.date)}{isBest ? '  ★ best' : ''}</td>
                                    <td className="mono-font">{fmtPrice(r.buy)}</td>
                                    <td className="mono-font">{fmtPrice(r.sell)}</td>
                                    <td className="mono-font" style={{ color: signColor(r.exp_pct), fontWeight: 700 }}>{fmtPct(r.exp_pct)}</td>
                                    <td className="mono-font">{Math.round(r.win_prob * 100)}%</td>
                                    <td>
                                      <Box sx={{ height: 6, borderRadius: 3, backgroundColor: tokens.border.main, position: 'relative' }}>
                                        <Box sx={{ position: 'absolute', height: '100%', borderRadius: 3, backgroundColor: signColor(r.exp_pct), width: `${(Math.abs(r.exp_pct) / maxAbs) * 100}%` }} />
                                      </Box>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </Box>
                        </Box>
                        <Typography sx={{ fontSize: '12px', color: muted, mt: 1 }}>
                          Prices are the expected (middle) values from the same 5,000 simulations as the chart. Selling before results avoids the usual results-day drop.
                        </Typography>
                      </>
                    );
                  })()}
                </Box>
              </Grid>
            ) : null}

            {trade && (details.rules || []).length > 0 && (
              <Grid item xs={12}>
                <Box sx={card}>
                  <Title>Exit rules: follow these in order</Title>
                  {(details.rules as string[]).map((rule, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1.5, py: 0.75, borderBottom: i < details.rules.length - 1 ? `1px solid ${tokens.border.main}` : 'none' }}>
                      <Box sx={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: tokens.text.primary, backgroundColor: tokens.background.cardHover, border: `1px solid ${line}` }}>{i + 1}</Box>
                      <Typography sx={{ fontSize: '15px', color: rule.startsWith('Heads-up') ? amber : tokens.text.primary, lineHeight: 1.5 }}>{rule}</Typography>
                    </Box>
                  ))}
                </Box>
              </Grid>
            )}

            {/* 2. What we expect — timeline */}
            <Grid item xs={12}>
              <Box sx={card}>
                <Title hint="moves are relative to the Nifty">What we expect</Title>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', px: 1 }}>
                    <Typography sx={label}>Today</Typography>
                    <Typography className="mono-font" sx={big}>{fmtDate(edge.asOfDate)}</Typography>
                  </Box>
                  <Arrow />
                  <Leg title="Before results" when={`next ${t.sessions_to_baseline ?? '—'} trading days, until ${fmtDate(t.baseline_date)}`}
                    p={edge.pRunup} p10={edge.runupP10} p50={edge.runupP50} p90={edge.runupP90} highlight={edge.strategy === 'RUNUP'} ev={details.runup?.evidence} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', px: 1 }}>
                    <Typography sx={{ fontSize: '20px' }}>📢</Typography>
                    <Typography sx={label}>Results</Typography>
                    <Typography className="mono-font" sx={big}>{fmtDate(edge.eventDate)}</Typography>
                  </Box>
                  <Leg title="After results" when="first 3 trading days"
                    p={edge.pReaction} p10={edge.reactionP10} p50={edge.reactionP50} p90={edge.reactionP90} highlight={edge.strategy === 'HOLD' || edge.verdict === 'AVOID'} ev={details.reaction?.evidence} />
                </Box>
              </Box>
            </Grid>

            {/* 3. Why + past results */}
            <Grid item xs={12} md={6}>
              <Box sx={card}>
                <Title>Why</Title>
                {reasons.map((r, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: 1, borderBottom: i < reasons.length - 1 ? `1px solid ${tokens.border.main}` : 'none' }}>
                    <Box sx={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800,
                      color: toneColor(r.tone), border: `1.5px solid ${toneColor(r.tone)}` }}>
                      {r.tone === 'good' ? '↑' : r.tone === 'bad' ? '↓' : 'i'}
                    </Box>
                    <Typography sx={{ fontSize: '15px', color: tokens.text.primary, lineHeight: 1.45 }}>{r.text}</Typography>
                  </Box>
                ))}
                <Typography sx={{ fontSize: '12px', color: muted, mt: 1.5 }}>
                  <span style={{ color: green }}>↑</span> points up · <span style={{ color: red }}>↓</span> points down · i = context
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box sx={card}>
                <Title hint={`last ${done.length} results`}>How it moved after past results</Title>
                {done.length === 0 ? (
                  <Typography sx={{ fontSize: '15px', color: muted }}>No past results on record.</Typography>
                ) : (
                  <>
                    <Typography sx={{ fontSize: '15px', color: tokens.text.primary, mb: 2 }}>
                      Went <b style={{ color: green }}>up {ups}</b> times and <b style={{ color: red }}>down {done.length - ups}</b> times.
                      {' '}Typical swing <b>±{details.own_history?.avg_abs_move != null ? details.own_history.avg_abs_move.toFixed(1) : '—'}%</b>.
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'stretch', gap: '6px', height: 110 }}>
                      {[...done].reverse().map((e) => {
                        const v = e.ar3 as number;
                        const h = Math.max(3, (Math.abs(v) / maxAbs) * 48);
                        return (
                          <Tooltip key={e.date} title={`${new Date(`${e.date}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}: ${fmtPct(v)} after results (before: ${fmtPct(e.runup5)})`}>
                            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', cursor: 'default' }}>
                              <Box sx={{ height: 50, display: 'flex', alignItems: 'flex-end' }}>
                                {v >= 0 && <Box sx={{ width: '100%', height: h, backgroundColor: green, borderRadius: '3px 3px 0 0' }} />}
                              </Box>
                              <Box sx={{ height: '1px', backgroundColor: tokens.text.tertiary }} />
                              <Box sx={{ height: 50 }}>
                                {v < 0 && <Box sx={{ width: '100%', height: h, backgroundColor: red, borderRadius: '0 0 3px 3px' }} />}
                              </Box>
                              <Typography sx={{ fontSize: '8px', color: muted, textAlign: 'center', mt: '2px', whiteSpace: 'nowrap' }}>
                                {new Date(`${e.date}T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })}'{String(e.date).slice(2, 4)}
                              </Typography>
                            </Box>
                          </Tooltip>
                        );
                      })}
                    </Box>
                    <Typography sx={{ fontSize: '12px', color: muted, mt: 1.5 }}>Each bar = the 3-day move after one results release, oldest → newest. Hover for details.</Typography>
                  </>
                )}
              </Box>
            </Grid>

            {/* 4. Full details (collapsed) */}
            <Grid item xs={12}>
              <Button onClick={() => setShowDetails(!showDetails)} fullWidth
                sx={{ textTransform: 'none', fontSize: '14px', fontWeight: 700, color: tokens.text.secondary, border: `1px dashed ${tokens.border.main}`, borderRadius: '8px', py: 1 }}>
                {showDetails ? '▲ Hide details' : '▼ More details: quick checks, reliability, past results'}
              </Button>
            </Grid>

            <Grid item xs={12} sx={{ pt: showDetails ? undefined : '0 !important' }}>
              <Collapse in={showDetails} unmountOnExit>
                <Grid container spacing={2}>
                  {/* Quick checks: only trader-relevant signals that actually have data */}
                  <Grid item xs={12} md={6}>
                    <Box sx={card}>
                      <Title hint="the stock right now">Quick checks</Title>
                      {(() => {
                        const pos = details.positioning || {};
                        const reg = details.regime || {};
                        const checks: { k: string; v: string; read: string; tone: Tone }[] = [];
                        if (pos.abn_ret_20 != null) {
                          const v = pos.abn_ret_20;
                          checks.push({ k: 'Trend vs Nifty (20 days)', v: `${fmtPct(v)} · 5d ${fmtPct(pos.abn_ret_5)}`,
                            read: v > 8 ? 'Strong run already, good news may be priced in' : v > 2 ? 'Outperforming the market' : v < -8 ? 'Weak, falling behind the market' : v < -2 ? 'Lagging the market' : 'In line with the market',
                            tone: v > 8 ? 'bad' : v > 2 ? 'good' : v < -2 ? 'bad' : 'neutral' });
                        }
                        if (pos.rsi_14 != null) {
                          const v = pos.rsi_14;
                          checks.push({ k: 'RSI (14)', v: `${Math.round(v)}`, read: v >= 70 ? 'Overbought, pullback risk' : v <= 30 ? 'Oversold, bounce possible' : v >= 55 ? 'Healthy momentum' : v <= 45 ? 'Soft momentum' : 'Neutral',
                            tone: v >= 70 ? 'bad' : v <= 30 ? 'neutral' : v >= 55 ? 'good' : v <= 45 ? 'bad' : 'neutral' });
                        }
                        if (pos.dist_52w_high != null) {
                          const v = pos.dist_52w_high;
                          checks.push({ k: 'From 52-week high', v: fmtPct(v), read: v > -5 ? 'Near its high, breakout zone' : v < -30 ? 'Deep below its high' : 'Below its high', tone: v > -5 ? 'good' : v < -30 ? 'bad' : 'neutral' });
                        }
                        if (pos.vol_ratio != null) {
                          const v = pos.vol_ratio;
                          checks.push({ k: 'Volume (5 days vs normal)', v: `${v.toFixed(2)}×`, read: v >= 1.5 ? 'Heavy interest building' : v <= 0.7 ? 'Quiet, low interest' : 'Normal', tone: v >= 1.5 ? 'good' : 'neutral' });
                        }
                        if (edge.impliedMovePct != null && edge.impliedMovePct > 0) {
                          const usual = edge.histAvgMovePct;
                          checks.push({ k: 'Results-day move options expect', v: `±${edge.impliedMovePct.toFixed(1)}%${usual != null ? ` (usual ±${usual.toFixed(1)}%)` : ''}`,
                            read: usual == null ? 'From option prices' : edge.impliedMovePct > usual * 1.25 ? 'Market expects a bigger move than usual' : edge.impliedMovePct < usual * 0.8 ? 'Market expects a smaller move than usual' : 'Normal size move expected', tone: 'neutral' });
                        } else if (edge.histAvgMovePct != null) {
                          checks.push({ k: 'Usual results-day move', v: `±${edge.histAvgMovePct.toFixed(1)}%`, read: 'How much it typically jumps on results', tone: 'neutral' });
                        }
                        if (reg.nifty_ret_20 != null) {
                          const v = reg.nifty_ret_20;
                          checks.push({ k: 'Market mood (Nifty 20d · VIX)', v: `${fmtPct(v)} · ${reg.vix_level != null ? reg.vix_level.toFixed(1) : '—'}`,
                            read: v > 3 ? 'Strong market' : v < -3 ? 'Weak market, be careful' : 'Sideways market', tone: v > 3 ? 'good' : v < -3 ? 'bad' : 'neutral' });
                        }
                        const sm = details.smart_money || {};
                        if (sm.delivery_pct_5d != null) checks.push({ k: 'Delivery % (5d vs before)', v: `${sm.delivery_pct_5d}% vs ${sm.delivery_pct_prior}%`, read: sm.delivery_pct_5d > sm.delivery_pct_prior + 5 ? 'Investors buying to hold' : 'No change', tone: sm.delivery_pct_5d > sm.delivery_pct_prior + 5 ? 'good' : 'neutral' });
                        if (sm.bulk_deals_30d) checks.push({ k: 'Bulk/block deals (30d)', v: `${sm.bulk_deals_30d} · net ₹${sm.bulk_net_value_cr} Cr`, read: sm.bulk_net_value_cr > 0 ? 'Big players net buying' : 'Big players net selling', tone: sm.bulk_net_value_cr > 0 ? 'good' : 'bad' });
                        return checks.map((c) => (
                          <Box key={c.k} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderBottom: `1px solid ${line}` }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: toneColor(c.tone) }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary }}>{c.k}</Typography>
                              <Typography sx={{ fontSize: '12px', color: muted }}>{c.read}</Typography>
                            </Box>
                            <Typography className="mono-font tabular-nums" sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary, textAlign: 'right' }}>{c.v}</Typography>
                          </Box>
                        ));
                      })()}
                      {(details.peers?.reported || []).length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary, mb: 1 }}>
                            Peers that already reported ({details.peers?.industry}) · avg {fmtPct(details.peers?.avg_reaction)}
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {(details.peers.reported as Dict[]).map((p) => (
                              <Box key={`${p.ticker}-${p.date}`} sx={{ px: 1, py: '3px', borderRadius: '5px', border: `1px solid ${line}`, fontSize: '12px', fontWeight: 700, color: tokens.text.primary }}>
                                {p.ticker} <span style={{ color: signColor(p.reaction3d) }}>{fmtPct(p.reaction3d)}</span>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </Grid>

                  {/* How reliable: plain sentences + one strip per model */}
                  <Grid item xs={12} md={6}>
                    <Box sx={card}>
                      <Title hint="tested on past results the model never saw">How reliable is this?</Title>
                      {(['runup', 'reaction'] as const).map((k) => {
                        const m = bt(k);
                        const buckets: Dict[] = Array.isArray(m.buckets) ? m.buckets : [];
                        const mine = details[k]?.bucket;
                        const b = buckets.find((x) => x.bucket === mine);
                        if (!b) return null;
                        const reliable = b.stable && Math.abs(b.t) >= 2.5;
                        const maxAbs = Math.max(0.5, ...buckets.map((x) => Math.abs(x.mean)));
                        return (
                          <Box key={k} sx={{ mb: 2 }}>
                            <Typography sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary }}>{k === 'runup' ? 'Before results' : 'After results'}</Typography>
                            <Typography sx={{ fontSize: '13px', color: muted, lineHeight: 1.5, mt: 0.25 }}>
                              In {b.n.toLocaleString('en-IN')} past cases like this, stocks moved <b style={{ color: signColor(b.mean) }}>{fmtPct(b.mean)}</b> vs Nifty on average
                              and beat it {Math.round(b.hit * 100)}% of the time. <b style={{ color: reliable ? green : amber }}>{reliable ? 'Reliable pattern.' : 'Not a reliable pattern.'}</b>
                            </Typography>
                            <Box sx={{ display: 'flex', gap: '6px', mt: 1, alignItems: 'flex-end', height: 44 }}>
                              {buckets.map((x) => (
                                <Tooltip key={x.bucket} title={`${x.bucket === 0 ? 'Worst 20%' : x.bucket === 4 ? 'Best 20%' : `Group ${x.bucket + 1}`}: ${fmtPct(x.mean)} avg, beat Nifty ${Math.round(x.hit * 100)}%`}>
                                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                    <Box sx={{ width: '100%', height: `${Math.max(3, (Math.abs(x.mean) / maxAbs) * 30)}px`, borderRadius: '3px', backgroundColor: signColor(x.mean),
                                      opacity: x.bucket === mine ? 1 : 0.35, outline: x.bucket === mine ? `2px solid ${tokens.text.primary}` : 'none' }} />
                                    <Typography sx={{ fontSize: '11px', color: x.bucket === mine ? tokens.text.primary : muted, fontWeight: x.bucket === mine ? 800 : 500 }}>
                                      {x.bucket === 0 ? 'worst' : x.bucket === 4 ? 'best' : x.bucket + 1}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                              ))}
                            </Box>
                          </Box>
                        );
                      })}
                      <Typography sx={{ fontSize: '13px', color: muted, borderTop: `1px solid ${line}`, pt: 1.25 }}>
                        {record.global?.n
                          ? <>Live calls so far: <b style={{ color: tokens.text.primary }}>{record.global.hits} of {record.global.n} right</b>{record.company?.n ? ` (this stock: ${record.company.hits} of ${record.company.n})` : ''}.</>
                          : 'Live track record starts once the first forecasts are graded after results.'}
                      </Typography>
                    </Box>
                  </Grid>

                  {/* Past results: what a swing trader needs - before, on, and after results */}
                  <Grid item xs={12}>
                    <Box sx={card}>
                      <Title hint="moves vs Nifty">Past results</Title>
                      {(() => {
                        const withRunup = events.filter((e) => e.runup5 != null);
                        const runUps = withRunup.filter((e) => e.runup5 > 0).length;
                        const d1 = events.filter((e) => e.ar1 != null);
                        const d1Ups = d1.filter((e) => e.ar1 > 0).length;
                        return (
                          <Typography sx={{ fontSize: '13px', color: tokens.text.primary, mb: 1.5, lineHeight: 1.6 }}>
                            Rose in the 5 days before results <b>{runUps} of {withRunup.length}</b> times · rose on results day <b>{d1Ups} of {d1.length}</b> times ·
                            higher 3 days after <b>{ups} of {done.length}</b> times.
                          </Typography>
                        );
                      })()}
                      <Box sx={{ overflowX: 'auto' }}>
                        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& td, & th': { fontSize: '13px', py: '6px', px: '8px', textAlign: 'right', borderBottom: `1px solid ${line}` }, '& th': { color: muted, fontWeight: 700 }, '& td:first-of-type, & th:first-of-type': { textAlign: 'left' } }}>
                          <thead><tr><th>Results date</th><th>5 days before</th><th>Results day</th><th>3 days after</th><th>5 days after</th></tr></thead>
                          <tbody>
                            {events.map((e) => (
                              <tr key={e.date}>
                                <td style={{ color: tokens.text.primary, fontWeight: 600 }}>{new Date(`${e.date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                {[e.runup5, e.ar1, e.ar3, e.ar5].map((v: number | null, i: number) => (
                                  <td key={i} className="mono-font" style={{ color: signColor(v), fontWeight: 700 }}>{fmtPct(v)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </Box>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </Collapse>
            </Grid>

            <Grid item xs={12}>
              <Typography sx={{ fontSize: '12px', color: muted, lineHeight: 1.5, textAlign: 'center' }}>
                These are probabilities, not promises — even a 65% call is wrong about 1 in 3 times. Always use the stop-loss. Not investment advice.
              </Typography>
            </Grid>
          </Grid>
        )}
      </DialogContent>
    </Dialog>
  );
};
