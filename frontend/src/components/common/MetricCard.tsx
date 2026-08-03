import React from 'react';
import { Box, Typography, Paper, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useThemeMode } from '../../theme/ThemeContext';

export interface MetricCardProps {
  title?: string;
  label?: string;
  value: string | number;
  subtitle?: string;
  subtext?: string;
  change?: string | number;
  trend?: number | 'up' | 'down' | string;
  trendLabel?: string;
  icon?: React.ReactNode;
  tooltip?: string;
  onClick?: () => void;
  active?: boolean;
  sx?: Record<string, any>;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  label,
  value,
  subtitle,
  subtext,
  change,
  trend,
  trendLabel,
  icon,
  tooltip,
  onClick,
  active = false,
  sx = {},
}) => {
  const { tokens } = useThemeMode();
  const displayLabel = label || title || '';
  const displaySubtext = subtext || subtitle || (typeof change === 'string' ? change : undefined) || '';

  let isPositiveTrend = true;
  let trendDisplay: string | null = null;

  if (typeof trend === 'number') {
    isPositiveTrend = trend >= 0;
    trendDisplay = `${isPositiveTrend ? '+' : ''}${trend.toFixed(1)}%`;
  } else if (trend !== undefined) {
    isPositiveTrend = trend !== 'down';
    if (typeof change === 'number') {
      trendDisplay = `${isPositiveTrend ? '+' : ''}${change}%`;
    } else if (trend === 'up') {
      trendDisplay = '▲ Bullish';
    } else if (trend === 'down') {
      trendDisplay = '▼ Bearish';
    } else {
      trendDisplay = trend;
    }
  }

  const trendColor = isPositiveTrend ? tokens.status.success.main : tokens.status.error.main;
  const trendBg = isPositiveTrend ? tokens.status.success.wash : tokens.status.error.wash;

  return (
    <Paper
      onClick={onClick}
      sx={{
        padding: '12px 16px',
        borderRadius: '12px',
        backgroundColor: active ? tokens.background.cardHover : tokens.background.card,
        border: `1px solid ${active ? tokens.accent.main : tokens.border.main}`,
        boxShadow: tokens.shadows.card,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease-in-out',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        '&:hover': {
          backgroundColor: onClick ? tokens.background.cardHover : tokens.background.card,
          borderColor: onClick ? tokens.border.light : tokens.border.main,
          transform: onClick ? 'translateY(-1px)' : undefined,
          boxShadow: tokens.shadows.subtle,
        },
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '8px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Typography
            sx={{
              color: tokens.text.secondary,
              fontSize: '11px',
              fontFamily: tokens.typography.fontFamily,
              fontWeight: 600,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              lineHeight: '16px',
            }}
          >
            {displayLabel}
          </Typography>
          {tooltip && (
            <Tooltip title={tooltip} placement="top">
              <InfoOutlinedIcon sx={{ fontSize: '14px', color: tokens.text.tertiary, cursor: 'help' }} />
            </Tooltip>
          )}
        </Box>

        {icon && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tokens.accent.main,
            }}
          >
            {icon}
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <Typography
          className="mono-font tabular-nums"
          sx={{
            fontSize: '18px',
            fontWeight: 600,
            color: tokens.text.primary,
            lineHeight: '24px',
          }}
        >
          {value}
        </Typography>

        {trendDisplay && (
          <Box
            className="mono-font tabular-nums"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              px: '6px',
              py: '2px',
              borderRadius: '6px',
              backgroundColor: trendBg,
              color: trendColor,
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            {isPositiveTrend ? <TrendingUpIcon sx={{ fontSize: '12px' }} /> : <TrendingDownIcon sx={{ fontSize: '12px' }} />}
            {trendDisplay} {trendLabel ? `(${trendLabel})` : ''}
          </Box>
        )}
      </Box>

      {displaySubtext && (
        <Typography
          sx={{
            color: tokens.text.secondary,
            fontSize: '11px',
            lineHeight: '15px',
            mt: '4px',
            fontFamily: tokens.typography.fontFamily,
          }}
        >
          {displaySubtext}
        </Typography>
      )}
    </Paper>
  );
};

export default MetricCard;
