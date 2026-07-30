import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Typography, Box, CircularProgress, Chip, IconButton, InputBase, Tooltip, Grid, Card, CardContent, Button } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import SearchIcon from '@mui/icons-material/Search';
import AssessmentIcon from '@mui/icons-material/Assessment';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import { MetricCard, FilterChipGroup } from '../components/common';
import { saasTokens } from '../theme/theme';

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
    }
  }
`;

const formatValCr = (val: number | null | undefined) => {
  if (val == null || isNaN(val) || val === 0) return '-';
  const inCr = Math.abs(val) >= 100000 ? val / 10000000 : val;
  return `${inCr < 0 ? '-' : ''}₹${Math.abs(inCr).toFixed(1)} Cr`;
};

const renderCenteredCell = (text: React.ReactNode, color = saasTokens.text.primary, fontWeight = 500, fontSize = '0.78rem') => (
  <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 0.5 }}>
    <Typography noWrap sx={{ fontSize, fontWeight, color }}>{text}</Typography>
  </Box>
);

const renderClubbedQuarterCell = (
  currRev?: number | null, prevRev?: number | null,
  currProfit?: number | null, prevProfit?: number | null,
  currEps?: number | null, prevEps?: number | null,
  trendOverride?: string
) => {
  if (currRev == null && currProfit == null && currEps == null) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 0.5 }}>
        <Typography sx={{ fontSize: '0.75rem', color: saasTokens.text.secondary }}>-</Typography>
      </Box>
    );
  }

  const renderSubRow = (label: string, curr?: number | null, prev?: number | null, isCurrency: boolean = true) => {
    const valText = curr != null && !isNaN(curr) ? (isCurrency ? formatValCr(curr) : curr.toString()) : '-';
    
    let pctEl = null;
    if (curr != null && prev != null && !isNaN(curr) && !isNaN(prev) && prev !== 0) {
      const pct = ((curr - prev) / Math.abs(prev)) * 100;
      if (!isNaN(pct) && isFinite(pct)) {
        const isPositive = pct >= 0;
        const arrow = isPositive ? '▲' : '▼';
        const color = isPositive ? '#059669' : '#e11d48';
        pctEl = (
          <Box component="span" sx={{ color, fontWeight: 700, fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', ml: '6px', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.55rem', marginRight: '2px' }}>{arrow}</span>
            {isPositive ? '+' : ''}{pct.toFixed(1)}%
          </Box>
        );
      }
    }

    return (
      <Box key={label} sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        width: '100%', 
        py: '2px', 
        borderBottom: `1px solid ${saasTokens.border.main}` 
      }}>
        <Typography component="span" sx={{ fontSize: '0.72rem', color: saasTokens.text.secondary, fontWeight: 500, flexShrink: 0 }}>
          {label}:
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', ml: 1, overflow: 'hidden' }}>
          <Typography component="span" noWrap sx={{ fontSize: '0.78rem', color: saasTokens.text.primary, fontWeight: 700 }}>
            {valText}
          </Typography>
          {pctEl}
        </Box>
      </Box>
    );
  };

  let isUp = false;
  let trendLabel = 'N/A';
  let pctText = '';
  let hasPct = false;

  if (currEps != null && prevEps != null && !isNaN(currEps) && !isNaN(prevEps) && prevEps !== 0) {
    const pct = ((currEps - prevEps) / Math.abs(prevEps)) * 100;
    if (!isNaN(pct) && isFinite(pct)) {
      hasPct = true;
      isUp = pct >= 0;
      pctText = `${isUp ? '+' : ''}${pct.toFixed(1)}%`;
      trendLabel = isUp ? 'UP' : 'DOWN';
    }
  }

  if (!hasPct && trendOverride && trendOverride !== 'N/A') {
    trendLabel = trendOverride;
    isUp = trendOverride === 'UP';
  }

  const badgeBg = isUp ? '#ecfdf5' : '#fff1f2';
  const badgeColor = isUp ? '#059669' : '#e11d48';
  const badgeBorder = isUp ? '1px solid #6ee7b7' : '1px solid #fda4af';
  const arrow = isUp ? '▲' : '▼';

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      width: '100%', 
      py: 0.5, 
      px: 0.5 
    }}>
      {renderSubRow('Revenue', currRev, prevRev, true)}
      {renderSubRow('Profit', currProfit, prevProfit, true)}
      {renderSubRow('EPS', currEps, prevEps, false)}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pt: '7px' }}>
        <Typography component="span" sx={{ fontSize: '0.72rem', color: saasTokens.text.secondary, fontWeight: 500, flexShrink: 0 }}>
          EPS Trend:
        </Typography>
        {(hasPct || (trendOverride && trendOverride !== 'N/A')) ? (
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            px: '6px',
            py: '2px',
            bgcolor: badgeBg,
            color: badgeColor,
            borderRadius: '4px',
            border: badgeBorder,
            fontSize: '0.65rem',
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '0.03em',
            boxShadow: 'none',
            whiteSpace: 'nowrap'
          }}>
            <span>{trendLabel}</span>
            <span style={{ fontSize: '0.55rem' }}>{arrow}</span>
            {hasPct && <span>{pctText}</span>}
          </Box>
        ) : <Typography component="span" sx={{ fontSize: '0.72rem', color: saasTokens.text.secondary }}>-</Typography>}
      </Box>
    </Box>
  );
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

const ANALYZE_CUSTOM_STOCK = gql`
  mutation AnalyzeCustomStock($ticker: String!) {
    analyzeCustomStock(ticker: $ticker)
  }
`;

const Home: React.FC = () => {
  const [expandQuarters, setExpandQuarters] = useState<boolean>(false);
  const { loading, error, data, refetch } = useQuery(GET_COMPANIES, { pollInterval: 15000, fetchPolicy: 'network-only' });
  const [customTicker, setCustomTicker] = useState('');
  const [analyzeCustomStock, { loading: analyzingCustom }] = useMutation(ANALYZE_CUSTOM_STOCK, {
    onCompleted: (res) => {
      if (res.analyzeCustomStock) {
        if (res.analyzeCustomStock.startsWith('ERROR:')) {
          alert(res.analyzeCustomStock);
        } else {
          window.open(`/companies/${res.analyzeCustomStock}`, '_blank', 'noopener,noreferrer');
          if (refetch) refetch();
          setCustomTicker('');
        }
      }
    },
    onError: (err) => {
      alert(`Error analyzing stock: ${err.message}`);
    }
  });

  const handleCustomAnalyze = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customTicker.trim()) return;
    analyzeCustomStock({ variables: { ticker: customTicker.trim() } });
  };

  const [populateData] = useMutation(POPULATE_DATA);
  const [massCalculate] = useMutation(MASS_CALCULATE_HEALTH, {
    onCompleted: () => {
      alert("Mass financial health analysis queued for all stocks! Check Tasks page for progress and refresh to view scores.");
    }
  });
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'RECENT_EVENTS' | 'HIGH_HEALTH'>('ALL');

  if (loading && !data) return <Box display="flex" justifyContent="center" mt={10}><CircularProgress sx={{color: saasTokens.primary.main}} /></Box>;
  if (error) return <Typography color="error" mt={5}>Error loading data.</Typography>;

  const handlePopulate = () => {
     populateData();
  };

  const baseRows = data?.companies?.filter((c: any) => 
     c.ticker.toLowerCase().includes(search.toLowerCase()) || 
     c.name.toLowerCase().includes(search.toLowerCase())
  ).map((c: any) => ({
     id: c.id,
     ...c
  })) || [];

  const recentEventsCount = data?.companies?.filter((c: any) => {
    if (!c.upcomingDate) return false;
    const eventDate = new Date(c.upcomingDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    eventDate.setHours(0,0,0,0);
    const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  }).length || 0;

  const highHealthCount = data?.companies?.filter((c: any) => (c.financialHealthScore || 0) >= 70).length || 0;

  const rows = baseRows.filter((c: any) => {
    if (filterMode === 'RECENT_EVENTS') {
      if (!c.upcomingDate) return false;
      const eventDate = new Date(c.upcomingDate);
      const today = new Date();
      today.setHours(0,0,0,0);
      eventDate.setHours(0,0,0,0);
      const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    }
    if (filterMode === 'HIGH_HEALTH') {
      return (c.financialHealthScore || 0) >= 70;
    }
    return true;
  });

  const sampleRow = data?.companies?.find((c: any) => c.q4Date && c.q3Date) || {};
  const getDateLabel = (dbDate: string | undefined, fallbackMonth: string) => {
    if (dbDate) return `${dbDate} `;
    return `${fallbackMonth} `;
  };
  const q4Prefix = getDateLabel(sampleRow.q4Date, "Mar-2026");
  const q3Prefix = getDateLabel(sampleRow.q3Date, "Dec-2025");
  const q2Prefix = getDateLabel(sampleRow.q2Date, "Sep-2025");
  const q1Prefix = getDateLabel(sampleRow.q1Date, "Jun-2025");

  const dateSortComparator = (v1: string | null, v2: string | null) => {
    if (!v1 && !v2) return 0;
    if (!v1) return -1;
    if (!v2) return 1;
    const d1 = new Date(v1).getTime();
    const d2 = new Date(v2).getTime();
    if (isNaN(d1) && isNaN(d2)) return v1.localeCompare(v2);
    if (isNaN(d1)) return -1;
    if (isNaN(d2)) return 1;
    return d1 - d2;
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'COMPANY & TICKER', width: 240, type: 'string', sortable: true,
      renderCell: (p) => (
        <Box 
          onClick={() => window.open(`/companies/${p.row?.id}`, '_blank', 'noopener,noreferrer')}
          sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            height: '100%', 
            py: 0.5,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            '&:hover': {
              '& .company-name-text': { color: '#6366f1', textDecoration: 'underline' },
              '& .company-ticker-text': { color: '#0f172a' }
            }
          }}
        >
          <Typography className="company-name-text" noWrap sx={{ fontSize: '0.84rem', fontWeight: 700, color: saasTokens.text.primary, lineHeight: 1.25, transition: 'color 0.15s' }}>
            {p.row?.name || '-'}
          </Typography>
          <Typography className="company-ticker-text" noWrap sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', mt: '3px', letterSpacing: '0.04em', transition: 'color 0.15s' }}>
            {p.row?.ticker || '-'}
          </Typography>
        </Box>
      )
    },
    { field: 'currentPrice', headerName: 'PRICE', width: 85, type: 'number', headerAlign: 'left', align: 'left',
      valueGetter: (_v: any, row: any) => row?.currentPrice != null && !isNaN(row.currentPrice) ? Number(row.currentPrice) : -Infinity,
      renderCell: (p) => renderCenteredCell(p.row?.currentPrice != null ? `₹${p.row.currentPrice}` : '-', saasTokens.text.primary, 600, '0.78rem')
    },
    { field: 'marketCap', headerName: 'MARKET CAP', width: 120, type: 'number', headerAlign: 'left', align: 'left',
      valueGetter: (_v: any, row: any) => row?.marketCap != null && !isNaN(row.marketCap) ? Number(row.marketCap) : -Infinity,
      renderCell: (p) => renderCenteredCell(formatValCr(p.row?.marketCap), '#0f172a', 600, '0.78rem')
    },
    { field: 'financialHealthScore', headerName: 'FINANCIAL HEALTH', width: 180, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.financialHealthScore != null && !isNaN(row.financialHealthScore) ? Number(row.financialHealthScore) : -Infinity,
      renderCell: (p) => {
        const score = p.row?.financialHealthScore;
        const grade = p.row?.financialHealthGrade || '';
        if (score == null || isNaN(score) || score <= 0) {
          return renderCenteredCell('Not Calc', saasTokens.text.secondary, 400, '0.75rem');
        }
        let bgcolor = '#fff1f2';
        let color = '#e11d48';
        let border = '1px solid #fda4af';
        if (score >= 75) {
          bgcolor = '#ecfdf5';
          color = '#059669';
          border = '1px solid #6ee7b7';
        } else if (score >= 60) {
          bgcolor = '#f1f5f9';
          color = '#0f172a';
          border = '1px solid #cbd5e1';
        } else if (score >= 45) {
          bgcolor = '#fffbeb';
          color = '#d97706';
          border = '1px solid #fcd34d';
        }
        const shortGrade = grade.split('(')[0].replace(/Grade\s*/i, '').trim() || grade;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 0.5 }}>
            <Box sx={{
              px: '10px',
              py: '5px',
              borderRadius: '16px',
              bgcolor,
              color,
              border,
              fontWeight: 700,
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: 'none',
              whiteSpace: 'nowrap'
            }}>
              <span style={{ fontSize: '0.6rem' }}>●</span>
              {score.toFixed(1)} {shortGrade ? `(${shortGrade})` : ''}
            </Box>
          </Box>
        );
      }
    },
    { field: 'momentumProbability', headerName: 'POST-RELEASE MOMENTUM PROB', width: 230, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.momentumProbability != null && !isNaN(row.momentumProbability) ? Number(row.momentumProbability) : -Infinity,
      renderCell: (p) => {
        const prob = p.row?.momentumProbability;
        if (prob == null || isNaN(prob) || prob < 0) {
          return renderCenteredCell('Not Calc', saasTokens.text.secondary, 400, '0.75rem');
        }
        let bgcolor = '#fff1f2';
        let color = '#e11d48';
        let border = '1px solid #fda4af';
        let fractionText = '0/4 Qtrs';
        if (prob >= 100) {
          bgcolor = '#ecfdf5';
          color = '#059669';
          border = '1px solid #6ee7b7';
          fractionText = '4/4 Qtrs';
        } else if (prob >= 75) {
          bgcolor = '#eff6ff';
          color = '#2563eb';
          border = '1px solid #93c5fd';
          fractionText = '3/4 Qtrs';
        } else if (prob >= 50) {
          bgcolor = '#fffbeb';
          color = '#d97706';
          border = '1px solid #fcd34d';
          fractionText = '2/4 Qtrs';
        } else if (prob >= 25) {
          bgcolor = '#fff7ed';
          color = '#ea580c';
          border = '1px solid #fdba74';
          fractionText = '1/4 Qtr';
        }
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 0.5 }}>
            <Box sx={{
              px: '10px',
              py: '4px',
              borderRadius: '14px',
              bgcolor,
              color,
              border,
              fontWeight: 700,
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'none'
            }}>
              <span>🎯 {prob.toFixed(0)}%</span>
              <span style={{ fontSize: '0.68rem', opacity: 0.9 }}>({fractionText})</span>
            </Box>
          </Box>
        );
      }
    },
    { field: 'avgPostEarningsMomentum', headerName: 'AVG MOMENTUM / BUY INDICATOR', width: 260, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.avgPostEarningsMomentum != null && !isNaN(row.avgPostEarningsMomentum) ? Number(row.avgPostEarningsMomentum) : -Infinity,
      renderCell: (p) => {
        const avgMom = p.row?.avgPostEarningsMomentum;
        const prob = p.row?.momentumProbability ?? 0;
        if (avgMom == null || isNaN(avgMom)) {
          return renderCenteredCell('Not Calc', saasTokens.text.secondary, 400, '0.75rem');
        }
        const isPos = avgMom >= 0;
        const momColor = isPos ? '#059669' : '#e11d48';
        const momArrow = isPos ? '▲' : '▼';
        const momText = `${isPos ? '+' : ''}${avgMom.toFixed(1)}%`;

        let signalLabel = 'NEUTRAL / HOLD';
        let signalBg = '#f8fafc';
        let signalColor = '#475569';
        let signalBorder = '1px solid #cbd5e1';
        let signalIcon = '⚠️';

        if ((prob >= 75 && avgMom > 0) || (prob >= 50 && avgMom >= 2.0)) {
          signalLabel = 'BUY PRE-RELEASE';
          signalBg = '#ecfdf5';
          signalColor = '#059669';
          signalBorder = '1px solid #6ee7b7';
          signalIcon = '🟢';
        } else if (prob < 50 || avgMom < 0) {
          signalLabel = 'AVOID PRE-RELEASE';
          signalBg = '#fff1f2';
          signalColor = '#e11d48';
          signalBorder = '1px solid #fda4af';
          signalIcon = '🔴';
        }

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: momColor }}>
                Avg Reaction: {momArrow} {momText}
              </Typography>
            </Box>
            <Box sx={{
              px: '7px',
              py: '2px',
              borderRadius: '6px',
              bgcolor: signalBg,
              color: signalColor,
              border: signalBorder,
              fontWeight: 700,
              fontSize: '0.66rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              width: 'fit-content'
            }}>
              <span>{signalIcon}</span>
              <span>{signalLabel}</span>
            </Box>
          </Box>
        );
      }
    },
    ...(expandQuarters ? [
      { field: 'q1Clubbed', headerName: `${q1Prefix.trim()} (Q1)`, width: 240, type: 'number' as const, headerAlign: 'left' as const, align: 'left' as const, sortable: true,
        valueGetter: (_v: any, row: any) => row?.q1Profit != null && !isNaN(row.q1Profit) ? Number(row.q1Profit) : (row?.q1Revenue != null ? Number(row.q1Revenue) : -Infinity),
        renderCell: (p: GridRenderCellParams) => renderClubbedQuarterCell(p.row?.q1Revenue, p.row?.q0Revenue, p.row?.q1Profit, p.row?.q0Profit, p.row?.q1Eps, p.row?.q0Eps)
      },
      { field: 'q2Clubbed', headerName: `${q2Prefix.trim()} (Q2)`, width: 240, type: 'number' as const, headerAlign: 'left' as const, align: 'left' as const, sortable: true,
        valueGetter: (_v: any, row: any) => row?.q2Profit != null && !isNaN(row.q2Profit) ? Number(row.q2Profit) : (row?.q2Revenue != null ? Number(row.q2Revenue) : -Infinity),
        renderCell: (p: GridRenderCellParams) => {
          const trends = p.row?.historicalTrend && p.row.historicalTrend !== 'N/A' ? p.row.historicalTrend.split(',') : [];
          return renderClubbedQuarterCell(p.row?.q2Revenue, p.row?.q1Revenue, p.row?.q2Profit, p.row?.q1Profit, p.row?.q2Eps, p.row?.q1Eps, trends[0] || 'UP');
        }
      },
      { field: 'q3Clubbed', headerName: `${q3Prefix.trim()} (Q3)`, width: 240, type: 'number' as const, headerAlign: 'left' as const, align: 'left' as const, sortable: true,
        valueGetter: (_v: any, row: any) => row?.q3Profit != null && !isNaN(row.q3Profit) ? Number(row.q3Profit) : (row?.q3Revenue != null ? Number(row.q3Revenue) : -Infinity),
        renderCell: (p: GridRenderCellParams) => {
          const trends = p.row?.historicalTrend && p.row.historicalTrend !== 'N/A' ? p.row.historicalTrend.split(',') : [];
          return renderClubbedQuarterCell(p.row?.q3Revenue, p.row?.q2Revenue, p.row?.q3Profit, p.row?.q2Profit, p.row?.q3Eps, p.row?.q2Eps, trends[1] || 'UP');
        }
      },
      { field: 'q4Clubbed', headerName: `${q4Prefix.trim()} (Q4 - LATEST)`, width: 260, type: 'number' as const, headerAlign: 'left' as const, align: 'left' as const, sortable: true,
        valueGetter: (_v: any, row: any) => row?.q4Profit != null && !isNaN(row.q4Profit) ? Number(row.q4Profit) : (row?.q4Revenue != null ? Number(row.q4Revenue) : -Infinity),
        renderHeader: () => (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 1 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{q4Prefix.trim()} (Q4 - LATEST)</span>
            <Chip 
              label="COLLAPSE ◄" 
              onClick={(e) => { e.stopPropagation(); setExpandQuarters(false); }} 
              size="small" 
              sx={{ bgcolor: '#fff1f2', color: '#e11d48', border: '1px solid #fda4af', fontSize: '0.62rem', fontWeight: 800, height: '20px', cursor: 'pointer', '&:hover': { bgcolor: '#ffe4e6' } }} 
            />
          </Box>
        ),
        renderCell: (p: GridRenderCellParams) => {
          const trends = p.row?.historicalTrend && p.row.historicalTrend !== 'N/A' ? p.row.historicalTrend.split(',') : [];
          return renderClubbedQuarterCell(p.row?.q4Revenue, p.row?.q3Revenue, p.row?.q4Profit, p.row?.q3Profit, p.row?.q4Eps, p.row?.q3Eps, trends[2] || 'UP');
        }
      }
    ] : [
      { field: 'quarterlySummary', headerName: 'QUARTERLY RESULTS (CLICK TO EXPAND)', width: 270, sortable: false, headerAlign: 'left' as const, align: 'left' as const,
        renderHeader: () => (
          <Box 
            onClick={() => setExpandQuarters(true)} 
            sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', width: '100%', color: '#6366f1', '&:hover': { color: '#4f46e5' } }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.72rem' }}>QUARTERLY RESULTS (Q1-Q4)</span>
            <Chip label="CLICK TO EXPAND ►" size="small" sx={{ bgcolor: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', fontSize: '0.62rem', fontWeight: 800, height: '20px', cursor: 'pointer' }} />
          </Box>
        ),
        renderCell: (p: GridRenderCellParams) => {
          const rev = p.row?.q4Revenue;
          const prof = p.row?.q4Profit;
          const eps = p.row?.q4Eps;
          return (
            <Box 
              onClick={() => setExpandQuarters(true)}
              sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', cursor: 'pointer', py: 0.5, '&:hover': { opacity: 0.85 } }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: saasTokens.text.primary }}>
                  Q4 EPS: {eps != null && !isNaN(eps) ? `₹${eps}` : '-'}
                </Typography>
                <Chip label="Expand 4 Qtrs ⛶" size="small" sx={{ height: '18px', fontSize: '0.62rem', bgcolor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontWeight: 600, cursor: 'pointer' }} />
              </Box>
              <Typography sx={{ fontSize: '0.72rem', color: saasTokens.text.secondary, mt: '3px' }}>
                Latest Rev: {formatValCr(rev)} | Profit: {formatValCr(prof)}
              </Typography>
            </Box>
          );
        }
      }
    ]),
    { field: 'upcomingDate', headerName: 'REPORT DATE', width: 130, sortComparator: dateSortComparator,
      renderCell: (p: GridRenderCellParams) => renderCenteredCell(p.value, saasTokens.text.secondary, 600, '0.78rem')
    }
  ];

  const totalCompanies = baseRows.length;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'transparent', pb: 4, fontFamily: 'Inter, sans-serif', width: '100%', overflowX: 'hidden' }}>
      {/* Top Controls Container with Padding */}
      <Box sx={{ px: { xs: 2, md: 3.5 }, pt: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4} flexWrap="wrap" gap={2}>
          <Box>
            <Typography sx={{ color: saasTokens.text.primary, fontSize: '1.25rem', fontWeight: 700, mb: 0.5 }}>Dashboard & Financial Health Analytics</Typography>
            <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.85rem' }}>NSE Incoming Earnings Fixtures & Comprehensive Quantitative Health Grades</Typography>
          </Box>
          <Box display="flex" gap={2} alignItems="center">
             <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2, px: 2, py: 0.5, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' }}>
                <SearchIcon sx={{ color: saasTokens.text.secondary, fontSize: '1rem', mr: 1 }} />
                <InputBase 
                   placeholder="Search stock ticker..." 
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                   sx={{ color: saasTokens.text.primary, fontSize: '0.85rem', width: '200px' }} 
                />
             </Box>
             <Tooltip title="Mass calculate financial health & generate AI analytics for all stocks in background">
                <Button 
                  onClick={() => massCalculate()} 
                  startIcon={<AssessmentIcon />}
                  sx={{ 
                    backgroundColor: '#0f172a',
                    color: '#ffffff', 
                    borderRadius: 2, 
                    px: 2, 
                    py: 0.8,
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    textTransform: 'none',
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.15)',
                    '&:hover': { backgroundColor: '#1e293b' } 
                  }}
                >
                  Mass Calculate Health
                </Button>
             </Tooltip>
             <Tooltip title="Bulk download historical data from Yahoo Finance (Takes ~5 minutes)">
                <IconButton onClick={handlePopulate} sx={{ bgcolor: '#f8fafc', color: '#0f172a', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2, '&:hover': {bgcolor: '#f1f5f9'} }}>
                   <CloudDownloadIcon fontSize="small" />
                </IconButton>
             </Tooltip>
          </Box>
        </Box>

        <Card sx={{ mb: 4, borderRadius: 3, border: `1px solid ${saasTokens.border.main}`, bgcolor: '#ffffff', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <SearchIcon sx={{ color: saasTokens.primary.main, fontSize: 20 }} />
              <Typography sx={{ color: saasTokens.text.primary, fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Instant Custom Share Lookup & Analytics
              </Typography>
              <Chip label="Any NSE / BSE Stock" size="small" sx={{ ml: 1, bgcolor: '#f1f5f9', color: '#0f172a', border: `1px solid ${saasTokens.border.main}`, fontWeight: 700, fontSize: '0.7rem' }} />
            </Box>
            <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.82rem', mb: 2.5 }}>
              Want to evaluate a specific equity not currently scheduled in upcoming calendar fixtures? Enter its symbol below (e.g. RELIANCE, TCS, INFY) to generate quantitative health modeling immediately.
            </Typography>

            <Box component="form" onSubmit={handleCustomAnalyze} sx={{ display: 'flex', gap: 2, maxWidth: 540 }}>
              <Box sx={{ flexGrow: 1, position: 'relative', display: 'flex', alignItems: 'center', bgcolor: '#f8fafc', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2, px: 2, py: 0.5, '&:focus-within': { borderColor: saasTokens.primary.main, bgcolor: '#ffffff' } }}>
                <InputBase
                  value={customTicker}
                  onChange={(e) => setCustomTicker(e.target.value)}
                  placeholder="Enter Stock Ticker (e.g. RELIANCE)..."
                  sx={{ color: saasTokens.text.primary, fontSize: '0.9rem', width: '100%', fontWeight: 600 }}
                  disabled={analyzingCustom}
                />
              </Box>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={analyzingCustom || !customTicker.trim()}
                sx={{
                  fontWeight: 600,
                  px: 3.5,
                  py: 1.1,
                  borderRadius: 2,
                  whiteSpace: 'nowrap',
                  bgcolor: '#0f172a',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.12)',
                  '&:hover': { bgcolor: '#1e293b' }
                }}
              >
                {analyzingCustom ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} sx={{ color: '#ffffff' }} />
                    <span>Processing...</span>
                  </Box>
                ) : 'Launch Analytics →'}
              </Button>
            </Box>
          </CardContent>
        </Card>

        <Grid container spacing={2.5} mb={4}>
          <Grid item xs={12} sm={6} md={4}>
            <MetricCard
              title="Total Companies Tracked"
              value={totalCompanies}
              subtitle="Live equity database constituents"
              icon={<AssessmentIcon />}
              onClick={() => setFilterMode('ALL')}
              active={filterMode === 'ALL'}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <MetricCard
              title="Events in Next 2-3 Days"
              value={recentEventsCount}
              subtitle="Imminent earnings release fixtures"
              icon={<EventAvailableIcon />}
              accentColor={saasTokens.status.success.main}
              onClick={() => setFilterMode(filterMode === 'RECENT_EVENTS' ? 'ALL' : 'RECENT_EVENTS')}
              active={filterMode === 'RECENT_EVENTS'}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={4}>
            <MetricCard
              title="High Health Score Stocks (>70)"
              value={highHealthCount}
              subtitle="Institutional fundamental quality grade"
              icon={<HealthAndSafetyIcon />}
              accentColor={saasTokens.secondary.main}
              onClick={() => setFilterMode(filterMode === 'HIGH_HEALTH' ? 'ALL' : 'HIGH_HEALTH')}
              active={filterMode === 'HIGH_HEALTH'}
            />
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap', px: { xs: 2, md: 3.5 } }}>
          <Typography sx={{ fontSize: '0.78rem', color: saasTokens.text.secondary, mr: 0.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Filter Universe:
          </Typography>
          <FilterChipGroup
            options={[
              { label: 'All Stocks', value: 'ALL', count: baseRows.length },
              { label: 'Events in Next 2-3 Days', value: 'RECENT_EVENTS', count: recentEventsCount, color: saasTokens.status.success.main },
              { label: 'High Financial Health (>70 Pts)', value: 'HIGH_HEALTH', count: highHealthCount, color: saasTokens.secondary.main },
            ]}
            selectedValue={filterMode}
            onChange={(val) => setFilterMode(val as 'ALL' | 'RECENT_EVENTS' | 'HIGH_HEALTH')}
          />
        </Box>
      </Box>

      {/* Edge-to-Edge SaaS Borderless DataGrid */}
      <Box sx={{ height: 'calc(100vh - 280px)', minHeight: 500, width: '100%', bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderLeft: 0, borderRight: 0, overflow: 'hidden', boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.03)' }}>
        <DataGrid 
          rows={rows} 
          columns={columns} 
          disableRowSelectionOnClick
          getRowHeight={() => 'auto'}
          getEstimatedRowHeight={() => 60}
          columnHeaderHeight={44}
          sx={{
             border: 0,
             borderRadius: 0,
             color: saasTokens.text.primary,
             '& .MuiDataGrid-columnHeaders': {
               bgcolor: saasTokens.background.header,
               color: saasTokens.text.secondary,
               textTransform: 'uppercase',
               fontSize: '0.72rem',
               fontWeight: 700,
               letterSpacing: '0.06em',
               borderRadius: 0,
               borderBottom: `1px solid ${saasTokens.border.main}`,
               borderTop: `1px solid ${saasTokens.border.main}`
             },
             '& .MuiDataGrid-columnHeader': {
               borderRadius: 0,
               '&:first-of-type': { pl: { xs: 2, md: 3.5 } },
               '&:last-of-type': { pr: { xs: 2, md: 3.5 } }
             },
             '& .MuiDataGrid-cell': {
               borderBottom: `1px solid ${saasTokens.border.main}`,
               py: '6px',
               '&:first-of-type': { pl: { xs: 2, md: 3.5 } },
               '&:last-of-type': { pr: { xs: 2, md: 3.5 } }
             },
             '& .MuiDataGrid-row': {
               bgcolor: '#ffffff',
               transition: 'background-color 0.15s ease',
               '&:hover': { bgcolor: '#f8fafc' }
             },
             '& .MuiDataGrid-row:nth-of-type(even)': {
               bgcolor: '#f8fafc',
             },
             '& .MuiDataGrid-footerContainer': {
               borderTop: `1px solid ${saasTokens.border.main}`,
               bgcolor: saasTokens.background.header,
               color: saasTokens.text.secondary,
               px: { xs: 2, md: 3.5 }
             },
             '& .MuiTablePagination-root': { color: saasTokens.text.secondary },
             '& .MuiDataGrid-virtualScroller': {
               '&::-webkit-scrollbar': { width: '8px', height: '8px' },
               '&::-webkit-scrollbar-track': { bgcolor: '#f8fafc' },
               '&::-webkit-scrollbar-thumb': { bgcolor: '#cbd5e1', borderRadius: '4px', '&:hover': { bgcolor: '#94a3b8' } }
             }
          }}
        />
      </Box>
    </Box>
  );
};

export default Home;
