import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import { useThemeMode } from '../../theme/ThemeContext';

export const ThemeModeToggle: React.FC = () => {
  const { mode, toggleMode, tokens } = useThemeMode();
  const isDark = mode === 'dark';

  return (
    <Tooltip title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}>
      <IconButton
        size="small"
        aria-label="Toggle Light/Dark Theme Mode"
        onClick={toggleMode}
        sx={{
          color: isDark ? tokens.accent.main : '#F59E0B',
          backgroundColor: 'transparent !important',
          transition: 'opacity 0.15s ease-in-out, transform 0.15s ease-in-out',
          '&:hover': {
            opacity: 0.8,
            transform: 'scale(1.1)',
          },
        }}
      >
        {isDark ? <DarkModeOutlinedIcon sx={{ fontSize: 18 }} /> : <LightModeOutlinedIcon sx={{ fontSize: 18 }} />}
      </IconButton>
    </Tooltip>
  );
};

export default ThemeModeToggle;
