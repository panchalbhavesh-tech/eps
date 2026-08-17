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
          color: tokens.text.secondary,
          backgroundColor: 'transparent',
          borderRadius: '4px',
          width: '24px',
          height: '24px',
          transition: 'color 0.15s ease-in-out',
          '&:hover': {
            color: tokens.text.primary,
            backgroundColor: 'transparent',
          },
        }}
      >
        {isDark ? <DarkModeOutlinedIcon sx={{ fontSize: 18 }} /> : <LightModeOutlinedIcon sx={{ fontSize: 18 }} />}
      </IconButton>
    </Tooltip>
  );
};

export default ThemeModeToggle;
