import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Typography, Box, CircularProgress, Chip, IconButton, InputBase, Tooltip, Button, Dialog, DialogTitle, DialogContent, Grid, DialogActions, LinearProgress } from '@mui/material';
import { GridColDef, GridRenderCellParams, GridRowSelectionModel } from '@mui/x-data-grid';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import SearchIcon from '@mui/icons-material/Search';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import { FilterChipGroup, ErrorBoundary, StatusChip, StatusBadge, BulkActionBar, RowTintedDataGrid } from '../components/common';
import { useThemeMode } from '../theme/ThemeContext';

const GET_COMPANIES = gql`
  query GetCompanies {
    companies {
      id
      ticker
      name
      purpose
      upcomingDate
      currentPrice
      marketCap
      q1Eps
      q2Eps
      q3Eps
      q4Eps
      q0Eps
      q1Date
      q2Date
      q3Date
      q4Date
      q1Revenue
      q2Revenue
      q3Revenue
      q4Revenue
      q0Revenue
      q1Profit
      q2Profit
      q3Profit
      q4Profit
      q0Profit
      historicalTrend
      financialHealthScore
      financialHealthGrade
      momentumProbability
      avgPostEarningsMomentum
      postReleaseReturn
    }
  }
`;

const formatValCr = (val: any) => {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n) || n === 0) return '—';
  const inCr = Math.abs(n) >= 100000 ? n / 10000000 : n;
  return `${inCr < 0 ? '-' : ''}₹${Math.abs(inCr).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cr`;
};

const formatPrice = (val: any) => {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n) || n === 0) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatRelativeDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  const eventDate = new Date(dateStr);
  if (isNaN(eventDate.getTime())) return dateStr;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(eventDate);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return dateStr;
};

const POPULATE_DATA = gql`
  mutation PopulateData {
    populateCompaniesData
  }
`;

const MASS_CALCULATE_HEALTH = gql`
  mutation MassCalculateHealth {
    massCalculateFinancialHealth
  }
`;

const Home: React.FC = () => {
  const { mode, tokens } = useThemeMode();
  const isDark = mode === 'dark';

  const [expandQuarters, setExpandQuarters] = useState<boolean>(false);
  const [selectedRowIds, setSelectedRowIds] = useState<GridRowSelectionModel>([]);
  const [detailModalRow, setDetailModalRow] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'RECENT_EVENTS' | 'HIGH_HEALTH'>('ALL');

  const { loading, error, data } = useQuery(GET_COMPANIES, { pollInterval: 15000, fetchPolicy: 'network-only' });
  const [populateData] = useMutation(POPULATE_DATA);
  const [massCalculate] = useMutation(MASS_CALCULATE_HEALTH, {
    onCompleted: () => {
      alert("Mass financial health analysis queued for all stocks! Check Tasks page for progress and refresh to view scores.");
    }
  });

  const handlePopulate = useCallback(() => {
    populateData();
  }, [populateData]);

  const baseRows = useMemo(() => {
    if (!data?.companies) return [];
    const lowerSearch = (search || '').trim().toLowerCase();
    return data.companies.filter((c: any) => 
      (c.ticker || '').toLowerCase().includes(lowerSearch) || 
      (c.name || '').toLowerCase().includes(lowerSearch)
    ).map((c: any) => ({
      id: c.id,
      ...c
    }));
  }, [data?.companies, search]);

  const recentEventsCount = useMemo(() => {
    return data?.companies?.filter((c: any) => {
      if (!c.upcomingDate) return false;
      const eventDate = new Date(c.upcomingDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      eventDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    }).length || 0;
  }, [data?.companies]);

  const highHealthCount = useMemo(() => {
    return data?.companies?.filter((c: any) => (c.financialHealthScore || 0) >= 70).length || 0;
  }, [data?.companies]);

  const rows = useMemo(() => {
    return baseRows.filter((c: any) => {
      if (filterMode === 'RECENT_EVENTS') {
        if (!c.upcomingDate) return false;
        const eventDate = new Date(c.upcomingDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        eventDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 3;
      }
      if (filterMode === 'HIGH_HEALTH') {
        return (c.financialHealthScore || 0) >= 70;
      }
      return true;
    });
  }, [baseRows, filterMode]);

  const sampleRow = useMemo(() => {
    return data?.companies?.find((c: any) => c.q4Date && c.q3Date) || {};
  }, [data?.companies]);

  const getDateLabel = useCallback((dbDate: string | undefined, fallbackMonth: string) => dbDate ? `${dbDate} ` : `${fallbackMonth} `, []);
  const q4Prefix = getDateLabel(sampleRow.q4Date, "Mar-2026");
  const q3Prefix = getDateLabel(sampleRow.q3Date, "Dec-2025");
  const q2Prefix = getDateLabel(sampleRow.q2Date, "Sep-2025");
  const q1Prefix = getDateLabel(sampleRow.q1Date, "Jun-2025");

  const dateSortComparator = useCallback((v1: string | null, v2: string | null) => {
    if (!v1 && !v2) return 0;
    if (!v1) return -1;
    if (!v2) return 1;
    const d1 = new Date(v1).getTime();
    const d2 = new Date(v2).getTime();
    if (isNaN(d1) && isNaN(d2)) return String(v1).localeCompare(String(v2));
    if (isNaN(d1)) return -1;
    if (isNaN(d2)) return 1;
    return d1 - d2;
  }, []);

  const renderSignalBadge = useCallback((status: string) => {
    const green = tokens.status.success.main;
    const red = tokens.status.error.main;
    const amber = tokens.status.warning.main;
    const cyan = tokens.status.info?.main || '#00B4D8';

    const colorMap: Record<string, { bg: string; text: string; border: string; icon: string }> = {
      'BUY PRE-RELEASE': { bg: tokens.status.success.wash || 'rgba(61, 255, 162, 0.2)', text: green, border: `${green}50`, icon: '✓' },
      'AVOID PRE-RELEASE': { bg: tokens.status.error.wash || 'rgba(255, 71, 87, 0.2)', text: red, border: `${red}50`, icon: '✕' },
      'NEUTRAL / HOLD': { bg: tokens.status.warning.wash || 'rgba(255, 165, 2, 0.2)', text: amber, border: `${amber}50`, icon: '⚠' },
      'TARGET HIT / WIN': { bg: tokens.status.success.wash || 'rgba(61, 255, 162, 0.2)', text: green, border: `${green}50`, icon: '✓' },
      'PREDICTION FAILED': { bg: tokens.status.error.wash || 'rgba(255, 71, 87, 0.2)', text: red, border: `${red}50`, icon: '✕' },
      'CONTRARY SURGE': { bg: tokens.status.warning.wash || 'rgba(255, 165, 2, 0.2)', text: amber, border: `${amber}50`, icon: '⚠' },
      'HOLD VALIDATED': { bg: tokens.status.info?.wash || 'rgba(0, 180, 216, 0.2)', text: cyan, border: `${cyan}50`, icon: '—' },
      'LOSSES AVOIDED': { bg: tokens.status.success.wash || 'rgba(61, 255, 162, 0.2)', text: green, border: `${green}50`, icon: '✓' },
    };

    const style = colorMap[status] || { bg: tokens.background.cardHover, text: tokens.text.secondary, border: tokens.border.main, icon: '—' };

    return (
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          backgroundColor: style.bg,
          color: style.text,
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          border: `1px solid ${style.border}`,
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        <span>{style.icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
      </Box>
    );
  }, [tokens]);

  const renderClubbedQuarterCell = useCallback((
    currRev?: number | null, prevRev?: number | null,
    currProfit?: number | null, prevProfit?: number | null,
    currEps?: number | null, prevEps?: number | null,
    trendOverride?: string
  ) => {
    if (currRev == null && currProfit == null && currEps == null) {
      return <Box sx={{ py: 1 }}><Typography sx={{ fontSize: '12px', color: tokens.text.tertiary }}>—</Typography></Box>;
    }

    const renderSubRow = (label: string, curr?: number | null, prev?: number | null, isCurrency: boolean = true) => {
      const valText = curr != null && !isNaN(curr) ? (isCurrency ? formatValCr(curr) : curr.toString()) : '—';
      let pctEl = null;
      if (curr != null && prev != null && !isNaN(curr) && !isNaN(prev) && prev !== 0) {
        const pct = ((curr - prev) / Math.abs(prev)) * 100;
        if (!isNaN(pct) && isFinite(pct)) {
          const isPositive = pct >= 0;
          pctEl = (
            <Box component="span" className="mono-font tabular-nums" sx={{ color: isPositive ? tokens.status.success.main : tokens.status.error.main, fontWeight: 600, fontSize: '11px', ml: '6px' }}>
              {isPositive ? '+' : ''}{Number(pct).toFixed(1)}%
            </Box>
          );
        }
      }

      return (
        <Box key={label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', py: '2px', borderBottom: `1px solid ${tokens.border.main}` }}>
          <Typography component="span" sx={{ fontSize: '11px', color: tokens.text.secondary, fontWeight: 500 }}>{label}:</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography component="span" className="mono-font tabular-nums" sx={{ fontSize: '12px', color: tokens.text.primary, fontWeight: 600 }}>{valText}</Typography>
            {pctEl}
          </Box>
        </Box>
      );
    };

    let isUp = trendOverride === 'UP';
    let trendLabel = trendOverride || 'N/A';
    if (currEps != null && prevEps != null && !isNaN(currEps) && !isNaN(prevEps) && prevEps !== 0) {
      isUp = (currEps - prevEps) >= 0;
      trendLabel = isUp ? 'UP' : 'DOWN';
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', py: 0.5 }}>
        {renderSubRow('Rev', currRev, prevRev, true)}
        {renderSubRow('Prof', currProfit, prevProfit, true)}
        {renderSubRow('EPS', currEps, prevEps, false)}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pt: '4px' }}>
          <Typography component="span" sx={{ fontSize: '11px', color: tokens.text.secondary, fontWeight: 500 }}>Trend:</Typography>
          <StatusChip label={trendLabel} variant={isUp ? 'success' : 'error'} size="small" />
        </Box>
      </Box>
    );
  }, [tokens]);

  const columns: GridColDef[] = useMemo(() => [
    { 
      field: 'name', 
      headerName: 'COMPANY / TICKER', 
      width: 240, 
      minWidth: 240, 
      type: 'string', 
      headerAlign: 'left',
      align: 'left',
      sortable: true,
      renderCell: (p) => (
        <Box 
          onClick={() => window.open(`/companies/${p.row?.id}`, '_blank', 'noopener,noreferrer')}
          sx={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center', height: '100%', cursor: 'pointer', overflow: 'hidden', width: '100%', '&:hover .company-name': { color: tokens.accent.main, textDecoration: 'underline' } }}
        >
          <Typography className="company-name" noWrap sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.primary, lineHeight: '16px', transition: 'color 0.15s' }}>
            {p.row?.name || p.row?.company || '—'}
          </Typography>
          <Typography noWrap sx={{ fontSize: '11px', fontWeight: 500, color: tokens.text.secondary, lineHeight: '14px' }}>
            {p.row?.ticker || '—'} {p.row?.exchange || 'NSE'}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'currentPrice', 
      headerName: 'PRICE', 
      width: 110, 
      type: 'number', 
      headerAlign: 'right', 
      align: 'right',
      valueGetter: (_v: any, row: any) => row?.currentPrice != null && !isNaN(row.currentPrice) ? Number(row.currentPrice) : -Infinity,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: '100%' }}>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.primary }}>
            {formatPrice(p.row?.currentPrice)}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'marketCap', 
      headerName: 'MKTCAP', 
      width: 125, 
      type: 'number', 
      headerAlign: 'right', 
      align: 'right',
      valueGetter: (_v: any, row: any) => row?.marketCap != null && !isNaN(row.marketCap) ? Number(row.marketCap) : -Infinity,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: '100%' }}>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 500, color: tokens.text.secondary }}>
            {formatValCr(p.row?.marketCap)}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'financialHealthScore', 
      headerName: 'HEALTH', 
      width: 70, 
      type: 'number', 
      headerAlign: 'center', 
      align: 'center', 
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.financialHealthScore != null && !isNaN(row.financialHealthScore) ? Number(row.financialHealthScore) : -Infinity,
      renderCell: (p) => {
        const score = p.row?.financialHealthScore != null ? Number(p.row.financialHealthScore) : NaN;
        const gradeStr = String(p.row?.financialHealthGrade || '');
        if (isNaN(score) || score <= 0) {
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <Chip label="—" size="small" sx={{ fontSize: '11px', height: '26px', width: '32px', backgroundColor: tokens.background.cardHover, color: tokens.text.tertiary, borderRadius: '6px' }} />
            </Box>
          );
        }
        let letter = 'C';
        if (gradeStr && (gradeStr.includes('A') || gradeStr.includes('B') || gradeStr.includes('C') || gradeStr.includes('D') || gradeStr.includes('E') || gradeStr.includes('F'))) {
          const match = gradeStr.match(/Grade\s*([A-F])/i) || gradeStr.match(/\b([A-F])\b/);
          if (match && match[1]) letter = match[1].toUpperCase();
          else if (score >= 80) letter = 'A';
          else if (score >= 70) letter = 'B';
          else if (score >= 50) letter = 'C';
          else if (score >= 40) letter = 'D';
          else letter = 'F';
        } else {
          if (score >= 80) letter = 'A';
          else if (score >= 70) letter = 'B';
          else if (score >= 50) letter = 'C';
          else if (score >= 40) letter = 'D';
          else letter = 'F';
        }

        let chipBg = tokens.status.warning.main;
        let chipText = isDark ? '#0A0A0C' : '#000000';
        if (letter === 'A' || letter === 'B' || score >= 70) {
          chipBg = tokens.status.success.main;
          chipText = '#0A0A0C';
        } else if (letter === 'C' || letter === 'D') {
          chipBg = tokens.status.warning.main;
          chipText = '#0A0A0C';
        } else {
          chipBg = tokens.status.error.main;
          chipText = '#FFFFFF';
        }

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <Tooltip title={`Financial Health: ${Number(score).toFixed(0)} / 100 (${p.row?.financialHealthGrade || 'Grade ' + letter})`} placement="top">
              <Chip
                label={letter}
                size="small"
                sx={{
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: chipBg,
                  color: chipText,
                  borderRadius: '6px',
                  height: '28px',
                  width: '32px',
                  '& .MuiChip-label': { padding: 0 },
                }}
              />
            </Tooltip>
          </Box>
        );
      }
    },
    { 
      field: 'momentumProbability', 
      headerName: 'MOM PROB', 
      width: 105, 
      type: 'number', 
      headerAlign: 'center', 
      align: 'center', 
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.momentumProbability != null && !isNaN(row.momentumProbability) ? Number(row.momentumProbability) : -Infinity,
      renderCell: (p) => {
        const prob = p.row?.momentumProbability != null ? Number(p.row.momentumProbability) : NaN;
        if (isNaN(prob) || prob < 0) {
          return (
            <Tooltip title="View Deep-Dive Financial Report" placement="top">
              <Box onClick={() => setDetailModalRow(p.row)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', cursor: 'pointer', '&:hover .zoom-icon': { color: tokens.accent.main } }}>
                <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary, mr: 0.5 }}>—</Typography>
                <ZoomInIcon className="zoom-icon" sx={{ fontSize: 15, color: tokens.text.tertiary, transition: 'color 0.15s' }} />
              </Box>
            </Tooltip>
          );
        }
        let barColor = tokens.status.error.main;
        if (prob >= 75) barColor = tokens.status.success.main;
        else if (prob >= 50) barColor = tokens.status.warning.main;

        return (
          <Tooltip title="View Deep-Dive Financial Report" placement="top">
            <Box 
              onClick={() => setDetailModalRow(p.row)}
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '4px', 
                width: '100%', 
                height: '100%', 
                cursor: 'pointer',
                borderRadius: '6px',
                transition: 'background-color 0.15s ease-in-out',
                '&:hover': { backgroundColor: tokens.background.cardHover },
                '&:hover .prob-text, &:hover .zoom-icon': { color: tokens.accent.main } 
              }}
            >
              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.max(0, prob))}
                sx={{
                  width: '64px',
                  height: '4px',
                  borderRadius: '2px',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: barColor,
                    borderRadius: '2px',
                  },
                }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Typography className="mono-font tabular-nums prob-text" sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.primary, lineHeight: '14px', transition: 'color 0.15s' }}>
                  {Number(prob).toFixed(0)}%
                </Typography>
                <ZoomInIcon className="zoom-icon" sx={{ fontSize: 14, color: tokens.text.tertiary, transition: 'color 0.15s' }} />
              </Box>
            </Box>
          </Tooltip>
        );
      }
    },
    { 
      field: 'avgPostEarningsMomentum', 
      headerName: 'AVG MOMENTUM / BUY INDICATOR', 
      width: 250, 
      type: 'number', 
      headerAlign: 'left', 
      align: 'left', 
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.avgPostEarningsMomentum != null && !isNaN(row.avgPostEarningsMomentum) ? Number(row.avgPostEarningsMomentum) : -Infinity,
      renderCell: (p) => {
        const avgMom = p.row?.avgPostEarningsMomentum != null ? Number(p.row.avgPostEarningsMomentum) : NaN;
        const prob = p.row?.momentumProbability != null ? Number(p.row.momentumProbability) : 0;
        if (isNaN(avgMom)) {
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 0.5, gap: '2px' }}>
              <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary }}>Not Calc</Typography>
              {renderSignalBadge('NEUTRAL / HOLD')}
            </Box>
          );
        }

        const isPos = avgMom >= 0;
        const momColor = isPos ? tokens.status.success.main : tokens.status.error.main;
        const momArrow = isPos ? '▲' : '▼';
        const momText = `${isPos ? '+' : ''}${avgMom.toFixed(1)}%`;

        let signalLabel = 'NEUTRAL / HOLD';
        if ((prob >= 75 && avgMom > 0) || (prob >= 50 && avgMom >= 2.0)) {
          signalLabel = 'BUY PRE-RELEASE';
        } else if (prob < 50 || avgMom < 0) {
          signalLabel = 'AVOID PRE-RELEASE';
        }

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 0.5, gap: '4px' }}>
            <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 700, color: momColor, lineHeight: '14px' }}>
              Avg Reaction: {momArrow} {momText}
            </Typography>
            {renderSignalBadge(signalLabel)}
          </Box>
        );
      }
    },
    { 
      field: 'postReleaseValidation', 
      headerName: 'POST-RELEASE RESULT', 
      width: 250, 
      type: 'number', 
      headerAlign: 'left', 
      align: 'left', 
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.postReleaseReturn != null && !isNaN(row.postReleaseReturn) ? Number(row.postReleaseReturn) : -Infinity,
      renderCell: (p: GridRenderCellParams) => {
        const prRet = p.row?.postReleaseReturn != null ? Number(p.row.postReleaseReturn) : NaN;
        const avgMom = p.row?.avgPostEarningsMomentum != null ? Number(p.row.avgPostEarningsMomentum) : NaN;
        const prob = p.row?.momentumProbability != null ? Number(p.row.momentumProbability) : 0;
        const upcoming = p.row?.upcomingDate;

        if (isNaN(prRet)) {
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 0.5, gap: '4px' }}>
              <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary, fontWeight: 500 }}>Post-Release: Pending</Typography>
              {renderSignalBadge(upcoming ? `Due: ${formatRelativeDate(upcoming)}` : 'HOLD VALIDATED')}
            </Box>
          );
        }

        const isPos = prRet >= 0;
        const retColor = isPos ? tokens.status.success.main : tokens.status.error.main;
        const retArrow = isPos ? '▲' : '▼';
        const retText = `${isPos ? '+' : ''}${prRet.toFixed(1)}%`;

        let isBuyPred = (prob >= 75 && avgMom > 0) || (prob >= 50 && avgMom >= 2.0);
        let isAvoidPred = prob < 50 || avgMom < 0;

        let statusLabel = 'HOLD VALIDATED';
        if (isBuyPred) {
          if (isPos) statusLabel = 'TARGET HIT / WIN';
          else statusLabel = 'PREDICTION FAILED';
        } else if (isAvoidPred) {
          if (!isPos || prRet <= 0.5) statusLabel = 'LOSSES AVOIDED';
          else statusLabel = 'CONTRARY SURGE';
        }

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 0.5, gap: '4px' }}>
            <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 700, color: retColor, lineHeight: '14px' }}>
              Post-Release: {retArrow} {retText}
            </Typography>
            {renderSignalBadge(statusLabel)}
          </Box>
        );
      }
    },
    { 
      field: 'upcomingDate', 
      headerName: 'REPORT DATE', 
      width: 110, 
      headerAlign: 'center',
      align: 'center',
      sortComparator: dateSortComparator,
      renderCell: (p: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 500, color: tokens.text.secondary }}>
            {formatRelativeDate(p.value) || '—'}
          </Typography>
        </Box>
      )
    },
    ...(expandQuarters ? [
      { field: 'q1Clubbed', headerName: `${q1Prefix.trim()} (Q1)`, width: 185, sortable: true, renderCell: (p: any) => renderClubbedQuarterCell(p.row?.q1Revenue, p.row?.q0Revenue, p.row?.q1Profit, p.row?.q0Profit, p.row?.q1Eps, p.row?.q0Eps) },
      { field: 'q2Clubbed', headerName: `${q2Prefix.trim()} (Q2)`, width: 185, sortable: true, renderCell: (p: any) => renderClubbedQuarterCell(p.row?.q2Revenue, p.row?.q1Revenue, p.row?.q2Profit, p.row?.q1Profit, p.row?.q2Eps, p.row?.q1Eps, (p.row?.historicalTrend || '').split(',')[0] || 'UP') },
      { field: 'q3Clubbed', headerName: `${q3Prefix.trim()} (Q3)`, width: 185, sortable: true, renderCell: (p: any) => renderClubbedQuarterCell(p.row?.q3Revenue, p.row?.q2Revenue, p.row?.q3Profit, p.row?.q2Profit, p.row?.q3Eps, p.row?.q2Eps, (p.row?.historicalTrend || '').split(',')[1] || 'UP') },
      { 
        field: 'q4Clubbed', 
        headerName: `${q4Prefix.trim()} (Q4 - LATEST)`, 
        minWidth: 220, 
        flex: 1.2, 
        sortable: true,
        renderHeader: () => (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 1 }}>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{q4Prefix.trim()} (LATEST)</span>
            <Chip label="COLLAPSE ◄" onClick={(e) => { e.stopPropagation(); setExpandQuarters(false); }} size="small" sx={{ backgroundColor: tokens.status.error.pillBg, color: tokens.status.error.main, border: `1px solid ${tokens.status.error.border}`, fontSize: '10px', fontWeight: 600, height: '22px', cursor: 'pointer' }} />
          </Box>
        ),
        renderCell: (p: any) => renderClubbedQuarterCell(p.row?.q4Revenue, p.row?.q3Revenue, p.row?.q4Profit, p.row?.q3Profit, p.row?.q4Eps, p.row?.q3Eps, (p.row?.historicalTrend || '').split(',')[2] || 'UP')
      }
    ] as GridColDef[] : [
      { 
        field: 'quarterlySummary', 
        headerName: 'QUARTERLY RESULTS', 
        width: 120, 
        headerAlign: 'center' as const,
        align: 'center' as const,
        sortable: false,
        renderHeader: () => (
          <Box onClick={() => setExpandQuarters(true)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, cursor: 'pointer', width: '100%', color: tokens.accent.main, '&:hover': { opacity: 0.8 } }}>
            <span style={{ fontWeight: 600, fontSize: '11px' }}>QTRS</span>
            <Chip label="EXPAND ►" size="small" sx={{ backgroundColor: tokens.primary.tint, color: tokens.text.primary, border: `1px solid ${tokens.border.light}`, fontSize: '9px', fontWeight: 700, height: '20px', cursor: 'pointer' }} />
          </Box>
        ),
        renderCell: (p: GridRenderCellParams) => {
          const eps = p.row?.q4Eps;
          return (
            <Box onClick={() => setDetailModalRow(p.row)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', cursor: 'pointer', '&:hover .qtr-text': { color: tokens.accent.main } }}>
              <Chip
                label={eps != null && !isNaN(eps) ? `₹${eps} EPS` : 'DETAILS ↗'}
                size="small"
                variant="outlined"
                onClick={() => setDetailModalRow(p.row)}
                className="qtr-text"
                sx={{
                  fontSize: '11px',
                  fontWeight: 600,
                  borderColor: tokens.border.light,
                  color: tokens.text.primary,
                  height: '26px',
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: tokens.background.cardHover, borderColor: tokens.accent.main }
                }}
              />
            </Box>
          );
        }
      }
    ] as GridColDef[])
  ], [expandQuarters, q1Prefix, q2Prefix, q3Prefix, q4Prefix, renderClubbedQuarterCell, tokens, dateSortComparator, isDark, renderSignalBadge]);

  const bulkActions = useMemo(() => [
    {
      label: 'Mass Calculate Health',
      isPrimary: true,
      icon: 'calc' as const,
      onClick: () => massCalculate()
    }
  ], [massCalculate]);

  if (loading && !data) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="60vh" gap={2}>
        <CircularProgress size={44} sx={{ color: tokens.accent.main }} />
        <Typography sx={{ color: tokens.text.secondary, fontSize: '13px', fontWeight: 500, fontFamily: tokens.typography.fontFamily }}>
          Loading NSE Earnings Fixtures...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box mt={5} p={3}>
        <Typography color="error" variant="h6">Failed to load earnings data: {error.message}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 56px)', backgroundColor: tokens.background.default, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Fixed Filter & Controls Bar */}
      <Box 
        sx={{ 
          px: '24px', 
          minHeight: 48,
          py: 1, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: 2, 
          borderBottom: `1px solid ${tokens.border.main}`, 
          backgroundColor: tokens.background.header,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Universe Filter:
          </Typography>
          <FilterChipGroup
            options={[
              { label: 'All Stocks', value: 'ALL', count: baseRows.length },
              { label: 'Events in 2-3 Days', value: 'RECENT_EVENTS', count: recentEventsCount },
              { label: 'High Health >70', value: 'HIGH_HEALTH', count: highHealthCount },
            ]}
            selectedValue={filterMode}
            onChange={(val) => setFilterMode(val as 'ALL' | 'RECENT_EVENTS' | 'HIGH_HEALTH')}
          />
        </Box>

        <Box display="flex" gap={1.5} alignItems="center">
          {/* 240px Search Bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '20px', px: '12px', height: '32px', transition: 'border-color 0.15s ease-in-out', '&:focus-within': { borderColor: tokens.border.focus } }}>
            <SearchIcon sx={{ color: tokens.text.secondary, fontSize: 16, mr: '6px' }} />
            <InputBase 
              placeholder="Search ticker or name..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ color: tokens.text.primary, fontSize: '12px', width: '200px', fontFamily: tokens.typography.fontFamily }} 
            />
          </Box>
          
          {/* Action Button: Calculate Health */}
          <Tooltip title="Mass Calculate Financial Health Across Universe" placement="top">
            <Button 
              onClick={() => massCalculate()} 
              size="small"
              startIcon={<AssessmentIcon sx={{ fontSize: '16px !important' }} />}
              sx={{ 
                backgroundColor: tokens.primary.main,
                color: isDark ? '#0A0A0C' : '#FFFFFF', 
                borderRadius: '16px', 
                px: '14px', 
                height: '32px',
                fontWeight: 600,
                fontSize: '12px',
                textTransform: 'none',
                boxShadow: 'none',
                transition: 'opacity 0.15s ease-in-out',
                '&:hover': { opacity: 0.88, backgroundColor: tokens.primary.main } 
              }}
            >
              Calculate Health
            </Button>
          </Tooltip>

          {/* Sync / Reload DB Button */}
          <Tooltip title="Sync & Populate Universe DB (~5 min)" placement="top">
            <IconButton 
              onClick={handlePopulate} 
              size="small"
              sx={{ backgroundColor: tokens.background.card, color: tokens.text.primary, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', width: 32, height: 32, transition: 'border-color 0.15s ease-in-out', '&:hover': { borderColor: tokens.border.light, backgroundColor: tokens.background.cardHover } }}
            >
              <CloudDownloadIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Bulk Selection Sticky Action Bar */}
      <Box sx={{ px: '24px', mt: selectedRowIds.length > 0 ? 1.5 : 0 }}>
        <BulkActionBar
          selectedCount={selectedRowIds.length}
          onClearSelection={() => setSelectedRowIds([])}
          actions={bulkActions}
        />
      </Box>

      {/* Dense Terminal DataGrid with Semantic Row Tinting & Dynamic Viewport Height */}
      <Box sx={{ flexGrow: 1, width: '100%', backgroundColor: tokens.background.paper, overflow: 'hidden', position: 'relative' }}>
        <ErrorBoundary fallbackTitle="Data Grid Table Error">
          <RowTintedDataGrid 
            rows={rows} 
            columns={columns} 
            checkboxSelection
            onRowSelectionModelChange={(newSelection) => setSelectedRowIds(newSelection)}
            rowSelectionModel={selectedRowIds}
            rowHeight={expandQuarters ? 84 : 52}
            columnHeaderHeight={44}
            pageSizeOptions={[20, 50, 100]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 50, page: 0 },
              },
            }}
            getRowClassName={(params) => {
              const prRet = params.row?.postReleaseReturn;
              if (prRet != null && !isNaN(Number(prRet))) {
                if (Number(prRet) > 2) return 'row-tint-buy';
                if (Number(prRet) < -2) return 'row-tint-avoid';
              }
              const prob = params.row?.momentumProbability;
              const avgMom = params.row?.avgPostEarningsMomentum;
              if (prob >= 75 && avgMom > 0) return 'row-tint-buy';
              if (prob < 50 || avgMom < -3) return 'row-tint-avoid';
              return 'row-tint-neutral';
            }}
            sx={{
              '& .MuiCheckbox-root': {
                color: tokens.text.secondary,
                '&.Mui-checked': { color: tokens.accent.main }
              },
            }}
          />
        </ErrorBoundary>
      </Box>
      
      {/* Detail View Modal Dialog */}
      <Dialog open={Boolean(detailModalRow)} onClose={() => setDetailModalRow(null)} maxWidth="md" fullWidth PaperProps={{ sx: { backgroundColor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', boxShadow: tokens.shadows.dropdown } }}>
        <DialogTitle sx={{ borderBottom: `1px solid ${tokens.border.main}`, pb: 2, pt: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: '18px', fontWeight: 700, color: tokens.text.primary }}>
              {detailModalRow?.name} ({detailModalRow?.ticker})
            </Typography>
            <Typography sx={{ fontSize: '12px', color: tokens.text.secondary, mt: 0.5 }}>
              4-Quarter Quantitative Earning Reaction & Health Report
            </Typography>
          </Box>
          <StatusBadge status={detailModalRow?.financialHealthScore >= 70 ? "HIGH HEALTH" : "STANDARD HEALTH"} variant={detailModalRow?.financialHealthScore >= 70 ? "success" : "neutral"} />
        </DialogTitle>
        <DialogContent sx={{ py: 3, pt: '24px !important' }}>
          {detailModalRow && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', height: '100%' }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 700, color: tokens.accent.main, pb: 1, mb: 1, borderBottom: `1px solid ${tokens.border.main}` }}>
                    {q1Prefix.trim()} (Q1)
                  </Typography>
                  {renderClubbedQuarterCell(detailModalRow.q1Revenue, detailModalRow.q0Revenue, detailModalRow.q1Profit, detailModalRow.q0Profit, detailModalRow.q1Eps, detailModalRow.q0Eps)}
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', height: '100%' }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 700, color: tokens.accent.main, pb: 1, mb: 1, borderBottom: `1px solid ${tokens.border.main}` }}>
                    {q2Prefix.trim()} (Q2)
                  </Typography>
                  {renderClubbedQuarterCell(detailModalRow.q2Revenue, detailModalRow.q1Revenue, detailModalRow.q2Profit, detailModalRow.q1Profit, detailModalRow.q2Eps, detailModalRow.q1Eps, (detailModalRow.historicalTrend || '').split(',')[0] || 'UP')}
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', height: '100%' }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 700, color: tokens.accent.main, pb: 1, mb: 1, borderBottom: `1px solid ${tokens.border.main}` }}>
                    {q3Prefix.trim()} (Q3)
                  </Typography>
                  {renderClubbedQuarterCell(detailModalRow.q3Revenue, detailModalRow.q2Revenue, detailModalRow.q3Profit, detailModalRow.q2Profit, detailModalRow.q3Eps, detailModalRow.q2Eps, (detailModalRow.historicalTrend || '').split(',')[1] || 'UP')}
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, backgroundColor: tokens.primary.tint, border: `1px solid ${tokens.border.light}`, borderRadius: '8px', height: '100%', boxShadow: tokens.accent.glow }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 700, color: tokens.text.primary, pb: 1, mb: 1, borderBottom: `1px solid ${tokens.border.main}` }}>
                    ★ {q4Prefix.trim()} (LATEST)
                  </Typography>
                  {renderClubbedQuarterCell(detailModalRow.q4Revenue, detailModalRow.q3Revenue, detailModalRow.q4Profit, detailModalRow.q3Profit, detailModalRow.q4Eps, detailModalRow.q3Eps, (detailModalRow.historicalTrend || '').split(',')[2] || 'UP')}
                </Box>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.border.main}` }}>
          <Button onClick={() => setDetailModalRow(null)} sx={{ color: tokens.text.secondary, textTransform: 'none', fontWeight: 600, fontSize: '12px' }}>Close</Button>
          <Button onClick={() => window.open(`/companies/${detailModalRow?.id}`, '_blank')} variant="contained" sx={{ backgroundColor: tokens.primary.main, color: isDark ? '#0A0A0C' : '#FFFFFF', fontWeight: 700, fontSize: '12px', textTransform: 'none', borderRadius: '6px' }}>Open Deep-Dive Lab ↗</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Home;
