import React from 'react';
import { Box } from '@mui/material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useThemeMode } from '../../theme/ThemeContext';

export interface StatusBadgeProps {
  status?: string;
  label?: string;
  size?: 'small' | 'medium';
  icon?: React.ReactNode;
  iconType?: string;
  variant?: 'outline' | 'glow' | 'filled' | 'success' | 'error' | 'warning' | 'neutral' | 'info';
  sx?: Record<string, any>;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status = '',
  label,
  size = 'small',
  icon: customIcon,
  iconType,
  variant = 'glow',
  sx = {},
}) => {
  const { tokens } = useThemeMode();
  const displayLabel = label || status || '';
  const normalized = displayLabel.trim().toUpperCase();

  if (!displayLabel || displayLabel === '-' || displayLabel === '—' || normalized === 'N/A' || normalized === 'NONE' || normalized === 'EMPTY') {
    return (
      <Box
        component="span"
        sx={{
          color: tokens.text.tertiary,
          fontWeight: 400,
          fontSize: size === 'medium' ? '13px' : '12px',
          fontFamily: tokens.typography.fontFamily,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...sx,
        }}
      >
        —
      </Box>
    );
  }

  let scheme = tokens.status.neutral;
  let defaultIconType = 'dash';

  if (
    variant === 'success' ||
    normalized.includes('WIN') ||
    normalized.includes('BUY') ||
    normalized.includes('SUCCESS') ||
    normalized.includes('HIGH') ||
    normalized.includes('POSITIVE') ||
    normalized.includes('TARGET HIT')
  ) {
    scheme = tokens.status.success;
    defaultIconType = 'check';
  } else if (
    variant === 'error' ||
    normalized.includes('FAIL') ||
    normalized.includes('ERROR') ||
    normalized.includes('AVOID') ||
    normalized.includes('EXIT') ||
    normalized.includes('WEAK') ||
    normalized.includes('NEGATIVE') ||
    normalized.includes('LOSS')
  ) {
    scheme = tokens.status.error;
    defaultIconType = 'cross';
  } else if (
    variant === 'warning' ||
    normalized.includes('WARN') ||
    normalized.includes('HOLD') ||
    normalized.includes('CONTRARY') ||
    normalized.includes('ATTENTION') ||
    normalized.includes('RUNNING') ||
    normalized.includes('PROGRESS')
  ) {
    scheme = tokens.status.warning;
    defaultIconType = 'warning';
  } else if (
    variant === 'info' ||
    normalized.includes('INFO') ||
    normalized.includes('WATCH') ||
    normalized.includes('VALIDATED')
  ) {
    scheme = tokens.status.info;
    defaultIconType = 'info';
  }

  const effectiveIconType = iconType !== undefined ? iconType : defaultIconType;
  const iconStyle = { fontSize: size === 'medium' ? 16 : 14, flexShrink: 0, color: 'inherit', opacity: 0.95 };
  let iconNode = customIcon;
  if (!iconNode && effectiveIconType !== 'none') {
    if (effectiveIconType === 'check') iconNode = <CheckCircleOutlinedIcon sx={iconStyle} />;
    else if (effectiveIconType === 'cross' || effectiveIconType === 'error') iconNode = <CancelOutlinedIcon sx={iconStyle} />;
    else if (effectiveIconType === 'warning') iconNode = <WarningAmberOutlinedIcon sx={iconStyle} />;
    else if (effectiveIconType === 'info' || effectiveIconType === 'dash') iconNode = <RemoveCircleOutlineIcon sx={iconStyle} />;
  }

  return (
    <Box
      component="span"
      aria-label={`Status: ${displayLabel}`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        height: size === 'medium' ? '32px' : '28px',
        padding: size === 'medium' ? '4px 14px' : '4px 12px',
        borderRadius: '6px',
        fontFamily: tokens.typography.fontFamily,
        fontSize: size === 'medium' ? '12px' : '11px',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.25px',
        lineHeight: '16px',
        backgroundColor: scheme.pillBg || scheme.wash,
        color: scheme.main,
        border: `1px solid ${scheme.border || scheme.main}`,
        boxShadow: 'none',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {iconNode && <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}>{iconNode}</Box>}
      <span>{displayLabel}</span>
    </Box>
  );
};

export default StatusBadge;
