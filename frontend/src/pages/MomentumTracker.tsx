import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { 
  Box, Typography, CircularProgress, Chip, Button, TextField, 
  InputAdornment, Card, CardContent, Grid, Divider, Tab, Tabs,
  Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress, IconButton
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import NotificationsIcon from '@mui/icons-material/NotificationsActive';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ShieldIcon from '@mui/icons-material/Shield';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';

const GET_MOMENTUM_DATA = gql`
  query GetMomentumScanner($signalFilter: String, $onlyAttention: Boolean!) {
    marketRegimeStatus {
      status
      score
      reason
    }
    momentumScanner(signalFilter: $signalFilter, onlyAttention: $onlyAttention) {
      id
      ticker
      name
      sector
      currentPrice
      latestMomentum {
        dateCalculated
        fundamentalScore
        technicalScore
        regimeScore
        smartMoneyScore
        derivativesScore
        compositeScore
        signal
        confidence
        stopLossPrice
        positionSizePct
        requiresAttention
        attentionReasons
      }
    }
  }
`;

const TRIGGER_MOMENTUM_SCAN = gql`
  mutation TriggerMomentumScan {
    triggerMomentumScan
  }
`;

const GET_INTENSIVE_BACKTEST = gql`
  query GetIntensiveBacktest($ticker: String!, $years: Int!) {
    getIntensiveBacktest(ticker: $ticker, years: $years) {
      ticker
      status
      yearsTested
      totalTradingBars
      benchmarkNiftyReturnPct
      momentumPerformance {
        totalTrades
        winRatePct
        netTotalReturnPct
        sharpeRatio
        sortinoRatio
        maxDrawdownPct
        mlHitRatePct
        brierScore
        alphaVsNiftyPct
        profitFactor
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

const MomentumTracker: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [backtestTicker, setBacktestTicker] = useState<string | null>(null);
  const [backtestYears, setBacktestYears] = useState<number>(3);

  const { loading: backtestLoading, data: backtestData } = useQuery(GET_INTENSIVE_BACKTEST, {
    variables: { ticker: backtestTicker ?? '', years: backtestYears },
    skip: !backtestTicker,
    fetchPolicy: 'network-only',
  });

  const signalFilter = selectedTab === 'ALL' || selectedTab === 'ATTENTION' ? null : selectedTab;
  const onlyAttention = selectedTab === 'ATTENTION';

  const { loading, error, data, refetch } = useQuery(GET_MOMENTUM_DATA, {
    variables: { signalFilter, onlyAttention },
    pollInterval: 15000,
    fetchPolicy: 'cache-and-network',
  });

  const [triggerScan, { loading: scanning }] = useMutation(TRIGGER_MOMENTUM_SCAN, {
    onCompleted: (res) => {
      setScanNotice(res.triggerMomentumScan);
      setTimeout(() => refetch(), 3000);
    }
  });

  const handleRunScan = () => {
    setScanNotice(null);
    triggerScan();
  };

  if (loading && !data) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" mt={15}>
        <CircularProgress size={56} sx={{ color: '#7c4dff', mb: 2 }} />
        <Typography variant="h6" sx={{ color: '#94a3b8', fontWeight: 500 }}>
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

  const stocks = data?.momentumScanner || [];
  const regime = data?.marketRegimeStatus || { status: 'Neutral', score: 50, reason: '' };

  // Filter by search query
  const filteredStocks = stocks.filter((s: any) => 
    s.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const attentionStocks = stocks.filter((s: any) => s.latestMomentum?.requiresAttention);

  const getSignalChip = (signal?: string) => {
    if (signal === 'BUY') {
      return (
        <Chip 
          label="HIGH MOMENTUM (BUY)" 
          size="small"
          sx={{ 
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            color: '#fff', fontWeight: 700, px: 1,
            boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
          }} 
        />
      );
    }
    if (signal === 'WATCHLIST') {
      return (
        <Chip 
          label="WATCHLIST / ATTENTION" 
          size="small"
          sx={{ 
            background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
            color: '#fff', fontWeight: 700, px: 1,
            boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)'
          }} 
        />
      );
    }
    if (signal === 'EXIT') {
      return (
        <Chip 
          label="WEAKENING (EXIT)" 
          size="small"
          sx={{ 
            background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
            color: '#fff', fontWeight: 700, px: 1,
            boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)'
          }} 
        />
      );
    }
    return <Chip label="NEUTRAL" size="small" sx={{ bgcolor: '#334155', color: '#cbd5e1', fontWeight: 600 }} />;
  };

  const getRegimeStyle = (status: string) => {
    if (status.includes('Bullish')) {
      return { bg: 'linear-gradient(135deg, rgba(6, 78, 59, 0.8) 0%, rgba(16, 185, 129, 0.3) 100%)', border: '#10b981', color: '#34d399' };
    }
    if (status.includes('Bearish')) {
      return { bg: 'linear-gradient(135deg, rgba(127, 29, 29, 0.8) 0%, rgba(239, 68, 68, 0.3) 100%)', border: '#ef4444', color: '#f87171' };
    }
    return { bg: 'linear-gradient(135deg, rgba(30, 58, 138, 0.8) 0%, rgba(59, 130, 246, 0.3) 100%)', border: '#3b82f6', color: '#60a5fa' };
  };

  const regimeStyle = getRegimeStyle(regime.status);

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header & Title */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <TrendingUpIcon sx={{ color: '#00d2ff', fontSize: 38 }} />
            NSE Multi-Factor Momentum & Attention
          </Typography>
          <Typography variant="body1" sx={{ color: '#94a3b8', mt: 0.5 }}>
            Real-time cross-sectional percentile rankings and anomaly attention tracker across NSE equities.
          </Typography>
        </Box>
        <Box display="flex" gap={2} alignItems="center">
          <Button
            variant="contained"
            disabled={scanning}
            onClick={handleRunScan}
            startIcon={scanning ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <RefreshIcon />}
            sx={{
              background: 'linear-gradient(135deg, #7c4dff 0%, #00d2ff 100%)',
              fontWeight: 700, px: 3, py: 1.2, borderRadius: 3,
              boxShadow: '0 4px 20px rgba(124, 77, 255, 0.4)',
              textTransform: 'none',
              transition: 'transform 0.2s, box-shadow 0.2s',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 24px rgba(124, 77, 255, 0.6)',
              }
            }}
          >
            {scanning ? 'Running Real-Time Scan...' : 'Run Real-Time Scan'}
          </Button>
        </Box>
      </Box>

      {scanNotice && (
        <Box mb={3} p={1.5} px={3} sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: 2 }}>
          <Typography sx={{ color: '#34d399', fontSize: '0.9rem', fontWeight: 600 }}>{scanNotice}</Typography>
        </Box>
      )}

      {/* Market Regime Live Banner */}
      <Card 
        sx={{ 
          mb: 4, 
          background: regimeStyle.bg,
          border: `1px solid ${regimeStyle.border}`,
          backdropFilter: 'blur(16px)',
          borderRadius: 4,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box display="flex" alignItems="center" gap={2.5}>
            <Box 
              sx={{ 
                p: 1.8, borderRadius: '50%', bgcolor: 'rgba(255, 255, 255, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 20px ${regimeStyle.border}` 
              }}
            >
              <ShieldIcon sx={{ fontSize: 32, color: regimeStyle.color }} />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                Nifty Benchmark & Market Regime Gate
              </Typography>
              <Typography variant="h5" sx={{ color: '#f8fafc', fontWeight: 800, mt: 0.2 }}>
                {regime.status} <Chip label={`Regime Score: ${regime.score}/100`} size="small" sx={{ ml: 1, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 700 }} />
              </Typography>
              <Typography variant="body2" sx={{ color: '#e2e8f0', mt: 0.5 }}>
                {regime.reason || 'Evaluating broad market trend via real-time 50 & 200 DMAs.'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: 'right', minWidth: 200 }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>
              RECOMMENDED PORTFOLIO POSTURE
            </Typography>
            <Typography variant="subtitle1" sx={{ color: '#f8fafc', fontWeight: 700 }}>
              {regime.score >= 70 ? '🟢 Aggressive Momentum Capture' : regime.score >= 50 ? '🟡 Selective Watchlist Entry' : '🔴 Capital Preservation / Tight Stops'}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Spotlight: Shares Requiring Immediate Attention */}
      {attentionStocks.length > 0 && (
        <Box mb={5}>
          <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
            <NotificationsIcon sx={{ color: '#f59e0b', fontSize: 28 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#f8fafc' }}>
              Requires Immediate Attention ({attentionStocks.length})
            </Typography>
            <Chip label="Real-Time Anomalies & Breakouts" size="small" sx={{ bgcolor: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontWeight: 700 }} />
          </Box>

          <Grid container spacing={2.5}>
            {attentionStocks.map((stock: any) => {
              const mom = stock.latestMomentum;
              const reasons = mom?.attentionReasons?.split(" | ") || ["Unusual Momentum Activity"];
              return (
                <Grid item xs={12} md={6} lg={4} key={stock.id}>
                  <Card 
                    onClick={() => navigate(`/companies/${stock.id}`)}
                    sx={{
                      cursor: 'pointer',
                      background: 'rgba(30, 41, 59, 0.75)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      borderRadius: 3,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      '&:hover': {
                        transform: 'translateY(-6px)',
                        boxShadow: '0 12px 32px rgba(245, 158, 11, 0.25)',
                        border: '1px solid #f59e0b',
                      }
                    }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 800, color: '#f8fafc', lineHeight: 1.2 }}>
                            {stock.ticker}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            {stock.name.length > 28 ? stock.name.substring(0, 28) + '...' : stock.name}
                          </Typography>
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: '#38bdf8' }}>
                          ₹{stock.currentPrice ? stock.currentPrice.toFixed(2) : 'N/A'}
                        </Typography>
                      </Box>

                      <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                        {getSignalChip(mom?.signal)}
                        {mom?.compositeScore && (
                          <Chip 
                            label={`Score: ${mom.compositeScore}`} 
                            size="small" 
                            sx={{ bgcolor: 'rgba(124, 77, 255, 0.2)', color: '#a78bfa', fontWeight: 700 }} 
                          />
                        )}
                      </Box>

                      <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', mb: 1.5 }} />

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                        {reasons.map((r: string, idx: number) => (
                          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ color: '#fde047', fontWeight: 600, fontSize: '0.85rem' }}>
                              • {r}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </CardContent>

                    <Box sx={{ p: 2, pt: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8' }}>
                      <Typography variant="caption" sx={{ color: '#cbd5e1' }}>
                        Stop Loss: <span style={{ color: '#f87171', fontWeight: 700 }}>₹{mom?.stopLossPrice || 'N/A'}</span>
                      </Typography>
                      <Box display="flex" alignItems="center" sx={{ color: '#7c4dff', fontWeight: 600, fontSize: '0.8rem' }}>
                        View Deep Research <ArrowForwardIcon sx={{ fontSize: 14, ml: 0.5 }} />
                      </Box>
                    </Box>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* Control Bar & Filter Tabs */}
      <Box sx={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: 3, p: 1.5, mb: 3, border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Tabs 
          value={selectedTab} 
          onChange={(_, newVal) => setSelectedTab(newVal)}
          sx={{
            '& .MuiTab-root': { color: '#94a3b8', fontWeight: 700, textTransform: 'none', px: 2.5, minHeight: 40 },
            '& .Mui-selected': { color: '#00d2ff !important' },
            '& .MuiTabs-indicator': { bgcolor: '#00d2ff', height: 3, borderRadius: 1.5 }
          }}
        >
          <Tab label="All Monitored Stocks" value="ALL" />
          <Tab label="⚠️ Requires Attention" value="ATTENTION" />
          <Tab label="🟢 High Momentum (Buy)" value="BUY" />
          <Tab label="🟡 Watchlist" value="WATCHLIST" />
          <Tab label="🔴 Weakening (Exit)" value="EXIT" />
        </Tabs>

        <TextField
          size="small"
          placeholder="Filter by Symbol or Name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#64748b' }} /></InputAdornment>,
            sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', color: '#f8fafc', borderRadius: 2, minWidth: 260, border: '1px solid rgba(255,255,255,0.1)' }
          }}
        />
      </Box>

      {/* Main Multi-Factor Momentum Grid */}
      <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <th style={{ padding: '16px 24px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>EQUITY SYMBOL</th>
                <th style={{ padding: '16px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>LIVE PRICE</th>
                <th style={{ padding: '16px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>COMPOSITE RANK</th>
                <th style={{ padding: '16px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>RANKS: T / F / SM / D</th>
                <th style={{ padding: '16px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>ACTION SIGNAL</th>
                <th style={{ padding: '16px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>RISK & SIZING</th>
                <th style={{ padding: '16px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>BACKTEST ACCURACY</th>
                <th style={{ padding: '16px 24px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>ATTENTION TRIGGERS</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                    No stocks matching the selected criteria or filters.
                  </td>
                </tr>
              ) : (
                filteredStocks.map((s: any) => {
                  const mom = s.latestMomentum;
                  const score = mom?.compositeScore ?? 0;
                  const reasons = mom?.attentionReasons ? mom.attentionReasons.split(" | ") : [];
                  
                  return (
                    <tr 
                      key={s.id}
                      onClick={() => navigate(`/companies/${s.id}`)}
                      style={{ 
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)', 
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(124, 77, 255, 0.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '16px 24px' }}>
                        <Typography sx={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.95rem' }}>
                          {s.ticker}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: '0.75rem' }}>
                          {s.name.length > 32 ? s.name.substring(0, 32) + '...' : s.name}
                        </Typography>
                      </td>
                      
                      <td style={{ padding: '16px' }}>
                        <Typography sx={{ color: '#f8fafc', fontWeight: 700 }}>
                          ₹{s.currentPrice ? s.currentPrice.toFixed(2) : 'N/A'}
                        </Typography>
                        {mom?.dateCalculated && (
                          <Typography sx={{ color: '#64748b', fontSize: '0.7rem' }}>
                            Updated Live
                          </Typography>
                        )}
                      </td>
                      
                      <td style={{ padding: '16px', minWidth: '150px' }}>
                        {mom?.compositeScore !== null && mom?.compositeScore !== undefined ? (
                          <Box display="flex" alignItems="center" gap={1.5}>
                            <Box sx={{ flexGrow: 1, bgcolor: 'rgba(255, 255, 255, 0.1)', borderRadius: 2, height: 8, overflow: 'hidden', minWidth: 70 }}>
                              <Box 
                                sx={{ 
                                  width: `${score}%`, 
                                  height: '100%', 
                                  background: score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444',
                                  transition: 'width 0.5s' 
                                }} 
                              />
                            </Box>
                            <Typography sx={{ fontWeight: 800, color: score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444', fontSize: '0.95rem' }}>
                              {score.toFixed(1)}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography sx={{ color: '#64748b', fontSize: '0.8rem' }}>Not Scanned</Typography>
                        )}
                      </td>
                      
                      <td style={{ padding: '16px', fontSize: '0.85rem' }}>
                        {mom ? (
                          <Box>
                            <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 700 }}>
                              <span style={{ color: '#38bdf8', title: 'Technical Rank' }}>T: {mom.technicalScore ?? '-'}</span>{" | "}
                              <span style={{ color: '#a78bfa', title: 'Fundamental Rank' }}>F: {mom.fundamentalScore ?? '-'}</span>
                            </Typography>
                            <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, mt: 0.3 }}>
                              <span style={{ color: '#f59e0b', title: 'Smart Money Rank' }}>SM: {mom.smartMoneyScore ?? '-'}</span>{" | "}
                              <span style={{ color: '#ec4899', title: 'Derivatives Rank' }}>D: {mom.derivativesScore ?? '-'}</span>
                            </Typography>
                          </Box>
                        ) : '-'}
                      </td>
                      
                      <td style={{ padding: '16px' }}>
                        {getSignalChip(mom?.signal)}
                      </td>
                      
                      <td style={{ padding: '16px' }}>
                        {mom?.stopLossPrice ? (
                          <Box>
                            <Typography sx={{ color: '#f87171', fontSize: '0.85rem', fontWeight: 700 }}>
                              Stop: ₹{mom.stopLossPrice}
                            </Typography>
                            <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                              Weight: {mom.positionSizePct ?? 5}% Max
                            </Typography>
                          </Box>
                        ) : '-'}
                      </td>
                      
                      <td style={{ padding: '16px' }}>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<AssessmentIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setBacktestTicker(s.ticker);
                          }}
                          sx={{
                            borderColor: 'rgba(56, 189, 248, 0.4)',
                            color: '#38bdf8',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            borderRadius: 2,
                            textTransform: 'none',
                            '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.1)', borderColor: '#38bdf8' }
                          }}
                        >
                          Run 3Y Test
                        </Button>
                      </td>
                      
                      <td style={{ padding: '16px 24px' }}>
                        {reasons.length > 0 ? (
                          <Box display="flex" flexDirection="column" gap={0.5}>
                            {reasons.slice(0, 2).map((r: string, idx: number) => (
                              <Typography key={idx} sx={{ color: '#fde047', fontSize: '0.8rem', fontWeight: 600 }}>
                                • {r}
                              </Typography>
                            ))}
                            {reasons.length > 2 && (
                              <Typography sx={{ color: '#64748b', fontSize: '0.75rem' }}>
                                +{reasons.length - 2} more triggers
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          <Typography sx={{ color: '#64748b', fontSize: '0.8rem' }}>No anomalies detected</Typography>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Box>
      </Card>

      {/* Intensive Historical Backtest Modal */}
      <Dialog 
        open={Boolean(backtestTicker)} 
        onClose={() => setBacktestTicker(null)}
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#0f172a',
            backgroundImage: 'linear-gradient(to bottom right, #0f172a, #1e1b4b)',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            borderRadius: 4,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            color: '#f8fafc',
            p: 1
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <AssessmentIcon sx={{ color: '#38bdf8', fontSize: 28 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '0.02rem' }}>
              {backtestTicker} — Intensive Historical Backtest Accuracy Report
            </Typography>
            <Chip 
              label={`${backtestYears}-Year Horizon`} 
              size="small" 
              sx={{ bgcolor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontWeight: 700, borderRadius: 2 }} 
            />
          </Box>
          <IconButton onClick={() => setBacktestTicker(null)} sx={{ color: '#94a3b8', '&:hover': { color: '#f8fafc' } }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

        <DialogContent sx={{ minHeight: 400, pt: 3 }}>
          {backtestLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={350} gap={3}>
              <CircularProgress size={56} sx={{ color: '#38bdf8' }} />
              <Typography sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '1.1rem' }}>
                Simulating rolling multi-factor momentum & ML probability hit rates across {backtestYears} years of live NSE OHLCV...
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: '0.9rem', maxWidth: 500, textAlign: 'center' }}>
                Deducting real-world Indian transaction costs (0.20% STT, Brokerage & Stamp Duty) to calculate strict net performance.
              </Typography>
            </Box>
          ) : backtestData?.getIntensiveBacktest ? (
            <Box display="flex" flexDirection="column" gap={4}>
              {/* Executive Portfolio Strategy KPI Cards */}
              <Grid container spacing={2.5}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, p: 2 }}>
                    <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Net Win Rate (%)
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: (backtestData.getIntensiveBacktest.momentumPerformance?.winRatePct ?? 0) >= 50 ? '#10b981' : '#f59e0b' }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.winRatePct ?? 0}%
                      </Typography>
                      <Typography sx={{ color: '#64748b', fontSize: '0.85rem' }}>
                        ({backtestData.getIntensiveBacktest.momentumPerformance?.totalTrades ?? 0} Trades)
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(100, backtestData.getIntensiveBacktest.momentumPerformance?.winRatePct ?? 0)} 
                      sx={{ height: 6, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.1)', mt: 1.5, '& .MuiLinearProgress-bar': { bgcolor: '#10b981' } }}
                    />
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, p: 2 }}>
                    <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Sharpe / Sortino Ratio
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1.5} mt={1}>
                      <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: (backtestData.getIntensiveBacktest.momentumPerformance?.sharpeRatio ?? 0) >= 1 ? '#38bdf8' : '#e2e8f0' }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.sharpeRatio ?? '0.0'}
                      </Typography>
                      <Typography sx={{ color: '#a78bfa', fontWeight: 700, fontSize: '1.1rem' }}>
                        / {backtestData.getIntensiveBacktest.momentumPerformance?.sortinoRatio ?? '0.0'}
                      </Typography>
                    </Box>
                    <Typography sx={{ color: '#64748b', fontSize: '0.75rem', mt: 1.5 }}>
                      Risk-free benchmark: 6.5% Indian 10Y T-Bill
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, p: 2 }}>
                    <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Nifty 50 Alpha (%)
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: (backtestData.getIntensiveBacktest.momentumPerformance?.alphaVsNiftyPct ?? 0) >= 0 ? '#10b981' : '#f87171' }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.alphaVsNiftyPct ?? 0}%
                      </Typography>
                      <Chip label="Net Return" size="small" sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '0.7rem', fontWeight: 700 }} />
                    </Box>
                    <Typography sx={{ color: '#64748b', fontSize: '0.75rem', mt: 1.5 }}>
                      Nifty Benchmark Return: {backtestData.getIntensiveBacktest.benchmarkNiftyReturnPct ?? 0}%
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, p: 2 }}>
                    <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      ML Directional Hit Rate
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: '#f43f5e' }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.mlHitRatePct ?? 0}%
                      </Typography>
                    </Box>
                    <Typography sx={{ color: '#64748b', fontSize: '0.75rem', mt: 1.5 }}>
                      Brier Score: {backtestData.getIntensiveBacktest.momentumPerformance?.brierScore ?? 0.25} (Lower = Cleaner)
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* Event Strategy Breakdown (Strategies A-F) */}
              <Box>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShieldIcon sx={{ color: '#a78bfa' }} /> Quantitative Earnings & Catalyst Strategies (A — F) Accuracy
                </Typography>
                <Card sx={{ bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(30, 41, 59, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <th style={{ padding: '14px 20px', color: '#94a3b8', fontWeight: 700 }}>STRATEGY CODE & LOGIC</th>
                        <th style={{ padding: '14px 16px', color: '#94a3b8', fontWeight: 700 }}>TOTAL TRADES</th>
                        <th style={{ padding: '14px 16px', color: '#94a3b8', fontWeight: 700 }}>WIN RATE</th>
                        <th style={{ padding: '14px 16px', color: '#94a3b8', fontWeight: 700 }}>AVG GAIN / LOSS</th>
                        <th style={{ padding: '14px 16px', color: '#94a3b8', fontWeight: 700 }}>EXPECTED VALUE (EV)</th>
                        <th style={{ padding: '14px 20px', color: '#94a3b8', fontWeight: 700 }}>PROFIT FACTOR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!backtestData.getIntensiveBacktest.eventStrategies || backtestData.getIntensiveBacktest.eventStrategies.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                            No corporate earnings event patterns triggered in this timeframe.
                          </td>
                        </tr>
                      ) : (
                        backtestData.getIntensiveBacktest.eventStrategies.map((est: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '14px 20px', color: '#f8fafc', fontWeight: 700 }}>
                              Strategy {est.strategyName} {est.strategyName === 'A' ? '(PEAD Breakout)' : est.strategyName === 'C' ? '(Vol Breakout)' : est.strategyName === 'D' ? '(Gap & Go)' : est.strategyName === 'E' ? '(Pre-Runup)' : ''}
                            </td>
                            <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>{est.totalTrades ?? 0}</td>
                            <td style={{ padding: '14px 16px', color: (est.winRate ?? 0) >= 50 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                              {est.winRate ? `${est.winRate.toFixed(1)}%` : '0%'}
                            </td>
                            <td style={{ padding: '14px 16px', color: '#94a3b8' }}>
                              <span style={{ color: '#10b981' }}>+{est.avgGain?.toFixed(1) ?? 0}%</span> / <span style={{ color: '#f87171' }}>{est.avgLoss?.toFixed(1) ?? 0}%</span>
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: 800, color: (est.expectedValue ?? 0) >= 0 ? '#38bdf8' : '#f87171' }}>
                              {est.expectedValue ? `${est.expectedValue >= 0 ? '+' : ''}${est.expectedValue.toFixed(2)}%` : '0.0%'}
                            </td>
                            <td style={{ padding: '14px 20px' }}>
                              <Chip 
                                label={est.profitFactor?.toFixed(2) ?? '0.0'} 
                                size="small" 
                                sx={{ 
                                  bgcolor: (est.profitFactor ?? 0) >= 1.3 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)', 
                                  color: (est.profitFactor ?? 0) >= 1.3 ? '#10b981' : '#f59e0b', 
                                  fontWeight: 800, 
                                  borderRadius: 2 
                                }} 
                              />
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
              <Typography sx={{ color: '#ef4444', fontWeight: 700 }}>
                Unable to simulate historical data for {backtestTicker}. Ensure live NSE feed is reachable.
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2.5, bgcolor: 'rgba(15, 23, 42, 0.9)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Box display="flex" gap={1.5} flexGrow={1} pl={1}>
            <Button 
              size="small" 
              variant={backtestYears === 1 ? "contained" : "outlined"}
              onClick={() => setBacktestYears(1)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
            >
              1-Year Test
            </Button>
            <Button 
              size="small" 
              variant={backtestYears === 3 ? "contained" : "outlined"}
              onClick={() => setBacktestYears(3)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
            >
              3-Year Test (Default)
            </Button>
            <Button 
              size="small" 
              variant={backtestYears === 5 ? "contained" : "outlined"}
              onClick={() => setBacktestYears(5)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
            >
              5-Year Test
            </Button>
          </Box>
          <Button onClick={() => setBacktestTicker(null)} variant="contained" sx={{ bgcolor: '#38bdf8', color: '#0f172a', fontWeight: 800, borderRadius: 2.5, px: 3, '&:hover': { bgcolor: '#0284c7' } }}>
            Close Analytical Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MomentumTracker;
