import React, { useState } from 'react';
import { Box, Typography, Button, TextField, Grid, Card, CardContent, CircularProgress } from '@mui/material';
import { useLazyQuery, gql } from '@apollo/client';
import { useThemeMode } from '../theme/ThemeContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const RUN_PORTFOLIO_SIMULATION = gql`
  query RunPortfolioSimulation($startDate: String!, $endDate: String!) {
    runPortfolioSimulation(startDate: $startDate, endDate: $endDate) {
      startDate
      endDate
      equityCurve
      sharpeRatio
      maxDrawdownPct
    }
  }
`;

const PortfolioSimulator: React.FC = () => {
  const { tokens } = useThemeMode();
  const [startDate, setStartDate] = useState('2020-01-01');
  const [endDate, setEndDate] = useState('2021-01-01');

  const [runSimulation, { data, loading, error }] = useLazyQuery(RUN_PORTFOLIO_SIMULATION);

  const handleRun = () => {
    runSimulation({ variables: { startDate, endDate } });
  };

  // Convert equityCurve array to recharts format
  const chartData = data?.runPortfolioSimulation?.equityCurve?.map((val: number, idx: number) => ({
    day: idx,
    equity: val
  })) || [];

  return (
    <Box sx={{ p: 4, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h5" sx={{ color: tokens.text.primary, fontWeight: 700, mb: 3 }}>
        Portfolio Simulation Engine
      </Typography>

      <Card sx={{ bgcolor: tokens.background.card, border: `1px solid ${tokens.border.main}`, mb: 4 }}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField 
            label="Start Date" 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ input: { color: tokens.text.primary } }}
          />
          <TextField 
            label="End Date" 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ input: { color: tokens.text.primary } }}
          />
          <Button 
            variant="contained" 
            onClick={handleRun}
            disabled={loading}
            sx={{ bgcolor: tokens.primary.main, color: '#fff', '&:hover': { bgcolor: tokens.primary.dark } }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Run Simulation'}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>Error: {error.message}</Typography>
      )}

      {data?.runPortfolioSimulation && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card sx={{ bgcolor: tokens.background.card, border: `1px solid ${tokens.border.main}` }}>
              <CardContent>
                <Typography sx={{ color: tokens.text.secondary, fontSize: 14 }}>Sharpe Ratio</Typography>
                <Typography sx={{ color: tokens.text.primary, fontSize: 24, fontWeight: 600 }}>
                  {data.runPortfolioSimulation.sharpeRatio}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ bgcolor: tokens.background.card, border: `1px solid ${tokens.border.main}` }}>
              <CardContent>
                <Typography sx={{ color: tokens.text.secondary, fontSize: 14 }}>Max Drawdown</Typography>
                <Typography sx={{ color: tokens.status.error.main, fontSize: 24, fontWeight: 600 }}>
                  {data.runPortfolioSimulation.maxDrawdownPct}%
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card sx={{ bgcolor: tokens.background.card, border: `1px solid ${tokens.border.main}`, p: 2 }}>
              <Typography sx={{ color: tokens.text.primary, mb: 2, fontWeight: 600 }}>Equity Curve</Typography>
              <Box sx={{ height: 400, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={tokens.border.main} />
                    <XAxis dataKey="day" stroke={tokens.text.secondary} />
                    <YAxis stroke={tokens.text.secondary} domain={['dataMin', 'dataMax']} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: tokens.background.paper, borderColor: tokens.border.main, color: tokens.text.primary }}
                      itemStyle={{ color: tokens.text.primary }}
                    />
                    <Line type="monotone" dataKey="equity" stroke={tokens.primary.main} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default PortfolioSimulator;
