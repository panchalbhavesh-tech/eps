import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Grid, Card, CardActionArea, CardContent, InputAdornment, Dialog, DialogContent, DialogTitle, IconButton, Chip, CircularProgress } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useThemeMode } from '../theme/ThemeContext';
import HistoricalDataChart from '../components/HistoricalDataChart';
import { useQuery } from '@apollo/client';
import { DATA_LAKE_STOCKS_QUERY } from '../graphql/operations';

interface StockInfo {
  ticker: string;
  name: string;
  hasHistoricalData: boolean;
}

const DataLakePage: React.FC = () => {
  const { tokens } = useThemeMode();
  const [search, setSearch] = useState('');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);

  const { data, loading, error } = useQuery(DATA_LAKE_STOCKS_QUERY);
  const stocks: StockInfo[] = data?.dataLakeStocks || [];

  // Reset visible count when search changes
  useEffect(() => {
    setVisibleCount(60);
  }, [search]);

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 500) {
        setVisibleCount(prev => prev + 60);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const totalCount = stocks.length;
  const availableCount = stocks.filter(s => s?.hasHistoricalData).length;
  const missingCount = totalCount - availableCount;

  // Optimize search: Use useMemo, pre-lowercase the search term, and cap results to 100
  const filteredStocks = React.useMemo(() => {
    if (!stocks.length) return [];
    
    const searchLower = search.trim().toLowerCase();
    const results = stocks.filter(stock => {
      if (!stock) return false;
      if (!searchLower) return true;
      return (stock.ticker || '').toLowerCase().includes(searchLower) || 
             (stock.name || '').toLowerCase().includes(searchLower);
    });
    
    return results.slice(0, visibleCount);
  }, [stocks, search, visibleCount]);

  return (
    <Box sx={{ p: 4, maxWidth: 1400, margin: '0 auto' }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ color: tokens.text.primary, fontWeight: 700, mb: 1 }}>
            Parquet Data Lake
          </Typography>
          <Typography sx={{ color: tokens.text.secondary }}>
            Explore historical OHLCV data availability and visualize cross-sectional records.
          </Typography>
        </Box>

        {!loading && !error && (
          <Box sx={{ 
            display: 'flex', 
            gap: 3, 
            alignItems: 'center', 
            p: 2, 
            bgcolor: tokens.background.card, 
            borderRadius: 2, 
            border: `1px solid ${tokens.border.main}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: tokens.text.tertiary, textTransform: 'uppercase', fontWeight: 600 }}>Total</Typography>
              <Typography variant="h6" sx={{ color: tokens.text.primary, fontWeight: 700, lineHeight: 1 }}>{totalCount}</Typography>
            </Box>
            <Box sx={{ width: 1, height: 30, bgcolor: tokens.border.main }} />
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: tokens.text.tertiary, textTransform: 'uppercase', fontWeight: 600 }}>Available</Typography>
              <Typography variant="h6" sx={{ color: '#4caf50', fontWeight: 700, lineHeight: 1 }}>{availableCount}</Typography>
            </Box>
            <Box sx={{ width: 1, height: 30, bgcolor: tokens.border.main }} />
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: tokens.text.tertiary, textTransform: 'uppercase', fontWeight: 600 }}>Missing</Typography>
              <Typography variant="h6" sx={{ color: '#f44336', fontWeight: 700, lineHeight: 1 }}>{missingCount}</Typography>
            </Box>
          </Box>
        )}
      </Box>

      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search stocks by ticker or name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{
          mb: 4,
          '& .MuiOutlinedInput-root': {
            bgcolor: tokens.background.card,
            '& fieldset': { borderColor: tokens.border.main },
            '&:hover fieldset': { borderColor: tokens.border.light },
            '&.Mui-focused fieldset': { borderColor: tokens.primary.main },
          },
          input: { color: tokens.text.primary }
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: tokens.text.tertiary }} />
            </InputAdornment>
          ),
        }}
      />

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress sx={{ color: tokens.primary.main }} />
        </Box>
      )}

      {error && (
        <Typography color="error" sx={{ mt: 4, textAlign: 'center' }}>
          Error loading stocks: {error.message}
        </Typography>
      )}

      {!loading && !error && (
        <Grid container spacing={3}>
          {filteredStocks.map((stock) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={stock.ticker}>
              <Card 
                sx={{ 
                  bgcolor: tokens.background.card, 
                  border: `1px solid ${tokens.border.main}`,
                  boxShadow: 'none',
                  height: '100%',
                  transition: 'border-color 0.2s',
                  '&:hover': { borderColor: tokens.primary.main }
                }}
              >
                <CardActionArea 
                  onClick={() => {
                    if (stock.hasHistoricalData) {
                      setSelectedTicker(stock.ticker);
                    }
                  }}
                  disabled={!stock.hasHistoricalData}
                  sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}
                >
                  <CardContent sx={{ width: '100%' }}>
                    <Typography variant="h6" sx={{ color: tokens.text.primary, fontWeight: 600, mb: 0.5 }}>
                      {stock.ticker}
                    </Typography>
                    <Typography variant="body2" sx={{ color: tokens.text.secondary, mb: 2, display: '-webkit-box', overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, height: 40 }}>
                      {stock.name}
                    </Typography>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {stock.hasHistoricalData ? (
                        <Chip 
                          icon={<CheckCircleIcon sx={{ fontSize: '16px !important' }}/>} 
                          label="Data Available" 
                          size="small"
                          sx={{ 
                            bgcolor: 'rgba(76, 175, 80, 0.1)', 
                            color: '#4caf50',
                            border: '1px solid rgba(76, 175, 80, 0.2)',
                            fontWeight: 500,
                            fontSize: '11px'
                          }} 
                        />
                      ) : (
                        <Chip 
                          icon={<CancelIcon sx={{ fontSize: '16px !important' }}/>} 
                          label="Missing Data" 
                          size="small"
                          sx={{ 
                            bgcolor: 'rgba(244, 67, 54, 0.1)', 
                            color: '#f44336',
                            border: '1px solid rgba(244, 67, 54, 0.2)',
                            fontWeight: 500,
                            fontSize: '11px'
                          }} 
                        />
                      )}
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Chart Dialog */}
      <Dialog 
        open={Boolean(selectedTicker)} 
        onClose={() => setSelectedTicker(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: tokens.background.paper,
            backgroundImage: 'none',
            border: `1px solid ${tokens.border.main}`,
            minHeight: '80vh'
          }
        }}
      >
        <DialogTitle sx={{ m: 0, p: 2, color: tokens.text.primary, borderBottom: `1px solid ${tokens.border.main}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Historical Analysis
          <IconButton
            onClick={() => setSelectedTicker(null)}
            sx={{ color: tokens.text.secondary, '&:hover': { color: tokens.text.primary, bgcolor: tokens.background.cardHover } }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {selectedTicker && <HistoricalDataChart ticker={selectedTicker} />}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default DataLakePage;
