import React from 'react';
import { Typography, Grid, Paper, Box } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import { saasTokens } from '../theme/theme';

const Dashboard: React.FC = () => {
  return (
    <Box sx={{ p: { xs: 2, md: 3.5 } }}>
      <Typography variant="h4" sx={{ color: saasTokens.text.primary, fontWeight: 800, mb: 1, letterSpacing: '-0.02em' }}>
        Welcome to VD Quant Lab
      </Typography>
      <Typography variant="body1" sx={{ color: saasTokens.text.secondary, maxWidth: 700, mb: 3, lineHeight: 1.6 }}>
        AI-Powered Quarterly Earnings Prediction System. Navigate to the Companies screen to view and generate predictions for our supported tickers across NSE & BSE.
      </Typography>

      <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 3.5, display: 'flex', alignItems: 'center', gap: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)' }}>
            <Box sx={{ bgcolor: '#f1f5f9', p: 2, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUpIcon sx={{ color: '#0f172a', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: saasTokens.text.primary, mb: 0.5 }}>Accuracy Tracking</Typography>
              <Typography variant="body2" sx={{ color: saasTokens.text.secondary, lineHeight: 1.5 }}>Historical predictions tracked and reconciled directly against actual reported EPS.</Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 3.5, display: 'flex', alignItems: 'center', gap: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)' }}>
            <Box sx={{ bgcolor: '#f1f5f9', p: 2, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AutorenewIcon sx={{ color: '#0f172a', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: saasTokens.text.primary, mb: 0.5 }}>Background Processing</Typography>
              <Typography variant="body2" sx={{ color: saasTokens.text.secondary, lineHeight: 1.5 }}>Predictions are generated reliably in the background using Docker & Celery workers.</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
