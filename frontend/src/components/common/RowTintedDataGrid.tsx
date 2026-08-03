import React from 'react';
import { DataGrid, DataGridProps } from '@mui/x-data-grid';
import { useThemeMode } from '../../theme/ThemeContext';

export interface RowTintedDataGridProps extends Omit<DataGridProps, 'sx'> {
  sx?: Record<string, any>;
}

export const RowTintedDataGrid: React.FC<RowTintedDataGridProps> = ({
  rowHeight = 48,
  columnHeaderHeight = 44,
  pageSizeOptions = [20, 50, 100],
  initialState,
  sx = {},
  ...props
}) => {
  const { tokens } = useThemeMode();

  const mergedInitialState = {
    ...initialState,
    pagination: {
      ...initialState?.pagination,
      paginationModel: initialState?.pagination?.paginationModel || { pageSize: 50, page: 0 },
    },
  };

  return (
    <DataGrid
      rowHeight={rowHeight}
      columnHeaderHeight={columnHeaderHeight}
      pageSizeOptions={pageSizeOptions}
      initialState={mergedInitialState}
      disableRowSelectionOnClick
      sx={{
        border: 'none',
        backgroundColor: tokens.background.paper,
        color: tokens.text.primary,
        fontFamily: tokens.typography.fontFamily,
        fontSize: '12px',
        '& .MuiDataGrid-main': {
          border: 'none',
        },
        '& .MuiDataGrid-columnHeaders, & .MuiDataGrid-container--top [role=row]': {
          backgroundColor: tokens.background.header,
          color: tokens.text.primary,
          borderBottom: `1px solid ${tokens.border.main}`,
          textTransform: 'uppercase',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.5px',
          lineHeight: '16px',
        },
        '& .MuiDataGrid-columnHeader': {
          padding: '6px 8px',
          '&:focus, &:focus-within': {
          outline: `2px solid ${tokens.border.focus}`,
          outlineOffset: '-2px',
          },
        },
        '& .MuiDataGrid-columnSeparator': {
          display: 'none',
        },
        '& .MuiDataGrid-cell': {
          borderBottom: `1px solid ${tokens.border.main}`,
          borderRight: 'none',
          padding: '6px 8px',
          fontSize: '12px',
          lineHeight: '16px',
          display: 'flex',
          alignItems: 'center',
          '&:focus, &:focus-within': {
            outline: `2px solid ${tokens.border.focus} !important`,
            outlineOffset: '-2px',
            borderRadius: '4px',
          },
        },
        '& .MuiDataGrid-row': {
          transition: 'none',
          '&:hover': {
            backgroundColor: tokens.rowTint.hoverOverlay,
          },
          '&.row-tint-buy': {
            backgroundColor: tokens.rowTint.buy,
            '&:hover': {
              backgroundColor: tokens.rowTint.buy,
              backgroundImage: `linear-gradient(${tokens.rowTint.hoverOverlay}, ${tokens.rowTint.hoverOverlay})`,
            },
          },
          '&.row-tint-avoid': {
            backgroundColor: tokens.rowTint.avoid,
            '&:hover': {
              backgroundColor: tokens.rowTint.avoid,
              backgroundImage: `linear-gradient(${tokens.rowTint.hoverOverlay}, ${tokens.rowTint.hoverOverlay})`,
            },
          },
          '&.row-tint-neutral': {
            backgroundColor: tokens.rowTint.neutral,
            '&:hover': {
              backgroundColor: tokens.rowTint.neutral,
              backgroundImage: `linear-gradient(${tokens.rowTint.hoverOverlay}, ${tokens.rowTint.hoverOverlay})`,
            },
          },
          '&.row-tint-attention': {
            backgroundColor: tokens.rowTint.attention,
            '&:hover': {
              backgroundColor: tokens.rowTint.attention,
              backgroundImage: `linear-gradient(${tokens.rowTint.hoverOverlay}, ${tokens.rowTint.hoverOverlay})`,
            },
          },
          '&.row-tint-child': {
            backgroundColor: tokens.rowTint.child,
            '&:hover': {
              backgroundColor: tokens.rowTint.child,
              backgroundImage: `linear-gradient(${tokens.rowTint.hoverOverlay}, ${tokens.rowTint.hoverOverlay})`,
            },
          },
        },
        '& .MuiDataGrid-footerContainer': {
          borderTop: `1px solid ${tokens.border.main}`,
          backgroundColor: tokens.background.paper,
          color: tokens.text.secondary,
          fontSize: '11px',
          height: '48px',
          minHeight: '48px',
        },
        '& .MuiTablePagination-root': {
          color: tokens.text.secondary,
          fontSize: '11px',
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
            fontSize: '11px',
            color: tokens.text.secondary,
          },
          '& .MuiSelect-select': {
            fontSize: '11px',
          },
        },
        '& .MuiDataGrid-overlay': {
          backgroundColor: tokens.background.paper,
        },
        ...sx,
      }}
      {...props}
    />
  );
};
