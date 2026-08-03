import React from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useThemeMode } from '../../theme/ThemeContext';

export interface MomentumGaugeProps {
  value: number; // 0 to 100
  size?: number;
}

export const MomentumGauge: React.FC<MomentumGaugeProps> = ({ value, size = 36 }) => {
  const { tokens } = useThemeMode();
  const clampedValue = Math.min(Math.max(Math.round(value), 0), 100);

  let progressColor = tokens.status.error.main; // < 40
  if (clampedValue > 70) {
    progressColor = tokens.status.success.main;
  } else if (clampedValue >= 40) {
    progressColor = tokens.status.warning.main;
  }

  const trackColor = tokens.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
      }}
    >
      {/* Background Track */}
      <CircularProgress
        variant="determinate"
        value={100}
        size={size}
        thickness={3.5}
        sx={{
          color: trackColor,
          position: 'absolute',
          left: 0,
          top: 0,
        }}
      />
      {/* Active Progress Arc */}
      <CircularProgress
        variant="determinate"
        value={clampedValue}
        size={size}
        thickness={3.5}
        sx={{
          color: progressColor,
          position: 'absolute',
          left: 0,
          top: 0,
          '& .MuiCircularProgress-circle': {
            strokeLinecap: 'round',
          },
        }}
      />
      {/* Center Monospace Percentage Text */}
      <Box
        component="span"
        className="mono-font tabular-nums"
        sx={{
          fontSize: '11px',
          fontWeight: 600,
          color: tokens.text.primary,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {clampedValue}%
      </Box>
    </Box>
  );
};
