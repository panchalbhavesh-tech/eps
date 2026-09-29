import React from 'react';
import { Box, InputBase, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useThemeMode } from '../../theme/ThemeContext';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number | string | Record<string, number | string>;
  sx?: Record<string, any>;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  width = 300,
  sx = {},
}) => {
  const { mode, tokens } = useThemeMode();
  const isDark = mode === 'dark';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 1.5,
        height: 38,
        width,
        bgcolor: tokens.background.card,
        border: `1px solid ${tokens.border.main}`,
        borderRadius: 2.5,
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: tokens.border.light,
          bgcolor: tokens.background.cardHover,
        },
        '&:focus-within': {
          borderColor: tokens.border.focus,
          boxShadow: isDark ? '0 0 0 2px rgba(61, 255, 162, 0.12)' : '0 0 0 2px rgba(15, 23, 42, 0.08)',
          bgcolor: tokens.background.cardHover,
        },
        ...sx,
      }}
    >
      <SearchIcon sx={{ color: tokens.text.secondary, mr: 1, fontSize: 19 }} />
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        sx={{
          flex: 1,
          color: tokens.text.primary,
          fontSize: { xs: '16px', sm: '0.85rem' },  // 16px on phones avoids iOS zoom-on-focus
          fontVariantNumeric: 'tabular-nums',
          '& ::placeholder': {
            color: tokens.text.secondary,
            opacity: 0.8,
          },
        }}
      />
      {value ? (
        <IconButton
          size="small"
          onClick={() => onChange('')}
          sx={{ color: tokens.text.secondary, p: 0.5, '&:hover': { color: tokens.text.primary } }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      ) : (
        <Box
          component="span"
          sx={{
            fontSize: '0.7rem',
            color: tokens.text.secondary,
            bgcolor: tokens.background.header,
            border: `1px solid ${tokens.border.main}`,
            borderRadius: 1,
            px: 0.6,
            py: 0.1,
            fontWeight: 600,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          /
        </Box>
      )}
    </Box>
  );
};

export default SearchInput;
