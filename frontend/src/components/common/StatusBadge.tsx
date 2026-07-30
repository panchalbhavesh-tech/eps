import React from 'react';
import { Box, Typography } from '@mui/material';
import { saasTokens } from '../../theme/theme';

export interface StatusBadgeProps {
  status: string;
  size?: 'small' | 'medium';
  icon?: React.ReactNode;
  variant?: 'outline' | 'glow' | 'filled';
  sx?: Record<string, any>;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status = '',
  size = 'small',
  icon,
  variant = 'glow',
  sx = {},
}) => {
  const normalized = status.toUpperCase();

  let scheme = saasTokens.status.neutral;
  if (
    normalized.includes('SUCCESS') ||
    normalized.includes('BUY') ||
    normalized.includes('HIGH') ||
    normalized.includes('POSITIVE') ||
    normalized.includes('ACTIVE')
  ) {
    scheme = saasTokens.status.success;
  } else if (
    normalized.includes('FAIL') ||
    normalized.includes('ERROR') ||
    normalized.includes('EXIT') ||
    normalized.includes('WEAK') ||
    normalized.includes('NEGATIVE')
  ) {
    scheme = saasTokens.status.error;
  } else if (
    normalized.includes('RUNNING') ||
    normalized.includes('PROGRESS') ||
    normalized.includes('WARN') ||
    normalized.includes('HOLD') ||
    normalized.includes('ATTENTION')
  ) {
    scheme = saasTokens.status.warning;
  } else if (
    normalized.includes('QUEUED') ||
    normalized.includes('INFO') ||
    normalized.includes('WATCH') ||
    normalized.includes('NEUTRAL')
  ) {
    scheme = saasTokens.status.info;
  }

  const padding = size === 'small' ? '3px 10px' : '5px 12px';
  const fontSize = size === 'small' ? '0.72rem' : '0.8rem';

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.6,
        padding,
        borderRadius: size === 'small' ? '6px' : '8px',
        fontSize,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
        backgroundColor: variant === 'glow' || variant === 'filled' ? scheme.tint : 'transparent',
        color: scheme.main,
        border: `1px solid ${scheme.border || scheme.main}`,
        boxShadow: 'none',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {icon && <Box component="span" sx={{ display: 'flex', alignItems: 'center', fontSize: '1.1em' }}>{icon}</Box>}
      <Typography
        component="span"
        sx={{
          fontSize: 'inherit',
          fontWeight: 'inherit',
          color: 'inherit',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {status}
      </Typography>
    </Box>
  );
};

export default StatusBadge;
