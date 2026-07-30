import React, { useState } from 'react';
import { Box, Drawer, Typography, IconButton, Button, Tooltip, Paper, Chip, Tab, Tabs } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import CodeIcon from '@mui/icons-material/Code';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TerminalIcon from '@mui/icons-material/Terminal';
import CheckIcon from '@mui/icons-material/Check';
import { StatusBadge } from '../common/StatusBadge';
import { saasTokens } from '../../theme/theme';

export interface BackgroundJob {
  id: string;
  celeryTaskId: string;
  taskName: string;
  status: string;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: string;
  errorMessage?: string;
  duration?: string;
}

export interface TaskDetailDrawerProps {
  open: boolean;
  task: BackgroundJob | null;
  onClose: () => void;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  open,
  task,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  if (!task) return null;

  const isFailure = task.status === 'FAILURE';
  const logContent = task.errorMessage || task.result || 'No diagnostic output or result returned by Celery worker.';

  const handleCopy = (text: string, setCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLog = () => {
    const filename = `qeps_task_${task.celeryTaskId || task.id}.log`;
    const element = document.createElement('a');
    const file = new Blob(
      [
        `================================================================================\n` +
        `QEPS QUANTITATIVE EARNINGS PREDICTION SYSTEM - WORKER DIAGNOSTIC LOG\n` +
        `================================================================================\n` +
        `TASK MODULE:    ${task.taskName}\n` +
        `CELERY UUID:    ${task.celeryTaskId}\n` +
        `EXECUTION STATUS: ${task.status}\n` +
        `QUEUED TIMESTAMP: ${new Date(task.queuedAt + "Z").toUTCString()}\n` +
        `TOTAL DURATION:   ${task.duration ? `${parseFloat(task.duration).toFixed(3)}s` : 'N/A'}\n` +
        `================================================================================\n\n` +
        `WORKER OUTPUT & EXCEPTION TRACEBACK:\n` +
        `--------------------------------------------------------------------------------\n` +
        logContent + '\n'
      ],
      { type: 'text/plain' }
    );
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDownloadJson = () => {
    const filename = `qeps_task_${task.celeryTaskId || task.id}.json`;
    const element = document.createElement('a');
    const file = new Blob([JSON.stringify(task, null, 2)], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 540, md: 620 },
          bgcolor: '#ffffff',
          borderLeft: `1px solid ${saasTokens.border.main}`,
          boxShadow: '-8px 0 30px rgba(15, 23, 42, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 1300,
        },
      }}
    >
      {/* Header Area */}
      <Box sx={{ p: 3, bgcolor: saasTokens.background.header, borderBottom: `1px solid ${saasTokens.border.main}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <StatusBadge status={task.status} size="medium" />
            <Typography sx={{ fontSize: '0.75rem', color: saasTokens.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
              Duration: <strong style={{ color: saasTokens.text.primary }}>{task.duration ? `${parseFloat(task.duration).toFixed(2)}s` : 'N/A'}</strong>
            </Typography>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.15rem', color: saasTokens.text.primary, wordBreak: 'break-word', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
            {task.taskName}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.2 }}>
            <Chip 
              label={`UUID: ${task.celeryTaskId || task.id}`} 
              size="small" 
              sx={{ 
                bgcolor: '#f1f5f9', 
                color: saasTokens.text.secondary, 
                border: `1px solid ${saasTokens.border.main}`,
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                maxWidth: '320px',
              }} 
            />
            <Tooltip title={copiedId ? "UUID Copied!" : "Copy Task UUID"}>
              <IconButton 
                size="small" 
                onClick={() => handleCopy(task.celeryTaskId || task.id, setCopiedId)}
                sx={{ color: copiedId ? '#10b981' : saasTokens.text.secondary, '&:hover': { color: saasTokens.text.primary } }}
              >
                {copiedId ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <IconButton 
          onClick={onClose} 
          sx={{ color: saasTokens.text.secondary, border: `1px solid ${saasTokens.border.main}`, bgcolor: '#ffffff', '&:hover': { color: saasTokens.text.primary, bgcolor: saasTokens.background.cardHover } }}
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Section Navigation Tabs */}
      <Box sx={{ px: 3, borderBottom: `1px solid ${saasTokens.border.main}`, bgcolor: '#f8fafc' }}>
        <Tabs 
          value={activeTab} 
          onChange={(_, val) => setActiveTab(val)}
          sx={{
            minHeight: 46,
            '& .MuiTab-root': {
              minHeight: 46,
              fontSize: '0.8rem',
              fontWeight: 600,
              color: saasTokens.text.secondary,
              textTransform: 'none',
              px: 2,
              '&.Mui-selected': { color: saasTokens.primary.main }
            },
            '& .MuiTabs-indicator': { bgcolor: saasTokens.primary.main, height: 2.5, borderRadius: '3px 3px 0 0' }
          }}
        >
          <Tab icon={<TerminalIcon sx={{ fontSize: 16, mr: 0.8 }} />} iconPosition="start" label="Terminal Logs & Diagnostics" />
          <Tab icon={<AccessTimeIcon sx={{ fontSize: 16, mr: 0.8 }} />} iconPosition="start" label="Lifecycle Timeline" />
          <Tab icon={<CodeIcon sx={{ fontSize: 16, mr: 0.8 }} />} iconPosition="start" label="Raw JSON Payload" />
        </Tabs>
      </Box>

      {/* Scrollable Content Area */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 3, bgcolor: saasTokens.background.default }}>
        {/* TAB 0: LOGS & DIAGNOSTICS */}
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: saasTokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Worker Output Log Stream
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={() => handleCopy(logContent, setCopiedLogs)}
                  startIcon={copiedLogs ? <CheckIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.72rem', py: 0.4, borderColor: saasTokens.border.main, color: copiedLogs ? '#10b981' : saasTokens.text.secondary }}
                >
                  {copiedLogs ? 'Copied' : 'Copy'}
                </Button>
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={handleDownloadLog}
                  startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.72rem', py: 0.4, borderColor: saasTokens.border.main, color: saasTokens.primary.light }}
                >
                  Export .LOG
                </Button>
              </Box>
            </Box>

            <Paper
              sx={{
                p: 2.5,
                bgcolor: '#f8fafc',
                border: `1px solid ${isFailure ? '#fda4af' : saasTokens.border.main}`,
                borderRadius: 2,
                flex: 1,
                minHeight: 320,
                overflowX: 'auto',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.8rem',
                lineHeight: 1.6,
                color: isFailure ? '#e11d48' : '#0f172a',
                boxShadow: 'none',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {logContent}
            </Paper>
          </Box>
        )}

        {/* TAB 1: LIFECYCLE TIMELINE */}
        {activeTab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: saasTokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Celery Worker Task Lifecycle
            </Typography>

            <Box sx={{ position: 'relative', pl: 3.5, borderLeft: `2px solid ${saasTokens.border.main}`, ml: 1, my: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Step 1: Queued */}
              <Box sx={{ position: 'relative' }}>
                <Box sx={{ position: 'absolute', left: -36, top: 0, width: 16, height: 16, borderRadius: '50%', bgcolor: saasTokens.primary.main, border: '3px solid #ffffff', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.15)' }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: saasTokens.text.primary }}>
                  Task Queued onto Redis Broker
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: saasTokens.text.secondary, fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
                  Timestamp: {task.queuedAt ? new Date(task.queuedAt + "Z").toLocaleString() : 'Recorded in backlog'}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: saasTokens.text.disabled, mt: 0.3 }}>
                  Status at stage: QUEUED (Awaiting Celery pool execution slot)
                </Typography>
              </Box>

              {/* Step 2: Processing & Execution */}
              <Box sx={{ position: 'relative' }}>
                <Box sx={{ position: 'absolute', left: -36, top: 0, width: 16, height: 16, borderRadius: '50%', bgcolor: saasTokens.secondary.main, border: '3px solid #ffffff', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.15)' }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: saasTokens.text.primary }}>
                  Active Processing in Container
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: saasTokens.text.secondary, fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
                  Worker Engine: <code style={{ color: saasTokens.primary.main }}>qeps_worker</code> (Async multi-core processing)
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: saasTokens.text.disabled, mt: 0.3 }}>
                  Execution duration: {task.duration ? `${parseFloat(task.duration).toFixed(3)} seconds` : 'Ongoing computation'}
                </Typography>
              </Box>

              {/* Step 3: Conclusion */}
              <Box sx={{ position: 'relative' }}>
                <Box 
                  sx={{ 
                    position: 'absolute', 
                    left: -36, 
                    top: 0, 
                    width: 16, 
                    height: 16, 
                    borderRadius: '50%', 
                    bgcolor: isFailure ? saasTokens.status.error.main : saasTokens.status.success.main, 
                    border: '3px solid #ffffff', 
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.15)' 
                  }} 
                />
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: isFailure ? '#e11d48' : '#059669' }}>
                  {isFailure ? 'Worker Execution Terminated with Failure' : 'Execution Completed Successfully'}
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: saasTokens.text.secondary, fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
                  Result persisted to PostgreSQL backend database.
                </Typography>
                {isFailure && (
                  <Paper sx={{ p: 1.5, mt: 1, bgcolor: '#fff1f2', border: '1px solid #fda4af', borderRadius: 1.5, fontSize: '0.75rem', color: '#e11d48', boxShadow: 'none' }}>
                    Error check: Refer to terminal logs for full exception stack trace and file origins.
                  </Paper>
                )}
              </Box>
            </Box>
          </Box>
        )}

        {/* TAB 2: RAW JSON PAYLOAD */}
        {activeTab === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: saasTokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                GraphQL Task Serialization
              </Typography>
              <Button 
                size="small" 
                variant="outlined" 
                onClick={handleDownloadJson}
                startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
                sx={{ fontSize: '0.72rem', py: 0.4, borderColor: saasTokens.border.main, color: saasTokens.primary.main }}
              >
                Export .JSON
              </Button>
            </Box>
            <Paper
              sx={{
                p: 2.5,
                bgcolor: '#f8fafc',
                border: `1px solid ${saasTokens.border.main}`,
                borderRadius: 2,
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: '0.78rem',
                color: '#0f172a',
                overflowX: 'auto',
                boxShadow: 'none',
              }}
            >
              <pre style={{ margin: 0 }}>{JSON.stringify(task, null, 2)}</pre>
            </Paper>
          </Box>
        )}
      </Box>

      {/* Footer Actions */}
      <Box sx={{ p: 2.5, bgcolor: '#ffffff', borderTop: `1px solid ${saasTokens.border.main}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.72rem', color: saasTokens.text.disabled }}>
          ID: {task.id} • Celery Backend
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" onClick={onClose} sx={{ px: 2, py: 0.8, borderColor: saasTokens.border.main, color: saasTokens.text.secondary, bgcolor: '#ffffff', '&:hover': { bgcolor: '#f8fafc', color: saasTokens.text.primary } }}>
            Dismiss Panel
          </Button>
          <Button variant="contained" color="primary" onClick={handleDownloadLog} startIcon={<DownloadIcon />} sx={{ bgcolor: '#0f172a', color: '#ffffff', '&:hover': { bgcolor: '#1e293b' } }}>
            Download Report
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default TaskDetailDrawer;
