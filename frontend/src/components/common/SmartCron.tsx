import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useLazyQuery, gql } from '@apollo/client';
import { Box, Typography, Button, CircularProgress, IconButton, Drawer, Divider, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Menu } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { StatusBadge } from './StatusBadge';
import { useThemeMode } from '../../theme/ThemeContext';

const GET_CELERY_SCHEDULES = gql`
  query GetCelerySchedules {
    celerySchedules {
      name
      taskName
      cronTitle
      category
      lastRunAt
      lastRunStatus
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

const PAGE_WORKER_MAPPING: Record<string, string[]> = {
  events: [
    'app.worker.tasks.sync_nse_calendar_task',
    'app.worker.tasks.sync_nse_universe_task',
    'app.worker.tasks.calculate_universe_health_task',
    'app.worker.tasks.run_pre_release_edge_pipeline_task',
    'app.worker.tasks.backfill_earnings_history_task',
    'app.worker.tasks.retrain_pre_release_model_task'
  ],
  momentum: [
    'app.worker.tasks.run_nse_momentum_scan_task',
    'app.worker.tasks.resolve_realized_forward_returns_task',
    'app.worker.tasks.monitor_momentum_trades_task',
    'app.worker.tasks.send_momentum_scorecard_task'
  ],
  hypothesis: [
    'app.worker.tasks.run_automated_hypothesis_research_task',
    'app.worker.tasks.retrain_momentum_ml_model_task',
    'app.worker.tasks.audit_shadow_model_performance_task'
  ],
  catalyst: [
    'app.worker.tasks.scan_nse_catalysts_live_task',
    'app.worker.tasks.update_catalyst_outcomes_task',
    'app.worker.tasks.scan_pre_catalyst_anomalies_task',
    'app.worker.tasks.scan_insider_trades_task',
    'app.worker.tasks.send_catalyst_digest_task',
    'app.worker.tasks.send_catalyst_scorecard_task',
    'app.worker.tasks.build_catalyst_evidence_task'
  ]
};

export const SmartCron: React.FC<{ page: string }> = ({ page }) => {
  const { tokens } = useThemeMode();
  
  const { data, refetch } = useQuery(GET_CELERY_SCHEDULES, {
    pollInterval: 15000,
    fetchPolicy: 'network-only'
  });

  const [triggerTask] = useMutation(TRIGGER_CELERY_TASK);
  const [getHistory, { data: historyData, loading: historyLoading }] = useLazyQuery(GET_WORKER_EXECUTION_HISTORY, {
    fetchPolicy: 'network-only'
  });

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [inspectDrawerOpen, setInspectDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [activeTrigger, setActiveTrigger] = useState<string | null>(null);

  const relevantTasks = PAGE_WORKER_MAPPING[page] || [];
  
  const workers = useMemo(() => {
    if (!data?.celerySchedules) return [];
    return data.celerySchedules.filter((sched: any) => relevantTasks.includes(sched.taskName));
  }, [data, relevantTasks]);

  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    refetch(); // Refresh status on open
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleRunNow = async (taskName: string) => {
    try {
      setActiveTrigger(taskName);
      await triggerTask({ variables: { taskName } });
      setTimeout(() => refetch(), 2000);
    } catch (e: any) {
      console.error(e);
    } finally {
      setActiveTrigger(null);
    }
  };

  const handleInspect = (worker: any) => {
    setSelectedTask(worker);
    setInspectDrawerOpen(true);
    getHistory({ variables: { taskName: worker.taskName } });
    handleCloseMenu();
  };

  if (workers.length === 0) {
    return null; // Hide if no relevant workers
  }

  // Group by category if we want to show category headers, but UI requests it as list.
  return (
    <>
      <Tooltip title="View & Trigger Contextual Workers" placement="top">
        <Button
          onClick={handleOpenMenu}
          size="small"
          startIcon={<SettingsIcon sx={{ fontSize: '15px !important' }} />}
          endIcon={<ArrowDropDownIcon sx={{ fontSize: '18px !important' }} />}
          sx={{
            backgroundColor: 'transparent',
            border: `1px solid ${tokens.border.main}`,
            color: tokens.text.primary,
            borderRadius: '4px',
            px: '12px',
            height: '32px',
            fontWeight: 600,
            fontSize: '12px',
            textTransform: 'none',
            boxShadow: 'none',
            transition: 'border-color 0.15s ease-in-out',
            '&:hover': { borderColor: tokens.border.focus, backgroundColor: tokens.background.cardHover }
          }}
        >
          Smart Cron
        </Button>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        PaperProps={{
          sx: {
            bgcolor: tokens.background.card,
            border: `1px solid ${tokens.border.main}`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            mt: 1,
            minWidth: 280,
            backgroundImage: 'none'
          }
        }}
      >
        <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${tokens.border.main}`, mb: 1 }}>
          <Typography sx={{ fontSize: '11px', fontWeight: 700, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Workers affecting this page
          </Typography>
        </Box>
        
        {workers.map((worker: any, idx: number) => {
          const isRunningLocally = activeTrigger === worker.taskName;
          const status = (worker.lastRunStatus || 'NEVER RUN').toUpperCase().replace('_', ' ');
          const isRunningState = status === 'RUNNING' || status === 'QUEUED';
          
          let categoryLabel = null;
          if (idx === 0 || workers[idx - 1].category !== worker.category) {
              categoryLabel = (
                  <Typography sx={{ fontSize: '10px', fontWeight: 800, color: tokens.primary.main, textTransform: 'uppercase', px: 2, mt: idx === 0 ? 0 : 1, mb: 0.5 }}>
                      {worker.category}
                  </Typography>
              );
          }

          return (
            <Box key={worker.taskName}>
              {categoryLabel}
              <Box sx={{ display: 'flex', flexDirection: 'column', px: 2, py: 1, '&:hover': { bgcolor: tokens.background.cardHover } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: '13px', fontWeight: 600, color: tokens.text.primary }}>
                        {worker.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" onClick={() => handleInspect(worker)} sx={{ color: tokens.text.secondary, p: 0.5, '&:hover': { color: tokens.primary.main } }}>
                            <VisibilityIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                        <IconButton 
                            size="small" 
                            disabled={isRunningLocally || isRunningState}
                            onClick={() => handleRunNow(worker.taskName)} 
                            sx={{ color: tokens.primary.main, p: 0.5, opacity: isRunningState ? 0.5 : 1 }}
                        >
                            {isRunningLocally ? <CircularProgress size={15} color="inherit" /> : <PlayArrowIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <StatusBadge status={status} size="small" />
                    {worker.lastRunAt && status !== 'RUNNING' && status !== 'QUEUED' && (
                        <Typography sx={{ fontSize: '10px', color: tokens.text.secondary }}>
                            {new Date(worker.lastRunAt + 'Z').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                    )}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Menu>

      <Drawer
        anchor="right"
        open={inspectDrawerOpen}
        onClose={() => setInspectDrawerOpen(false)}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 550 }, bgcolor: tokens.background.paper, backgroundImage: 'none', zIndex: 1300 }
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
  );
};
