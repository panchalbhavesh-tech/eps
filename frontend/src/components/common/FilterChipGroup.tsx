import React from 'react';
import { Box, Chip } from '@mui/material';
import { saasTokens } from '../../theme/theme';

export interface FilterOption {
  label: string;
  value: string;
  count?: number;
  color?: string;
}

export interface FilterChipGroupProps {
  options: FilterOption[];
  selectedValue: string;
  onChange: (value: string) => void;
  sx?: Record<string, any>;
}

export const FilterChipGroup: React.FC<FilterChipGroupProps> = ({
  options,
  selectedValue,
  onChange,
  sx = {},
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        alignItems: 'center',
        p: 0.5,
        bgcolor: saasTokens.background.paper,
        borderRadius: 3,
        border: `1px solid ${saasTokens.border.main}`,
        width: 'fit-content',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        ...sx,
      }}
    >
      {options.map((opt) => {
        const isSelected = selectedValue === opt.value;
        
        return (
          <Chip
            key={opt.value}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <span>{opt.label}</span>
                {opt.count !== undefined && (
                  <Box
                    component="span"
                    sx={{
                      px: 0.8,
                      py: 0.2,
                      borderRadius: 1,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      bgcolor: isSelected ? 'rgba(255,255,255,0.2)' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : saasTokens.text.secondary,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {opt.count}
                  </Box>
                )}
              </Box>
            }
            onClick={() => onChange(opt.value)}
            sx={{
              cursor: 'pointer',
              px: 1,
              height: 34,
              borderRadius: 5, // Pill shape
              fontSize: '0.8rem',
              fontWeight: 600,
              transition: 'all 0.15s ease',
              bgcolor: isSelected ? '#0f172a' : 'transparent',
              color: isSelected ? '#ffffff' : saasTokens.text.secondary,
              border: isSelected ? '1px solid #0f172a' : `1px solid ${saasTokens.border.main}`,
              boxShadow: 'none',
              '&:hover': {
                bgcolor: isSelected ? '#1e293b' : '#f8fafc',
                color: isSelected ? '#ffffff' : saasTokens.text.primary,
              },
              '& .MuiChip-label': {
                px: 0.5,
              }
            }}
          />
        );
      })}
    </Box>
  );
};

export default FilterChipGroup;
