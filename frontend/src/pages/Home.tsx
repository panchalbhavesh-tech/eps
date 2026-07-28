import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Typography, Box, CircularProgress, Chip, IconButton, InputBase, Tooltip, Grid, Card, CardContent, Button } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import SearchIcon from '@mui/icons-material/Search';
import AssessmentIcon from '@mui/icons-material/Assessment';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';

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
    }
  }
`;

const formatValCr = (val: number | null | undefined) => {
  if (val == null || isNaN(val) || val === 0) return '-';
  const inCr = Math.abs(val) >= 100000 ? val / 10000000 : val;
  return `${inCr < 0 ? '-' : ''}₹${Math.abs(inCr).toFixed(1)} Cr`;
};

const renderCenteredCell = (text: React.ReactNode, color = '#e2e8f0', fontWeight = 500, fontSize = '0.78rem') => (
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
        <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>-</Typography>
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
        const color = isPositive ? '#4ade80' : '#f87171';
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
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)' 
      }}>
        <Typography component="span" sx={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>
          {label}:
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', ml: 1, overflow: 'hidden' }}>
          <Typography component="span" noWrap sx={{ fontSize: '0.78rem', color: '#f8fafc', fontWeight: 700 }}>
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

  const badgeBg = isUp ? 'rgba(20, 83, 45, 0.45)' : 'rgba(127, 29, 29, 0.45)';
  const badgeColor = isUp ? '#4ade80' : '#f87171';
  const badgeBorder = isUp ? '1px solid #16a34a' : '1px solid #dc2626';
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
        <Typography component="span" sx={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>
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
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            whiteSpace: 'nowrap'
          }}>
            <span>{trendLabel}</span>
            <span style={{ fontSize: '0.55rem' }}>{arrow}</span>
            {hasPct && <span>{pctText}</span>}
          </Box>
        ) : <Typography component="span" sx={{ fontSize: '0.72rem', color: '#64748b' }}>-</Typography>}
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
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'RECENT_EVENTS' | 'HIGH_HEALTH'>('ALL');

  if (loading && !data) return <Box display="flex" justifyContent="center" mt={10}><CircularProgress sx={{color: '#7c4dff'}} /></Box>;
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
              '& .company-name-text': { color: '#7c4dff', textDecoration: 'underline' },
              '& .company-ticker-text': { color: '#c4b5fd' }
            }
          }}
        >
          <Typography className="company-name-text" noWrap sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1.25, transition: 'color 0.15s' }}>
            {p.row?.name || '-'}
          </Typography>
          <Typography className="company-ticker-text" noWrap sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#a78bfa', mt: '3px', letterSpacing: '0.04em', transition: 'color 0.15s' }}>
            {p.row?.ticker || '-'}
          </Typography>
        </Box>
      )
    },
    { field: 'currentPrice', headerName: 'PRICE', width: 85, type: 'number', headerAlign: 'left', align: 'left',
      valueGetter: (_v: any, row: any) => row?.currentPrice != null && !isNaN(row.currentPrice) ? Number(row.currentPrice) : -Infinity,
      renderCell: (p) => renderCenteredCell(p.row?.currentPrice != null ? `₹${p.row.currentPrice}` : '-', '#e2e8f0', 600, '0.78rem')
    },
    { field: 'marketCap', headerName: 'MARKET CAP', width: 120, type: 'number', headerAlign: 'left', align: 'left',
      valueGetter: (_v: any, row: any) => row?.marketCap != null && !isNaN(row.marketCap) ? Number(row.marketCap) : -Infinity,
      renderCell: (p) => renderCenteredCell(formatValCr(p.row?.marketCap), '#a78bfa', 600, '0.78rem')
    },
    { field: 'financialHealthScore', headerName: 'FINANCIAL HEALTH', width: 180, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.financialHealthScore != null && !isNaN(row.financialHealthScore) ? Number(row.financialHealthScore) : -Infinity,
      renderCell: (p) => {
        const score = p.row?.financialHealthScore;
        const grade = p.row?.financialHealthGrade || '';
        if (score == null || isNaN(score) || score <= 0) {
          return renderCenteredCell('Not Calc', '#64748b', 400, '0.75rem');
        }
        let bgcolor = 'rgba(244, 63, 94, 0.18)';
        let color = '#f43f5e';
        let border = '1px solid rgba(244, 63, 94, 0.35)';
        if (score >= 75) {
          bgcolor = 'rgba(16, 185, 129, 0.18)';
          color = '#10b981';
          border = '1px solid rgba(16, 185, 129, 0.35)';
        } else if (score >= 60) {
          bgcolor = 'rgba(124, 77, 255, 0.2)';
          color = '#a78bfa';
          border = '1px solid rgba(124, 77, 255, 0.4)';
        } else if (score >= 45) {
          bgcolor = 'rgba(245, 158, 11, 0.18)';
          color = '#f59e0b';
          border = '1px solid rgba(245, 158, 11, 0.35)';
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
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              whiteSpace: 'nowrap'
            }}>
              <span style={{ fontSize: '0.6rem' }}>●</span>
              {score.toFixed(1)} {shortGrade ? `(${shortGrade})` : ''}
            </Box>
          </Box>
        );
      }
    },
    { field: 'q1Clubbed', headerName: `${q1Prefix.trim()} (Q1)`, width: 240, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.q1Profit != null && !isNaN(row.q1Profit) ? Number(row.q1Profit) : (row?.q1Revenue != null ? Number(row.q1Revenue) : -Infinity),
      renderCell: (p) => renderClubbedQuarterCell(p.row?.q1Revenue, p.row?.q0Revenue, p.row?.q1Profit, p.row?.q0Profit, p.row?.q1Eps, p.row?.q0Eps)
    },
    { field: 'q2Clubbed', headerName: `${q2Prefix.trim()} (Q2)`, width: 240, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.q2Profit != null && !isNaN(row.q2Profit) ? Number(row.q2Profit) : (row?.q2Revenue != null ? Number(row.q2Revenue) : -Infinity),
      renderCell: (p) => {
        const trends = p.row?.historicalTrend && p.row.historicalTrend !== 'N/A' ? p.row.historicalTrend.split(',') : [];
        return renderClubbedQuarterCell(p.row?.q2Revenue, p.row?.q1Revenue, p.row?.q2Profit, p.row?.q1Profit, p.row?.q2Eps, p.row?.q1Eps, trends[0] || 'UP');
      }
    },
    { field: 'q3Clubbed', headerName: `${q3Prefix.trim()} (Q3)`, width: 240, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.q3Profit != null && !isNaN(row.q3Profit) ? Number(row.q3Profit) : (row?.q3Revenue != null ? Number(row.q3Revenue) : -Infinity),
      renderCell: (p) => {
        const trends = p.row?.historicalTrend && p.row.historicalTrend !== 'N/A' ? p.row.historicalTrend.split(',') : [];
        return renderClubbedQuarterCell(p.row?.q3Revenue, p.row?.q2Revenue, p.row?.q3Profit, p.row?.q2Profit, p.row?.q3Eps, p.row?.q2Eps, trends[1] || 'UP');
      }
    },
    { field: 'q4Clubbed', headerName: `${q4Prefix.trim()} (Q4 - LATEST)`, width: 250, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.q4Profit != null && !isNaN(row.q4Profit) ? Number(row.q4Profit) : (row?.q4Revenue != null ? Number(row.q4Revenue) : -Infinity),
      renderCell: (p) => {
        const trends = p.row?.historicalTrend && p.row.historicalTrend !== 'N/A' ? p.row.historicalTrend.split(',') : [];
        return renderClubbedQuarterCell(p.row?.q4Revenue, p.row?.q3Revenue, p.row?.q4Profit, p.row?.q3Profit, p.row?.q4Eps, p.row?.q3Eps, trends[2] || 'UP');
      }
    },
    { field: 'upcomingDate', headerName: 'REPORT DATE', width: 130, sortComparator: dateSortComparator,
      renderCell: (p) => renderCenteredCell(p.value, '#94a3b8', 500, '0.78rem')
    }
  ];

  const totalCompanies = baseRows.length;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0b10', pb: 4, fontFamily: 'Inter, sans-serif', width: '100%', overflowX: 'hidden' }}>
      {/* Top Controls Container with Padding */}
      <Box sx={{ px: { xs: 2, md: 3.5 }, pt: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4} flexWrap="wrap" gap={2}>
          <Box>
            <Typography sx={{ color: '#e2e8f0', fontSize: '1.25rem', fontWeight: 600, mb: 0.5 }}>Dashboard & Financial Health Analytics</Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.85rem' }}>NSE Incoming Earnings Fixtures & Comprehensive Quantitative Health Grades</Typography>
          </Box>
          <Box display="flex" gap={2} alignItems="center">
             <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#13151a', border: '1px solid #1e293b', borderRadius: 1, px: 2, py: 0.5 }}>
                <SearchIcon sx={{ color: '#64748b', fontSize: '1rem', mr: 1 }} />
                <InputBase 
                   placeholder="Search stock ticker..." 
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                   sx={{ color: '#e2e8f0', fontSize: '0.85rem', width: '200px' }} 
                />
             </Box>
             <Tooltip title="Mass calculate financial health & generate AI analytics for all stocks in background">
                <Button 
                  onClick={() => massCalculate()} 
                  startIcon={<AssessmentIcon />}
                  sx={{ 
                    backgroundColor: '#7c4dff',
                    color: '#f8fafc', 
                    borderRadius: 1.5, 
                    px: 2, 
                    py: 0.8,
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    textTransform: 'none',
                    boxShadow: '0 4px 14px rgba(124, 77, 255, 0.3)',
                    '&:hover': { backgroundColor: '#651fff' } 
                  }}
                >
                  Mass Calculate Health
                </Button>
             </Tooltip>
             <Tooltip title="Bulk download historical data from Yahoo Finance (Takes ~5 minutes)">
                <IconButton onClick={handlePopulate} sx={{ bgcolor: '#1e293b', color: '#e2e8f0', borderRadius: 1, '&:hover': {bgcolor: '#334155'} }}>
                   <CloudDownloadIcon fontSize="small" />
                </IconButton>
             </Tooltip>
          </Box>
        </Box>

        {/* Custom Share Instant Analyzer Banner */}
        <Card sx={{ bgcolor: '#111420', border: '1px solid rgba(124, 77, 255, 0.4)', borderRadius: 2, mb: 4, boxShadow: '0 8px 24px rgba(124, 77, 255, 0.12)' }}>
          <CardContent sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2, py: '18px !important', px: 3 }}>
            <Box>
              <Typography sx={{ color: '#ffffff', fontSize: '1.02rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>🔍 Instant Custom Share Lookup & Analysis</span>
                <Chip label="Any NSE / BSE Stock" size="small" sx={{ bgcolor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontWeight: 700, fontSize: '0.68rem', border: '1px solid #38bdf8' }} />
              </Typography>
              <Typography sx={{ color: '#94a3b8', fontSize: '0.82rem', mt: 0.5 }}>
                Want to check a specific stock not scheduled in upcoming calendar fixtures? Enter its symbol below (e.g. <span style={{ color: '#a78bfa', fontWeight: 600 }}>RELIANCE</span>, <span style={{ color: '#a78bfa', fontWeight: 600 }}>TCS</span>, <span style={{ color: '#a78bfa', fontWeight: 600 }}>INFY</span>) to generate live analytics & open its dedicated page immediately.
              </Typography>
            </Box>
            <Box component="form" onSubmit={handleCustomAnalyze} sx={{ display: 'flex', gap: 1.5, width: { xs: '100%', md: 'auto' }, alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#0b0c13', border: '1px solid #334155', borderRadius: 1.5, px: 2, py: 0.8, minWidth: '220px' }}>
                <InputBase
                  placeholder="Ticker (e.g. RELIANCE)..."
                  value={customTicker}
                  onChange={(e) => setCustomTicker(e.target.value)}
                  sx={{ color: '#ffffff', fontSize: '0.9rem', width: '100%', fontWeight: 600 }}
                  disabled={analyzingCustom}
                />
              </Box>
              <Button
                type="submit"
                disabled={analyzingCustom || !customTicker.trim()}
                sx={{
                  bgcolor: '#3b82f6',
                  color: '#ffffff',
                  fontWeight: 700,
                  px: 3,
                  py: 1.1,
                  borderRadius: 1.5,
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                  '&:hover': { bgcolor: '#2563eb' },
                  '&.Mui-disabled': { bgcolor: '#1e293b', color: '#64748b' }
                }}
              >
                {analyzingCustom ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} sx={{ color: '#94a3b8' }} />
                    <span>Analyzing...</span>
                  </Box>
                ) : 'Launch Share Page 🚀'}
              </Button>
            </Box>
          </CardContent>
        </Card>

        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} sm={6} md={4}>
            <Card 
              onClick={() => setFilterMode('ALL')}
              sx={{ 
                bgcolor: filterMode === 'ALL' ? '#1c1f2e' : '#13151a', 
                border: filterMode === 'ALL' ? '1px solid #7c4dff' : '1px solid #1e293b', 
                borderRadius: 2, 
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { borderColor: '#7c4dff', transform: 'translateY(-2px)' }
              }}
            >
              <CardContent sx={{ pb: '16px !important' }}>
                <Typography color="#94a3b8" fontSize="0.8rem" fontWeight="600" textTransform="uppercase">Total Companies Tracked</Typography>
                <Typography color="#e2e8f0" fontSize="1.8rem" fontWeight="bold" mt={0.5}>{totalCompanies}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card 
              onClick={() => setFilterMode(filterMode === 'RECENT_EVENTS' ? 'ALL' : 'RECENT_EVENTS')}
              sx={{ 
                bgcolor: filterMode === 'RECENT_EVENTS' ? '#064e3b' : '#13151a', 
                border: filterMode === 'RECENT_EVENTS' ? '1px solid #10b981' : '1px solid #1e293b', 
                borderRadius: 2,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { borderColor: '#10b981', transform: 'translateY(-2px)' }
              }}
            >
              <CardContent sx={{ pb: '16px !important' }}>
                <Typography color="#94a3b8" fontSize="0.8rem" fontWeight="600" textTransform="uppercase">Events in Next 2-3 Days</Typography>
                <Typography color="#10b981" fontSize="1.8rem" fontWeight="bold" mt={0.5}>{recentEventsCount}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={12} md={4}>
            <Card 
              onClick={() => setFilterMode(filterMode === 'HIGH_HEALTH' ? 'ALL' : 'HIGH_HEALTH')}
              sx={{ 
                bgcolor: filterMode === 'HIGH_HEALTH' ? '#075985' : '#13151a', 
                border: filterMode === 'HIGH_HEALTH' ? '1px solid #38bdf8' : '1px solid #1e293b', 
                borderRadius: 2,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { borderColor: '#38bdf8', transform: 'translateY(-2px)' }
              }}
            >
              <CardContent sx={{ pb: '16px !important' }}>
                <Typography color="#94a3b8" fontSize="0.8rem" fontWeight="600" textTransform="uppercase">High Health Score Stocks (&gt;70)</Typography>
                <Typography color="#38bdf8" fontSize="1.8rem" fontWeight="bold" mt={0.5}>{highHealthCount}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 1.5, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', mr: 1, fontWeight: 700, letterSpacing: '0.04em' }}>FILTER VIEW:</Typography>
          <Chip 
            label={`All Stocks (${baseRows.length})`} 
            onClick={() => setFilterMode('ALL')} 
            sx={{ 
              bgcolor: filterMode === 'ALL' ? '#7c4dff' : '#13151a', 
              color: '#f8fafc', 
              border: '1px solid #1e293b',
              fontWeight: 700,
              cursor: 'pointer',
              px: 0.5,
              '&:hover': { bgcolor: filterMode === 'ALL' ? '#651fff' : '#1e293b' }
            }} 
          />
          <Chip 
            icon={<EventAvailableIcon sx={{ color: filterMode === 'RECENT_EVENTS' ? '#fff !important' : '#10b981 !important', fontSize: '1rem' }} />}
            label={`Events in Next 2-3 Days (${recentEventsCount})`} 
            onClick={() => setFilterMode(filterMode === 'RECENT_EVENTS' ? 'ALL' : 'RECENT_EVENTS')} 
            sx={{ 
              bgcolor: filterMode === 'RECENT_EVENTS' ? '#059669' : '#13151a', 
              color: '#f8fafc', 
              border: '1px solid #1e293b',
              fontWeight: 700,
              cursor: 'pointer',
              px: 0.5,
              '&:hover': { bgcolor: filterMode === 'RECENT_EVENTS' ? '#047857' : '#1e293b' }
            }} 
          />
          <Chip 
            icon={<HealthAndSafetyIcon sx={{ color: filterMode === 'HIGH_HEALTH' ? '#fff !important' : '#38bdf8 !important', fontSize: '1rem' }} />}
            label={`High Financial Health (>70 Pts)`} 
            onClick={() => setFilterMode(filterMode === 'HIGH_HEALTH' ? 'ALL' : 'HIGH_HEALTH')} 
            sx={{ 
              bgcolor: filterMode === 'HIGH_HEALTH' ? '#0284c7' : '#13151a', 
              color: '#f8fafc', 
              border: '1px solid #1e293b',
              fontWeight: 700,
              cursor: 'pointer',
              px: 0.5,
              '&:hover': { bgcolor: filterMode === 'HIGH_HEALTH' ? '#0369a1' : '#1e293b' }
            }} 
          />
        </Box>
      </Box>

      {/* Edge-to-Edge Borderless DataGrid */}
      <Box sx={{ height: 'calc(100vh - 280px)', width: '100%', bgcolor: '#0a0b10', border: 0, overflow: 'hidden' }}>
        <DataGrid 
          rows={rows} 
          columns={columns} 
          disableRowSelectionOnClick
          getRowHeight={() => 'auto'}
          getEstimatedRowHeight={() => 60}
          columnHeaderHeight={40}
          sx={{
             border: 0,
             borderRadius: 0,
             color: '#e2e8f0',
             '& .MuiDataGrid-columnHeaders': {
               bgcolor: '#13151a',
               color: '#64748b',
               textTransform: 'uppercase',
               fontSize: '0.7rem',
               fontWeight: 700,
               letterSpacing: '0.05em',
               borderRadius: 0,
               borderBottom: '1px solid #1e293b',
               borderTop: '1px solid #1e293b'
             },
             '& .MuiDataGrid-columnHeader': {
               borderRadius: 0,
               '&:first-of-type': { pl: { xs: 2, md: 3.5 } },
               '&:last-of-type': { pr: { xs: 2, md: 3.5 } }
             },
             '& .MuiDataGrid-cell': {
               borderBottom: '1px solid #1e293b',
               py: '4px',
               '&:first-of-type': { pl: { xs: 2, md: 3.5 } },
               '&:last-of-type': { pr: { xs: 2, md: 3.5 } }
             },
             '& .MuiDataGrid-row': {
               bgcolor: '#0a0b10',
               '&:hover': { bgcolor: '#13151a' }
             },
             '& .MuiDataGrid-row:nth-of-type(even)': {
               bgcolor: '#0e1017',
             },
             '& .MuiDataGrid-footerContainer': {
               borderTop: '1px solid #1e293b',
               bgcolor: '#13151a',
               color: '#64748b',
               px: { xs: 2, md: 3.5 }
             },
             '& .MuiTablePagination-root': { color: '#64748b' },
             '& .MuiDataGrid-virtualScroller': {
               '&::-webkit-scrollbar': { width: '6px', height: '6px' },
               '&::-webkit-scrollbar-track': { bgcolor: '#0a0b10' },
               '&::-webkit-scrollbar-thumb': { bgcolor: '#282f45', borderRadius: '3px', '&:hover': { bgcolor: '#475569' } }
             }
          }}
        />
      </Box>
    </Box>
  );
};

export default Home;
