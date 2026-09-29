import { useState } from 'react';
import { Box, Typography, Button, TextField, Select, MenuItem, InputAdornment, IconButton, Chip } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useQuery } from '@apollo/client';
import { CATALYST_EVENTS_QUERY } from '../graphql/operations';
import { useThemeMode } from '../theme/ThemeContext';
import { formatToIST } from '../utils/dateUtils';
import { CatalystEvent } from '../types/catalyst';
import { CatalystDetailDrawer } from '../components/catalyst/CatalystDetailDrawer';
import { SmartCron } from '../components/common/SmartCron';
import { MobileCardList } from '../components/common/MobileCardList';
import type { MobileSortOption } from '../components/common/MobileCardList';
import { useIsMobile } from '../hooks/useResponsive';

const formatMarketCap = (val: any) => {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n) || n === 0) return '—';
  const inCr = Math.abs(n) >= 100000 ? n / 10000000 : n;
  if (Math.abs(inCr) < 1) {
    const inL = inCr * 100;
    return `${inL < 0 ? '-' : ''}₹${Math.abs(inL).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
  }
  return `${inCr < 0 ? '-' : ''}₹${Math.abs(inCr).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cr`;
};

export default function CatalystRadar() {
  const { tokens } = useThemeMode();
  const isMobile = useIsMobile();
  
  const [tierFilter, setTierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedEvent, setSelectedEvent] = useState<CatalystEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Use network-only or cache-and-network for fresh data
  const { data, loading, refetch } = useQuery(CATALYST_EVENTS_QUERY, {
    variables: {
      limit: 100,
      tier: tierFilter === 'ALL' ? null : tierFilter,
      status: statusFilter === 'ALL' ? null : statusFilter,
      searchQuery: searchQuery || null
    },
    fetchPolicy: 'cache-and-network',
    pollInterval: 15000 // Smart polling, updates every 15 seconds
  });

  const events: CatalystEvent[] = data?.catalystEvents || [];

  const handleOpenDrawer = (event: CatalystEvent) => {
    setSelectedEvent(event);
    setDrawerOpen(true);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'S-TIER': return tokens.status.error.main; // Red
      case 'A-TIER': return tokens.status.warning.main; // Orange
      case 'B-TIER': return tokens.status.info.main; // Blue
      default: return tokens.text.secondary;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EARLY': return tokens.status.success.main;
      case 'DEVELOPING': return tokens.status.warning.main;
      case 'EXTENDED': return tokens.status.error.main;
      case 'LATE': return tokens.status.error.main;
      default: return tokens.text.secondary;
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'detectedAt',
      headerName: 'TIME (IST)',
      width: 90,
      description: 'Actual publication time of the catalyst (or detection time if publication time is unavailable).',
      renderCell: (params: GridRenderCellParams) => {
        const timeVal = params.row.publishedAt || params.value;
        return (
          <Typography sx={{ fontSize: '12px', color: tokens.text.secondary, fontFamily: 'monospace' }}>
            {timeVal ? formatToIST(timeVal as string).timeStr : '-'}
          </Typography>
        );
      }
    },
    {
      field: 'ticker',
      headerName: 'TICKER',
      width: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Box>
          <Typography sx={{ fontSize: '13px', fontWeight: 600, color: tokens.primary.main }}>
            {params.value}
          </Typography>
          {params.row.companyName && (
            <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
              {params.row.companyName}
            </Typography>
          )}
        </Box>
      )
    },
    {
      field: 'marketCapAtEvent',
      headerName: 'MARKET CAP',
      width: 110,
      description: 'Market capitalization at the time of the catalyst.',
      headerAlign: 'right',
      align: 'right',
      valueGetter: (_v: any, row: any) => {
        const n = Number(row?.marketCapAtEvent);
        return !isNaN(n) ? n : -Infinity;
      },
      renderCell: (params: GridRenderCellParams) => {
        if (params.row.marketCapAtEvent == null) {
          return (
            <Typography sx={{ fontSize: '13px', color: tokens.text.secondary }}>
              —
            </Typography>
          );
        }
        return (
          <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 500, color: tokens.text.secondary }}>
            {formatMarketCap(params.row.marketCapAtEvent)}
          </Typography>
        );
      }
    },
    {
      field: 'eventTitle',
      headerName: 'CATALYST',
      flex: 1,
      renderCell: (params: GridRenderCellParams) => (
        <Typography sx={{ fontSize: '13px', fontWeight: 500, color: tokens.text.primary }} noWrap>
          {params.value}
        </Typography>
      )
    },
    {
      field: 'category',
      headerName: 'CATEGORY',
      width: 130,
      description: 'Classification of the corporate event (e.g., ORDERS, GOVERNANCE, CORPORATE).',
      renderCell: (params: GridRenderCellParams) => (
        <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>
          {params.value}
        </Typography>
      )
    },
    {
      field: 'tier',
      headerName: 'IMPACT',
      width: 90,
      description: 'Estimated fundamental importance of the catalyst. S = Severe, A = High, B = Moderate, C = Informational.',
      renderCell: (params: GridRenderCellParams) => (
        <Typography sx={{ fontSize: '12px', fontWeight: 700, color: getTierColor(params.value) }}>
          {params.value?.replace('-TIER', '')}
        </Typography>
      )
    },
    {
      field: 'earlyScore',
      headerName: 'EARLY',
      width: 80,
      description: 'Estimates how early this catalyst was detected relative to the stock\'s price reaction. Higher = potentially earlier.',
      renderCell: (params: GridRenderCellParams) => {
        const val = params.value as number;
        return (
          <Typography sx={{ fontSize: '13px', fontWeight: 600, color: val > 80 ? tokens.status.success.main : tokens.text.primary }}>
            {val ? Math.round(val) : '-'}
          </Typography>
        )
      }
    },
    {
      field: 'reactionPct',
      headerName: 'REACTION',
      width: 90,
      description: 'Approximate price movement already observed since the catalyst. This is NOT a prediction.',
      renderCell: (params: GridRenderCellParams) => {
        const val = params.value as number;
        if (val === undefined || val === null) return <Typography>-</Typography>;
        const color = val > 0 ? tokens.status.success.main : (val < 0 ? tokens.status.error.main : tokens.text.primary);
        return (
          <Typography sx={{ fontSize: '13px', fontWeight: 600, color }}>
            {val > 0 ? '+' : ''}{val.toFixed(2)}%
          </Typography>
        )
      }
    },
    {
      field: 'relativeVolume',
      headerName: 'VOL',
      width: 70,
      description: 'Current trading volume divided by the normal volume baseline. 6.7x means 6.7× normal activity.',
      renderCell: (params: GridRenderCellParams) => (
        <Typography sx={{ fontSize: '13px', fontWeight: 500, color: tokens.text.primary }}>
          {params.value ? `${(params.value as number).toFixed(1)}x` : '-'}
        </Typography>
      )
    },
    {
      field: 'status',
      headerName: 'STATUS',
      width: 110,
      description: 'Indicates whether the catalyst appears early, developing, already extended, or informational.',
      renderCell: (params: GridRenderCellParams) => (
        <Chip 
          label={params.value}
          size="small"
          sx={{ 
            height: 20, 
            fontSize: '10px', 
            fontWeight: 700,
            bgcolor: `${getStatusColor(params.value)}15`,
            color: getStatusColor(params.value),
            borderRadius: '4px'
          }}
        />
      )
    },
    {
      field: 'details',
      headerName: '',
      width: 60,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <IconButton 
          size="small" 
          onClick={(e) => { e.stopPropagation(); handleOpenDrawer(params.row as CatalystEvent); }}
          sx={{ color: tokens.primary.main, '&:hover': { bgcolor: tokens.background.cardHover } }}
        >
          <OpenInNewIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )
    }
  ];

  // ── Phone card: ticker & time → catalyst → impact/category/size → early/reaction/volume ──
  const tierRank: Record<string, number> = { 'S-TIER': 4, 'A-TIER': 3, 'B-TIER': 2, 'C-TIER': 1 };
  const mobileSortOptions: MobileSortOption[] = [
    { key: 'time', label: 'Newest first', get: (r) => new Date(r.publishedAt || r.detectedAt || 0).getTime() },
    { key: 'impact', label: 'Impact', get: (r) => tierRank[r.tier] ?? 0 },
    { key: 'early', label: 'Earliest detection', get: (r) => r.earlyScore },
    { key: 'reaction', label: 'Biggest reaction', get: (r) => (r.reactionPct == null ? null : Math.abs(r.reactionPct)) },
  ];
  const renderCatalystCard = (row: any) => {
    const t = row.publishedAt || row.detectedAt;
    const stat = { fontSize: '12px', color: tokens.text.secondary };
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: '14px', fontWeight: 700, color: tokens.primary.main }}>{row.ticker}</Typography>
            {row.companyName && <Typography noWrap sx={{ fontSize: '12px', color: tokens.text.secondary }}>{row.companyName}</Typography>}
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Chip label={row.status} size="small" sx={{ height: 22, fontSize: '11px', fontWeight: 700, bgcolor: `${getStatusColor(row.status)}15`, color: getStatusColor(row.status), borderRadius: '4px' }} />
            <Typography sx={{ ...stat, fontFamily: 'monospace', mt: 0.25 }}>{t ? formatToIST(t).timeStr : '-'}</Typography>
          </Box>
        </Box>
        <Typography sx={{ fontSize: '13px', fontWeight: 500, color: tokens.text.primary, lineHeight: '18px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {row.eventTitle}
        </Typography>
        <Typography sx={stat}>
          Impact <b style={{ color: getTierColor(row.tier) }}>{row.tier?.replace('-TIER', '') || '—'}</b> · {row.category} · {formatMarketCap(row.marketCapAtEvent)}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography className="mono-font" sx={{ ...stat, flex: 1 }}>
            Early <b style={{ color: row.earlyScore > 80 ? tokens.status.success.main : tokens.text.primary }}>{row.earlyScore ? Math.round(row.earlyScore) : '-'}</b>
            {' · '}Reaction <b style={{ color: row.reactionPct > 0 ? tokens.status.success.main : row.reactionPct < 0 ? tokens.status.error.main : tokens.text.primary }}>
              {row.reactionPct == null ? '-' : `${row.reactionPct > 0 ? '+' : ''}${Number(row.reactionPct).toFixed(2)}%`}</b>
            {' · '}Vol <b style={{ color: tokens.text.primary }}>{row.relativeVolume ? `${Number(row.relativeVolume).toFixed(1)}x` : '-'}</b>
          </Typography>
          <OpenInNewIcon sx={{ fontSize: 18, color: tokens.primary.main }} />
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ height: { xs: 'auto', sm: '100%' }, display: 'flex', flexDirection: 'column', p: { xs: 1.5, md: 3 }, bgcolor: tokens.background.default }}>
      {/* Header and Controls (phones: description + Smart Cron, then search, then filters) */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 1.5, md: 0 }, mb: { xs: 1.5, md: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" sx={{ display: { xs: 'none', sm: 'block' }, fontWeight: 700, color: tokens.text.primary, mb: 0.5 }}>
              Catalyst Radar
            </Typography>
            <Typography sx={{ fontSize: '13px', color: tokens.text.secondary }}>
              Early-detection and market repricing intelligence engine for the NSE universe.
            </Typography>
          </Box>
          {isMobile && <SmartCron page="catalyst" />}
        </Box>
        
        <Box sx={{ display: 'flex', gap: { xs: 1, md: 2 }, alignItems: 'center', flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
          <TextField
            size="small"
            placeholder="Search Ticker or News..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: tokens.text.tertiary }} /></InputAdornment>,
              sx: { 
                fontSize: '13px', 
                bgcolor: tokens.background.paper,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border.main }
              }
            }}
            sx={{ width: { xs: 'calc(100% - 48px)', md: 220 }, '& input': { fontSize: { xs: '16px', md: '13px' } } }}
          />
          {isMobile && (
            <IconButton aria-label="Refresh" onClick={() => refetch()} sx={{ width: 40, height: 40, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', color: tokens.text.primary }}>
              <RefreshIcon sx={{ fontSize: 20 }} />
            </IconButton>
          )}
          
          <Select
            size="small"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            sx={{ 
              fontSize: '13px', 
              width: { xs: 'calc(50% - 4px)', md: 130 }, 
              height: { xs: 40, md: 'auto' },
              bgcolor: tokens.background.paper,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border.main }
            }}
          >
            <MenuItem value="ALL" sx={{ fontSize: '13px' }}>All Tiers</MenuItem>
            <MenuItem value="S-TIER" sx={{ fontSize: '13px', color: tokens.status.error.main, fontWeight: 600 }}>S-Tier Only</MenuItem>
            <MenuItem value="A-TIER" sx={{ fontSize: '13px', color: tokens.status.warning.main, fontWeight: 600 }}>A-Tier Only</MenuItem>
          </Select>

          <Select
            size="small"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ 
              fontSize: '13px', 
              width: { xs: 'calc(50% - 4px)', md: 140 }, 
              height: { xs: 40, md: 'auto' },
              bgcolor: tokens.background.paper,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border.main }
            }}
          >
            <MenuItem value="ALL" sx={{ fontSize: '13px' }}>All Statuses</MenuItem>
            <MenuItem value="EARLY" sx={{ fontSize: '13px', color: tokens.status.success.main, fontWeight: 600 }}>Early / Fresh</MenuItem>
            <MenuItem value="DEVELOPING" sx={{ fontSize: '13px', color: tokens.status.warning.main, fontWeight: 600 }}>Developing</MenuItem>
            <MenuItem value="EXTENDED" sx={{ fontSize: '13px', color: tokens.status.error.main, fontWeight: 600 }}>Late / Priced In</MenuItem>
          </Select>
          
          {!isMobile && <Button 
            variant="outlined" 
            onClick={() => refetch()} 
            startIcon={<RefreshIcon />}
            sx={{ 
              textTransform: 'none', 
              fontSize: '13px', 
              fontWeight: 600,
              borderColor: tokens.border.main,
              color: tokens.text.primary,
              '&:hover': { borderColor: tokens.border.light, bgcolor: tokens.background.cardHover }
            }}
          >
            Refresh
          </Button>}
          {!isMobile && <SmartCron page="catalyst" />}
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 3, mb: 1.5, px: 1, py: 0.5, bgcolor: tokens.background.card, borderRadius: '4px', border: `1px solid ${tokens.border.main}`, width: 'fit-content' }}>
        <Typography sx={{ fontSize: '11px', color: tokens.text.secondary }}>
          <strong style={{ color: tokens.text.primary }}>Impact:</strong> S Severe · A High · B Moderate · C Informational
        </Typography>
        <Typography sx={{ fontSize: '11px', color: tokens.text.secondary }}>
          <strong style={{ color: tokens.text.primary }}>Early:</strong> Higher = earlier detection
        </Typography>
        <Typography sx={{ fontSize: '11px', color: tokens.text.secondary }}>
          <strong style={{ color: tokens.text.primary }}>Reaction:</strong> Move already observed
        </Typography>
        <Typography sx={{ fontSize: '11px', color: tokens.text.secondary }}>
          <strong style={{ color: tokens.text.primary }}>Vol:</strong> Relative vs normal
        </Typography>
      </Box>

      {/* Grid */}
      <Box sx={{ flexGrow: 1, width: '100%', bgcolor: tokens.background.paper, borderRadius: '8px', border: `1px solid ${tokens.border.main}`, overflow: 'hidden' }}>
        {isMobile ? (
          <MobileCardList rows={events} renderCard={renderCatalystCard} sortOptions={mobileSortOptions} loading={loading}
            emptyText="No catalysts match these filters." onRowClick={(p: any) => handleOpenDrawer(p.row as CatalystEvent)} />
        ) : (
        <DataGrid
          rows={events}
          columns={columns}
          loading={loading}
          density="compact"
          disableRowSelectionOnClick
          hideFooterSelectedRowCount
          sx={{
            border: 'none',
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: tokens.background.card,
              borderBottom: `1px solid ${tokens.border.main}`,
              color: tokens.text.secondary,
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.5px'
            },
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${tokens.border.main}`,
              alignItems: 'center',
              display: 'flex'
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: tokens.background.cardHover,
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: `1px solid ${tokens.border.main}`,
              backgroundColor: tokens.background.card,
            }
          }}
        />
        )}
      </Box>

      <CatalystDetailDrawer 
        open={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
        event={selectedEvent} 
      />
    </Box>
  );
}
