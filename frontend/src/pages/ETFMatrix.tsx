import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Typography, Card, CardContent, Button, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress,
  Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Alert, AlertTitle, Tooltip, IconButton, CircularProgress
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import TuneIcon from '@mui/icons-material/Tune';
import TimelineIcon from '@mui/icons-material/Timeline';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SellIcon from '@mui/icons-material/Sell';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from 'recharts';
import { apiUrl } from '../utils/api';

interface ETFSummary {
  total_capital: number;
  slot_capital: number;
  total_slots: number;
  used_slots: number;
  available_slots: number;
  available_cash: number;
  total_invested: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  realized_pnl: number;
  win_rate: number;
  active_positions_count: number;
  total_trades_count: number;
  last_scan_time: string | null;
  latest_recommendation: string;
  top_dip_symbol: string | null;
  top_dip_pct: number | null;
}

interface ETFPositionItem {
  id: string;
  symbol: string;
  name: string;
  category: string;
  total_quantity: number;
  average_price: number;
  current_price: number;
  invested_amount: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  target_profit_pct: number;
  target_exit_price: number;
  last_buy_price: number;
  slot_count: number;
  status: string;
  first_bought_at: string;
  last_bought_at: string;
}

interface ETFUniverseItem {
  id: string;
  symbol: string;
  name: string;
  category: string;
  underlying_index: string;
  current_price: number;
  prev_close: number;
  day_change_pct: number;
}

interface ETFTradeItem {
  id: string;
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  total_amount: number;
  reason: string;
  realized_pnl: number;
  executed_at: string;
  notes: string;
}

interface ETFSignals {
  exit_signals: any[];
  entry_candidate: any;
  ranked_universe: any[];
  averaging_dip_pct: number;
}

const ETFMatrix: React.FC = () => {
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [summary, setSummary] = useState<ETFSummary | null>(null);
  const [positions, setPositions] = useState<ETFPositionItem[]>([]);
  const [universe, setUniverse] = useState<ETFUniverseItem[]>([]);
  const [trades, setTrades] = useState<ETFTradeItem[]>([]);
  const [signals, setSignals] = useState<ETFSignals | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Settings Modal State
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [slotCapitalInput, setSlotCapitalInput] = useState<number>(25000);
  const [targetProfitInput, setTargetProfitInput] = useState<number>(6.0);
  const [averagingDipInput, setAveragingDipInput] = useState<number>(2.5);
  const [totalCapitalInput, setTotalCapitalInput] = useState<number>(500000);

  // Backtest Modal State
  const [backtestOpen, setBacktestOpen] = useState<boolean>(false);
  const [backtestLoading, setBacktestLoading] = useState<boolean>(false);
  const [backtestResults, setBacktestResults] = useState<any>(null);
  const [lookbackYears, setLookbackYears] = useState<number>(2);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [sumRes, posRes, uniRes, traRes, sigRes] = await Promise.all([
        fetch(apiUrl('/api/etf-matrix/summary')).then(r => r.json()),
        fetch(apiUrl('/api/etf-matrix/positions')).then(r => r.json()),
        fetch(apiUrl('/api/etf-matrix/universe')).then(r => r.json()),
        fetch(apiUrl('/api/etf-matrix/trades')).then(r => r.json()),
        fetch(apiUrl('/api/etf-matrix/signals')).then(r => r.json()),
      ]);

      setSummary(sumRes);
      setPositions(posRes);
      setUniverse(uniRes);
      setTrades(traRes);
      setSignals(sigRes);

      if (sumRes) {
        setSlotCapitalInput(sumRes.slot_capital || 25000);
        setTotalCapitalInput(sumRes.total_capital || 500000);
      }
    } catch (err: any) {
      console.error('Error loading ETF Matrix data:', err);
      setActionMsg({ type: 'error', text: 'Failed to load ETF Matrix data from server.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleRunScan = async (autoExecute: boolean = false) => {
    setScanning(true);
    setActionMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/etf-matrix/scan?auto_execute=${autoExecute}`), { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setActionMsg({ type: 'error', text: `Scan error: ${data.error}` });
      } else {
        const candidate = data.chosen_candidate;
        if (candidate && candidate.qualifies) {
          setActionMsg({
            type: 'success',
            text: `Scan complete: ${candidate.symbol} is top dip (${candidate.day_change_pct > 0 ? '+' : ''}${candidate.day_change_pct}%). Recommendation: ${candidate.action_type}`
          });
        } else {
          setActionMsg({ type: 'info', text: 'Scan complete: No new ETF dip meets the entry/averaging criteria today.' });
        }
        await fetchAllData();
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `Failed to execute scan: ${err.message}` });
    } finally {
      setScanning(false);
    }
  };

  const handleManualBuy = async (symbol: string, reason: string = 'MANUAL') => {
    try {
      const res = await fetch(apiUrl('/api/etf-matrix/buy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, reason })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setActionMsg({ type: 'success', text: `Successfully bought ${data.quantity} units of ${data.symbol} @ ₹${data.price}` });
        fetchAllData();
      } else {
        setActionMsg({ type: 'error', text: data.detail || 'Buy order failed' });
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `Buy failed: ${err.message}` });
    }
  };

  const handleManualSell = async (symbol: string) => {
    try {
      const res = await fetch(apiUrl('/api/etf-matrix/sell'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, reason: 'PROFIT_BOOKING' })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setActionMsg({
          type: 'success',
          text: `Sold ${data.symbol} position @ ₹${data.price}! Realized PnL: ₹${data.realized_pnl > 0 ? '+' : ''}${data.realized_pnl}`
        });
        fetchAllData();
      } else {
        setActionMsg({ type: 'error', text: data.detail || 'Sell order failed' });
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `Sell failed: ${err.message}` });
    }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch(apiUrl('/api/etf-matrix/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_capital: slotCapitalInput,
          target_profit_pct: targetProfitInput,
          averaging_dip_pct: averagingDipInput,
          total_capital: totalCapitalInput
        })
      });
      setSettingsOpen(false);
      setActionMsg({ type: 'success', text: 'ETF Matrix configuration updated successfully.' });
      fetchAllData();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `Config save error: ${err.message}` });
    }
  };

  const handleRunBacktest = async () => {
    setBacktestLoading(true);
    try {
      const res = await fetch(apiUrl('/api/etf-matrix/backtest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookback_years: lookbackYears,
          slot_capital: slotCapitalInput,
          profit_target_pct: targetProfitInput,
          averaging_dip_pct: averagingDipInput
        })
      });
      const data = await res.json();
      setBacktestResults(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setBacktestLoading(false);
    }
  };

  const candidate = signals?.entry_candidate;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header Banner */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2, mb: 3 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.5px' }}>
              ETF Matrix
            </Typography>
            <Chip label="ETF Engine" color="primary" size="small" sx={{ fontWeight: 700, fontSize: '0.75rem' }} />
            <Chip label="NSE Live" variant="outlined" color="success" size="small" sx={{ fontWeight: 600 }} />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Systematic Indian ETF dip accumulation & 6% profit-booking mean reversion strategy
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={scanning ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
            onClick={() => handleRunScan(false)}
            disabled={scanning}
            sx={{ fontWeight: 700, textTransform: 'none' }}
          >
            {scanning ? 'Scanning NSE...' : 'Run Market Scan'}
          </Button>

          <Button
            variant="outlined"
            color="info"
            startIcon={<TimelineIcon />}
            onClick={() => { setBacktestOpen(true); if (!backtestResults) handleRunBacktest(); }}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Backtest Strategy
          </Button>

          <Button
            variant="outlined"
            startIcon={<TuneIcon />}
            onClick={() => setSettingsOpen(true)}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Settings
          </Button>

          <IconButton onClick={fetchAllData} disabled={loading} color="inherit">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {actionMsg && (
        <Alert severity={actionMsg.type} sx={{ mb: 3 }} onClose={() => setActionMsg(null)}>
          {actionMsg.text}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Total Portfolio
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                ₹{summary?.total_capital?.toLocaleString('en-IN') || '5,00,000'}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Available Cash:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>₹{summary?.available_cash?.toLocaleString('en-IN') || '0'}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Active Invested
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                ₹{summary?.total_invested?.toLocaleString('en-IN') || '0'}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Current Value:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>₹{summary?.current_value?.toLocaleString('en-IN') || '0'}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Unrealized P&L
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.5 }}>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 800,
                    color: (summary?.unrealized_pnl || 0) >= 0 ? 'success.main' : 'error.main'
                  }}
                >
                  ₹{(summary?.unrealized_pnl || 0) >= 0 ? '+' : ''}{summary?.unrealized_pnl?.toLocaleString('en-IN') || '0'}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: (summary?.unrealized_pnl_pct || 0) >= 0 ? 'success.main' : 'error.main'
                  }}
                >
                  ({(summary?.unrealized_pnl_pct || 0) >= 0 ? '+' : ''}{summary?.unrealized_pnl_pct || 0}%)
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Open Positions:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{summary?.active_positions_count || 0}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Realized Profits
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  mt: 0.5,
                  color: (summary?.realized_pnl || 0) >= 0 ? 'success.main' : 'text.primary'
                }}
              >
                ₹{(summary?.realized_pnl || 0) >= 0 ? '+' : ''}{summary?.realized_pnl?.toLocaleString('en-IN') || '0'}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Win Rate:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
                  {summary?.win_rate || 100}%
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Slot Allocation
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                {summary?.used_slots || 0} / {summary?.total_slots || 20} Slots
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={((summary?.used_slots || 0) / (summary?.total_slots || 20)) * 100}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Strategic Recommendation Banner */}
      {candidate ? (
        <Card
          sx={{
            mb: 3,
            border: '2px solid',
            borderColor: candidate.action_type === 'FRESH_BUY' ? 'primary.main' : 'warning.main',
            bgcolor: 'background.paper',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { md: 'center' }, gap: 2 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <Chip
                    label={candidate.action_type === 'FRESH_BUY' ? 'TODAY\'S TOP DIP: FRESH BUY' : 'DIP AVERAGING TRIGGERED'}
                    color={candidate.action_type === 'FRESH_BUY' ? 'primary' : 'warning'}
                    sx={{ fontWeight: 800 }}
                  />
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    {candidate.symbol} ({candidate.name})
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: candidate.day_change_pct < 0 ? 'error.main' : 'success.main'
                    }}
                  >
                    {candidate.day_change_pct > 0 ? '+' : ''}{candidate.day_change_pct}% Today
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  <strong>Current Price:</strong> ₹{candidate.current_price} &bull; <strong>Strategy Rule:</strong> {candidate.reason}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<AddShoppingCartIcon />}
                  onClick={() => handleManualBuy(candidate.symbol, candidate.action_type)}
                  sx={{ fontWeight: 700, px: 3, textTransform: 'none' }}
                >
                  Buy 1 Slot (₹{summary?.slot_capital?.toLocaleString('en-IN') || '25,000'})
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ mb: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No pending entry signal. Run a Market Scan above to check live NSE ETF dip rankings.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Card sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={tabIndex} onChange={(_, newVal) => setTabIndex(newVal)}>
            <Tab label={`Active Positions (${positions.length})`} sx={{ fontWeight: 700, textTransform: 'none' }} />
            <Tab label={`ETF Universe & Dips (${universe.length})`} sx={{ fontWeight: 700, textTransform: 'none' }} />
            <Tab label={`Trade Log (${trades.length})`} sx={{ fontWeight: 700, textTransform: 'none' }} />
          </Tabs>
        </Box>

        {/* Tab 0: Active Positions */}
        {tabIndex === 0 && (
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Symbol / Category</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Qty (Slots)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Avg Buy Price</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Current Price</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Invested Amount</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Current Value</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Unrealized P&L</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Target Exit (6%)</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {positions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No active ETF positions. Click "Run Market Scan" above to discover today's top dip opportunity.
                    </TableCell>
                  </TableRow>
                ) : (
                  positions.map((pos) => {
                    const isTargetHit = pos.unrealized_pnl_pct >= pos.target_profit_pct;
                    const progress = Math.max(0, Math.min(100, (pos.unrealized_pnl_pct / pos.target_profit_pct) * 100));

                    return (
                      <TableRow key={pos.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {pos.symbol}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {pos.name || pos.category}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {pos.total_quantity}
                          </Typography>
                          <Chip label={`${pos.slot_count} slot`} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                        </TableCell>
                        <TableCell align="right">₹{pos.average_price.toFixed(2)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>₹{pos.current_price.toFixed(2)}</TableCell>
                        <TableCell align="right">₹{pos.invested_amount.toLocaleString('en-IN')}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>₹{pos.current_value.toLocaleString('en-IN')}</TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 800,
                              color: pos.unrealized_pnl >= 0 ? 'success.main' : 'error.main'
                            }}
                          >
                            ₹{pos.unrealized_pnl >= 0 ? '+' : ''}{pos.unrealized_pnl.toFixed(2)}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 700,
                              color: pos.unrealized_pnl_pct >= 0 ? 'success.main' : 'error.main'
                            }}
                          >
                            ({pos.unrealized_pnl_pct >= 0 ? '+' : ''}{pos.unrealized_pnl_pct.toFixed(2)}%)
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ minWidth: 160 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: isTargetHit ? 'success.main' : 'text.secondary' }}>
                              ₹{pos.target_exit_price.toFixed(2)}
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: isTargetHit ? 'success.main' : 'text.secondary' }}>
                              {progress.toFixed(0)}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={progress}
                            color={isTargetHit ? 'success' : 'primary'}
                            sx={{ height: 6, borderRadius: 3 }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Button
                            variant={isTargetHit ? 'contained' : 'outlined'}
                            color={isTargetHit ? 'success' : 'primary'}
                            size="small"
                            startIcon={<SellIcon sx={{ fontSize: 16 }} />}
                            onClick={() => handleManualSell(pos.symbol)}
                            sx={{ textTransform: 'none', fontWeight: 700 }}
                          >
                            {isTargetHit ? 'Book Profit' : 'Sell'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Tab 1: ETF Universe */}
        {tabIndex === 1 && (
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Symbol</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Name / Category</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Current Price</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Prev Close</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Today's Change %</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Portfolio Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Quick Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {universe.map((item) => {
                  const isHeld = positions.some(p => p.symbol === item.symbol);
                  return (
                    <TableRow key={item.id} hover>
                      <TableCell sx={{ fontWeight: 800 }}>{item.symbol}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.name}</Typography>
                        <Chip label={item.category} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>₹{item.current_price.toFixed(2)}</TableCell>
                      <TableCell align="right">₹{item.prev_close.toFixed(2)}</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${item.day_change_pct > 0 ? '+' : ''}${item.day_change_pct.toFixed(2)}%`}
                          color={item.day_change_pct < 0 ? 'error' : 'success'}
                          size="small"
                          sx={{ fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        {isHeld ? (
                          <Chip label="Held in Portfolio" color="info" size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                        ) : (
                          <Chip label="Available" color="default" size="small" sx={{ fontWeight: 500 }} />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleManualBuy(item.symbol, isHeld ? 'DIP_AVERAGING' : 'FRESH_BUY')}
                          sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                          {isHeld ? 'Add Slot' : 'Buy'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Tab 2: Trade Log */}
        {tabIndex === 2 && (
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Date & Time</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Symbol</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Action</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Quantity</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Execution Price</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Total Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Strategy Reason</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Realized P&L</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trades.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No trades executed yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  trades.map((tr) => (
                    <TableRow key={tr.id} hover>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                        {tr.executed_at ? new Date(tr.executed_at).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>{tr.symbol}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={tr.action}
                          color={tr.action === 'BUY' ? 'primary' : 'success'}
                          size="small"
                          sx={{ fontWeight: 800 }}
                        />
                      </TableCell>
                      <TableCell align="right">{tr.quantity}</TableCell>
                      <TableCell align="right">₹{tr.price.toFixed(2)}</TableCell>
                      <TableCell align="right">₹{tr.total_amount.toLocaleString('en-IN')}</TableCell>
                      <TableCell>
                        <Chip label={tr.reason} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                      </TableCell>
                      <TableCell align="right">
                        {tr.action === 'SELL' ? (
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 800,
                              color: tr.realized_pnl >= 0 ? 'success.main' : 'error.main'
                            }}
                          >
                            ₹{tr.realized_pnl >= 0 ? '+' : ''}{tr.realized_pnl.toFixed(2)}
                          </Typography>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>ETF Matrix Settings</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            label="Total Portfolio Capital (₹)"
            type="number"
            fullWidth
            value={totalCapitalInput}
            onChange={(e) => setTotalCapitalInput(Number(e.target.value))}
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            label="Slot Capital (₹ per purchase)"
            type="number"
            fullWidth
            value={slotCapitalInput}
            onChange={(e) => setSlotCapitalInput(Number(e.target.value))}
            helperText="Amount allocated per single dip order"
            sx={{ mb: 2 }}
          />
          <TextField
            label="Target Profit Exit % (Default: 6%)"
            type="number"
            fullWidth
            value={targetProfitInput}
            onChange={(e) => setTargetProfitInput(Number(e.target.value))}
            helperText="Standard strategy exit threshold"
            sx={{ mb: 2 }}
          />
          <TextField
            label="Averaging Dip Threshold % (Default: 2.5%)"
            type="number"
            fullWidth
            value={averagingDipInput}
            onChange={(e) => setAveragingDipInput(Number(e.target.value))}
            helperText="Minimum drop below last buy price before adding another slot"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSettings} sx={{ fontWeight: 700 }}>
            Save Configuration
          </Button>
        </DialogActions>
      </Dialog>

      {/* Backtest Dialog */}
      <Dialog open={backtestOpen} onClose={() => setBacktestOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          ETF Matrix Historical Backtest
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
            <TextField
              select
              label="Lookback Period"
              value={lookbackYears}
              onChange={(e) => setLookbackYears(Number(e.target.value))}
              SelectProps={{ native: true }}
              size="small"
              sx={{ minWidth: 150 }}
            >
              <option value={1}>1 Year</option>
              <option value={2}>2 Years</option>
              <option value={3}>3 Years</option>
              <option value={5}>5 Years</option>
            </TextField>
            <Button
              variant="contained"
              onClick={handleRunBacktest}
              disabled={backtestLoading}
              startIcon={backtestLoading ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
              sx={{ fontWeight: 700 }}
            >
              {backtestLoading ? 'Simulating...' : 'Run Simulation'}
            </Button>
          </Box>

          {backtestResults && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 1.5, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">Total Return</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'success.main' }}>
                      +{backtestResults.total_return_pct}%
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 1.5, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">CAGR</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
                      {backtestResults.cagr}%
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 1.5, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">Win Rate</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'success.main' }}>
                      {backtestResults.win_rate}%
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 1.5, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">Max Drawdown</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'error.main' }}>
                      -{backtestResults.max_drawdown_pct}%
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {backtestResults.equity_curve && (
                <Box sx={{ height: 280, width: '100%' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Equity Curve Growth (₹)
                  </Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={backtestResults.equity_curve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#444' }} />
                      <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setBacktestOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ETFMatrix;
