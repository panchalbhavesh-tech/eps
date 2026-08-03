import React from 'react';
import { Box, Tooltip } from '@mui/material';
import { useThemeMode } from '../../theme/ThemeContext';

export interface FactorChartProps {
  technical?: number | null;
  fundamental?: number | null;
  smartMoney?: number | null;
  derivatives?: number | null;
  regime?: number | null;
  width?: number;
}

export const FactorChart: React.FC<FactorChartProps> = ({
  technical = 50,
  fundamental = 50,
  smartMoney = 50,
  derivatives = 50,
  regime = 50,
  width = 100,
}) => {
  const { tokens } = useThemeMode();

  const techVal = Math.round(Math.max(0, Math.min(100, Number(technical ?? 50))));
  const fundVal = Math.round(Math.max(0, Math.min(100, Number(fundamental ?? 50))));
  const smVal = Math.round(Math.max(0, Math.min(100, Number(smartMoney ?? 50))));
  const derivVal = Math.round(Math.max(0, Math.min(100, Number(derivatives ?? 50))));
  const regVal = Math.round(Math.max(0, Math.min(100, Number(regime ?? 50))));

  const tooltipText = `Technical ${techVal}% | Fundamental ${fundVal}% | Smart Money ${smVal}% | Derivatives ${derivVal}% | Regime ${regVal}%`;

  return (
    <Tooltip title={tooltipText} arrow placement="top">
      <Box
        role="group"
        aria-label="5-Factor Momentum breakdown"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width,
          cursor: 'pointer',
          py: 0.5,
        }}
      >
        {/* Horizontal Stacked Mini Bar */}
        <Box
          sx={{
            width: '100%',
            height: '6px',
            borderRadius: '2px',
            display: 'flex',
            overflow: 'hidden',
            backgroundColor: tokens.border.main,
            mb: '4px',
          }}
        >
          <Box
            sx={{
              width: '20%',
              height: '100%',
              backgroundColor: '#00B4D8', // Technical (TECH)
              borderRight: `1px solid ${tokens.background.card}`,
              opacity: techVal / 100 * 0.7 + 0.3,
            }}
          />
          <Box
            sx={{
              width: '20%',
              height: '100%',
              backgroundColor: '#3DFFA2', // Fundamental (FUND)
              borderRight: `1px solid ${tokens.background.card}`,
              opacity: fundVal / 100 * 0.7 + 0.3,
            }}
          />
          <Box
            sx={{
              width: '20%',
              height: '100%',
              backgroundColor: '#7C3AED', // Smart Money (SM)
              borderRight: `1px solid ${tokens.background.card}`,
              opacity: smVal / 100 * 0.7 + 0.3,
            }}
          />
          <Box
            sx={{
              width: '20%',
              height: '100%',
              backgroundColor: '#FFA502', // Derivatives (DERIV)
              borderRight: `1px solid ${tokens.background.card}`,
              opacity: derivVal / 100 * 0.7 + 0.3,
            }}
          />
          <Box
            sx={{
              width: '20%',
              height: '100%',
              backgroundColor: '#00D9FF', // Regime (REGIME)
              opacity: regVal / 100 * 0.7 + 0.3,
            }}
          />
        </Box>
        {/* Label below bar */}
        <Box
          component="div"
          className="mono-font"
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '92%',
            fontSize: '11px',
            color: tokens.text.secondary,
            lineHeight: '14px',
            fontWeight: 500,
          }}
        >
          <span>T</span>
          <span>F</span>
          <span>S</span>
          <span>D</span>
          <span>R</span>
        </Box>
      </Box>
    </Tooltip>
  );
};
