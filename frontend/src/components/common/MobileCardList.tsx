import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, CircularProgress, MenuItem, Select, Typography } from '@mui/material';
import { useThemeMode } from '../../theme/ThemeContext';

export interface MobileSortOption {
  label: string;
  key: string;
  get: (row: any) => number | string | null | undefined;
  desc?: boolean;
}

export interface MobileCardListProps {
  rows: readonly any[];
  renderCard: (row: any) => React.ReactNode;
  sortOptions?: MobileSortOption[];
  defaultSortKey?: string;
  pageSize?: number;
  loading?: boolean;
  emptyText?: string;
  getRowClassName?: (params: any) => string;
  onRowClick?: (params: any, event: any, details: any) => void;
  checkboxSelection?: boolean;
  rowSelectionModel?: any;
  onRowSelectionModelChange?: (model: any, details: any) => void;
  getRowId?: (row: any) => any;
}

/**
 * Phone representation of a data table: one card per row with the page's own information hierarchy,
 * incremental "show more" paging (cheap to render), a sort menu instead of column headers, and an
 * optional select mode so bulk actions keep working on touch devices.
 */
export const MobileCardList: React.FC<MobileCardListProps> = ({
  rows, renderCard, sortOptions = [], defaultSortKey, pageSize = 25, loading, emptyText = 'Nothing to show.',
  getRowClassName, onRowClick, checkboxSelection, rowSelectionModel, onRowSelectionModelChange, getRowId = (r: any) => r.id,
}) => {
  const { tokens } = useThemeMode();
  const [sortKey, setSortKey] = useState<string>(defaultSortKey || sortOptions[0]?.key || '');
  const [visible, setVisible] = useState(pageSize);
  const [selectMode, setSelectMode] = useState(false);

  const sorted = useMemo(() => {
    const opt = sortOptions.find((o) => o.key === sortKey);
    if (!opt) return rows as any[];
    const dir = opt.desc === false ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = opt.get(a), vb = opt.get(b);
      const na = va === null || va === undefined || (typeof va === 'number' && !isFinite(va));
      const nb = vb === null || vb === undefined || (typeof vb === 'number' && !isFinite(vb));
      if (na && nb) return 0;
      if (na) return 1;          // missing values always last
      if (nb) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, sortOptions, sortKey]);

  useEffect(() => { setVisible(pageSize); }, [rows, sortKey, pageSize]);

  const selectedIds: any[] = Array.isArray(rowSelectionModel) ? rowSelectionModel : (rowSelectionModel?.ids ? Array.from(rowSelectionModel.ids) : []);
  const toggle = (id: any) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onRowSelectionModelChange?.(next as any, {} as any);
  };
  const tint = (row: any) => {
    const cls = getRowClassName?.({ row, id: getRowId(row) }) || '';
    if (cls.includes('buy')) return tokens.status.success.main;
    if (cls.includes('avoid')) return tokens.status.error.main;
    if (cls.includes('attention')) return tokens.status.warning.main;
    return 'transparent';
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: tokens.background.paper }}>
      {(sortOptions.length > 0 || checkboxSelection) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: `1px solid ${tokens.border.main}`, flexShrink: 0 }}>
          <Typography sx={{ fontSize: '12px', color: tokens.text.secondary, flexShrink: 0 }}>{sorted.length.toLocaleString('en-IN')} rows</Typography>
          <Box sx={{ flex: 1 }} />
          {sortOptions.length > 0 && (
            <Select size="small" value={sortKey} onChange={(e) => setSortKey(String(e.target.value))} aria-label="Sort by"
              sx={{ fontSize: '12px', height: 36, minWidth: 0, flex: '0 1 auto', color: tokens.text.primary, '& .MuiSelect-select': { py: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' } }}
              renderValue={(v) => `Sort: ${sortOptions.find((o) => o.key === v)?.label ?? ''}`}>
              {sortOptions.map((o) => <MenuItem key={o.key} value={o.key} sx={{ fontSize: '13px', minHeight: 44 }}>{o.label}</MenuItem>)}
            </Select>
          )}
          {checkboxSelection && (
            <Button size="small" onClick={() => { setSelectMode(!selectMode); if (selectMode) onRowSelectionModelChange?.([] as any, {} as any); }}
              sx={{ height: 36, minWidth: 0, px: 1.25, flexShrink: 0, fontSize: '12px', textTransform: 'none', fontWeight: 700, color: selectMode ? tokens.accent.main : tokens.text.primary,
                border: `1px solid ${selectMode ? tokens.accent.main : tokens.border.main}` }}>
              {selectMode ? `Done (${selectedIds.length})` : 'Select'}
            </Button>
          )}
        </Box>
      )}
      <Box sx={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        {loading && sorted.length === 0 && (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={28} sx={{ color: tokens.accent.main }} /></Box>
        )}
        {!loading && sorted.length === 0 && (
          <Typography sx={{ p: 4, textAlign: 'center', fontSize: '13px', color: tokens.text.secondary }}>{emptyText}</Typography>
        )}
        {sorted.slice(0, visible).map((row) => { const id = getRowId(row); return (
          <Box key={id} role={onRowClick ? 'button' : undefined}
            onClick={(e) => (selectMode ? toggle(id) : onRowClick?.({ row, id } as any, e as any, {} as any))}
            sx={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${tokens.border.main}`, borderLeft: `3px solid ${tint(row)}`,
              cursor: onRowClick || selectMode ? 'pointer' : 'default', '&:active': { backgroundColor: tokens.background.cardHover } }}>
            {selectMode && (
              <Checkbox checked={selectedIds.includes(id)} onClick={(e) => { e.stopPropagation(); toggle(id); }}
                sx={{ alignSelf: 'center', ml: 0.5, color: tokens.text.secondary, '&.Mui-checked': { color: tokens.accent.main } }} />
            )}
            <Box sx={{ flex: 1, minWidth: 0, px: 1.5, py: 1.25 }}>{renderCard(row)}</Box>
          </Box>
        ); })}
        {visible < sorted.length && (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
            <Button onClick={() => setVisible((v) => v + pageSize)} sx={{ textTransform: 'none', fontWeight: 700, fontSize: '13px', minHeight: 44, px: 3,
              color: tokens.text.primary, border: `1px solid ${tokens.border.main}` }}>
              Show {Math.min(pageSize, sorted.length - visible)} more · {visible} of {sorted.length.toLocaleString('en-IN')}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default MobileCardList;
