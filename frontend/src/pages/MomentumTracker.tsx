import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { 
  Box, Typography, CircularProgress, Chip, Button, 
  Card, CardContent, Grid, Divider, 
  Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress, IconButton
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import NotificationsIcon from '@mui/icons-material/NotificationsActive';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ShieldIcon from '@mui/icons-material/Shield';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import { FilterChipGroup, SearchInput } from '../components/common';
import { saasTokens } from '../theme/theme';

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
        <CircularProgress size={48} sx={{ color: '#0f172a', mb: 2 }} />
        <Typography variant="h6" sx={{ color: '#64748b', fontWeight: 600, fontSize: '1rem' }}>
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
            bgcolor: '#d1fae5',
            color: '#065f46', fontWeight: 700, px: 1, border: '1px solid #a7f3d0',
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
            bgcolor: '#fef3c7',
            color: '#92400e', fontWeight: 700, px: 1, border: '1px solid #fde68a',
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
            bgcolor: '#fff1f2',
            color: '#be123c', fontWeight: 700, px: 1, border: '1px solid #fda4af',
          }} 
        />
      );
    }
    return <Chip label="NEUTRAL" size="small" sx={{ bgcolor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontWeight: 600 }} />;
  };

  const getRegimeStyle = (status: string) => {
    if (status.includes('Bullish')) {
      return { bg: '#f0fdf4', border: '#86efac', color: '#15803d', badgeBg: '#dcfce7' };
    }
    if (status.includes('Bearish')) {
      return { bg: '#fff1f2', border: '#fda4af', color: '#e11d48', badgeBg: '#ffe4e6' };
    }
    return { bg: '#f8fafc', border: '#cbd5e1', color: '#0f172a', badgeBg: '#f1f5f9' };
  };

  const regimeStyle = getRegimeStyle(regime.status);

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header & Title */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: saasTokens.text.primary, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <TrendingUpIcon sx={{ color: '#0f172a', fontSize: 36 }} />
            NSE Multi-Factor Momentum & Attention
          </Typography>
          <Typography variant="body1" sx={{ color: saasTokens.text.secondary, mt: 0.5 }}>
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
              bgcolor: '#0f172a',
              color: '#ffffff',
              fontWeight: 700, px: 3, py: 1.2, borderRadius: 2.5,
              boxShadow: '0 4px 16px rgba(15, 23, 42, 0.15)',
              textTransform: 'none',
              transition: 'all 0.2s',
              '&:hover': {
                bgcolor: '#1e293b',
                transform: 'translateY(-1px)',
              }
            }}
          >
            {scanning ? 'Running Real-Time Scan...' : 'Run Real-Time Scan'}
          </Button>
        </Box>
      </Box>

      {scanNotice && (
        <Box mb={3} p={1.5} px={3} sx={{ bgcolor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 2 }}>
          <Typography sx={{ color: '#15803d', fontSize: '0.9rem', fontWeight: 600 }}>{scanNotice}</Typography>
        </Box>
      )}

      {/* Market Regime Live Banner */}
      <Card 
        sx={{ 
          mb: 4, 
          bgcolor: regimeStyle.bg,
          border: `1px solid ${regimeStyle.border}`,
          borderRadius: 3.5,
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.03)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box display="flex" alignItems="center" gap={2.5}>
            <Box 
              sx={{ 
                p: 1.8, borderRadius: '50%', bgcolor: '#ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
                border: `1px solid ${regimeStyle.border}`
              }}
            >
              <ShieldIcon sx={{ fontSize: 32, color: regimeStyle.color }} />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: saasTokens.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                Nifty Benchmark & Market Regime Gate
              </Typography>
              <Typography variant="h5" sx={{ color: saasTokens.text.primary, fontWeight: 800, mt: 0.2 }}>
                {regime.status} <Chip label={`Regime Score: ${regime.score}/100`} size="small" sx={{ ml: 1, bgcolor: '#ffffff', border: `1px solid ${regimeStyle.border}`, color: regimeStyle.color, fontWeight: 700 }} />
              </Typography>
              <Typography variant="body2" sx={{ color: saasTokens.text.secondary, mt: 0.5 }}>
                {regime.reason || 'Evaluating broad market trend via real-time 50 & 200 DMAs.'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: 'right', minWidth: 200 }}>
            <Typography variant="caption" sx={{ color: saasTokens.text.secondary, display: 'block', fontWeight: 600 }}>
              RECOMMENDED PORTFOLIO POSTURE
            </Typography>
            <Typography variant="subtitle1" sx={{ color: saasTokens.text.primary, fontWeight: 700, mt: 0.2 }}>
              {regime.score >= 70 ? '🟢 Aggressive Momentum Capture' : regime.score >= 50 ? '🟡 Selective Watchlist Entry' : '🔴 Capital Preservation / Tight Stops'}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Spotlight: Shares Requiring Immediate Attention */}
      {attentionStocks.length > 0 && (
        <Box mb={5}>
          <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
            <NotificationsIcon sx={{ color: '#d97706', fontSize: 28 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, color: saasTokens.text.primary }}>
              Requires Immediate Attention ({attentionStocks.length})
            </Typography>
            <Chip label="Real-Time Anomalies & Breakouts" size="small" sx={{ bgcolor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 700 }} />
          </Box>

          <Grid container spacing={2.5}>
            {attentionStocks.map((stock: any) => {
              const mom = stock.latestMomentum;
              const reasons = mom?.attentionReasons?.split(" | ") || ["Unusual Momentum Activity"];
              return (
                <Grid item xs={12} md={6} lg={4} key={stock.id}>
                  <Card 
                    onClick={() => navigate(`/companies/${stock.id}`)}
                    elevation={0}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: '#ffffff',
                      border: `1px solid ${saasTokens.border.main}`,
                      borderRadius: 3,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 12px 24px rgba(15, 23, 42, 0.08)',
                        borderColor: '#cbd5e1',
                      }
                    }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 800, color: saasTokens.text.primary, lineHeight: 1.2 }}>
                            {stock.ticker}
                          </Typography>
                          <Typography variant="caption" sx={{ color: saasTokens.text.secondary }}>
                            {stock.name.length > 28 ? stock.name.substring(0, 28) + '...' : stock.name}
                          </Typography>
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: saasTokens.text.primary }}>
                          ₹{stock.currentPrice ? stock.currentPrice.toFixed(2) : 'N/A'}
                        </Typography>
                      </Box>

                      <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                        {getSignalChip(mom?.signal)}
                        {mom?.compositeScore && (
                          <Chip 
                            label={`Score: ${mom.compositeScore}`} 
                            size="small" 
                            sx={{ bgcolor: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', fontWeight: 700 }} 
                          />
                        )}
                      </Box>

                      <Divider sx={{ borderColor: saasTokens.border.main, mb: 1.5 }} />

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                        {reasons.map((r: string, idx: number) => (
                          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ color: saasTokens.text.primary, fontWeight: 600, fontSize: '0.85rem' }}>
                              • {r}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </CardContent>

                    <Box sx={{ p: 2, pt: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: saasTokens.text.secondary }}>
                      <Typography variant="caption" sx={{ color: saasTokens.text.secondary }}>
                        Stop Loss: <span style={{ color: '#e11d48', fontWeight: 700 }}>₹{mom?.stopLossPrice || 'N/A'}</span>
                      </Typography>
                      <Box display="flex" alignItems="center" sx={{ color: '#0f172a', fontWeight: 700, fontSize: '0.8rem' }}>
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

      {/* SaaS Control Bar & Filter Group */}
      <Box sx={{ bgcolor: '#ffffff', borderRadius: 3, p: 2, mb: 3, border: `1px solid ${saasTokens.border.main}`, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2, boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)' }}>
        <FilterChipGroup
          options={[
            { label: 'All Monitored Stocks', value: 'ALL' },
            { label: '⚠️ Requires Attention', value: 'ATTENTION', color: '#f59e0b' },
            { label: '🟢 High Momentum (Buy)', value: 'BUY', color: saasTokens.status.success.main },
            { label: '🟡 Watchlist', value: 'WATCHLIST', color: saasTokens.status.warning.main },
            { label: '🔴 Weakening (Exit)', value: 'EXIT', color: saasTokens.status.error.main },
          ]}
          selectedValue={selectedTab}
          onChange={(val) => setSelectedTab(val)}
        />

        <SearchInput
          value={searchQuery}
          onChange={(val) => setSearchQuery(val)}
          placeholder="Filter by Symbol or Name..."
          width={300}
        />
      </Box>

      {/* Main Multi-Factor Momentum Grid */}
      <Card elevation={0} sx={{ bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, overflow: 'hidden', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: saasTokens.background.header, borderBottom: `1px solid ${saasTokens.border.main}` }}>
                <th style={{ padding: '16px 24px', color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>EQUITY SYMBOL</th>
                <th style={{ padding: '16px', color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>LIVE PRICE</th>
                <th style={{ padding: '16px', color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>COMPOSITE RANK</th>
                <th style={{ padding: '16px', color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>RANKS: T / F / SM / D</th>
                <th style={{ padding: '16px', color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>ACTION SIGNAL</th>
                <th style={{ padding: '16px', color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>RISK & SIZING</th>
                <th style={{ padding: '16px', color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>BACKTEST ACCURACY</th>
                <th style={{ padding: '16px 24px', color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>ATTENTION TRIGGERS</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: saasTokens.text.secondary }}>
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
                        borderBottom: `1px solid ${saasTokens.border.main}`, 
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        background: '#ffffff'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                    >
                      <td style={{ padding: '16px 24px' }}>
                        <Typography sx={{ color: saasTokens.text.primary, fontWeight: 700, fontSize: '0.95rem' }}>
                          {s.ticker}
                        </Typography>
                        <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem' }}>
                          {s.name.length > 32 ? s.name.substring(0, 32) + '...' : s.name}
                        </Typography>
                      </td>
                      
                      <td style={{ padding: '16px' }}>
                        <Typography sx={{ color: saasTokens.text.primary, fontWeight: 700 }}>
                          ₹{s.currentPrice ? s.currentPrice.toFixed(2) : 'N/A'}
                        </Typography>
                        {mom?.dateCalculated && (
                          <Typography sx={{ color: saasTokens.text.disabled, fontSize: '0.7rem' }}>
                            Updated Live
                          </Typography>
                        )}
                      </td>
                      
                      <td style={{ padding: '16px', minWidth: '150px' }}>
                        {mom?.compositeScore !== null && mom?.compositeScore !== undefined ? (
                          <Box display="flex" alignItems="center" gap={1.5}>
                            <Box sx={{ flexGrow: 1, bgcolor: '#e2e8f0', borderRadius: 2, height: 8, overflow: 'hidden', minWidth: 70 }}>
                              <Box 
                                sx={{ 
                                  width: `${score}%`, 
                                  height: '100%', 
                                  background: score >= 70 ? '#059669' : score >= 50 ? '#d97706' : '#e11d48',
                                  transition: 'width 0.5s' 
                                }} 
                              />
                            </Box>
                            <Typography sx={{ fontWeight: 800, color: saasTokens.text.primary, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums' }}>
                              {score.toFixed(1)}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography sx={{ color: saasTokens.text.disabled, fontSize: '0.8rem' }}>Not Scanned</Typography>
                        )}
                      </td>
                      
                      <td style={{ padding: '16px', fontSize: '0.85rem' }}>
                        {mom ? (
                          <Box>
                            <Typography sx={{ color: saasTokens.text.primary, fontSize: '0.8rem', fontWeight: 700 }}>
                              <span title="Technical Rank">T: {mom.technicalScore ?? '-'}</span>{" | "}
                              <span title="Fundamental Rank">F: {mom.fundamentalScore ?? '-'}</span>
                            </Typography>
                            <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 600, mt: 0.3 }}>
                              <span title="Smart Money Rank">SM: {mom.smartMoneyScore ?? '-'}</span>{" | "}
                              <span title="Derivatives Rank">D: {mom.derivativesScore ?? '-'}</span>
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
                            <Typography sx={{ color: '#e11d48', fontSize: '0.85rem', fontWeight: 700 }}>
                              Stop: ₹{mom.stopLossPrice}
                            </Typography>
                            <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem' }}>
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
                            borderColor: saasTokens.border.main,
                            color: saasTokens.text.primary,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            borderRadius: 2,
                            textTransform: 'none',
                            bgcolor: '#ffffff',
                            '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' }
                          }}
                        >
                          Run 3Y Test
                        </Button>
                      </td>
                      
                      <td style={{ padding: '16px 24px' }}>
                        {reasons.length > 0 ? (
                          <Box display="flex" flexDirection="column" gap={0.5}>
                            {reasons.slice(0, 2).map((r: string, idx: number) => (
                              <Typography key={idx} sx={{ color: saasTokens.text.primary, fontSize: '0.8rem', fontWeight: 600 }}>
                                • {r}
                              </Typography>
                            ))}
                            {reasons.length > 2 && (
                              <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem' }}>
                                +{reasons.length - 2} more triggers
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          <Typography sx={{ color: saasTokens.text.disabled, fontSize: '0.8rem' }}>No anomalies detected</Typography>
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
            bgcolor: '#ffffff',
            backgroundImage: 'none',
            border: `1px solid ${saasTokens.border.main}`,
            borderRadius: 3.5,
            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)',
            color: saasTokens.text.primary,
            p: 1
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <AssessmentIcon sx={{ color: '#0f172a', fontSize: 26 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, color: saasTokens.text.primary, letterSpacing: '0.01rem' }}>
              {backtestTicker} — Intensive Historical Backtest Accuracy Report
            </Typography>
            <Chip 
              label={`${backtestYears}-Year Horizon`} 
              size="small" 
              sx={{ bgcolor: '#f1f5f9', border: `1px solid ${saasTokens.border.main}`, color: '#0f172a', fontWeight: 700, borderRadius: 2 }} 
            />
          </Box>
          <IconButton onClick={() => setBacktestTicker(null)} sx={{ color: saasTokens.text.secondary, '&:hover': { color: saasTokens.text.primary } }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Divider sx={{ borderColor: saasTokens.border.main }} />

        <DialogContent sx={{ minHeight: 400, pt: 3 }}>
          {backtestLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={350} gap={3}>
              <CircularProgress size={48} sx={{ color: '#0f172a' }} />
              <Typography sx={{ color: saasTokens.text.primary, fontWeight: 600, fontSize: '1.1rem' }}>
                Simulating rolling multi-factor momentum & ML probability hit rates across {backtestYears} years of live NSE OHLCV...
              </Typography>
              <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.9rem', maxWidth: 500, textAlign: 'center' }}>
                Deducting real-world Indian transaction costs (0.20% STT, Brokerage & Stamp Duty) to calculate strict net performance.
              </Typography>
            </Box>
          ) : backtestData?.getIntensiveBacktest ? (
            <Box display="flex" flexDirection="column" gap={4}>
              {/* Executive Portfolio Strategy KPI Cards */}
              <Grid container spacing={2.5}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card elevation={0} sx={{ bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, p: 2, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
                    <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Net Win Rate (%)
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: (backtestData.getIntensiveBacktest.momentumPerformance?.winRatePct ?? 0) >= 50 ? '#059669' : '#d97706' }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.winRatePct ?? 0}%
                      </Typography>
                      <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.85rem' }}>
                        ({backtestData.getIntensiveBacktest.momentumPerformance?.totalTrades ?? 0} Trades)
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(100, backtestData.getIntensiveBacktest.momentumPerformance?.winRatePct ?? 0)} 
                      sx={{ height: 6, borderRadius: 2, bgcolor: '#e2e8f0', mt: 1.5, '& .MuiLinearProgress-bar': { bgcolor: '#059669' } }}
                    />
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card elevation={0} sx={{ bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, p: 2, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
                    <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Sharpe / Sortino Ratio
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1.5} mt={1}>
                      <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: (backtestData.getIntensiveBacktest.momentumPerformance?.sharpeRatio ?? 0) >= 1 ? '#0f172a' : '#64748b' }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.sharpeRatio ?? '0.0'}
                      </Typography>
                      <Typography sx={{ color: '#0f172a', fontWeight: 700, fontSize: '1.1rem' }}>
                        / {backtestData.getIntensiveBacktest.momentumPerformance?.sortinoRatio ?? '0.0'}
                      </Typography>
                    </Box>
                    <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem', mt: 1.5 }}>
                      Risk-free benchmark: 6.5% Indian 10Y T-Bill
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card elevation={0} sx={{ bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, p: 2, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
                    <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Nifty 50 Alpha (%)
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: (backtestData.getIntensiveBacktest.momentumPerformance?.alphaVsNiftyPct ?? 0) >= 0 ? '#059669' : '#e11d48' }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.alphaVsNiftyPct ?? 0}%
                      </Typography>
                      <Chip label="Net Return" size="small" sx={{ bgcolor: '#d1fae5', color: '#065f46', fontSize: '0.7rem', fontWeight: 700 }} />
                    </Box>
                    <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem', mt: 1.5 }}>
                      Nifty Benchmark Return: {backtestData.getIntensiveBacktest.benchmarkNiftyReturnPct ?? 0}%
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card elevation={0} sx={{ bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, p: 2, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
                    <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      ML Directional Hit Rate
                    </Typography>
                    <Box display="flex" alignItems="baseline" gap={1} mt={1}>
                      <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
                        {backtestData.getIntensiveBacktest.momentumPerformance?.mlHitRatePct ?? 0}%
                      </Typography>
                    </Box>
                    <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.75rem', mt: 1.5 }}>
                      Brier Score: {backtestData.getIntensiveBacktest.momentumPerformance?.brierScore ?? 0.25} (Lower = Cleaner)
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* Event Strategy Breakdown (Strategies A-F) */}
              <Box>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: saasTokens.text.primary, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShieldIcon sx={{ color: '#0f172a' }} /> Quantitative Earnings & Catalyst Strategies (A — F) Accuracy
                </Typography>
                <Card elevation={0} sx={{ bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, overflow: 'hidden', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: saasTokens.background.header, borderBottom: `1px solid ${saasTokens.border.main}` }}>
                        <th style={{ padding: '14px 20px', color: saasTokens.text.secondary, fontWeight: 700 }}>STRATEGY CODE & LOGIC</th>
                        <th style={{ padding: '14px 16px', color: saasTokens.text.secondary, fontWeight: 700 }}>TOTAL TRADES</th>
                        <th style={{ padding: '14px 16px', color: saasTokens.text.secondary, fontWeight: 700 }}>WIN RATE</th>
                        <th style={{ padding: '14px 16px', color: saasTokens.text.secondary, fontWeight: 700 }}>AVG GAIN / LOSS</th>
                        <th style={{ padding: '14px 16px', color: saasTokens.text.secondary, fontWeight: 700 }}>EXPECTED VALUE (EV)</th>
                        <th style={{ padding: '14px 20px', color: saasTokens.text.secondary, fontWeight: 700 }}>PROFIT FACTOR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!backtestData.getIntensiveBacktest.eventStrategies || backtestData.getIntensiveBacktest.eventStrategies.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: saasTokens.text.secondary }}>
                            No corporate earnings event patterns triggered in this timeframe.
                          </td>
                        </tr>
                      ) : (
                        backtestData.getIntensiveBacktest.eventStrategies.map((est: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: `1px solid ${saasTokens.border.main}` }}>
                            <td style={{ padding: '14px 20px', color: saasTokens.text.primary, fontWeight: 700 }}>
                              Strategy {est.strategyName} {est.strategyName === 'A' ? '(PEAD Breakout)' : est.strategyName === 'C' ? '(Vol Breakout)' : est.strategyName === 'D' ? '(Gap & Go)' : est.strategyName === 'E' ? '(Pre-Runup)' : ''}
                            </td>
                            <td style={{ padding: '14px 16px', color: saasTokens.text.secondary }}>{est.totalTrades ?? 0}</td>
                            <td style={{ padding: '14px 16px', color: (est.winRate ?? 0) >= 50 ? '#059669' : '#d97706', fontWeight: 700 }}>
                              {est.winRate ? `${est.winRate.toFixed(1)}%` : '0%'}
                            </td>
                            <td style={{ padding: '14px 16px', color: saasTokens.text.secondary }}>
                              <span style={{ color: '#059669' }}>+{est.avgGain?.toFixed(1) ?? 0}%</span> / <span style={{ color: '#e11d48' }}>{est.avgLoss?.toFixed(1) ?? 0}%</span>
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: 800, color: (est.expectedValue ?? 0) >= 0 ? '#0f172a' : '#e11d48' }}>
                              {est.expectedValue ? `${est.expectedValue >= 0 ? '+' : ''}${est.expectedValue.toFixed(2)}%` : '0.0%'}
                            </td>
                            <td style={{ padding: '14px 20px' }}>
                              <Chip 
                                label={est.profitFactor?.toFixed(2) ?? '0.0'} 
                                size="small" 
                                sx={{ 
                                  bgcolor: (est.profitFactor ?? 0) >= 1.3 ? '#d1fae5' : '#fef3c7', 
                                  color: (est.profitFactor ?? 0) >= 1.3 ? '#065f46' : '#92400e', 
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
              <Typography sx={{ color: '#e11d48', fontWeight: 700 }}>
                Unable to simulate historical data for {backtestTicker}. Ensure live NSE feed is reachable.
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2.5, bgcolor: '#f8fafc', borderTop: `1px solid ${saasTokens.border.main}` }}>
          <Box display="flex" gap={1.5} flexGrow={1} pl={1}>
            <Button 
              size="small" 
              variant={backtestYears === 1 ? "contained" : "outlined"}
              onClick={() => setBacktestYears(1)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, bgcolor: backtestYears === 1 ? '#0f172a' : '#ffffff', color: backtestYears === 1 ? '#ffffff' : saasTokens.text.primary, borderColor: saasTokens.border.main, '&:hover': { bgcolor: backtestYears === 1 ? '#1e293b' : '#f1f5f9' } }}
            >
              1-Year Test
            </Button>
            <Button 
              size="small" 
              variant={backtestYears === 3 ? "contained" : "outlined"}
              onClick={() => setBacktestYears(3)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, bgcolor: backtestYears === 3 ? '#0f172a' : '#ffffff', color: backtestYears === 3 ? '#ffffff' : saasTokens.text.primary, borderColor: saasTokens.border.main, '&:hover': { bgcolor: backtestYears === 3 ? '#1e293b' : '#f1f5f9' } }}
            >
              3-Year Test (Default)
            </Button>
            <Button 
              size="small" 
              variant={backtestYears === 5 ? "contained" : "outlined"}
              onClick={() => setBacktestYears(5)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, bgcolor: backtestYears === 5 ? '#0f172a' : '#ffffff', color: backtestYears === 5 ? '#ffffff' : saasTokens.text.primary, borderColor: saasTokens.border.main, '&:hover': { bgcolor: backtestYears === 5 ? '#1e293b' : '#f1f5f9' } }}
            >
              5-Year Test
            </Button>
          </Box>
          <Button onClick={() => setBacktestTicker(null)} variant="contained" sx={{ bgcolor: '#0f172a', color: '#ffffff', fontWeight: 800, borderRadius: 2.5, px: 3, '&:hover': { bgcolor: '#1e293b' } }}>
            Close Analytical Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MomentumTracker;
