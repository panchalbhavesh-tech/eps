import React from 'react';
import { Drawer, Box, Typography, IconButton, Divider, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useThemeMode } from '../../theme/ThemeContext';
import { AdminActivityLog } from '../../pages/AdminLogs';
import { StatusBadge } from '../common';
import { formatToIST } from '../../utils';

interface AdminLogDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  log: AdminActivityLog;
}

const AdminLogDetailDrawer: React.FC<AdminLogDetailDrawerProps> = ({ open, onClose, log }) => {
  const { mode, tokens } = useThemeMode();
  const isDark = mode === 'dark';

  let meta = {};
  try {
    if (log.metadataJson) {
      meta = JSON.parse(log.metadataJson);
    }
  } catch (e) {}

  const LabelValue = ({ label, value, render }: { label: string, value?: string, render?: React.ReactNode }) => (
    <Box sx={{ mb: 3 }}>
      <Typography variant="overline" sx={{ color: tokens.text.disabled, fontWeight: 600, display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      {render || <Typography variant="body1" sx={{ color: tokens.text.primary, fontWeight: 500 }}>{value || '-'}</Typography>}
    </Box>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 400 },
          bgcolor: tokens.background.default,
          backgroundImage: 'none',
          borderLeft: `1px solid ${tokens.border.main}`
        }
      }}
    >
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${tokens.border.light}` }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: tokens.text.primary }}>
          Activity Details
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ p: 3, overflowY: 'auto' }}>
        <LabelValue label="Event Name" value={log.eventName} />
        
        <LabelValue 
          label="Status" 
          render={<StatusBadge status={log.status} />}
        />
        
        <LabelValue 
          label="Event Type" 
          render={
            <Chip 
              label={log.eventType} 
              size="small"
              sx={{ 
                bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                color: tokens.text.primary,
                fontWeight: 600,
                borderRadius: 1
              }}
            />
          }
        />

        <LabelValue label="Executed By" value={log.userEmail} />

        <Divider sx={{ my: 3, borderColor: tokens.border.light }} />

        <LabelValue 
          label="Started" 
          value={log.startedAt ? formatToIST(log.startedAt).fullStr : '-'} 
        />
        
        {log.completedAt && (
          <LabelValue 
            label="Completed" 
            value={formatToIST(log.completedAt).fullStr} 
          />
        )}
        
        <LabelValue 
          label="Duration" 
          value={log.durationMs ? `${log.durationMs} ms` : 'In Progress...'} 
        />

        {log.celeryTaskId && (
          <LabelValue label="Celery Task ID" value={log.celeryTaskId} />
        )}

        {Object.keys(meta).length > 0 && (
          <>
            <Divider sx={{ my: 3, borderColor: tokens.border.light }} />
            <Typography variant="overline" sx={{ color: tokens.text.disabled, fontWeight: 600, display: 'block', mb: 1 }}>
              Metadata & Results
            </Typography>
            <Box sx={{ 
              p: 2, 
              bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', 
              borderRadius: 1,
              border: `1px solid ${tokens.border.light}`,
              overflowX: 'auto'
            }}>
              <pre style={{ margin: 0, fontSize: '0.8rem', color: tokens.text.secondary, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(meta, null, 2)}
              </pre>
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
};

export default AdminLogDetailDrawer;
