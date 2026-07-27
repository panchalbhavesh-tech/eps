import React from 'react';
import { Typography, Grid, Paper, Box } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AutorenewIcon from '@mui/icons-material/Autorenew';

const Dashboard: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" color="text.primary" gutterBottom>
        Welcome to QEPS
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        AI-Powered Quarterly Earnings Prediction System. Navigate to the Companies tab to view and generate predictions for our supported tickers.
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'background.paper' }}>
            <Box sx={{ bgcolor: 'rgba(124, 77, 255, 0.2)', p: 2, borderRadius: 2 }}>
              <TrendingUpIcon color="primary" fontSize="large" />
            </Box>
            <Box>
              <Typography variant="h6">Accuracy Tracking</Typography>
              <Typography variant="body2" color="text.secondary">Historical predictions tracked against actual reported EPS.</Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'background.paper' }}>
            <Box sx={{ bgcolor: 'rgba(0, 229, 255, 0.2)', p: 2, borderRadius: 2 }}>
              <AutorenewIcon color="secondary" fontSize="large" />
            </Box>
            <Box>
              <Typography variant="h6">Background Processing</Typography>
              <Typography variant="body2" color="text.secondary">Predictions are generated securely using Celery workers.</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
