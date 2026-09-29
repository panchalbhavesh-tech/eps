import React from 'react';
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography, CircularProgress, Grid } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { useThemeMode } from '../../theme/ThemeContext';
import { useIsMobile } from '../../hooks/useResponsive';
import { PriceForecastChart } from '../events/PriceForecastChart';
import type { PricePath } from '../events/PriceForecastChart';
import { fmtDate, fmtPct, fmtPrice, safeJson } from '../events/preReleaseTypes';
import { GET_IMPACTFUL_EVENT_DETAIL, ImpactEvent, whenText, keyDate } from './impactfulTypes';
import { ActionChip } from './ImpactBits';

type Dict = Record<string, any>;

const ImpactfulEventDialog: React.FC<{ event: ImpactEvent | null; onClose: () => void }> = ({ event, onClose }) => {
  const { tokens } = useThemeMode();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { data, loading } = useQuery(GET_IMPACTFUL_EVENT_DETAIL, { variables: { key: event?.key || '' }, skip: !event, fetchPolicy: 'cache-first' });
  const detail = safeJson<Dict>(data?.impactfulEventDetail, {});
  const e: ImpactEvent | null = (detail.row as ImpactEvent) || event;
  const path = detail.path as (PricePath & { event_label?: string }) | undefined;
  const history: Dict[] = detail.history || [];

  const green = tokens.status.success.main, red = tokens.status.error.main, muted = tokens.text.secondary;
  const isDark = tokens.mode === 'dark';
  const line = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
  const signColor = (v?: number | null) => (v == null ? muted : v >= 0 ? green : red);
  const card = { p: { xs: 2, md: 2.5 }, backgroundColor: isDark ? '#16191D' : '#FFFFFF', border: `1px solid ${line}`, borderRadius: '12px', height: '100%' };
  const label = { fontSize: '12px', fontWeight: 800, color: tokens.text.primary, textTransform: 'uppercase' as const, letterSpacing: '0.7px', opacity: 0.85, mb: 1.5 };

  if (!e) return null;
  const own = e.own || { n: 0, moves: [] };
  const g = e.group || {};
  const k = (e.sessions_to_exit ?? 0) + 1;
  const daysWord = `${k} trading day${k === 1 ? '' : 's'}`;
  const window = e.stage === 'NOTICE' ? 'from the meeting notice to the day before the meeting' : 'from the announcement to the day before the ex-date';

  const summary = own.n >= 3
    ? <>Last {own.n} times, {e.ticker} <b>rose {own.up} of {own.n} times</b> {window}, by <b style={{ color: signColor(own.mean) }}>{fmtPct(own.mean)}</b> on average.</>
    : g.n ? <>{e.ticker} has little history of this. Across <b>{g.n} similar events</b>, the stock rose <b>{g.hit}%</b> of the time {window}, by <b style={{ color: signColor(g.mean) }}>{fmtPct(g.mean)}</b> on average.</>
      : <>No past events of this type to learn from.</>;

  const Fact: React.FC<{ k: string; v: React.ReactNode; c?: string }> = ({ k, v, c }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.75, borderBottom: `1px dashed ${line}` }}>
      <Typography sx={{ fontSize: '13px', color: muted }}>{k}</Typography>
      <Typography className="mono-font" sx={{ fontSize: '13.5px', fontWeight: 700, color: c || tokens.text.primary, textAlign: 'right' }}>{v}</Typography>
    </Box>
  );
  const Big: React.FC<{ k: string; v: React.ReactNode; s?: React.ReactNode; c?: string }> = ({ k, v, s, c }) => (
    <Box>
      <Typography sx={{ fontSize: '12px', color: muted }}>{k}</Typography>
      <Typography className="mono-font" sx={{ fontSize: { xs: '18px', md: '20px' }, fontWeight: 800, color: c || tokens.text.primary, lineHeight: 1.3 }}>{v}</Typography>
      {s && <Typography sx={{ fontSize: '12px', color: muted }}>{s}</Typography>}
    </Box>
  );

  return (
    <Dialog open={!!event} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}
      PaperProps={{ sx: { backgroundColor: isDark ? '#0D0F12' : '#F4F5F7', backgroundImage: 'none', border: `1px solid ${line}`, borderRadius: isMobile ? 0 : '14px' } }}>
      <DialogTitle sx={{ borderBottom: `1px solid ${line}`, py: 2, px: { xs: 2, md: 3 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: { xs: '17px', md: '20px' }, fontWeight: 800, color: tokens.text.primary, cursor: 'pointer' }}
            onClick={() => navigate(`/companies/${e.company_id}`)}>
            {e.name} <span style={{ color: muted, fontWeight: 500 }}>({e.ticker})</span>
          </Typography>
          <Typography sx={{ fontSize: '14px', color: muted, mt: 0.5 }}>
            <b style={{ color: tokens.text.primary }}>{e.what}</b> · {whenText(e)} ({fmtDate(keyDate(e))})
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} sx={{ color: muted }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: { xs: 1.5, md: 3 }, pt: { xs: '12px !important', md: '20px !important' } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1.5, md: 2 } }}>
          {/* action */}
          <Box sx={card}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.25, flexWrap: 'wrap' }}>
              <ActionChip a={e.action} big />
              <Typography sx={{ fontSize: '15px', fontWeight: 700, color: tokens.text.primary }}>{e.why}</Typography>
            </Box>
            <Typography sx={{ fontSize: '14px', color: tokens.text.primary, lineHeight: 1.6 }}>{summary}</Typography>
            {e.moved_pct != null && e.stage !== 'EX_PASSED' && (
              <Typography sx={{ fontSize: '13px', color: muted, mt: 0.75 }}>
                Since the {e.stage === 'NOTICE' ? 'notice' : 'announcement'} it has already moved <b style={{ color: signColor(e.moved_pct) }}>{fmtPct(e.moved_pct)}</b>.
              </Typography>
            )}
          </Box>

          {/* if you buy today */}
          {e.now && (
            <Box sx={card}>
              <Typography sx={label}>If you buy today at {fmtPrice(e.now.entry)}</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}><Big k="Target" v={e.now.target_pct >= 0.5 ? fmtPrice(e.now.target) : '—'} c={green}
                  s={e.now.target_pct >= 0.5 ? `${fmtPct(e.now.target_pct)} · hit in ${e.now.target_hit}% of cases` : 'little upside left'} /></Grid>
                <Grid item xs={6} sm={3}><Big k="Stretch" v={fmtPrice(e.now.stretch)} c={green} s={`${fmtPct(e.now.stretch_pct)} · hit in ~30%`} /></Grid>
                <Grid item xs={6} sm={3}><Big k="Stop loss" v={fmtPrice(e.now.stop)} c={red} s={`${fmtPct(e.now.stop_pct)} · on a close below`} /></Grid>
                <Grid item xs={6} sm={3}><Big k="Sell by" v={fmtDate(e.now.sell_by)} s={e.stage === 'NOTICE' ? 'close before the meeting' : 'close before the ex-date'} /></Grid>
              </Grid>
              <Typography sx={{ fontSize: '13.5px', color: tokens.text.primary, mt: 1.75, lineHeight: 1.6 }}>
                In <b>{e.now.n} past {e.now.basis === 'own' ? `${e.ticker} events` : 'similar events'}</b> bought {daysWord} before the {e.stage === 'NOTICE' ? 'meeting' : 'ex-date'} and
                sold by the sell-by date, <b style={{ color: e.now.win >= 60 ? green : e.now.win <= 40 ? red : tokens.text.primary }}>{e.now.wins} of {e.now.n} made money</b>
                {' '}(typical result <b style={{ color: signColor(e.now.median) }}>{fmtPct(e.now.median)}</b>, typical best point <b style={{ color: signColor(e.now.best_pct) }}>{fmtPct(e.now.best_pct)}</b>).
              </Typography>
              <Box sx={{ mt: 2 }}>
                {loading && !path ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={22} /></Box>
                  : path ? <PriceForecastChart path={path} entryLabel="BUY" eventLabel={path.event_label || 'SELL'} /> : null}
              </Box>
              <Typography sx={{ fontSize: '12.5px', color: muted, mt: 1 }}>
                Book profit at the target. If it isn't reached, sell by the date anyway - most of these fade after the {e.stage === 'NOTICE' ? 'meeting' : 'ex-date'}.
              </Typography>
            </Box>
          )}

          {/* this stock's past */}
          <Box sx={card}>
            <Typography sx={label}>{e.ticker}: last {e.kind_label.toLowerCase()} events</Typography>
            {loading && !history.length ? <CircularProgress size={20} /> : history.length === 0 ? (
              <Typography sx={{ fontSize: '13px', color: muted }}>None in the last 5 years.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {history.map((h, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.9, borderBottom: i < history.length - 1 ? `1px dashed ${line}` : 'none' }}>
                    <Typography className="mono-font" sx={{ fontSize: '13px', color: muted, width: 86, flexShrink: 0 }}>
                      {h.date ? new Date(`${h.date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: '13px', color: tokens.text.primary, flex: 1, minWidth: 0 }}>
                      {h.subject}{h.yield_pct != null ? ` · ${h.yield_pct.toFixed(1)}% yield` : ''}
                    </Typography>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography className="mono-font" sx={{ fontSize: '14px', fontWeight: 800, color: signColor(h.move), whiteSpace: 'nowrap' }}>
                        {h.move == null ? '—' : `${h.move > 0 ? '▲' : '▼'} ${fmtPct(h.move)}`}
                      </Typography>
                      {h.from_here != null && (
                        <Typography className="mono-font" sx={{ fontSize: '12px', color: muted, whiteSpace: 'nowrap' }}>
                          from today's point <span style={{ color: signColor(h.from_here) }}>{fmtPct(h.from_here)}</span>
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
            <Typography sx={{ fontSize: '12px', color: muted, mt: 1 }}>
              Big number: the stock's own price change {window}.{e.now ? ` Small: if bought ${daysWord} before, as you would today, and sold by the sell-by date.` : ''}
            </Typography>
          </Box>

          {/* details */}
          <Box sx={card}>
            <Typography sx={label}>Details</Typography>
            <Fact k="Price" v={fmtPrice(e.price)} />
            {e.meeting_date && <Fact k="Board meeting" v={`${fmtDate(e.meeting_date)}${e.notice_at ? ` (notified ${fmtDate(e.notice_at.slice(0, 10))} ${e.notice_at.slice(11)})` : ''}`} />}
            {e.ex_date && <Fact k="Ex-date" v={fmtDate(e.ex_date)} />}
            {e.record_date && <Fact k="Record date" v={fmtDate(e.record_date)} />}
            {e.kind === 'DIVIDEND' && e.dividend != null && <>
              <Fact k="Dividend / yield" v={`₹${e.dividend} · ${e.yield_pct?.toFixed(2)}%`} />
              {e.surprise_pct != null && <Fact k="vs same dividend last year" v={fmtPct(e.surprise_pct, 0)} c={signColor(e.surprise_pct)} />}
            </>}
            {e.kind === 'BUYBACK' && <>
              <Fact k="Buyback price" v={e.buyback_price ? `${fmtPrice(e.buyback_price)} (${fmtPct(e.bb_premium_pct)})` : 'not in filings yet'} />
              <Fact k="Method" v={e.buyback_method === 'TENDER' ? 'Tender offer' : e.buyback_method === 'OPEN_MARKET' ? 'Open market' : '—'} />
              {e.entitlement != null && <Fact k="Guaranteed acceptance (small holders)" v={`${(e.entitlement * 100).toFixed(0)}%`} />}
              {e.bb_return_pct != null && <Fact k="Arbitrage at guaranteed acceptance" v={fmtPct(e.bb_return_pct)} c={signColor(e.bb_return_pct)} />}
            </>}
            {e.kind === 'RIGHTS' && e.rights_price != null && <Fact k="Rights terms" v={`${e.rights_ratio || ''} @ ₹${e.rights_price} (${e.rights_discount_pct}% below price)`} />}
            <Fact k="Traded per day" v={e.adv_cr != null ? `₹${e.adv_cr.toLocaleString('en-IN')} Cr` : '—'} />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default ImpactfulEventDialog;
