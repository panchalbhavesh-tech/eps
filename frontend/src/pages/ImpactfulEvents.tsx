import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Tabs, Tab, IconButton, Tooltip, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery } from '@apollo/client';
import { useThemeMode } from '../theme/ThemeContext';
import { RowTintedDataGrid, FilterChipGroup, SearchInput } from '../components/common';
import type { MobileSortOption } from '../components/common';
import { SmartCron } from '../components/common/SmartCron';
import { useIsMobile } from '../hooks/useResponsive';
import { fmtDate, fmtPct, fmtPrice, safeJson } from '../components/events/preReleaseTypes';
import {
  GET_IMPACTFUL_EVENTS, REFRESH_IMPACTFUL_EVENTS, ImpactEvent, ImpactSnapshot, TABS, ACTION_ORDER, whenText, keyDate,
} from '../components/impactful/impactfulTypes';
import ImpactfulEventDialog from '../components/impactful/ImpactfulEventDialog';
import { ActionChip, PastRecord } from '../components/impactful/ImpactBits';

// whole rupees above ₹100 keep the one-line plan readable
const px = (v?: number | null) => (v == null ? '—' : v >= 100 ? `₹${Math.round(v).toLocaleString('en-IN')}` : fmtPrice(v));
const EMPTY: ImpactSnapshot = { built_at: null, evidence_events: 0, tabs: {}, items: [] };

const ImpactfulEvents: React.FC = () => {
  const { tokens } = useThemeMode();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('early');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ImpactEvent | null>(null);
  const [waitingSince, setWaitingSince] = useState<string | null | undefined>(undefined);

  const { data, loading, refetch, startPolling, stopPolling } = useQuery(GET_IMPACTFUL_EVENTS, { fetchPolicy: 'cache-and-network' });
  const snap = safeJson<ImpactSnapshot>(data?.impactfulEvents, EMPTY);
  const [refresh, { loading: refreshing }] = useMutation(REFRESH_IMPACTFUL_EVENTS);

  // Poll while the first build runs, or after "Refresh" until a newer snapshot lands.
  const waiting = !!snap.building || (waitingSince !== undefined && snap.built_at === waitingSince);
  useEffect(() => {
    if (waiting) startPolling(10000);
    else { stopPolling(); if (waitingSince !== undefined) setWaitingSince(undefined); }
    return () => stopPolling();
  }, [waiting, startPolling, stopPolling, waitingSince]);

  const green = tokens.status.success.main, red = tokens.status.error.main, muted = tokens.text.secondary;
  const signColor = (v?: number | null) => (v == null ? muted : v >= 0 ? green : red);

  // one row per event (the grid needs unique ids)
  const items = useMemo(() => Array.from(new Map(snap.items.map((e) => [e.key, e])).values()), [snap.items]);
  const tabRows = useMemo(() => items.filter((e) => (tab === 'early' ? e.stage === 'NOTICE' && e.action === 'BUY' : e.tab === tab)), [items, tab]);
  const isDone = (e: ImpactEvent) => e.stage === 'EX_PASSED' || e.stage === 'MEETING_DONE';
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabRows.filter((e) => {
      if (filter === 'BUY' && e.action !== 'BUY') return false;
      if (filter === 'UPCOMING' && isDone(e)) return false;
      if (filter === 'DONE' && !isDone(e)) return false;
      return !q || e.ticker.toLowerCase().includes(q) || (e.name || '').toLowerCase().includes(q);
    });
  }, [tabRows, filter, search]);

  const pills = [
    { label: 'All', value: 'ALL', count: tabRows.length },
    { label: 'Buy now', value: 'BUY', count: tabRows.filter((e) => e.action === 'BUY').length, color: green },
    { label: 'Upcoming', value: 'UPCOMING', count: tabRows.filter((e) => !isDone(e)).length },
    { label: 'Done', value: 'DONE', count: tabRows.filter(isDone).length },
  ];

  const two = (top: React.ReactNode, bottom: React.ReactNode, topColor?: string) => (
    <Box sx={{ lineHeight: 1.3, minWidth: 0, width: '100%' }}>
      <Typography noWrap sx={{ fontSize: '13px', fontWeight: 700, color: topColor || tokens.text.primary }}>{top}</Typography>
      <Typography noWrap sx={{ fontSize: '12px', color: muted }}>{bottom}</Typography>
    </Box>
  );

  /** "If you buy today": what past events did from this same point, sold on the close before the key date. */
  const buyToday = (e: ImpactEvent) => {
    const t = e.now;
    if (t) {
      const upside = t.target_pct >= 0.5;
      return (
        <Tooltip arrow title={`In ${t.n} past ${t.basis === 'own' ? `${e.ticker} events` : 'similar events'} bought this many days before the ${e.stage === 'NOTICE' ? 'meeting' : 'ex-date'}: the target was reached in ${t.target_hit}% of them; held to the sell-by date, ${t.wins} of ${t.n} rose (typical ${fmtPct(t.median)}).`}>
          {two(
            upside ? <>{px(t.entry)} → {px(t.target)} <span style={{ color: green }}>{fmtPct(t.target_pct)}</span></> : <span style={{ color: muted }}>Little upside left from here</span>,
            <>Rose {t.wins}/{t.n} · stop {px(t.stop)} · sell by {fmtDate(t.sell_by)}</>)}
        </Tooltip>
      );
    }
    if (e.stage === 'EX_PASSED' && e.result_pct != null) return two(
      <span style={{ color: signColor(e.result_pct) }}>{fmtPct(e.result_pct)} news → ex-date</span>, <>{fmtPct(e.after_ex_pct)} since ex-date</>);
    return <Typography sx={{ fontSize: '12px', color: muted }}>—</Typography>;
  };

  const eventDetail = (e: ImpactEvent) => {
    if (e.kind === 'DIVIDEND' && e.surprise_pct != null)
      return Math.abs(e.surprise_pct) < 1 ? 'Same as last year' : e.surprise_pct > 0 ? `Raised ${e.surprise_pct.toFixed(0)}% vs last year` : `Cut ${Math.abs(e.surprise_pct).toFixed(0)}% vs last year`;
    if (e.kind === 'BUYBACK' && e.bb_return_pct != null) return `Min. arbitrage ${fmtPct(e.bb_return_pct)}`;
    if (e.kind === 'RIGHTS' && e.rights_discount_pct != null) return `${e.rights_discount_pct}% below price · dilutive`;
    if (e.with_results) return 'With quarterly results';
    return e.kind_label;
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'STOCK', flex: 1.2, minWidth: 200,
      renderCell: ({ row }) => two(row.name, <>{row.ticker}{row.is_new && <Box component="span" sx={{ ml: 0.75, px: 0.6, borderRadius: '4px', fontSize: '10.5px', fontWeight: 800, color: '#fff', backgroundColor: tokens.accent.main }}>NEW</Box>}</>) },
    { field: 'what', headerName: 'EVENT', flex: 1.2, minWidth: 200, renderCell: ({ row }) => two(row.what, eventDetail(row)) },
    { field: 'days_to', headerName: 'KEY DATE', width: 170, type: 'number', align: 'left', headerAlign: 'left',
      renderCell: ({ row }) => two(whenText(row), fmtDate(keyDate(row)), isDone(row) ? muted : undefined) },
    { field: 'own', headerName: 'PAST RECORD', width: 190, sortable: false, renderCell: ({ row }) => <PastRecord e={row} /> },
    { field: 'action', headerName: 'ACTION', width: 190,
      sortComparator: (a, b) => ACTION_ORDER.indexOf(a) - ACTION_ORDER.indexOf(b),
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
          <ActionChip a={row.action} />
          <Typography noWrap sx={{ fontSize: '12px', color: muted }}>{row.why}</Typography>
        </Box>
      ) },
    { field: 'now', headerName: 'IF YOU BUY TODAY', flex: 1.3, minWidth: 240, sortable: true, valueGetter: (_v, row) => row.now?.target_pct ?? -99, renderCell: ({ row }) => buyToday(row) },
    { field: 'price', headerName: 'PRICE', width: 120, type: 'number',
      renderCell: ({ row }) => (
        <Box sx={{ lineHeight: 1.3, textAlign: 'right', width: '100%' }}>
          <Typography className="mono-font" sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary }}>{fmtPrice(row.price)}</Typography>
          <Typography sx={{ fontSize: '12px', color: muted }}>{row.adv_cr != null ? `₹${row.adv_cr.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr/day` : ''}</Typography>
        </Box>
      ) },
  ];

  const renderCard = (e: ImpactEvent) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '14px', fontWeight: 700, color: tokens.text.primary }}>{e.name}</Typography>
          <Typography sx={{ fontSize: '12px', color: muted }}>{e.ticker}{e.is_new && <b style={{ color: tokens.accent.main }}> · NEW</b>} · {fmtPrice(e.price)}</Typography>
        </Box>
        <ActionChip a={e.action} />
      </Box>
      <Typography sx={{ fontSize: '13px', color: tokens.text.primary }}><b>{e.what}</b> · {whenText(e)} ({fmtDate(keyDate(e))})</Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
        <PastRecord e={e} />
        <Typography sx={{ fontSize: '12px', color: muted, textAlign: 'right' }}>{e.why}</Typography>
      </Box>
      {e.now && (
        <Typography sx={{ fontSize: '12.5px', color: tokens.text.primary }}>
          <b>If you buy today:</b>{' '}
          {e.now.target_pct >= 0.5 ? <>{px(e.now.entry)} → {px(e.now.target)} <span style={{ color: green }}>{fmtPct(e.now.target_pct)}</span></> : 'little upside left'}
          {' '}· rose {e.now.wins}/{e.now.n} · stop {px(e.now.stop)} · sell by {fmtDate(e.now.sell_by)}
        </Typography>
      )}
    </Box>
  );
  const sortOptions: MobileSortOption[] = [
    { key: 'action', label: 'Best first', desc: false, get: (r) => ACTION_ORDER.indexOf(r.action) * 1000 + (r.days_to != null && r.days_to >= 0 ? r.days_to : 999) },
    { key: 'soon', label: 'Soonest', desc: false, get: (r) => (r.days_to != null && r.days_to >= 0 ? r.days_to : 999) },
    { key: 'yield', label: 'Dividend yield', get: (r) => r.yield_pct },
    { key: 'volume', label: 'Most traded', get: (r) => r.adv_cr },
  ];

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, height: { xs: 'auto', sm: '100%' }, display: 'flex', flexDirection: 'column', gap: { xs: 1.5, md: 2 }, minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0, flex: '1 1 420px' }}>
          <Typography sx={{ fontSize: { xs: '18px', md: '20px' }, fontWeight: 800, color: tokens.text.primary }}>Impactful Events</Typography>
          <Typography sx={{ fontSize: '13px', color: muted, mt: 0.25 }}>
            Catch dividends, bonus issues, splits and buybacks early. <b style={{ color: green }}>BUY</b> = this event made money before and there is still time to enter.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '12px', color: muted, whiteSpace: 'nowrap' }}>
            {waiting ? 'Updating…' : snap.built_at ? `Updated ${snap.built_at.slice(11)}` : ''}
          </Typography>
          <Tooltip title="Pull the latest from NSE now">
            <span>
              <IconButton aria-label="Refresh" disabled={refreshing || waiting}
                onClick={async () => { setWaitingSince(snap.built_at); await refresh(); refetch(); }}
                sx={{ border: `1px solid ${tokens.border.main}`, borderRadius: '8px', width: 40, height: 40, color: tokens.text.primary }}>
                {refreshing || waiting ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <SmartCron page="impactful" />
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => { setTab(v); setFilter('ALL'); }} variant="scrollable" scrollButtons={false}
        sx={{ minHeight: 40, borderBottom: `1px solid ${tokens.border.main}`, flexShrink: 0,
          '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontSize: '13.5px', fontWeight: 700, color: muted, px: { xs: 1.5, md: 2 } },
          '& .Mui-selected': { color: `${tokens.text.primary} !important` }, '& .MuiTabs-indicator': { backgroundColor: tokens.primary.main } }}>
        {TABS.map((t) => {
          const c = snap.tabs?.[t.key];
          return (
            <Tab key={t.key} value={t.key} label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {isMobile ? t.short : t.label}
                <Box component="span" sx={{ fontSize: '11.5px', color: muted, fontWeight: 600 }}>{c?.total ?? 0}</Box>
                {c?.buy ? <Box component="span" sx={{ fontSize: '11px', fontWeight: 800, color: '#fff', backgroundColor: green, borderRadius: '10px', px: 0.75 }}>{c.buy} BUY</Box> : null}
              </Box>
            } />
          );
        })}
      </Tabs>

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        {tab === 'early' ? (
          <Typography sx={{ fontSize: '13px', color: muted, flex: { xs: '1 1 100%', md: '0 1 auto' } }}>
            Only board-meeting notices worth buying now, before the announcement. All other notices stay in their own tabs.
          </Typography>
        ) : (
          <Box sx={{ minWidth: 0, maxWidth: '100%', flex: { xs: '1 1 100%', md: '0 1 auto' } }}>
            <FilterChipGroup options={pills} selectedValue={filter} onChange={setFilter} />
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search stock" width={{ xs: '100%', sm: 240 }} />
      </Box>

      <Box sx={{ flex: 1, minHeight: { xs: 'auto', sm: 420 }, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', overflow: 'hidden' }}>
        {snap.building && !items.length ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={26} />
            <Typography sx={{ mt: 1.5, fontSize: '13px', color: muted }}>Pulling the latest events from NSE (about a minute)…</Typography>
          </Box>
        ) : (
          <RowTintedDataGrid
            key={tab}
            rows={rows} columns={columns} getRowId={(r) => r.key} loading={loading && !items.length}
            rowHeight={60} disableRowSelectionOnClick
            localeText={{ noRowsLabel: tab === 'early' ? 'No early opportunity right now - new notices are checked every 30 minutes.' : 'Nothing here right now.' }} onRowClick={(p) => setSelected(p.row as ImpactEvent)}
            getRowClassName={(p) => (p.row.action === 'BUY' ? 'row-tint-buy' : p.row.action === 'AVOID' ? 'row-tint-avoid' : 'row-tint-neutral')}
            initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
            mobileCard={renderCard} mobileSortOptions={sortOptions} mobileDefaultSort="action"
            mobileEmptyText={tab === 'early' ? 'No early opportunity right now - new notices are checked every 30 minutes.' : filter === 'BUY' ? 'No event passes the test right now.' : 'Nothing here right now.'}
            sx={{ height: '100%', '& .MuiDataGrid-row': { cursor: 'pointer' } }}
          />
        )}
      </Box>

      <ImpactfulEventDialog event={selected} onClose={() => setSelected(null)} />
    </Box>
  );
};

export default ImpactfulEvents;
