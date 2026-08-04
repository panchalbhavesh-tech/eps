import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Box, Typography, CircularProgress, Button, Tooltip, Grid, Card, CardContent, Snackbar, Alert } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import StorageIcon from '@mui/icons-material/Storage';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import { StatusBadge, FilterChipGroup, SearchInput } from '../components/common';
import { useThemeMode } from '../theme/ThemeContext';

const GET_CELERY_SCHEDULES = gql`
  query GetCelerySchedules {
    celerySchedules {
      name
      taskName
      intervalSeconds
      humanReadableInterval
      category
      description
      lastRunAt
      lastRunStatus
      lastRunDuration
    }
  }
`;

const TRIGGER_CELERY_TASK = gql`
  mutation TriggerCeleryTask($taskName: String!) {
    triggerCeleryTask(taskName: $taskName)
  }
`;

export interface CelerySchedule {
  name: string;
  taskName: string;
  intervalSeconds: number;
  humanReadableInterval: string;
  category: string;
  description: string;
  lastRunAt?: string;
  lastRunStatus?: string;
  lastRunDuration?: number;
}

const Schedules: React.FC = () => {
  const { mode, tokens } = useThemeMode();
  const isDark = mode === 'dark';

  const { loading, error, data, refetch } = useQuery(GET_CELERY_SCHEDULES, { 
    pollInterval: 15000, 
    fetchPolicy: 'network-only' 
  });

  const [triggerTask, { loading: triggering }] = useMutation(TRIGGER_CELERY_TASK);
  const [activeTrigger, setActiveTrigger] = useState<string | null>(null);
  const [snackbarMsg, setSnackbarMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleRunNow = async (taskName: string, name: string) => {
    try {
      setActiveTrigger(taskName);
      const res = await triggerTask({ variables: { taskName } });
      setSnackbarMsg(res.data?.triggerCeleryTask || `Successfully triggered ${name}.`);
      setTimeout(() => refetch(), 2000);
    } catch (e: any) {
      setSnackbarMsg(`Error deploying worker: ${e.message}`);
    } finally {
      setActiveTrigger(null);
    }
  };

  const rows: CelerySchedule[] = data?.celerySchedules || [];

  // KPI Metrics calculation
  const metrics = useMemo(() => {
    const total = rows.length;
    let aiCount = 0;
    let marketDataCount = 0;
    let quantCount = 0;

    rows.forEach((sched) => {
      if (sched.category.includes('AI') || sched.category.includes('ML')) aiCount++;
      else if (sched.category.includes('Market Data')) marketDataCount++;
      else if (sched.category.includes('Quant')) quantCount++;
    });

    return { total, aiCount, marketDataCount, quantCount };
  }, [rows]);

  const filterOptions = [
    { label: 'All Schedules', value: 'ALL', count: metrics.total },
    { label: 'AI & ML Workflows', value: 'AI', count: metrics.aiCount, color: tokens.primary.main },
    { label: 'Market Data Sync', value: 'MARKET', count: metrics.marketDataCount, color: tokens.status.success.main },
    { label: 'Quant Analytics', value: 'QUANT', count: metrics.quantCount, color: tokens.secondary.main },
  ];

  const filteredRows = useMemo(() => {
    return rows.filter((sched) => {
      if (categoryFilter === 'AI' && !sched.category.includes('AI') && !sched.category.includes('ML')) return false;
      if (categoryFilter === 'MARKET' && !sched.category.includes('Market Data')) return false;
      if (categoryFilter === 'QUANT' && !sched.category.includes('Quant')) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesName = sched.name.toLowerCase().includes(q);
        const matchesTask = sched.taskName.toLowerCase().includes(q);
        const matchesDesc = sched.description.toLowerCase().includes(q);
        if (!matchesName && !matchesTask && !matchesDesc) return false;
      }
      return true;
    });
  }, [rows, categoryFilter, searchQuery]);

  const columns: GridColDef[] = [
    { 
      field: 'name', 
      headerName: 'BEAT SCHEDULE & SYMBOL', 
      width: 290, 
      flex: 1.5,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ py: 1.2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: tokens.text.primary, letterSpacing: '-0.01em' }}>
              {params.value}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.73rem', color: tokens.text.secondary, fontFamily: 'monospace', mt: 0.3 }}>
            {params.row.taskName}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'humanReadableInterval', 
      headerName: 'SCHEDULE INTERVAL', 
      width: 170,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScheduleIcon sx={{ fontSize: 16, color: tokens.primary.main }} />
          <Box>
            <Typography sx={{ fontSize: '0.82rem', color: tokens.text.primary, fontWeight: 600 }}>
              {params.value}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: tokens.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
              {params.row.intervalSeconds}s interval
            </Typography>
          </Box>
        </Box>
      )
    },
    { 
      field: 'category', 
      headerName: 'CATEGORY', 
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        const cat = params.value as string;
        let bg = tokens.background.card;
        let color = tokens.text.secondary;
        let border = tokens.border.main;

        if (cat.includes('AI') || cat.includes('ML')) {
          color = tokens.primary.main;
        } else if (cat.includes('Market Data')) {
          color = tokens.status.success.main;
        } else {
          color = tokens.secondary.main;
        }

        return (
          <Box sx={{ 
            px: 1.2, 
            py: 0.4, 
            borderRadius: 1, 
            bgcolor: bg, 
            border: `1px solid ${border}`,
            color: color,
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.03em'
          }}>
            {cat}
          </Box>
        );
      }
    },
    { 
      field: 'description', 
      headerName: 'INSTITUTIONAL PURPOSE & RATIONALE', 
      width: 380, 
      flex: 2,
      renderCell: (params: GridRenderCellParams) => (
        <Typography 
          sx={{ 
            fontSize: '0.8rem', 
            color: tokens.text.secondary,
            lineHeight: 1.4,
            whiteSpace: 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            pr: 1
          }}
        >
          {params.value || 'Automated scheduled quant workflow.'}
        </Typography>
      )
    },
    { 
      field: 'lastRunStatus', 
      headerName: 'LATEST WORKER STATE', 
      width: 170,
      renderCell: (params: GridRenderCellParams) => {
        const st = params.value || 'NEVER_RUN';
        const at = params.row.lastRunAt;
        const dur = params.row.lastRunDuration;
        return (
          <Box>
            {st === 'NEVER_RUN' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tokens.text.disabled }} />
                <Typography sx={{ fontSize: '0.75rem', color: tokens.text.disabled, fontWeight: 600 }}>
                  Standby / Unfired
                </Typography>
              </Box>
            ) : (
              <>
                <StatusBadge status={st} size="small" />
                {at && (
                  <Typography sx={{ fontSize: '0.7rem', color: tokens.text.secondary, fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
                    {dur ? `${dur.toFixed(1)}s exec time` : new Date(at + "Z").toLocaleTimeString()}
                  </Typography>
                )}
              </>
            )}
          </Box>
        );
      }
    },
    {
      field: 'action',
      headerName: 'EXECUTION CONTROLS',
      width: 140,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params: GridRenderCellParams) => {
        const isRunning = activeTrigger === params.row.taskName;
        return (
          <Button
            size="small"
            variant="contained"
            disabled={triggering && isRunning}
            onClick={() => handleRunNow(params.row.taskName, params.row.name)}
            startIcon={isRunning ? <CircularProgress size={12} color="inherit" /> : <PlayArrowIcon sx={{ fontSize: '15px !important' }} />}
            sx={{
              fontSize: '0.74rem',
              py: 0.6,
              px: 1.4,
              bgcolor: tokens.primary.main,
              color: '#ffffff',
              textTransform: 'none',
              fontWeight: 700,
              boxShadow: 'none',
              '&:hover': {
                bgcolor: tokens.primary.dark || tokens.primary.main,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              }
            }}
          >
            {isRunning ? 'Queueing...' : 'Deploy Now'}
          </Button>
        );
      }
    }
  ];

  if (loading && !data) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="70vh" gap={2}>
        <CircularProgress size={44} sx={{ color: tokens.primary.main }} />
        <Typography sx={{ color: tokens.text.secondary, fontSize: '0.88rem', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
          Inspecting Celery Beat Schedule Pool...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={4}>
        <Typography color="error" variant="h6" fontWeight={700}>Failed to inspect Celery Beat timer configurations.</Typography>
        <Typography color="text.secondary" fontSize="0.85rem" mt={1}>{error.message}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: tokens.background.default, pb: 4, fontFamily: tokens.typography.fontFamily, width: '100%', overflowX: 'hidden' }}>
      {/* KPI Scorecard Deck */}
      <Box sx={{ px: { xs: 2, md: 3.5 }, pt: 3, pb: 2 }}>
        <Grid container spacing={2.5}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: tokens.background.card, border: `1px solid ${tokens.border.main}`, boxShadow: 'none', borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total Beat Schedules
                  </Typography>
                  <ScheduleIcon sx={{ fontSize: 20, color: tokens.text.secondary }} />
                </Box>
                <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: tokens.text.primary, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  {metrics.total}
                </Typography>
                <Typography sx={{ fontSize: '0.74rem', color: tokens.status.success.main, fontWeight: 600, mt: 0.5 }}>
                  Active periodic worker timers
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: tokens.background.card, border: `1px solid ${tokens.border.main}`, boxShadow: 'none', borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    AI Quant & ML Pipelines
                  </Typography>
                  <AutoAwesomeIcon sx={{ fontSize: 20, color: tokens.primary.main }} />
                </Box>
                <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: tokens.primary.main, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  {metrics.aiCount}
                </Typography>
                <Typography sx={{ fontSize: '0.74rem', color: tokens.text.secondary, fontWeight: 500, mt: 0.5 }}>
                  Autonomous factor & retraining loops
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: tokens.background.card, border: `1px solid ${tokens.border.main}`, boxShadow: 'none', borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Market Data Workflows
                  </Typography>
                  <StorageIcon sx={{ fontSize: 20, color: tokens.status.success.main }} />
                </Box>
                <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: tokens.text.primary, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  {metrics.marketDataCount}
                </Typography>
                <Typography sx={{ fontSize: '0.74rem', color: tokens.text.secondary, fontWeight: 500, mt: 0.5 }}>
                  NSE Bhavcopy & corporate events sync
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: tokens.background.card, border: `1px solid ${tokens.border.main}`, boxShadow: 'none', borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Scheduler Status
                  </Typography>
                  <CheckCircleOutlineIcon sx={{ fontSize: 20, color: tokens.status.success.main }} />
                </Box>
                <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: tokens.status.success.main, mt: 0.5 }}>
                  100% Online
                </Typography>
                <Typography sx={{ fontSize: '0.74rem', color: tokens.text.secondary, fontWeight: 500, mt: 0.5 }}>
                  Redis Celery broker connected
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Top Controls & Filter Bar */}
      <Box sx={{ px: { xs: 2, md: 3.5 }, pt: 1, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, borderBottom: `1px solid ${tokens.border.main}`, bgcolor: tokens.background.header }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterChipGroup
            options={filterOptions}
            selectedValue={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <SearchInput
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            placeholder="Search schedules, symbols, or purpose..."
            width={290}
          />

          <Button
            variant="outlined"
            onClick={handleRefresh}
            startIcon={<AutorenewIcon sx={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none', fontSize: '17px !important' }} />}
            sx={{ 
              height: '36px',
              borderColor: tokens.border.main, 
              color: tokens.text.primary, 
              bgcolor: tokens.background.card, 
              fontWeight: 600,
              fontSize: '0.78rem',
              px: 2,
              borderRadius: 2,
              textTransform: 'none',
              '&:hover': { bgcolor: tokens.background.cardHover } 
            }}
          >
            Refresh Timers
          </Button>
        </Box>
      </Box>

      {/* Main Schedule DataGrid Table */}
      <Box sx={{ height: 'calc(100vh - 280px)', minHeight: 520, width: '100%', bgcolor: tokens.background.paper, borderBottom: `1px solid ${tokens.border.main}`, overflow: 'hidden' }}>
        <DataGrid 
          rows={filteredRows} 
          columns={columns} 
          getRowId={(row) => row.name}
          disableRowSelectionOnClick
          rowHeight={64}
          columnHeaderHeight={46}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          pageSizeOptions={[15, 25, 50]}
          sx={{
            border: 0,
            color: tokens.text.primary,
            fontFamily: tokens.typography.fontFamily,
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: tokens.background.card,
              color: tokens.text.secondary,
              textTransform: 'uppercase',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              borderRadius: 0,
              borderBottom: `1px solid ${tokens.border.main}`,
              borderTop: `1px solid ${tokens.border.main}`
            },
            '& .MuiDataGrid-columnSeparator': {
              display: 'none',
            },
            '& .MuiDataGrid-columnHeader': {
              '&:focus, &:focus-within': { outline: 'none' },
            },
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${tokens.border.main}`,
              display: 'flex',
              alignItems: 'center',
              fontSize: '0.82rem',
              '&:focus, &:focus-within': { outline: 'none' },
            },
            '& .MuiDataGrid-row': {
              '&:hover': {
                bgcolor: tokens.background.cardHover,
              },
            },
            '& .MuiTablePagination-root': {
              color: tokens.text.secondary,
              fontSize: '0.8rem',
            },
          }}
        />
      </Box>

      <Snackbar
        open={!!snackbarMsg}
        autoHideDuration={5000}
        onClose={() => setSnackbarMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbarMsg(null)} severity={snackbarMsg?.includes('Error') ? 'error' : 'success'} sx={{ width: '100%', fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Schedules;
