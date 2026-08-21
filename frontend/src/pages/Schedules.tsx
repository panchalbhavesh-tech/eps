import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useLazyQuery, gql } from '@apollo/client';
import { Box, Typography, CircularProgress, Button, Snackbar, Alert, Drawer, IconButton, Divider, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';

import { StatusBadge, FilterChipGroup, SearchInput } from '../components/common';
import { useThemeMode } from '../theme/ThemeContext';
import TaskManager from './TaskManager';

const GET_CELERY_SCHEDULES = gql`
  query GetCelerySchedules {
    celerySchedules {
      name
      taskName
      cronTitle
      intervalSeconds
      humanReadableInterval
      category
      description
      lastRunAt
      lastRunStatus
      lastRunDuration
      nextRunAt
      lastRunResult
      lastRunError
    }
  }
`;

const GET_WORKER_EXECUTION_HISTORY = gql`
  query GetWorkerExecutionHistory($taskName: String!) {
    workerExecutionHistory(taskName: $taskName) {
      id
      taskName
      status
      queuedAt
      startedAt
      finishedAt
      durationMs
      result
      errorMessage
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
  cronTitle: string;
  intervalSeconds: number;
  humanReadableInterval: string;
  category: string;
  description: string;
  lastRunAt?: string;
  lastRunStatus?: string;
  lastRunDuration?: number;
  nextRunAt?: string;
  lastRunResult?: string;
  lastRunError?: string;
}

export interface WorkerExecutionHistory {
  id: string;
  taskName: string;
  status: string;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  result?: string;
  errorMessage?: string;
}

const Schedules: React.FC = () => {
  const { tokens } = useThemeMode();


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
  const [inspectDrawerOpen, setInspectDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CelerySchedule | null>(null);

  const [getHistory, { data: historyData, loading: historyLoading }] = useLazyQuery(GET_WORKER_EXECUTION_HISTORY, {
    fetchPolicy: 'network-only'
  });

  const handleInspect = (task: CelerySchedule) => {
    setSelectedTask(task);
    setInspectDrawerOpen(true);
    getHistory({ variables: { taskName: task.taskName } });
  };


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
    return { total };
  }, [rows]);

  const filterOptions = [
    { label: 'All Schedules', value: 'ALL', count: metrics.total },
    { label: 'History of Workers', value: 'HISTORY', color: tokens.accent.main },
  ];

  const filteredRows = useMemo(() => {
    return rows.filter((sched) => {
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
      headerName: 'WORKER / TASK',
      width: 250,
      flex: 1.2,
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
      field: 'cronTitle',
      headerName: 'CRON TITLE',
      width: 220,
      flex: 1.2,
      renderCell: (params: GridRenderCellParams) => {
        const title = params.value || '';
        const parts = title.split(': ');
        return (
          <Box>
            {parts.length === 2 ? (
              <>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: tokens.primary.main, textTransform: 'uppercase' }}>
                  {parts[0]}
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: tokens.text.primary }}>
                  {parts[1]}
                </Typography>
              </>
            ) : (
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: tokens.text.primary }}>
                {title}
              </Typography>
            )}
          </Box>
        );
      }
    },
    {
      field: 'humanReadableInterval',
      headerName: 'SCHEDULE',
      width: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScheduleIcon sx={{ fontSize: 16, color: tokens.primary.main }} />
          <Box>
            <Typography sx={{ fontSize: '0.82rem', color: tokens.text.primary, fontWeight: 600 }}>
              {params.value}
            </Typography>
          </Box>
        </Box>
      )
    },
    {
      field: 'description',
      headerName: 'PURPOSE',
      width: 250,
      flex: 1.5,
      renderCell: (params: GridRenderCellParams) => (
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: tokens.text.secondary,
            lineHeight: 1.3,
            whiteSpace: 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            pr: 1
          }}
        >
          {params.value}
        </Typography>
      )
    },
    {
      field: 'lastRunStatus',
      headerName: 'STATUS',
      width: 110,
      renderCell: (params: GridRenderCellParams) => {
        const st = (params.value || 'NEVER RUN').toUpperCase().replace('_', ' ');
        if (st === 'NEVER RUN') {
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tokens.text.disabled }} />
              <Typography sx={{ fontSize: '0.75rem', color: tokens.text.disabled, fontWeight: 600 }}>
                NEVER RUN
              </Typography>
            </Box>
          );
        }
        return <StatusBadge status={st} size="small" />;
      }
    },
    {
      field: 'lastRunAt',
      headerName: 'LAST RUN',
      width: 130,
      renderCell: (params: GridRenderCellParams) => {
        const at = params.value;
        const dur = params.row.lastRunDuration;
        if (!at) return <Typography sx={{ fontSize: '0.75rem', color: tokens.text.disabled }}>-</Typography>;
        
        const dateObj = new Date(at + "Z");
                const timeStr = dateObj.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
        
        return (
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: tokens.text.primary, fontWeight: 500 }}>
              {timeStr}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: tokens.text.secondary }}>
              {dur ? `${dur.toFixed(1)}s` : ''}
            </Typography>
          </Box>
        );
      }
    },
    {
      field: 'nextRunAt',
      headerName: 'NEXT RUN',
      width: 130,
      renderCell: (params: GridRenderCellParams) => {
        const at = params.value;
        if (!at) return <Typography sx={{ fontSize: '0.75rem', color: tokens.text.disabled }}>—</Typography>;

        const dateObj = new Date(at);
        const timeStr = dateObj.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
        const dateStr = dateObj.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });

        const now = new Date();
        const diffMs = dateObj.getTime() - now.getTime();

        let relStr = '';
        if (diffMs > 0) {
            const diffMins = Math.floor(diffMs / 60000);
            const hrs = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            if (hrs > 24) {
                const days = Math.floor(hrs / 24);
                relStr = `in ${days}d ${hrs % 24}h`;
            } else if (hrs > 0) {
                relStr = `in ${hrs}h ${mins}m`;
            } else {
                relStr = `in ${mins}m`;
            }
        } else {
            relStr = 'overdue';
        }

        return (
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: tokens.text.primary, fontWeight: 500 }}>
              {dateStr} {timeStr}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: diffMs > 0 ? tokens.text.secondary : tokens.status.error.main, mt: 0.2 }}>
              {relStr}
            </Typography>
          </Box>
        );
      }
    },
    {
      field: 'lastRunResult',
      headerName: 'LAST RESULT',
      width: 140,
      renderCell: (params: GridRenderCellParams) => {
        const res = params.value;
        const err = params.row.lastRunError;
        
        let text = '-';
        let color = tokens.text.secondary;
        if (err) {
            text = err.substring(0, 30) + (err.length > 30 ? '...' : '');
            color = tokens.status.error.main;
        } else if (res) {
            text = res.substring(0, 30) + (res.length > 30 ? '...' : '');
        }

        return (
          <Typography sx={{ fontSize: '0.7rem', color: color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {text}
          </Typography>
        );
      }
    },
    {
      field: 'action',
      headerName: 'ACTION',
      width: 180,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params: GridRenderCellParams) => {
        const isRunning = activeTrigger === params.row.taskName;
        return (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => handleInspect(params.row)}
              sx={{
                fontSize: '0.68rem',
                py: 0.3,
                px: 1,
                borderColor: tokens.border.main,
                color: tokens.text.primary,
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              Inspect
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={triggering && isRunning}
              onClick={() => handleRunNow(params.row.taskName, params.row.name)}
              startIcon={isRunning ? <CircularProgress size={12} color="inherit" /> : <PlayArrowIcon sx={{ fontSize: '15px !important' }} />}
              sx={{
                fontSize: '0.68rem',
                py: 0.3,
                px: 1,
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
              {isRunning ? 'Run...' : 'Run now'}
            </Button>
          </Box>
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

      {categoryFilter === 'HISTORY' ? (
        <Box sx={{ 
          '& > div': { 
            minHeight: 'calc(100vh - 120px) !important', 
            pb: 0 
          } 
        }}>
          <TaskManager />
        </Box>
      ) : (
        <>
          {/* Main Schedule DataGrid Table */}
          <Box sx={{ height: 'calc(100vh - 120px)', minHeight: 520, width: '100%', bgcolor: tokens.background.paper, borderBottom: `1px solid ${tokens.border.main}`, overflow: 'hidden' }}>
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

      <Drawer
        anchor="right"
        open={inspectDrawerOpen}
        onClose={() => setInspectDrawerOpen(false)}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 550 }, bgcolor: tokens.background.paper, backgroundImage: 'none' }
        }}
      >
        {selectedTask && (
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: tokens.text.primary, display: 'flex', alignItems: 'center', gap: 1 }}>
                <InfoIcon sx={{ color: tokens.primary.main }} /> Worker Details
              </Typography>
              <IconButton onClick={() => setInspectDrawerOpen(false)} sx={{ color: tokens.text.secondary }}>
                <CloseIcon />
              </IconButton>
            </Box>
            
            <Divider sx={{ borderColor: tokens.border.main, mb: 3 }} />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: tokens.text.secondary, textTransform: 'uppercase', fontWeight: 700 }}>Worker Name</Typography>
                <Typography sx={{ fontSize: '0.9rem', color: tokens.text.primary, fontWeight: 600 }}>{selectedTask.name}</Typography>
              </Box>
            </Box>

            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: tokens.text.primary, textTransform: 'uppercase', mb: 2 }}>
              Execution History
            </Typography>

            {historyLoading ? (
               <Box display="flex" justifyContent="center" p={4}><CircularProgress size={24} sx={{color: tokens.primary.main}} /></Box>
            ) : (
              <Box sx={{ border: `1px solid ${tokens.border.main}`, borderRadius: 1, overflowY: 'auto', flexGrow: 1, minHeight: 0 }}>
                <Table size="small" stickyHeader>
                  <TableHead sx={{ bgcolor: tokens.background.card }}>
                    <TableRow>
                      <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, color: tokens.text.secondary, borderBottom: `1px solid ${tokens.border.main}` }}>TIME (IST)</TableCell>
                      <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, color: tokens.text.secondary, borderBottom: `1px solid ${tokens.border.main}` }}>STATUS</TableCell>
                      <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, color: tokens.text.secondary, borderBottom: `1px solid ${tokens.border.main}` }}>DURATION</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {historyData?.workerExecutionHistory?.length ? historyData.workerExecutionHistory.map((h: any) => (
                      <TableRow key={h.id}>
                        <TableCell sx={{ fontSize: '0.75rem', color: tokens.text.primary, borderBottom: `1px solid ${tokens.border.light}` }}>
                          {h.startedAt ? (new Date(h.startedAt + "Z")).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                        </TableCell>
                        <TableCell sx={{ borderBottom: `1px solid ${tokens.border.light}` }}>
                          <StatusBadge status={h.status} size="small" />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', color: tokens.text.secondary, borderBottom: `1px solid ${tokens.border.light}` }}>
                          {h.durationMs ? `${h.durationMs.toFixed(1)}s` : '-'}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={3} align="center" sx={{ fontSize: '0.75rem', color: tokens.text.disabled, py: 3, border: 0 }}>
                          No execution history
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Box>
        )}
      </Drawer>
        </>
      )}
    </Box>
  );
};

export default Schedules;
