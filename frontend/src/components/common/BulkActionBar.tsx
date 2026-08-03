import React from 'react';
import { Box, Typography, Button, Slide } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useThemeMode } from '../../theme/ThemeContext';

export interface BulkActionItem {
  label: string;
  onClick: () => void;
  isPrimary?: boolean;
  icon?: 'calc' | 'watchlist' | 'export';
}

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection?: () => void;
  actions: BulkActionItem[];
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  onClearSelection,
  actions
}) => {
  const { mode, tokens } = useThemeMode();
  const isDark = mode === 'dark';

  return (
    <Slide direction="down" in={selectedCount > 0} mountOnEnter unmountOnExit timeout={200}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1,
          height: 48,
          bgcolor: isDark ? '#1A1A1E' : '#FFFFFF',
          border: `1px solid ${isDark ? 'rgba(61, 255, 162, 0.3)' : tokens.border.light}`,
          borderRadius: 2,
          mb: 1.5,
          boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 16px rgba(15, 23, 42, 0.08)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CheckCircleOutlineIcon sx={{ color: tokens.accent.main, fontSize: 20 }} />
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: tokens.text.primary }}>
            {selectedCount} {selectedCount === 1 ? 'row selected' : 'rows selected'}
          </Typography>
          {onClearSelection && (
            <Button
              size="small"
              onClick={onClearSelection}
              sx={{ minWidth: 0, p: '2px 8px', fontSize: '0.72rem', color: tokens.text.secondary, textTransform: 'none' }}
            >
              Clear
            </Button>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
          {actions.map((act) => {
            let iconEl = null;
            if (act.icon === 'calc') iconEl = <AssessmentOutlinedIcon sx={{ fontSize: 15 }} />;
            else if (act.icon === 'watchlist') iconEl = <BookmarkAddOutlinedIcon sx={{ fontSize: 15 }} />;
            else if (act.icon === 'export') iconEl = <FileDownloadOutlinedIcon sx={{ fontSize: 15 }} />;

            const primaryBg = isDark ? '#3DFFA2' : '#0FAE64';
            const primaryText = isDark ? '#0B0B0D' : '#FFFFFF';

            return (
              <Button
                key={act.label}
                onClick={act.onClick}
                variant={act.isPrimary ? "contained" : "outlined"}
                startIcon={iconEl}
                sx={{
                  height: 32,
                  px: 1.5,
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  bgcolor: act.isPrimary ? primaryBg : 'transparent',
                  color: act.isPrimary ? primaryText : tokens.text.primary,
                  border: act.isPrimary ? 'none' : `1px solid ${tokens.border.light}`,
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor: act.isPrimary ? (isDark ? '#59FFB2' : '#0E9B59') : tokens.background.cardHover,
                    borderColor: act.isPrimary ? 'none' : tokens.text.secondary,
                    transform: 'translateY(-1px)',
                    boxShadow: act.isPrimary ? `0 2px 10px ${tokens.accent.tint}` : 'none'
                  }
                }}
              >
                {act.label}
              </Button>
            );
          })}
        </Box>
      </Box>
    </Slide>
  );
};
