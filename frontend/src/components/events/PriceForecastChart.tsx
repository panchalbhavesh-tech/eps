import React, { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useThemeMode } from '../../theme/ThemeContext';
import { fmtDate, fmtPrice } from './preReleaseTypes';
import { useIsMobile } from '../../hooks/useResponsive';

type Dict = Record<string, any>;

export interface PricePath {
  as_of: string;
  price: number;
  price_source: string;
  daily_vol_pct: number;
  results_index: number;
  exit_index: number;
  history: { date: string; close: number }[];
  bands: { date: string; p10: number; p25: number; p50: number; p75: number; p90: number }[];
  plan: { stop: number; stop_pct: number; stop_touch_prob: number; stop_basis: string; reward_risk: number | null; expected_exit_pct: number;
    targets: { name: string; price: number; pct: number; touch_prob: number; hit_date?: string | null; hit_early?: string | null; hit_late?: string | null }[] };
  entry_schedule?: { exit_session: number; exit_date: string; cost_pct: number; best_session: number | null; meaningful?: boolean; best_exp_pct?: number; min_edge_pct?: number;
    rows: { session: number; date: string; buy: number; sell: number; exp_pct: number; median_pct: number; win_prob: number }[] };
  after_results?: { entry_date: string; entry_price: number; end_date: string; sessions: number; move_pct: number;
    up_first_prob: number; down_first_prob: number; end_median_pct: number; end_up_prob: number };
  entry?: { best_session: number; best_date: string | null; best_price: number; best_vs_now_pct: number; limit_price: number; limit_vs_now_pct: number;
    limit_fill_prob: number; limit_fill_date: string | null; deadline_date: string | null; after_results: boolean };
  levels: Dict[];
  results_move_p10_p90: [number, number];
  trade_plan?: Dict;
  rules?: string[];
  calibration?: Dict;
}

interface Props {
  path: PricePath;
  entryLabel?: string;         // "BUY" for trade calls, otherwise a neutral "cheapest price" marker
  exitLabel?: string;
  eventLabel?: string;         // marker at results_index ("RESULTS" on the Events page)
}

// Drawing size: phones get a narrower canvas so labels stay readable when scaled to the screen.
const DESKTOP = { W: 760, H: 360, PAD: { l: 8, r: 150, t: 22, b: 30 } };
const PHONE = { W: 400, H: 300, PAD: { l: 6, r: 118, t: 22, b: 28 } };

/** Real closes flowing into the simulated forecast cone, with plan levels on top. */
export const PriceForecastChart: React.FC<Props> = ({ path, exitLabel, entryLabel = 'CHEAPEST', eventLabel = 'RESULTS' }) => {
  const { tokens } = useThemeMode();
  const [hover, setHover] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const { W, H, PAD } = isMobile ? PHONE : DESKTOP;
  const green = tokens.status.success.main;
  const red = tokens.status.error.main;
  const amber = tokens.status.warning.main;
  const blue = tokens.accent.main;
  const muted = tokens.text.secondary;

  const model = useMemo(() => {
    const hist = path.history.slice(0, -1).length && path.history[path.history.length - 1].date === path.bands[0].date
      ? path.history.slice(0, -1) : path.history;
    const nH = hist.length;
    const n = nH + path.bands.length;          // bands[0] is "now"
    // Piecewise x-axis: recent history on the left 50%, the forecast gets the right 50% so the cone is readable.
    const split = PAD.l + 0.5 * (W - PAD.l - PAD.r);
    const nF = path.bands.length - 1;
    const x = (i: number) => i <= nH
      ? PAD.l + (nH ? i / nH : 0) * (split - PAD.l)
      : split + ((i - nH) / Math.max(1, nF)) * (W - PAD.r - split);
    // Keep it simple: only the prices you act on - two targets and the stop-loss.
    // Phones: short labels (T1 ₹1,569) so they fit beside the plot.
    const px = (v: number) => (isMobile ? `₹${Math.round(v).toLocaleString('en-IN')}` : fmtPrice(v));
    const lines: { price: number; label: string; color: string; dash: string; strong: boolean }[] = [
      { price: path.plan.targets[1].price, label: `${isMobile ? 'T2' : 'Target 2'} ${px(path.plan.targets[1].price)}`, color: green, dash: '5 4', strong: true },
      { price: path.plan.targets[0].price, label: `${isMobile ? 'T1' : 'Target 1'} ${px(path.plan.targets[0].price)}`, color: green, dash: '5 4', strong: true },
      { price: path.plan.stop, label: `Stop ${px(path.plan.stop)}`, color: red, dash: '', strong: true },
    ];
    const vals = [...hist.map((h) => h.close), ...path.bands.flatMap((b) => [b.p10, b.p90]), ...lines.map((l) => l.price)];
    const lo = Math.min(...vals) * 0.995;
    const hi = Math.max(...vals) * 1.005;
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const fi = (j: number) => nH + j;           // x-index of forecast step j
    const area = (a: 'p10', b: 'p90') =>
      path.bands.map((d, j) => `${x(fi(j))},${y(d[b])}`).join(' ') + ' ' +
      [...path.bands].reverse().map((d, k) => `${x(fi(path.bands.length - 1 - k))},${y(d[a])}`).join(' ');
    // Keep right-edge labels from overlapping
    const labels = lines.map((l) => ({ ...l, ly: y(l.price) })).sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < labels.length; i++) if (labels[i].ly - labels[i - 1].ly < 16) labels[i].ly = labels[i - 1].ly + 16;
    return { hist, nH, n, x, y, fi, area, labels, lines };
  }, [path, tokens, green, red, W, H, PAD, isMobile]);

  const { hist, nH, n, x, y, fi, area, labels, lines } = model;
  const resultsX = x(fi(Math.min(path.results_index, path.bands.length - 1)));
  const exitX = x(fi(Math.min(path.exit_index, path.bands.length - 1)));
  // phones: fewer date ticks so labels never collide on the narrow canvas
  const tickIdx = isMobile ? [0, nH, n - 1] : [0, Math.floor(nH / 2), nH, n - 1];

  // Mouse hover on desktop, tap/drag on touch screens: nearest day under the pointer.
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };

  const point = (i: number) => {
    if (i < nH) return { date: hist[i].date, actual: hist[i].close };
    const b = path.bands[i - nH];
    return { date: b.date, band: b, now: i === nH };
  };
  const hp = hover != null ? point(hover) : null;

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', touchAction: 'pan-y' }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => pick(e)}
        onPointerMove={(e) => pick(e)}>
        <style>{`text { paint-order: stroke; stroke: ${tokens.mode === 'dark' ? '#16191D' : '#FFFFFF'}; stroke-width: 4px; stroke-linejoin: round; }`}</style>
        {/* forecast zone background */}
        <rect x={x(nH)} y={PAD.t} width={x(n - 1) - x(nH)} height={H - PAD.t - PAD.b} fill={tokens.background.cardHover} opacity={0.5} />
        {/* level lines */}
        {lines.map((l, i) => (
          <line key={i} x1={PAD.l} x2={W - PAD.r} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeWidth={l.strong ? 1.6 : 1} strokeDasharray={l.dash} opacity={l.strong ? 0.95 : 0.6} />
        ))}
        {/* cone */}
        <polygon points={area('p10', 'p90')} fill={blue} opacity={0.24} />
        <polyline points={path.bands.map((d, j) => `${x(fi(j))},${y(d.p50)}`).join(' ')} fill="none" stroke={blue} strokeWidth={2.6} strokeDasharray="7 5" />
        {/* actual prices */}
        <polyline points={[...hist.map((h, i) => `${x(i)},${y(h.close)}`), `${x(nH)},${y(path.price)}`].join(' ')} fill="none" stroke={tokens.text.primary} strokeWidth={2.4} />
        {/* results + exit markers */}
        <line x1={resultsX} x2={resultsX} y1={PAD.t} y2={H - PAD.b} stroke={amber} strokeWidth={1.2} strokeDasharray="3 3" />
        <text x={resultsX + 4} y={PAD.t + 10} fontSize="13" fontWeight={700} fill={amber}>{eventLabel}</text>
        {exitLabel && Math.abs(exitX - resultsX) > 2 && (
          <>
            <line x1={exitX} x2={exitX} y1={PAD.t} y2={H - PAD.b} stroke={green} strokeWidth={1.2} strokeDasharray="3 3" />
            <text x={exitX - 4} y={PAD.t + 24} fontSize="13" fontWeight={700} fill={green} textAnchor="end">{exitLabel}</text>
          </>
        )}
        {/* when each target is typically first reached */}
        {path.plan.targets.slice(0, 2).map((t, k) => {
          const j = t.hit_date ? path.bands.findIndex((b) => b.date === t.hit_date) : -1;
          if (j < 0) return null;
          return (
            <g key={k}>
              <circle cx={x(fi(j))} cy={y(t.price)} r={4} fill={green} stroke={tokens.background.card} strokeWidth={1.5} />
              <text x={x(fi(j))} y={y(t.price) - 7} fontSize="13" fontWeight={700} fill={green} textAnchor="middle">~{fmtDate(t.hit_date)}</text>
            </g>
          );
        })}
        {/* best entry */}
        {path.entry && path.entry.best_session > 0 && (() => {
          const j = Math.min(path.entry.best_session, path.bands.length - 1);
          const sameAsResults = j === Math.min(path.results_index, path.bands.length - 1);
          const cx = x(fi(j));
          const cy = y(path.entry.best_price);
          return (
            <g>
              <polygon points={`${cx},${cy + 3} ${cx - 6},${cy + 13} ${cx + 6},${cy + 13}`} fill={green} />
              {!sameAsResults && <text x={cx} y={cy + 28} fontSize="13" fontWeight={800} fill={green} textAnchor="middle">{entryLabel}</text>}
            </g>
          );
        })()}
        {/* expected price on results day */}
        {(() => {
          const j = Math.min(path.results_index, path.bands.length - 1);
          const v = path.bands[j].p50;
          return (
            <>
              <circle cx={x(fi(j))} cy={y(v)} r={4} fill={amber} />
              <text x={x(fi(j)) + 12} y={y(v) + 24} fontSize="14" fontWeight={800} fill={amber} textAnchor="start">
                {fmtPrice(v)}{path.entry && Math.min(path.entry.best_session, path.bands.length - 1) === j ? (entryLabel === 'BUY' ? ' · buy' : ' · cheapest') : ''}
              </text>
            </>
          );
        })()}
        {/* now */}
        <circle cx={x(nH)} cy={y(path.price)} r={4.5} fill={blue} stroke={tokens.background.card} strokeWidth={2} />
        {/* right-edge labels */}
        {labels.map((l, i) => (
          <text key={i} x={W - PAD.r + 6} y={l.ly + 3.5} fontSize="13" fontWeight={l.strong ? 700 : 500} fill={l.color}>{l.label}</text>
        ))}
        {/* x ticks */}
        {tickIdx.map((i, k) => (
          <text key={k} x={x(i)} y={H - 8} fontSize="13" fill={muted} textAnchor={k === 0 ? 'start' : k === tickIdx.length - 1 ? 'end' : 'middle'}>
            {i === nH ? 'Today' : fmtDate(point(i).date)}
          </text>
        ))}
        {/* hover */}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke={muted} strokeWidth={1} />}
      </svg>
      {hp && (
        <Box sx={{ position: 'absolute', top: 8, left: 12, px: 1.25, py: 0.75, borderRadius: '6px', backgroundColor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, pointerEvents: 'none' }}>
          <Typography sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary }}>{fmtDate(hp.date)}{hp.now ? ' · now' : ''}</Typography>
          {'actual' in hp && hp.actual != null && <Typography className="mono-font" sx={{ fontSize: '13px', color: tokens.text.secondary }}>Close {fmtPrice(hp.actual)}</Typography>}
          {'band' in hp && hp.band && !hp.now && (
            <Typography className="mono-font" sx={{ fontSize: '13px', color: tokens.text.secondary }}>
              Expected <b style={{ color: tokens.text.primary }}>{fmtPrice(hp.band.p50)}</b><br />
              Likely between {fmtPrice(hp.band.p10)} and {fmtPrice(hp.band.p90)}
            </Typography>
          )}
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
        {[
          ['━', tokens.text.primary, 'Real price'],
          ['┅', blue, 'Expected price'],
          ['▇', `${blue}88`, 'Likely range'],
          ['┅', green, 'Targets'],
          ['━', red, 'Stop-loss'],
          ['●', green, 'Target usually hit'],
          ['▲', green, entryLabel === 'BUY' ? 'Best entry' : 'Cheapest expected price'],
        ].map(([sym, c, t]) => (
          <Typography key={t} sx={{ fontSize: '12px', color: muted }}><span style={{ color: c, fontWeight: 800 }}>{sym}</span> {t}</Typography>
        ))}
      </Box>
    </Box>
  );
};
