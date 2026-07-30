import React from 'react';
import { Box, InputBase, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { saasTokens } from '../../theme/theme';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number | string;
  sx?: Record<string, any>;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  width = 300,
  sx = {},
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 1.5,
        height: 38,
        width,
        bgcolor: '#f8fafc',
        border: `1px solid ${saasTokens.border.main}`,
        borderRadius: 2.5,
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: saasTokens.border.light,
          bgcolor: '#ffffff',
        },
        '&:focus-within': {
          borderColor: saasTokens.border.focus,
          boxShadow: '0 0 0 2px rgba(15, 23, 42, 0.08)',
          bgcolor: '#ffffff',
        },
        ...sx,
      }}
    >
      <SearchIcon sx={{ color: saasTokens.text.secondary, mr: 1, fontSize: 19 }} />
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        sx={{
          flex: 1,
          color: saasTokens.text.primary,
          fontSize: '0.85rem',
          fontVariantNumeric: 'tabular-nums',
          '& ::placeholder': {
            color: saasTokens.text.secondary,
            opacity: 0.8,
          },
        }}
      />
      {value ? (
        <IconButton
          size="small"
          onClick={() => onChange('')}
          sx={{ color: saasTokens.text.secondary, p: 0.5, '&:hover': { color: saasTokens.text.primary } }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      ) : (
        <Box
          component="span"
          sx={{
            fontSize: '0.7rem',
            color: saasTokens.text.secondary,
            bgcolor: '#f1f5f9',
            border: `1px solid ${saasTokens.border.main}`,
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
