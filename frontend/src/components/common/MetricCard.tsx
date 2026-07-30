import React from 'react';
import { Box, Typography, Paper, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { saasTokens } from '../../theme/theme';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number; // Positive or negative percentage trend
  trendLabel?: string;
  icon?: React.ReactNode;
  tooltip?: string;
  onClick?: () => void;
  active?: boolean;
  accentColor?: string;
  sx?: Record<string, any>;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  icon,
  tooltip,
  onClick,
  active = false,
  accentColor = '#0f172a',
  sx = {},
}) => {
  const isPositiveTrend = trend !== undefined && trend >= 0;
  const trendColor = isPositiveTrend ? saasTokens.status.success.main : saasTokens.status.error.main;
  const trendBg = isPositiveTrend ? saasTokens.status.success.tint : saasTokens.status.error.tint;

  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2.5,
        borderRadius: 3,
        bgcolor: active ? '#f8fafc' : saasTokens.background.card,
        border: `1px solid ${active ? '#0f172a' : saasTokens.border.main}`,
        boxShadow: active ? '0 4px 12px rgba(15, 23, 42, 0.06)' : '0 1px 3px 0 rgba(0, 0, 0, 0.04)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          bgcolor: onClick ? saasTokens.background.cardHover : undefined,
          borderColor: onClick ? saasTokens.border.light : undefined,
          transform: onClick ? 'translateY(-1px)' : undefined,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
        },
        ...sx,
      }}
    >
      {active && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            backgroundColor: accentColor || '#0f172a',
          }}
        />
      )}
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography
            sx={{
              color: saasTokens.text.secondary,
              fontSize: '0.78rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {title}
          </Typography>
          {tooltip && (
            <Tooltip title={tooltip} placement="top">
              <InfoOutlinedIcon sx={{ fontSize: '15px', color: saasTokens.text.secondary, cursor: 'help', opacity: 0.7, '&:hover': { opacity: 1 } }} />
            </Tooltip>
          )}
        </Box>
        
        {icon && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: 2,
              bgcolor: '#f1f5f9',
              color: '#334155',
              border: `1px solid ${saasTokens.border.main}`,
            }}
          >
            {icon}
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography
          variant="h4"
          sx={{
            fontSize: '1.85rem',
            fontWeight: 700,
            color: saasTokens.text.primary,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </Typography>

        {trend !== undefined && (
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              px: 1,
              py: 0.25,
              borderRadius: 1.5,
              bgcolor: trendBg,
              color: trendColor,
              fontSize: '0.75rem',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {isPositiveTrend ? <TrendingUpIcon sx={{ fontSize: '13px' }} /> : <TrendingDownIcon sx={{ fontSize: '13px' }} />}
            {isPositiveTrend ? '+' : ''}{trend.toFixed(1)}% {trendLabel ? `(${trendLabel})` : ''}
          </Box>
        )}
      </Box>

      {subtitle && (
        <Typography
          sx={{
            color: saasTokens.text.secondary,
            fontSize: '0.78rem',
            mt: 1,
            opacity: 0.9,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
};

export default MetricCard;
