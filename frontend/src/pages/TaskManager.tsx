import React, { useState, useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Box, Typography, CircularProgress, Button, Tooltip, Grid } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import StorageIcon from '@mui/icons-material/Storage';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { StatusBadge, MetricCard, FilterChipGroup, SearchInput } from '../components/common';
import { TaskDetailDrawer, BackgroundJob } from '../components/tasks/TaskDetailDrawer';
import { saasTokens } from '../theme/theme';

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
      // Status Filter
      if (statusFilter === 'SUCCESS' && job.status !== 'SUCCESS') return false;
      if (statusFilter === 'FAILURE' && job.status !== 'FAILURE') return false;
      if (statusFilter === 'ACTIVE' && job.status !== 'RUNNING' && job.status !== 'QUEUED') return false;

      // Search Query Filter
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
    { label: 'Successful', value: 'SUCCESS', count: metrics.success, color: saasTokens.status.success.main },
    { label: 'Active & Queued', value: 'ACTIVE', count: metrics.active, color: saasTokens.secondary.main },
    { label: 'Failures & Errors', value: 'FAILURE', count: metrics.failure, color: saasTokens.status.error.main },
  ];

  const columns: GridColDef[] = [
    { 
      field: 'taskName', 
      headerName: 'QUANT PIPELINE / TASK MODULE', 
      width: 280, 
      flex: 1.5,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ py: 1 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: saasTokens.text.primary, fontFamily: 'monospace' }}>
            {params.value}
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: saasTokens.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
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
        <Typography sx={{ fontSize: '0.78rem', color: saasTokens.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
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
        if (!val) return <Typography sx={{ fontSize: '0.75rem', color: saasTokens.text.disabled }}>In progress...</Typography>;
        const sec = parseFloat(val);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: sec < 3 ? saasTokens.status.success.main : saasTokens.status.warning.main }} />
            <Typography sx={{ fontSize: '0.8rem', color: saasTokens.text.primary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
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
        if (!msg) return <Typography sx={{ fontSize: '0.75rem', color: saasTokens.text.disabled }}>No output recorded</Typography>;
        
        const isError = params.row.status === 'FAILURE';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pr: 2 }}>
            <Typography 
              sx={{ 
                fontSize: '0.78rem', 
                color: isError ? '#e11d48' : saasTokens.text.secondary,
                fontFamily: isError ? 'monospace' : 'inherit',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                bgcolor: isError ? '#fff1f2' : 'transparent',
                px: isError ? 1 : 0,
                py: isError ? 0.3 : 0,
                borderRadius: 1,
                border: isError ? '1px solid #fda4af' : 'none',
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
              borderColor: params.row.status === 'FAILURE' ? '#fda4af' : saasTokens.border.main,
              color: params.row.status === 'FAILURE' ? '#e11d48' : '#0f172a',
              bgcolor: '#ffffff',
              '&:hover': {
                bgcolor: params.row.status === 'FAILURE' ? '#fff1f2' : '#f1f5f9',
                borderColor: params.row.status === 'FAILURE' ? '#f87171' : '#cbd5e1',
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
        <CircularProgress size={44} sx={{ color: saasTokens.primary.main }} />
        <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.88rem', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
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
    <Box sx={{ pb: 6 }}>
      {/* Page Title Area */}
      <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: saasTokens.text.primary, letterSpacing: '-0.02em' }}>
              Processes & Quant Workers
            </Typography>
            <StatusBadge status="ACTIVE MONITORING" variant="glow" />
          </Box>
          <Typography sx={{ color: saasTokens.text.secondary, fontSize: '0.88rem', mt: 0.5 }}>
            Real-time tracking of asynchronous Celery background workers, deep research synthesis, and data syncing pipelines.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip title="Polling GraphQL server automatically every 5000ms">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.8, borderRadius: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: saasTokens.status.success.main }} />
              <Typography sx={{ fontSize: '0.75rem', color: saasTokens.text.secondary, fontWeight: 600 }}>
                Polling Interval: 5s
              </Typography>
            </Box>
          </Tooltip>
          
          <Button
            variant="outlined"
            onClick={handleRefresh}
            startIcon={<AutorenewIcon sx={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />}
            sx={{ borderColor: saasTokens.border.main, color: saasTokens.text.primary, bgcolor: '#ffffff', '&:hover': { bgcolor: '#f8fafc' } }}
          >
            Force Sync
          </Button>
        </Box>
      </Box>

      {/* Top Executive KPI Metric Cards Bar */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Total Monitored Tasks"
            value={metrics.total}
            subtitle="Celery worker execution history"
            icon={<StorageIcon />}
            tooltip="Total asynchronous pipelines executed across all worker queues"
            onClick={() => setStatusFilter('ALL')}
            active={statusFilter === 'ALL'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Worker Success Rate"
            value={`${metrics.successRate.toFixed(1)}%`}
            subtitle={`${metrics.success} successful pipeline runs`}
            trend={metrics.successRate > 80 ? 2.4 : -1.5}
            trendLabel="reliability"
            icon={<CheckCircleOutlineIcon />}
            accentColor={saasTokens.status.success.main}
            onClick={() => setStatusFilter('SUCCESS')}
            active={statusFilter === 'SUCCESS'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Active & Queued Pipelines"
            value={metrics.active}
            subtitle="Current live concurrency"
            icon={<AutorenewIcon />}
            accentColor={saasTokens.secondary.main}
            tooltip="Tasks actively computing or waiting in Redis broker"
            onClick={() => setStatusFilter('ACTIVE')}
            active={statusFilter === 'ACTIVE'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Execution Failures"
            value={metrics.failure}
            subtitle={metrics.failure > 0 ? "Requires traceback analysis" : "All pipelines operating normally"}
            icon={<ErrorOutlineIcon />}
            accentColor={saasTokens.status.error.main}
            tooltip="Tasks terminated with Python exceptions or timeouts"
            onClick={() => setStatusFilter('FAILURE')}
            active={statusFilter === 'FAILURE'}
          />
        </Grid>
      </Grid>

      {/* Filter & Search Toolbar */}
      <Box sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: '12px 12px 0 0', borderBottom: 'none', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 2, boxShadow: '0 4px 16px rgba(15, 23, 42, 0.02)' }}>
        <FilterChipGroup
          options={filterOptions}
          selectedValue={statusFilter}
          onChange={(val) => setStatusFilter(val)}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SearchInput
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            placeholder="Search tasks, UUIDs, or errors..."
            width={320}
          />
        </Box>
      </Box>

      {/* Main DataGrid Table */}
      <Box sx={{ height: 'calc(100vh - 420px)', minHeight: 450, width: '100%', bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: '0 0 12px 12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)' }}>
        <DataGrid 
          rows={filteredRows} 
          columns={columns} 
          disableRowSelectionOnClick
          rowHeight={56}
          columnHeaderHeight={46}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          pageSizeOptions={[15, 25, 50, 100]}
          sx={{
            border: 0,
            color: saasTokens.text.primary,
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: saasTokens.background.header,
              color: saasTokens.text.secondary,
              textTransform: 'uppercase',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              borderBottom: `1px solid ${saasTokens.border.main}`
            },
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${saasTokens.border.main}`,
              display: 'flex',
              alignItems: 'center',
              fontVariantNumeric: 'tabular-nums',
            },
            '& .MuiDataGrid-row': {
              bgcolor: '#ffffff',
              transition: 'background-color 0.15s ease',
              '&:hover': { bgcolor: '#f8fafc' }
            },
            '& .MuiDataGrid-row:nth-of-type(even)': {
              bgcolor: '#f8fafc',
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: `1px solid ${saasTokens.border.main}`,
              bgcolor: saasTokens.background.header,
              color: saasTokens.text.secondary
            },
            '& .MuiTablePagination-root': { color: saasTokens.text.secondary },
            '& .MuiDataGrid-overlay': { bgcolor: '#ffffff' }
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
