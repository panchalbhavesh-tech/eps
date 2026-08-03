import React from 'react';
import { StatusBadge } from './StatusBadge';

export type StatusVariant = 'success' | 'error' | 'warning' | 'neutral' | 'info';

export interface StatusChipProps {
  label?: string;
  status?: string;
  variant?: StatusVariant;
  iconType?: 'check' | 'close' | 'warning' | 'dash' | 'none';
  size?: 'small' | 'medium';
  sx?: Record<string, any>;
}

export const StatusChip: React.FC<StatusChipProps> = (props) => {
  return <StatusBadge {...props} />;
};

export default StatusChip;
