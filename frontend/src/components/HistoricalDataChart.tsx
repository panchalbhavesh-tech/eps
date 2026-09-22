import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { ResponsiveContainer, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, Bar, ComposedChart } from 'recharts';
import { useThemeMode } from '../theme/ThemeContext';

interface HistoricalDataChartProps {
  ticker: string;
}

interface OHLCVRecord {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

const HistoricalDataChart: React.FC<HistoricalDataChartProps> = ({ ticker }) => {
  const { tokens } = useThemeMode();
  const [data, setData] = useState<OHLCVRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Use relative URL so it goes through Nginx on port 8080.
        // Fallback to non-/api prefix for live VPS if needed.
        let response = await fetch(`/api/data_lake/ohlcv/${ticker}`);
        if (!response.ok && response.status === 404) {
          response = await fetch(`/data_lake/ohlcv/${ticker}`);
        }
        
        if (!response.ok) {
          throw new Error(`Failed to fetch historical data (Status: ${response.status}).`);
        }
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Received non-JSON response from server. Please check API routing.");
        }
        
        const result = await response.json();
        result.sort((a: any, b: any) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
        setData(result);
      } catch (err: any) {
        setError(err.message || 'Error fetching data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [ticker]);

  const columns: GridColDef[] = [
    { field: 'Date', headerName: 'Date', width: 120 },
    { field: 'Open', headerName: 'Open', width: 120, type: 'number' },
    { field: 'High', headerName: 'High', width: 120, type: 'number' },
    { field: 'Low', headerName: 'Low', width: 120, type: 'number' },
    { field: 'Close', headerName: 'Close', width: 120, type: 'number' },
    { field: 'Volume', headerName: 'Volume', width: 160, type: 'number' },
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
    );
  }

  if (data.length === 0) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>No data available for {ticker}</Alert>
    );
  }

  const formatVolume = (value: number) => {
    if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
    if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    return value.toString();
  };

  const formatPrice = (value: number) => {
    return '₹' + value.toFixed(0);
  };

  return (
    <Box sx={{ width: '100%', mt: 1 }}>
      <Typography variant="h6" sx={{ mb: 2, color: tokens.text.primary }}>
        {ticker} Historical Data
      </Typography>
      
      <Box sx={{ width: '100%', height: 400, mb: 4, bgcolor: tokens.background.card, p: 2, borderRadius: 3, border: `1px solid ${tokens.border.main}`, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={tokens.primary.main} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={tokens.primary.main} stopOpacity={0.0}/>
              </linearGradient>
              <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={tokens.accent.main} stopOpacity={0.5}/>
                <stop offset="95%" stopColor={tokens.accent.main} stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={tokens.border.main} vertical={false} strokeOpacity={0.4} />
            <XAxis 
                dataKey="Date" 
                tick={{ fill: tokens.text.secondary, fontSize: 11 }} 
                minTickGap={40}
                axisLine={false}
                tickLine={false}
                dy={10}
            />
            <YAxis 
                yAxisId="left" 
                tick={{ fill: tokens.text.secondary, fontSize: 11 }} 
                domain={['auto', 'auto']} 
                tickFormatter={formatPrice}
                axisLine={false}
                tickLine={false}
                dx={-10}
            />
            <YAxis 
                yAxisId="right" 
                orientation="right" 
                tick={{ fill: tokens.text.secondary, fontSize: 11 }} 
                tickFormatter={formatVolume}
                axisLine={false}
                tickLine={false}
                dx={10}
            />
            <RechartsTooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(20, 20, 20, 0.85)', 
                backdropFilter: 'blur(8px)',
                borderColor: tokens.border.main, 
                color: tokens.text.primary,
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
              }}
              itemStyle={{ color: tokens.text.primary, fontWeight: 500 }}
              labelStyle={{ color: tokens.text.secondary, marginBottom: '4px' }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Area yAxisId="left" type="monotone" dataKey="Close" stroke={tokens.primary.main} fillOpacity={1} fill="url(#colorClose)" strokeWidth={2} />
            <Bar yAxisId="right" dataKey="Volume" fill="url(#colorVol)" radius={[2, 2, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>

      <Box sx={{ height: 400, width: '100%' }}>
        <DataGrid
          rows={data}
          columns={columns}
          getRowId={(row) => row.Date}
          density="compact"
          sx={{
            bgcolor: tokens.background.card,
            borderColor: tokens.border.main,
            color: tokens.text.primary,
            '& .MuiDataGrid-cell': { borderColor: tokens.border.main },
            '& .MuiDataGrid-columnHeaders': { borderColor: tokens.border.main, bgcolor: tokens.background.paper },
            '& .MuiDataGrid-footerContainer': { borderColor: tokens.border.main },
            '& .MuiCheckbox-root': { color: tokens.text.secondary }
          }}
        />
      </Box>
    </Box>
  );
};

export default HistoricalDataChart;
