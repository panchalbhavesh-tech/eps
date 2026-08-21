import React from 'react';
import { Box, Chip } from '@mui/material';
import { useThemeMode } from '../../theme/ThemeContext';

export interface FilterOption {
  label: string;
  value: string;
  count?: number;
  color?: string;
}

export interface QuickFilterPillsProps {
  options: FilterOption[];
  selectedValue: string;
  onChange: (value: string) => void;
  sx?: Record<string, any>;
}

export const QuickFilterPills: React.FC<QuickFilterPillsProps> = ({
  options,
  selectedValue,
  onChange,
  sx = {},
}) => {
  const { tokens } = useThemeMode();

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        alignItems: 'center',
        ...sx,
      }}
    >
      {options.map((opt) => {
        const isSelected = selectedValue === opt.value;

        return (
          <Chip
            key={opt.value}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{opt.label}</span>
                {opt.count !== undefined && (
                  <Box
                    component="span"
                    className="mono-font tabular-nums"
                    sx={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: isSelected ? (opt.color || tokens.text.primary) : (opt.color || tokens.text.secondary),
                    }}
                  >
                    ({opt.count})
                  </Box>
                )}
              </Box>
            }
            onClick={() => onChange(opt.value)}
            sx={{
              cursor: 'pointer',
              height: '32px',
              px: '4px',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: tokens.typography.fontFamily,
              fontWeight: 600,
              lineHeight: '16px',
              transition: 'all 0.1s ease-in-out',
              backgroundColor: isSelected ? (opt.color ? `${opt.color}15` : (tokens.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')) : 'transparent',
              color: isSelected ? (opt.color || tokens.text.primary) : (opt.color || tokens.text.secondary),
              border: `1px solid ${isSelected ? (opt.color || tokens.border.focus) : (opt.color ? `${opt.color}40` : tokens.border.main)}`,
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: tokens.background.cardHover,
                color: tokens.text.primary,
              },
              '& .MuiChip-label': {
                padding: '0 8px',
              },
            }}
          />
        );
      })}
    </Box>
  );
};
