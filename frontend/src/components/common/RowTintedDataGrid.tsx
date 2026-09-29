import React from 'react';
import { DataGrid, DataGridProps } from '@mui/x-data-grid';
import { useThemeMode } from '../../theme/ThemeContext';
import { useIsMobile } from '../../hooks/useResponsive';
import { MobileCardList, MobileSortOption } from './MobileCardList';

export interface RowTintedDataGridProps extends Omit<DataGridProps, 'sx'> {
  sx?: Record<string, any>;
  /** Phones (< 600px): render each row as a card with this layout instead of the grid. */
  mobileCard?: (row: any) => React.ReactNode;
  mobileSortOptions?: MobileSortOption[];
  mobileDefaultSort?: string;
  mobileEmptyText?: string;
}

export const RowTintedDataGrid: React.FC<RowTintedDataGridProps> = ({
  rowHeight = 48,
  columnHeaderHeight = 44,
  pageSizeOptions = [20, 50, 100],
  initialState,
  sx = {},
  mobileCard,
  mobileSortOptions,
  mobileDefaultSort,
  mobileEmptyText,
  ...props
}) => {
  const { tokens } = useThemeMode();
  const isMobile = useIsMobile();

  if (isMobile && mobileCard) {
    return (
      <MobileCardList
        rows={props.rows || []}
        renderCard={mobileCard}
        sortOptions={mobileSortOptions}
        defaultSortKey={mobileDefaultSort}
        loading={props.loading}
        emptyText={mobileEmptyText}
        getRowClassName={props.getRowClassName}
        onRowClick={props.onRowClick as any}
        checkboxSelection={props.checkboxSelection}
        rowSelectionModel={props.rowSelectionModel}
        onRowSelectionModelChange={props.onRowSelectionModelChange as any}
        getRowId={props.getRowId as any}
      />
    );
  }

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
      slotProps={{
        panel: {
          placement: 'bottom-start',
          sx: {
            mt: 1, // small margin top to separate from header
            '& .MuiDataGrid-paper': {
              backgroundColor: tokens.background.card,
              border: `1px solid ${tokens.border.main}`,
              boxShadow: tokens.shadows.card || '0 4px 16px rgba(0,0,0,0.15)',
              borderRadius: '6px',
              overflow: 'hidden',
              minWidth: '320px',
            },
            '& .MuiDataGrid-filterForm': {
              padding: '16px',
              gap: '12px',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'transparent',
            },
            '& .MuiDataGrid-filterFormColumnInput, & .MuiDataGrid-filterFormOperatorInput, & .MuiDataGrid-filterFormValueInput': {
              width: '100%',
              margin: 0,
              '& .MuiInputBase-root': {
                backgroundColor: tokens.background.paper,
                borderRadius: '4px',
                border: `1px solid ${tokens.border.main}`,
                fontSize: '13px',
                '&:hover': {
                  borderColor: tokens.border.light,
                },
                '&.Mui-focused': {
                  borderColor: tokens.border.focus,
                  boxShadow: `0 0 0 1px ${tokens.border.focus}`,
                }
              },
              '& .MuiInput-underline:before, & .MuiInput-underline:after': {
                display: 'none',
              },
              '& .MuiInputBase-input': {
                padding: '6px 12px',
                height: 'auto',
                color: tokens.text.primary,
              },
              '& .MuiInputLabel-root': {
                color: tokens.text.secondary,
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                transform: 'none',
                position: 'relative',
                marginBottom: '4px',
                display: 'block',
              },
            },
            '& .MuiDataGrid-filterFormDeleteIcon': {
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              mt: '20px', // align with inputs
              '& .MuiIconButton-root': {
                color: tokens.text.secondary,
                padding: '4px',
                borderRadius: '4px',
                '&:hover': {
                  backgroundColor: tokens.background.cardHover,
                  color: tokens.status.error.main,
                }
              }
            },
            '& .MuiDataGrid-panelHeader': {
              padding: '12px 16px',
              borderBottom: `1px solid ${tokens.border.main}`,
              backgroundColor: tokens.background.header,
              fontSize: '13px',
              fontWeight: 600,
              color: tokens.text.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            '& .MuiDataGrid-panelContent': {
              display: 'flex',
              flexDirection: 'column',
            },
            '& .MuiDataGrid-panelFooter': {
              padding: '12px 16px',
              borderTop: `1px solid ${tokens.border.main}`,
              backgroundColor: tokens.background.header,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              '& .MuiButton-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '12px',
                padding: '4px 12px',
                minWidth: 'auto',
                borderRadius: '4px',
                color: tokens.text.primary,
                border: `1px solid ${tokens.border.main}`,
                '&:hover': {
                  backgroundColor: tokens.background.cardHover,
                }
              },
              '& .MuiButton-textPrimary': {
                backgroundColor: tokens.accent.main,
                color: tokens.mode === 'dark' ? '#0A0A0C' : '#FFFFFF',
                borderColor: tokens.accent.main,
                '&:hover': {
                  backgroundColor: tokens.accent.main,
                  opacity: 0.9,
                }
              }
            }
          }
        }
      }}
      {...props}
    />
  );
};
