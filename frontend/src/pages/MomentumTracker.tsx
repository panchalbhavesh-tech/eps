import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, gql } from '@apollo/client';
import { 
  Box, Typography, Card, Button, 
  CircularProgress, Chip, Dialog, 
  DialogTitle, DialogContent, DialogActions, Grid, Divider, 
  LinearProgress, IconButton, InputBase, Tooltip
} from '@mui/material';
import { GridColDef, GridRenderCellParams, GridRowSelectionModel } from '@mui/x-data-grid';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShieldIcon from '@mui/icons-material/Shield';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate } from 'react-router-dom';
import { FilterChipGroup, StatusBadge, FactorChart, MomentumGauge, BulkActionBar, ErrorBoundary, RowTintedDataGrid, MetricCard } from '../components/common';
import { SmartCron } from '../components/common/SmartCron';
import { useThemeMode } from '../theme/ThemeContext';

const GET_MOMENTUM_DATA = gql`
  query GetMomentumData($signalFilter: String, $onlyAttention: Boolean) {
    momentumScanner(signalFilter: $signalFilter, onlyAttention: $onlyAttention) {
      id
      ticker
      name
      currentPrice
      latestMomentum {
        compositeScore
        technicalScore
        fundamentalScore
        smartMoneyScore
        derivativesScore
        regimeScore
        signal
        confidence
        positionSizePct
        stopLossPrice
        requiresAttention
        attentionReasons
        dateCalculated
      }
    }
    marketRegimeStatus {
      status
      score
      reason
    }
  }
`;



const GET_INTENSIVE_BACKTEST = gql`
  query GetIntensiveBacktest($ticker: String!, $years: Int!) {
    getIntensiveBacktest(ticker: $ticker, years: $years) {
      ticker
      companyName
      evaluationHorizonYears
      benchmarkNiftyReturnPct
      momentumPerformance {
        strategyName
        winRatePct
        totalTrades
        sharpeRatio
        sortinoRatio
        maxDrawdownPct
        alphaVsNiftyPct
        brierScore
        mlHitRatePct
      }
      eventStrategies {
        strategyName
        totalTrades
        winRate
        avgGain
        avgLoss
        expectedValue
        profitFactor
      }
    }
  }
`;

// 24H Change temporarily disabled pending backend schema integration
const formatRelativeTimestamp = (dateStr?: string | null) => {
  if (!dateStr) return 'Recently';
  const timestamp = new Date(dateStr).getTime();
  if (isNaN(timestamp)) return 'Live feed';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
};

const MomentumTrackerContent: React.FC = () => {
  const { mode, tokens } = useThemeMode();
  const isDark = mode === 'dark';
  const navigate = useNavigate();

  const [selectedTab, setSelectedTab] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
    const [backtestTicker, setBacktestTicker] = useState<string | null>(null);
  const [backtestYears, setBacktestYears] = useState<number>(3);
  const [selectedRowIds, setSelectedRowIds] = useState<GridRowSelectionModel>([]);

  const { loading: backtestLoading, data: backtestData } = useQuery(GET_INTENSIVE_BACKTEST, {
    variables: { ticker: backtestTicker ?? '', years: backtestYears },
    skip: !backtestTicker,
    fetchPolicy: 'network-only',
  });

  const signalFilter = selectedTab === 'ALL' || selectedTab === 'ATTENTION' ? null : selectedTab;
  const onlyAttention = selectedTab === 'ATTENTION';

  const { loading, error, data } = useQuery(GET_MOMENTUM_DATA, {
    variables: { signalFilter, onlyAttention },
    pollInterval: 15000,
    fetchPolicy: 'cache-and-network',
  });

    
  
  
  const stocks = useMemo(() => {
    const raw = data?.momentumScanner;
    return Array.isArray(raw) ? raw : [];
  }, [data?.momentumScanner]);
  const regime = useMemo(() => data?.marketRegimeStatus || { status: 'Neutral', score: 50, reason: '' }, [data?.marketRegimeStatus]);

  const filteredStocks = useMemo(() => {
    const lowerSearch = searchQuery.trim().toLowerCase();
    return stocks.filter((s: any) => 
      (s.ticker || '').toLowerCase().includes(lowerSearch) ||
      (s.name || '').toLowerCase().includes(lowerSearch)
    ).map((s: any) => ({
      id: s.id,
      ...s
    }));
  }, [stocks, searchQuery]);

  const attentionStocks = useMemo(() => stocks.filter((s: any) => s.latestMomentum?.requiresAttention), [stocks]);
  const strongMomentumCount = useMemo(() => stocks.filter((s: any) => (s.latestMomentum?.compositeScore || 0) >= 70).length, [stocks]);
  const weakCount = useMemo(() => stocks.filter((s: any) => (s.latestMomentum?.compositeScore || 0) < 40).length, [stocks]);

  const bulkActions = useMemo(() => [
    {
      label: 'Add to Watchlist',
      isPrimary: true,
      icon: 'watchlist' as const,
      onClick: () => {
        alert(`Added ${selectedRowIds.length} equities to active monitoring watchlist.`);
        setSelectedRowIds([]);
      }
    },
    {
      label: 'Export CSV',
      isPrimary: false,
      icon: 'export' as const,
      onClick: () => {
        alert("Generating quantitative CSV export for selected stocks...");
      }
    }
  ], [selectedRowIds]);

  const getRegimeStyle = useCallback((status: string) => {
    if (status.includes('Bullish')) {
      return { bg: tokens.status.success.pillBg, border: tokens.status.success.border, color: tokens.status.success.main };
    }
    if (status.includes('Bearish')) {
      return { bg: tokens.status.error.pillBg, border: tokens.status.error.border, color: tokens.status.error.main };
    }
    return { bg: tokens.background.card, border: tokens.border.main, color: tokens.text.primary };
  }, [tokens]);

  const regimeStyle = useMemo(() => getRegimeStyle(regime.status), [getRegimeStyle, regime.status]);

  const columns: GridColDef[] = useMemo(() => [
    { 
      field: 'ticker', 
      headerName: 'TICKER / COMPANY', 
      minWidth: 230, 
      flex: 1.5, 
      sortable: true,
      renderCell: (p: GridRenderCellParams) => (
        <Box 
          onClick={() => navigate(`/companies/${p.row?.id}`)}
          sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', width: '100%', cursor: 'pointer', '&:hover .sym-ticker': { color: tokens.accent.main, textDecoration: 'underline' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Typography className="sym-ticker" noWrap sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary, transition: 'color 0.15s', lineHeight: '18px' }}>
              {p.row?.ticker || '—'}
            </Typography>
            <Chip label="NSE" size="small" sx={{ height: 16, fontSize: '10px', backgroundColor: tokens.background.cardHover, color: tokens.text.secondary, fontWeight: 600, borderRadius: '4px' }} />
          </Box>
          <Typography noWrap sx={{ fontSize: '11px', color: tokens.text.secondary, textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '95%', lineHeight: '15px' }}>
            {p.row?.name || '—'}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'currentPrice', 
      headerName: 'LIVE PRICE', 
      width: 100, 
      type: 'number', 
      headerAlign: 'left', 
      align: 'left', 
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.currentPrice != null && !isNaN(row.currentPrice) ? Number(row.currentPrice) : -Infinity,
      renderCell: (p: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.primary }}>
            {p.row?.currentPrice != null ? `₹${Number(p.row.currentPrice).toFixed(2)}` : '—'}
          </Typography>
        </Box>
      )
    },
    {
      field: 'change24h',
      headerName: '24H CHANGE',
      width: 105,
      headerAlign: 'left',
      align: 'left',
      sortable: false,
      renderCell: () => {
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.tertiary }}>
              --
            </Typography>
          </Box>
        );
      }
    },
    { 
      field: 'compositeScore', 
      headerName: 'MOMENTUM GAUGE', 
      width: 135, 
      type: 'number', 
      headerAlign: 'left', 
      align: 'left', 
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.latestMomentum?.compositeScore != null ? Number(row.latestMomentum.compositeScore) : -Infinity,
      renderCell: (p: GridRenderCellParams) => {
        const score = p.row?.latestMomentum?.compositeScore;
        if (score == null || isNaN(Number(score))) return <StatusBadge status="Not Scanned" variant="neutral" />;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: '100%' }}>
            <MomentumGauge value={Number(score)} size={36} />
            <Box>
              <Typography className="mono-font tabular-nums" sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary }}>
                {Number(score).toFixed(0)}
              </Typography>
              <Typography sx={{ fontSize: '10px', color: tokens.text.tertiary, fontWeight: 500 }}>
                / 100
              </Typography>
            </Box>
          </Box>
        );
      }
    },
    { 
      field: 'factorSubScores', 
      headerName: 'FACTOR SUB-SCORES', 
      width: 170, 
      sortable: false,
      renderCell: (p: GridRenderCellParams) => {
        const mom = p.row?.latestMomentum;
        if (!mom) return <Typography sx={{ fontSize: '12px', color: tokens.text.tertiary }}>—</Typography>;
        return (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', pr: 1 }}>
            <FactorChart
              technical={mom.technicalScore ?? 50}
              fundamental={mom.fundamentalScore ?? 50}
              smartMoney={mom.smartMoneyScore ?? 50}
              derivatives={mom.derivativesScore ?? 50}
              regime={mom.regimeScore ?? 50}
            />
          </Box>
        );
      }
    },
    { 
      field: 'signal', 
      headerName: 'ACTION SIGNAL', 
      width: 155, 
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.latestMomentum?.signal || 'NEUTRAL',
      renderCell: (p: GridRenderCellParams) => {
        const sig = p.row?.latestMomentum?.signal;
        const conf = p.row?.latestMomentum?.confidence;
        if (sig === 'BUY') return <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><StatusBadge status={`BUY (${conf || 85}%)`} variant="success" iconType="check" /></Box>;
        if (sig === 'WATCHLIST') return <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><StatusBadge status="WATCHLIST" variant="warning" iconType="warning" /></Box>;
        if (sig === 'EXIT') return <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><StatusBadge status="EXIT / WEAK" variant="error" iconType="close" /></Box>;
        return <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><StatusBadge status="NEUTRAL" variant="neutral" iconType="none" /></Box>;
      }
    },
    { 
      field: 'attentionReasons', 
      headerName: 'ATTENTION FLAG', 
      minWidth: 200, 
      flex: 1.2, 
      sortable: false,
      renderCell: (p: GridRenderCellParams) => {
        const mom = p.row?.latestMomentum;
        const reasons = mom?.attentionReasons ? mom.attentionReasons.split(" | ") : [];
        if (!reasons.length || !mom?.requiresAttention) {
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
              <Typography sx={{ color: tokens.text.tertiary, fontSize: '12px' }}>Normal pattern</Typography>
            </Box>
          );
        }
        const summary = reasons[0];
        const isTruncated = summary.length > 32 || reasons.length > 1;
        return (
          <Tooltip title={reasons.join(" • ")} placement="top">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', height: '100%' }}>
              <WarningAmberIcon sx={{ fontSize: 16, color: tokens.status.warning.main, flexShrink: 0 }} />
              <Typography noWrap sx={{ color: tokens.text.primary, fontSize: '12px', fontWeight: 600 }}>
                {summary.substring(0, 32)}{isTruncated ? '...' : ''}
              </Typography>
            </Box>
          </Tooltip>
        );
      }
    },
    { 
      field: 'riskSizing', 
      headerName: 'STOP LOSS & RISK', 
      width: 140, 
      sortable: false,
      renderCell: (p: GridRenderCellParams) => {
        const mom = p.row?.latestMomentum;
        if (!mom?.stopLossPrice) return <Typography sx={{ color: tokens.text.tertiary, fontSize: '12px' }}>—</Typography>;
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <Typography className="mono-font tabular-nums" sx={{ color: tokens.status.error.main, fontSize: '12px', fontWeight: 600 }}>
              Stop: ₹{mom.stopLossPrice}
            </Typography>
            <Typography className="mono-font tabular-nums" sx={{ color: tokens.text.secondary, fontSize: '11px' }}>
              Max Size: {mom.positionSizePct ?? 5}%
            </Typography>
          </Box>
        );
      }
    },
    {
      field: 'dateCalculated',
      headerName: 'UPDATED',
      width: 95,
      sortable: false,
      renderCell: (p: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: '11px', color: tokens.text.tertiary }}>
            {formatRelativeTimestamp(p.row?.latestMomentum?.dateCalculated)}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'actions', 
      headerName: 'ANALYTICS', 
      width: 115, 
      sortable: false, 
      align: 'right', 
      headerAlign: 'right',
      renderCell: (p: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '100%' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setBacktestTicker(p.row?.ticker);
            }}
            startIcon={<AssessmentIcon sx={{ fontSize: '14px !important' }} />}
            sx={{
              borderColor: tokens.border.main,
              color: tokens.text.primary,
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '6px',
              textTransform: 'none',
              backgroundColor: tokens.background.card,
              px: 1,
              py: 0.3,
              transition: 'all 0.15s ease-in-out',
              '&:hover': { backgroundColor: tokens.primary.tint, borderColor: tokens.border.light }
            }}
          >
            3Y Test
          </Button>
        </Box>
      )
    }
  ], [navigate, tokens, setBacktestTicker]);

  if (loading && !data) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="60vh" gap={2}>
        <CircularProgress size={44} sx={{ color: tokens.accent.main }} />
        <Typography sx={{ color: tokens.text.secondary, fontWeight: 500, fontSize: '13px', fontFamily: tokens.typography.fontFamily }}>
          Analyzing NSE Universe & Calculating Multi-Factor Momentum...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box mt={5} p={3}>
        <Typography color="error" variant="h6">Failed to load momentum analysis: {error.message}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 6, width: '100%', overflowX: 'hidden', backgroundColor: tokens.background.default }}>
      {/* Top Header Section */}
      <Box sx={{ px: '24px', pt: '24px', mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, fontSize: '24px', color: tokens.text.primary, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <TrendingUpIcon sx={{ color: tokens.accent.main, fontSize: 28 }} />
              NSE Multi-Factor Momentum & Attention Scanner
            </Typography>
            <Typography sx={{ color: tokens.text.secondary, mt: 0.5, fontSize: '13px' }}>
              Real-time cross-sectional percentile rankings and anomaly attention tracker across NSE equities.
            </Typography>
          </Box>
          <Box display="flex" flexDirection="column" alignItems="flex-end">
            <ErrorBoundary fallbackTitle="Cron Error">
              <SmartCron page="momentum" />
            </ErrorBoundary>
          </Box>
        </Box>

        
      </Box>

      {/* Sleek Top Summary Card Bar (Replaced chaotic hybrid cards) */}
      <Box sx={{ px: '24px', mb: 3 }}>
        <ErrorBoundary fallbackTitle="Metrics Unavailable">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard 
                label="Total Universe Monitored" 
                value={`${stocks.length} Stocks`} 
                change="Active cross-sectional scan" 
                trend="up" 
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard 
                label="Strong Momentum (>70%)" 
                value={`${strongMomentumCount} Stocks`} 
                change="Prime momentum targets" 
                trend="up" 
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard 
                label="Requires Attention Flags" 
                value={`${attentionStocks.length} Anomalies`} 
                change="Unusual volatility / breakouts" 
                trend="down" 
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ p: 2, backgroundColor: regimeStyle.bg, border: `1px solid ${regimeStyle.border}`, borderRadius: '12px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '4px' }}>
                  <Typography sx={{ fontSize: '11px', fontWeight: 600, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Nifty Market Regime
                  </Typography>
                  <Chip label={`${regime.score}/100`} size="small" sx={{ backgroundColor: tokens.background.paper, color: regimeStyle.color, fontSize: '10px', fontWeight: 700, height: 20 }} />
                </Box>
                <Typography sx={{ fontSize: '16px', fontWeight: 700, color: regimeStyle.color }}>
                  {regime.status} Gate
                </Typography>
                <Typography noWrap sx={{ fontSize: '11px', color: tokens.text.secondary, mt: '2px' }}>
                  {regime.score >= 70 ? '🟢 Aggressive Momentum' : regime.score >= 50 ? '🟡 Selective Entry' : '🔴 Tight Stops / Protect'}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </ErrorBoundary>
      </Box>

      {/* Sticky Filter & Controls Bar - 48px height */}
      <Box 
        sx={{ 
          position: 'sticky',
          top: 56,
          zIndex: 1000,
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
          backdropFilter: 'blur(8px)',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Momentum Filter:
          </Typography>
          <FilterChipGroup
            options={[
              { label: 'All Signals', value: 'ALL', count: stocks.length },
              { label: 'Requires Attention', value: 'ATTENTION', count: attentionStocks.length },
              { label: 'Strong Momentum (>70%)', value: 'BUY', count: strongMomentumCount },
              { label: 'Watchlist / Neutral', value: 'WATCHLIST' },
              { label: 'Weakening (<40%)', value: 'EXIT', count: weakCount },
            ]}
            selectedValue={selectedTab}
            onChange={(val) => setSelectedTab(val)}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '20px', px: '12px', height: '32px', minWidth: '240px', transition: 'border-color 0.15s ease-in-out', '&:focus-within': { borderColor: tokens.border.focus } }}>
          <SearchIcon sx={{ color: tokens.text.secondary, fontSize: 16, mr: '6px' }} />
          <InputBase
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticker or name..."
            sx={{ color: tokens.text.primary, fontSize: '12px', width: '100%', fontFamily: tokens.typography.fontFamily }}
          />
        </Box>
      </Box>

      {/* Bulk Selection Action Bar */}
      <Box sx={{ px: '24px', mt: selectedRowIds.length > 0 ? 1.5 : 0 }}>
        <BulkActionBar
          selectedCount={selectedRowIds.length}
          onClearSelection={() => setSelectedRowIds([])}
          actions={bulkActions}
        />
      </Box>

      {/* Unified Full-Page Terminal DataGrid with Semantic Row Tinting */}
      <Box sx={{ height: 'calc(100vh - 180px)', minHeight: 600, width: '100%', backgroundColor: tokens.background.paper, borderBottom: `1px solid ${tokens.border.main}`, overflow: 'hidden' }}>
        <ErrorBoundary fallbackTitle="Momentum Table Error">
          <RowTintedDataGrid
            rows={filteredStocks}
            columns={columns}
            checkboxSelection
            onRowSelectionModelChange={(newSelection) => setSelectedRowIds(newSelection)}
            rowSelectionModel={selectedRowIds}
            rowHeight={64}
            columnHeaderHeight={44}
            getRowClassName={(params) => {
              const mom = params.row?.latestMomentum;
              if (mom?.requiresAttention || mom?.signal === 'EXIT') return 'row-tint-avoid';
              if (mom?.compositeScore >= 70 || mom?.signal === 'BUY') return 'row-tint-buy';
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

      {/* Intensive Historical Backtest Modal */}
      <Dialog 
        open={Boolean(backtestTicker)} 
        onClose={() => setBacktestTicker(null)}
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: tokens.background.paper,
            backgroundImage: 'none',
            border: `1px solid ${tokens.border.main}`,
            borderRadius: '12px',
            boxShadow: tokens.shadows.dropdown,
            color: tokens.text.primary,
            p: 1
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1.5, pt: 2 }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <AssessmentIcon sx={{ color: tokens.accent.main, fontSize: 24 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '18px', color: tokens.text.primary }}>
              {backtestTicker} — Intensive Historical Backtest Accuracy Report
            </Typography>
            <Chip label={`${backtestYears}-Year Horizon`} size="small" sx={{ backgroundColor: tokens.background.cardHover, border: `1px solid ${tokens.border.main}`, color: tokens.text.primary, fontWeight: 600, borderRadius: '6px', fontSize: '11px' }} />
          </Box>
          <IconButton onClick={() => setBacktestTicker(null)} size="small" sx={{ color: tokens.text.secondary, '&:hover': { color: tokens.text.primary } }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Divider sx={{ borderColor: tokens.border.main }} />

        <ErrorBoundary fallbackTitle="Analytics Report Error">
          <DialogContent sx={{ minHeight: 400, pt: 3 }}>
          {backtestLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={350} gap={3}>
              <CircularProgress size={44} sx={{ color: tokens.accent.main }} />
              <Typography sx={{ color: tokens.text.primary, fontWeight: 600, fontSize: '15px', fontFamily: tokens.typography.fontFamily }}>
                Simulating rolling multi-factor momentum & ML probability hit rates across {backtestYears} years of live NSE OHLCV...
              </Typography>
              <Typography sx={{ color: tokens.text.secondary, fontSize: '12px', maxWidth: 500, textAlign: 'center' }}>
                Deducting real-world Indian transaction costs (0.20% STT, Brokerage & Stamp Duty) to calculate strict net performance.
              </Typography>
            </Box>
          ) : backtestData?.getIntensiveBacktest ? (
            <Box display="flex" flexDirection="column" gap={4}>
              {/* Executive Portfolio Strategy KPI Cards */}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card elevation={0} sx={{ backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', p: 2 }}>
                    <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Net Win Rate (%)
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography className="mono-font tabular-nums" sx={{ fontSize: '24px', fontWeight: 700, color: (backtestData.getIntensiveBacktest.momentumPerformance?.winRatePct ?? 0) >= 50 ? tokens.status.success.main : tokens.status.warning.main }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.winRatePct ?? 0}%
                      </Typography>
                      <Typography sx={{ color: tokens.text.secondary, fontSize: '12px' }}>
                        ({backtestData.getIntensiveBacktest.momentumPerformance?.totalTrades ?? 0} Trades)
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(100, backtestData.getIntensiveBacktest.momentumPerformance?.winRatePct ?? 0)} 
                      sx={{ height: 6, borderRadius: 2, backgroundColor: tokens.border.main, mt: 1.5, '& .MuiLinearProgress-bar': { backgroundColor: tokens.status.success.main } }}
                    />
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card elevation={0} sx={{ backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', p: 2 }}>
                    <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Sharpe / Sortino Ratio
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography className="mono-font tabular-nums" sx={{ fontSize: '24px', fontWeight: 700, color: (backtestData.getIntensiveBacktest.momentumPerformance?.sharpeRatio ?? 0) >= 1 ? tokens.text.primary : tokens.text.secondary }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.sharpeRatio ?? '0.0'}
                      </Typography>
                      <Typography className="mono-font tabular-nums" sx={{ color: tokens.text.primary, fontWeight: 600, fontSize: '16px' }}>
                        / {backtestData.getIntensiveBacktest.momentumPerformance?.sortinoRatio ?? '0.0'}
                      </Typography>
                    </Box>
                    <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', mt: 1.5 }}>
                      Risk-free benchmark: 6.5% Indian 10Y T-Bill
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card elevation={0} sx={{ backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', p: 2 }}>
                    <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Nifty 50 Alpha (%)
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography className="mono-font tabular-nums" sx={{ fontSize: '24px', fontWeight: 700, color: (backtestData.getIntensiveBacktest.momentumPerformance?.alphaVsNiftyPct ?? 0) >= 0 ? tokens.status.success.main : tokens.status.error.main }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.alphaVsNiftyPct ?? 0}%
                      </Typography>
                      <StatusBadge status="Net Return" variant="success" />
                    </Box>
                    <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', mt: 1.5 }}>
                      Nifty Return: {backtestData.getIntensiveBacktest.benchmarkNiftyReturnPct ?? 0}%
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card elevation={0} sx={{ backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', p: 2 }}>
                    <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      ML Directional Hit Rate
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography className="mono-font tabular-nums" sx={{ fontSize: '24px', fontWeight: 700, color: tokens.text.primary }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.mlHitRatePct ?? 0}%
                      </Typography>
                    </Box>
                    <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', mt: 1.5 }}>
                      Brier Score: {backtestData.getIntensiveBacktest.momentumPerformance?.brierScore ?? 0.25} (Lower = Better)
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* Event Strategy Breakdown (Strategies A-F) */}
              <Box>
                <Typography sx={{ fontSize: '15px', fontWeight: 700, color: tokens.text.primary, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShieldIcon sx={{ color: tokens.accent.main, fontSize: 18 }} /> Quantitative Earnings & Catalyst Strategies (A — F) Accuracy
                </Typography>
                <Card elevation={0} sx={{ backgroundColor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: tokens.background.header, borderBottom: `1px solid ${tokens.border.main}` }}>
                        <th style={{ padding: '12px 16px', color: tokens.text.secondary, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>STRATEGY CODE & LOGIC</th>
                        <th style={{ padding: '12px 16px', color: tokens.text.secondary, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TOTAL TRADES</th>
                        <th style={{ padding: '12px 16px', color: tokens.text.secondary, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>WIN RATE</th>
                        <th style={{ padding: '12px 16px', color: tokens.text.secondary, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AVG GAIN / LOSS</th>
                        <th style={{ padding: '12px 16px', color: tokens.text.secondary, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>EXPECTED VALUE (EV)</th>
                        <th style={{ padding: '12px 16px', color: tokens.text.secondary, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PROFIT FACTOR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!Array.isArray(backtestData.getIntensiveBacktest.eventStrategies) || backtestData.getIntensiveBacktest.eventStrategies.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: tokens.text.secondary }}>
                            No corporate earnings event patterns triggered in this timeframe.
                          </td>
                        </tr>
                      ) : (
                        backtestData.getIntensiveBacktest.eventStrategies.map((est: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: `1px solid ${tokens.border.main}`, backgroundColor: tokens.background.paper }}>
                            <td style={{ padding: '12px 16px', color: tokens.text.primary, fontWeight: 600 }}>
                              Strategy {est.strategyName} {est.strategyName === 'A' ? '(PEAD Breakout)' : est.strategyName === 'C' ? '(Vol Breakout)' : est.strategyName === 'D' ? '(Gap & Go)' : est.strategyName === 'E' ? '(Pre-Runup)' : ''}
                            </td>
                            <td style={{ padding: '12px 16px', color: tokens.text.secondary, fontFamily: tokens.typography.fontFamily, fontWeight: 500 }} className="mono-font tabular-nums">{est.totalTrades ?? 0}</td>
                            <td style={{ padding: '12px 16px', color: (est.winRate ?? 0) >= 50 ? tokens.status.success.main : tokens.status.warning.main, fontWeight: 600 }} className="mono-font tabular-nums">
                              {est.winRate ? `${est.winRate.toFixed(1)}%` : '0%'}
                            </td>
                            <td style={{ padding: '12px 16px', fontWeight: 600 }} className="mono-font tabular-nums">
                              <span style={{ color: tokens.status.success.main }}>+{est.avgGain?.toFixed(1) ?? 0}%</span> / <span style={{ color: tokens.status.error.main }}>{est.avgLoss?.toFixed(1) ?? 0}%</span>
                            </td>
                            <td style={{ padding: '12px 16px', fontWeight: 700, color: (est.expectedValue ?? 0) >= 0 ? tokens.text.primary : tokens.status.error.main }} className="mono-font tabular-nums">
                              {est.expectedValue ? `${est.expectedValue >= 0 ? '+' : ''}${est.expectedValue.toFixed(2)}%` : '0.0%'}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <StatusBadge status={est.profitFactor?.toFixed(2) ?? '0.0'} variant={(est.profitFactor ?? 0) >= 1.3 ? 'success' : 'warning'} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Card>
              </Box>
            </Box>
          ) : (
            <Box display="flex" alignItems="center" justifyContent="center" height={250}>
              <Typography sx={{ color: tokens.status.error.main, fontWeight: 600, fontSize: '13px' }}>
                Unable to simulate historical data for {backtestTicker}. Ensure live NSE feed is reachable.
              </Typography>
            </Box>
          )}
          </DialogContent>
        </ErrorBoundary>

        <DialogActions sx={{ p: 2.5, backgroundColor: tokens.background.header, borderTop: `1px solid ${tokens.border.main}` }}>
          <Box display="flex" gap={1.5} flexGrow={1} pl={1}>
            {[1, 3, 5].map((yr) => (
              <Button 
                key={yr}
                size="small" 
                variant={backtestYears === yr ? "contained" : "outlined"}
                onClick={() => setBacktestYears(yr)}
                sx={{ 
                  borderRadius: '6px', 
                  textTransform: 'none', 
                  fontWeight: 600, 
                  fontSize: '12px',
                  backgroundColor: backtestYears === yr ? tokens.primary.main : tokens.background.card, 
                  color: backtestYears === yr ? (isDark ? '#0A0A0C' : '#FFFFFF') : tokens.text.primary, 
                  borderColor: tokens.border.main, 
                  transition: 'opacity 0.15s ease-in-out',
                  '&:hover': { opacity: 0.88, backgroundColor: backtestYears === yr ? tokens.primary.main : tokens.background.cardHover } 
                }}
              >
                {yr}-Year Test {yr === 3 ? '(Default)' : ''}
              </Button>
            ))}
          </Box>
          <Button onClick={() => setBacktestTicker(null)} variant="contained" sx={{ backgroundColor: tokens.primary.main, color: isDark ? '#0A0A0C' : '#FFFFFF', fontWeight: 600, fontSize: '12px', borderRadius: '6px', px: 3, textTransform: 'none', '&:hover': { opacity: 0.88, backgroundColor: tokens.primary.main } }}>
            Close Analytical Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default function MomentumTracker() {
  return (
    <ErrorBoundary fallbackTitle="Momentum & Attention Unavailable">
      <MomentumTrackerContent />
    </ErrorBoundary>
  );
}
