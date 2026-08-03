import React, { useState, useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Box, Typography, CircularProgress, Button, Tooltip } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { StatusBadge, FilterChipGroup, SearchInput } from '../components/common';
import { TaskDetailDrawer, BackgroundJob } from '../components/tasks/TaskDetailDrawer';
import { useThemeMode } from '../theme/ThemeContext';

const GET_BACKGROUND_JOBS = gql`
  query GetBackgroundJobs {
    backgroundJobs(limit: 100) {
      id
      celeryTaskId
      taskName
      status
      queuedAt
      startedAt
      finishedAt
      result
      errorMessage
      duration
    }
  }
`;

const TaskManager: React.FC = () => {
  const { mode, tokens } = useThemeMode();
  const isDark = mode === 'dark';

  const { loading, error, data, refetch } = useQuery(GET_BACKGROUND_JOBS, { 
    pollInterval: 5000, 
    fetchPolicy: 'network-only' 
  });

  const [selectedTask, setSelectedTask] = useState<BackgroundJob | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleOpenDetails = (job: BackgroundJob) => {
    setSelectedTask(job);
    setDrawerOpen(true);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const rows: BackgroundJob[] = data?.backgroundJobs || [];

  // Compute live KPI metrics from background jobs
  const metrics = useMemo(() => {
    const total = rows.length;
    let success = 0;
    let failure = 0;
    let active = 0;
    let totalDuration = 0;
    let durationCount = 0;

    rows.forEach((job) => {
      if (job.status === 'SUCCESS') success++;
      else if (job.status === 'FAILURE') failure++;
      else if (job.status === 'RUNNING' || job.status === 'QUEUED') active++;

      if (job.duration && !isNaN(parseFloat(job.duration))) {
        totalDuration += parseFloat(job.duration);
        durationCount++;
      }
    });

    const successRate = total > 0 ? ((success / total) * 100) : 0;
    const avgDuration = durationCount > 0 ? (totalDuration / durationCount) : 0;

    return { total, success, failure, active, successRate, avgDuration };
  }, [rows]);

  // Filter rows by status and search query
  const filteredRows = useMemo(() => {
    return rows.filter((job) => {
      if (statusFilter === 'SUCCESS' && job.status !== 'SUCCESS') return false;
      if (statusFilter === 'FAILURE' && job.status !== 'FAILURE') return false;
      if (statusFilter === 'ACTIVE' && job.status !== 'RUNNING' && job.status !== 'QUEUED') return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesName = job.taskName?.toLowerCase().includes(q);
        const matchesId = job.celeryTaskId?.toLowerCase().includes(q) || job.id?.toLowerCase().includes(q);
        const matchesMsg = job.errorMessage?.toLowerCase().includes(q) || job.result?.toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesMsg) return false;
      }

      return true;
    });
  }, [rows, statusFilter, searchQuery]);

  const filterOptions = [
    { label: 'All Pipelines', value: 'ALL', count: metrics.total },
    { label: 'Successful', value: 'SUCCESS', count: metrics.success, color: tokens.status.success.main },
    { label: 'Active & Queued', value: 'ACTIVE', count: metrics.active, color: tokens.secondary.main },
    { label: 'Failures & Errors', value: 'FAILURE', count: metrics.failure, color: tokens.status.error.main },
  ];

  const columns: GridColDef[] = [
    { 
      field: 'taskName', 
      headerName: 'QUANT PIPELINE / TASK MODULE', 
      width: 280, 
      flex: 1.5,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ py: 1 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: tokens.text.primary, fontFamily: 'monospace' }}>
            {params.value}
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: tokens.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
            UUID: {params.row.celeryTaskId ? `${params.row.celeryTaskId.slice(0, 18)}...` : params.row.id}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'status', 
      headerName: 'WORKER STATUS', 
      width: 140,
      renderCell: (params: GridRenderCellParams) => <StatusBadge status={params.value} size="small" />
    },
    { 
      field: 'queuedAt', 
      headerName: 'QUEUED TIMESTAMP', 
      width: 190,
      renderCell: (params: GridRenderCellParams) => (
        <Typography sx={{ fontSize: '0.78rem', color: tokens.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
          {new Date(params.value + "Z").toLocaleString()}
        </Typography>
      )
    },
    { 
      field: 'duration', 
      headerName: 'EXECUTION TIMINGS', 
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        const val = params.value;
        if (!val) return <Typography sx={{ fontSize: '0.75rem', color: tokens.text.disabled }}>In progress...</Typography>;
        const sec = parseFloat(val);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: sec < 3 ? tokens.status.success.main : tokens.status.warning.main }} />
            <Typography sx={{ fontSize: '0.8rem', color: tokens.text.primary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {sec.toFixed(2)}s
            </Typography>
          </Box>
        );
      }
    },
    { 
      field: 'message', 
      headerName: 'OUTPUT & EXCEPTION TRACEBACK', 
      width: 340, 
      flex: 2,
      renderCell: (params: GridRenderCellParams) => {
        const msg = params.row.errorMessage || params.row.result;
        if (!msg) return <Typography sx={{ fontSize: '0.75rem', color: tokens.text.disabled }}>No output recorded</Typography>;
        
        const isError = params.row.status === 'FAILURE';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pr: 2 }}>
            <Typography 
              sx={{ 
                fontSize: '0.78rem', 
                color: isError ? tokens.status.error.main : tokens.text.secondary,
                fontFamily: isError ? 'monospace' : 'inherit',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                bgcolor: isError ? tokens.status.error.wash : 'transparent',
                px: isError ? 1 : 0,
                py: isError ? 0.3 : 0,
                borderRadius: 1,
                border: isError ? `1px solid ${tokens.status.error.border || tokens.status.error.main}` : 'none',
              }}
            >
              {msg}
            </Typography>
          </Box>
        );
      }
    },
    {
      field: 'action',
      headerName: 'SURVEILLANCE',
      width: 120,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params: GridRenderCellParams) => {
        const isFail = params.row.status === 'FAILURE';
        return (
          <Button
            size="small"
            variant="outlined"
            onClick={() => handleOpenDetails(params.row)}
            endIcon={<OpenInNewIcon sx={{ fontSize: '13px !important' }} />}
            sx={{
              fontSize: '0.72rem',
              py: 0.4,
              px: 1.2,
              borderColor: isFail ? (tokens.status.error.border || tokens.status.error.main) : tokens.border.main,
              color: isFail ? tokens.status.error.main : tokens.text.primary,
              bgcolor: tokens.background.card,
              textTransform: 'none',
              fontWeight: 700,
              '&:hover': {
                bgcolor: isFail ? tokens.status.error.wash : tokens.background.cardHover,
                borderColor: isFail ? tokens.status.error.main : tokens.border.light,
              }
            }}
          >
            Inspect
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
          Synchronizing Celery Worker Pools...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={4}>
        <Typography color="error" variant="h6" fontWeight={700}>Failed to load async worker pipeline logs.</Typography>
        <Typography color="text.secondary" fontSize="0.85rem" mt={1}>{error.message}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: tokens.background.default, pb: 4, fontFamily: tokens.typography.fontFamily, width: '100%', overflowX: 'hidden' }}>
      {/* Sleek Top Controls & Filter Bar */}
      <Box sx={{ px: { xs: 2, md: 3.5 }, pt: 2, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, borderBottom: `1px solid ${tokens.border.main}`, bgcolor: tokens.background.header }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterChipGroup
            options={filterOptions}
            selectedValue={statusFilter}
            onChange={(val) => setStatusFilter(val)}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <SearchInput
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            placeholder="Search tasks, UUIDs, or errors..."
            width={280}
          />

          <Tooltip title="Polling GraphQL server automatically every 5000ms" placement="bottom">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.6, borderRadius: 2, bgcolor: tokens.background.card, border: `1px solid ${tokens.border.main}`, height: '36px' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tokens.status.success.main }} />
              <Typography sx={{ fontSize: '0.75rem', color: tokens.text.secondary, fontWeight: 700 }}>
                Polling Interval: 5s
              </Typography>
            </Box>
          </Tooltip>

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
            Force Sync
          </Button>
        </Box>
      </Box>

      {/* Main Edge-to-Edge DataGrid Table */}
      <Box sx={{ height: 'calc(100vh - 130px)', minHeight: 500, width: '100%', bgcolor: tokens.background.paper, borderBottom: `1px solid ${tokens.border.main}`, overflow: 'hidden' }}>
        <DataGrid 
          rows={filteredRows} 
          columns={columns} 
          disableRowSelectionOnClick
          rowHeight={54}
          columnHeaderHeight={44}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          pageSizeOptions={[15, 25, 50, 100]}
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
              borderRadius: 0,
              '&:first-of-type': { pl: { xs: 2, md: 3.5 } },
              '&:last-of-type': { pr: { xs: 2, md: 3.5 } }
            },
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${tokens.border.main}`,
              borderRight: 'none',
              display: 'flex',
              alignItems: 'center',
              fontVariantNumeric: 'tabular-nums',
              '&:first-of-type': { pl: { xs: 2, md: 3.5 } },
              '&:last-of-type': { pr: { xs: 2, md: 3.5 } }
            },
            '& .MuiDataGrid-row': {
              bgcolor: tokens.background.paper,
              transition: 'background-color 0.15s ease',
              '&:hover': { bgcolor: `${tokens.background.cardHover} !important` }
            },
            '& .MuiDataGrid-row:nth-of-type(even)': {
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.015)',
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: `1px solid ${tokens.border.main}`,
              bgcolor: tokens.background.card,
              color: tokens.text.secondary,
              px: { xs: 2, md: 3.5 }
            },
            '& .MuiTablePagination-root': { color: tokens.text.secondary },
            '& .MuiDataGrid-overlay': { bgcolor: tokens.background.paper }
          }}
        />
      </Box>

      {/* Right-Side Task Detail Drawer */}
      <TaskDetailDrawer
        open={drawerOpen}
        task={selectedTask}
        onClose={() => setDrawerOpen(false)}
      />
    </Box>
  );
};

export default TaskManager;
