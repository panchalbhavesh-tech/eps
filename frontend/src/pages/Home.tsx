import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Typography, Box, CircularProgress, Chip, IconButton, InputBase, Tooltip, Grid, Card, CardContent } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import SearchIcon from '@mui/icons-material/Search';

const GET_COMPANIES = gql`
  query GetCompanies {
    companies {
      id
      ticker
      name
      purpose
      upcomingDate
      currentPrice
      marketCap
      q1Eps
      q2Eps
      q3Eps
      q4Eps
      q0Eps
      q1Date
      q2Date
      q3Date
      q4Date
      q1Revenue
      q2Revenue
      q3Revenue
      q4Revenue
      q0Revenue
      q1Profit
      q2Profit
      q3Profit
      q4Profit
      q0Profit
      historicalTrend
    }
  }
`;

const formatValCr = (val: number | null | undefined) => {
  if (val == null || isNaN(val) || val === 0) return '-';
  const inCr = Math.abs(val) >= 100000 ? val / 10000000 : val;
  return `${inCr < 0 ? '-' : ''}₹${Math.abs(inCr).toFixed(1)} Cr`;
};

const renderCenteredCell = (text: React.ReactNode, color = '#e2e8f0', fontWeight = 500, fontSize = '0.78rem') => (
  <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', minHeight: '130px', py: 1 }}>
    <Typography sx={{ fontSize, fontWeight, color, noWrap: true }}>{text}</Typography>
  </Box>
);

const renderClubbedQuarterCell = (
  currRev?: number | null, prevRev?: number | null,
  currProfit?: number | null, prevProfit?: number | null,
  currEps?: number | null, prevEps?: number | null,
  trendOverride?: string
) => {
  if (currRev == null && currProfit == null && currEps == null) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: '130px', py: 1 }}>
        <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>-</Typography>
      </Box>
    );
  }

  const renderSubRow = (label: string, curr?: number | null, prev?: number | null, isCurrency: boolean = true) => {
    const valText = curr != null && !isNaN(curr) ? (isCurrency ? formatValCr(curr) : curr.toString()) : '-';
    
    let pctEl = null;
    if (curr != null && prev != null && !isNaN(curr) && !isNaN(prev) && prev !== 0) {
      const pct = ((curr - prev) / Math.abs(prev)) * 100;
      if (!isNaN(pct) && isFinite(pct)) {
        const isPositive = pct >= 0;
        const arrow = isPositive ? '▲' : '▼';
        const color = isPositive ? '#4ade80' : '#f87171';
        pctEl = (
          <Box component="span" sx={{ color, fontWeight: 700, fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', ml: '6px', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.55rem', marginRight: '2px' }}>{arrow}</span>
            {isPositive ? '+' : ''}{pct.toFixed(1)}%
          </Box>
        );
      }
    }

    return (
      <Box key={label} sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        width: '100%', 
        py: '5px', 
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)' 
      }}>
        <Typography component="span" sx={{ fontSize: '0.72rem', color: '#94a3b8', width: '68px', fontWeight: 500, flexShrink: 0 }}>
          {label}:
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexGrow: 1 }}>
          <Typography component="span" sx={{ fontSize: '0.75rem', color: '#f8fafc', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {valText}
          </Typography>
          {pctEl}
        </Box>
      </Box>
    );
  };

  let isUp = true;
  let pctText = '';
  let hasPct = false;
  if (currEps != null && prevEps != null && !isNaN(currEps) && !isNaN(prevEps) && prevEps !== 0) {
    const pct = ((currEps - prevEps) / Math.abs(prevEps)) * 100;
    if (!isNaN(pct) && isFinite(pct)) {
      hasPct = true;
      isUp = pct >= 0;
      pctText = `${isUp ? '+' : ''}${pct.toFixed(1)}%`;
    }
  }

  let trendLabel = isUp ? 'UP' : 'DOWN';
  if (trendOverride && trendOverride !== 'N/A' && !hasPct) {
    trendLabel = trendOverride;
    isUp = trendOverride === 'UP';
  }

  const badgeBg = isUp ? 'rgba(20, 83, 45, 0.45)' : 'rgba(127, 29, 29, 0.45)';
  const badgeColor = isUp ? '#4ade80' : '#f87171';
  const badgeBorder = isUp ? '1px solid #16a34a' : '1px solid #dc2626';
  const arrow = isUp ? '▲' : '▼';

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      width: '100%', 
      py: 1.5, 
      px: 0.5 
    }}>
      {renderSubRow('Revenue', currRev, prevRev, true)}
      {renderSubRow('Profit', currProfit, prevProfit, true)}
      {renderSubRow('EPS', currEps, prevEps, false)}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pt: '7px' }}>
        <Typography component="span" sx={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>
          EPS Trend:
        </Typography>
        {(hasPct || (trendOverride && trendOverride !== 'N/A')) ? (
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            px: '6px',
            py: '2px',
            bgcolor: badgeBg,
            color: badgeColor,
            borderRadius: '4px',
            border: badgeBorder,
            fontSize: '0.65rem',
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '0.03em',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            whiteSpace: 'nowrap'
          }}>
            <span>{trendLabel}</span>
            <span style={{ fontSize: '0.55rem' }}>{arrow}</span>
            {hasPct && <span>{pctText}</span>}
          </Box>
        ) : <Typography component="span" sx={{ fontSize: '0.72rem', color: '#64748b' }}>-</Typography>}
      </Box>
    </Box>
  );
};

const POPULATE_DATA = gql`
  mutation PopulateData {
    populateCompaniesData
  }
`;

const Home: React.FC = () => {
  const { loading, error, data } = useQuery(GET_COMPANIES, { pollInterval: 15000, fetchPolicy: 'network-only' });
  const [populateData] = useMutation(POPULATE_DATA);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  if (loading && !data) return <Box display="flex" justifyContent="center" mt={10}><CircularProgress sx={{color: '#7c4dff'}} /></Box>;
  if (error) return <Typography color="error" mt={5}>Error loading data.</Typography>;

  const handlePopulate = () => {
     populateData();
  };

  const rows = data?.companies?.filter((c: any) => 
     c.ticker.toLowerCase().includes(search.toLowerCase()) || 
     c.name.toLowerCase().includes(search.toLowerCase())
  ).map((c: any) => ({
     id: c.id,
     ...c
  })) || [];

  const sampleRow = data?.companies?.find((c: any) => c.q4Date && c.q3Date) || {};
  const getDateLabel = (dbDate: string | undefined, fallbackMonth: string) => {
    if (dbDate) return `${dbDate} `;
    return `${fallbackMonth} `;
  };
  const q4Prefix = getDateLabel(sampleRow.q4Date, "Mar-2026");
  const q3Prefix = getDateLabel(sampleRow.q3Date, "Dec-2025");
  const q2Prefix = getDateLabel(sampleRow.q2Date, "Sep-2025");
  const q1Prefix = getDateLabel(sampleRow.q1Date, "Jun-2025");

  const dateSortComparator = (v1: string | null, v2: string | null) => {
    if (!v1 && !v2) return 0;
    if (!v1) return -1;
    if (!v2) return 1;
    const d1 = new Date(v1).getTime();
    const d2 = new Date(v2).getTime();
    if (isNaN(d1) && isNaN(d2)) return v1.localeCompare(v2);
    if (isNaN(d1)) return -1;
    if (isNaN(d2)) return 1;
    return d1 - d2;
  };

  const columns: GridColDef[] = [
    { field: 'ticker', headerName: 'TICKER', width: 115, type: 'string',
      renderCell: (p) => renderCenteredCell(p.value, '#f8fafc', 700, '0.82rem')
    },
    { field: 'name', headerName: 'COMPANY NAME', width: 180, type: 'string',
      renderCell: (p) => renderCenteredCell(p.value, '#94a3b8', 400, '0.75rem')
    },
    { field: 'currentPrice', headerName: 'PRICE', width: 85, type: 'number', headerAlign: 'left', align: 'left',
      valueGetter: (_v: any, row: any) => row?.currentPrice != null && !isNaN(row.currentPrice) ? Number(row.currentPrice) : -Infinity,
      renderCell: (p) => renderCenteredCell(p.row?.currentPrice != null ? `₹${p.row.currentPrice}` : '-', '#e2e8f0', 600, '0.78rem')
    },
    { field: 'marketCap', headerName: 'MARKET CAP', width: 120, type: 'number', headerAlign: 'left', align: 'left',
      valueGetter: (_v: any, row: any) => row?.marketCap != null && !isNaN(row.marketCap) ? Number(row.marketCap) : -Infinity,
      renderCell: (p) => renderCenteredCell(formatValCr(p.row?.marketCap), '#a78bfa', 600, '0.78rem')
    },
    { field: 'q1Clubbed', headerName: `${q1Prefix.trim()} (Q1)`, width: 240, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.q1Profit != null && !isNaN(row.q1Profit) ? Number(row.q1Profit) : (row?.q1Revenue != null ? Number(row.q1Revenue) : -Infinity),
      renderCell: (p) => renderClubbedQuarterCell(p.row?.q1Revenue, p.row?.q0Revenue, p.row?.q1Profit, p.row?.q0Profit, p.row?.q1Eps, p.row?.q0Eps)
    },
    { field: 'q2Clubbed', headerName: `${q2Prefix.trim()} (Q2)`, width: 240, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.q2Profit != null && !isNaN(row.q2Profit) ? Number(row.q2Profit) : (row?.q2Revenue != null ? Number(row.q2Revenue) : -Infinity),
      renderCell: (p) => {
        const trends = p.row?.historicalTrend && p.row.historicalTrend !== 'N/A' ? p.row.historicalTrend.split(',') : [];
        return renderClubbedQuarterCell(p.row?.q2Revenue, p.row?.q1Revenue, p.row?.q2Profit, p.row?.q1Profit, p.row?.q2Eps, p.row?.q1Eps, trends[0] || 'UP');
      }
    },
    { field: 'q3Clubbed', headerName: `${q3Prefix.trim()} (Q3)`, width: 240, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.q3Profit != null && !isNaN(row.q3Profit) ? Number(row.q3Profit) : (row?.q3Revenue != null ? Number(row.q3Revenue) : -Infinity),
      renderCell: (p) => {
        const trends = p.row?.historicalTrend && p.row.historicalTrend !== 'N/A' ? p.row.historicalTrend.split(',') : [];
        return renderClubbedQuarterCell(p.row?.q3Revenue, p.row?.q2Revenue, p.row?.q3Profit, p.row?.q2Profit, p.row?.q3Eps, p.row?.q2Eps, trends[1] || 'UP');
      }
    },
    { field: 'q4Clubbed', headerName: `${q4Prefix.trim()} (Q4 - LATEST)`, width: 250, type: 'number', headerAlign: 'left', align: 'left', sortable: true,
      valueGetter: (_v: any, row: any) => row?.q4Profit != null && !isNaN(row.q4Profit) ? Number(row.q4Profit) : (row?.q4Revenue != null ? Number(row.q4Revenue) : -Infinity),
      renderCell: (p) => {
        const trends = p.row?.historicalTrend && p.row.historicalTrend !== 'N/A' ? p.row.historicalTrend.split(',') : [];
        return renderClubbedQuarterCell(p.row?.q4Revenue, p.row?.q3Revenue, p.row?.q4Profit, p.row?.q3Profit, p.row?.q4Eps, p.row?.q3Eps, trends[2] || 'UP');
      }
    },
    { field: 'upcomingDate', headerName: 'REPORT DATE', width: 125, sortComparator: dateSortComparator,
      renderCell: (p) => renderCenteredCell(p.value, '#94a3b8', 400, '0.75rem')
    },
    {
      field: 'action',
      headerName: '',
      width: 50,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', minHeight: '130px' }}>
          <IconButton 
            size="small"
            onClick={() => navigate(`/companies/${params.row?.id}`)}
            sx={{ color: '#64748b', '&:hover': { color: '#e2e8f0' } }}
          >
            <MoreHorizIcon fontSize="small" />
          </IconButton>
        </Box>
      )
    }
  ];

  const totalCompanies = rows.length;
  
  const eventsInNext7Days = rows.filter((c: any) => {
    if (!c.upcomingDate) return false;
    const eventDate = new Date(c.upcomingDate);
    const today = new Date();
    // Reset times to midnight for accurate day diff
    today.setHours(0,0,0,0);
    eventDate.setHours(0,0,0,0);
    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0b10', p: 4, fontFamily: 'Inter, sans-serif' }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography sx={{ color: '#e2e8f0', fontSize: '1.25rem', fontWeight: 600, mb: 0.5 }}>Dashboard</Typography>
          <Typography sx={{ color: '#64748b', fontSize: '0.85rem' }}>NSE Incoming Earnings Fixtures</Typography>
        </Box>
        <Box display="flex" gap={2}>
           <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#13151a', border: '1px solid #1e293b', borderRadius: 1, px: 2, py: 0.5 }}>
              <SearchIcon sx={{ color: '#64748b', fontSize: '1rem', mr: 1 }} />
              <InputBase 
                 placeholder="Search vessels..." 
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 sx={{ color: '#e2e8f0', fontSize: '0.85rem', width: '200px' }} 
              />
           </Box>
           <Tooltip title="Bulk download historical data from Yahoo Finance (Takes ~5 minutes)">
              <IconButton onClick={handlePopulate} sx={{ bgcolor: '#1e293b', color: '#e2e8f0', borderRadius: 1, '&:hover': {bgcolor: '#334155'} }}>
                 <CloudDownloadIcon fontSize="small" />
              </IconButton>
           </Tooltip>
        </Box>
      </Box>

      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: '#13151a', border: '1px solid #1e293b', borderRadius: 2 }}>
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography color="#94a3b8" fontSize="0.85rem" fontWeight="600" textTransform="uppercase">Total Companies Tracked</Typography>
              <Typography color="#e2e8f0" fontSize="2rem" fontWeight="bold" mt={1}>{totalCompanies}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: '#13151a', border: '1px solid #1e293b', borderRadius: 2 }}>
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography color="#94a3b8" fontSize="0.85rem" fontWeight="600" textTransform="uppercase">Events in Next 7 Days</Typography>
              <Typography color="#7c4dff" fontSize="2rem" fontWeight="bold" mt={1}>{eventsInNext7Days}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ height: 'calc(100vh - 150px)', width: '100%', bgcolor: '#0f111a', borderRadius: 2, overflow: 'hidden', border: '1px solid #1e293b' }}>
        <DataGrid 
          rows={rows} 
          columns={columns} 
          disableRowSelectionOnClick
          getRowHeight={() => 'auto'}
          getEstimatedRowHeight={() => 130}
          headerHeight={46}
          sx={{
             border: 0,
             color: '#e2e8f0',
             '& .MuiDataGrid-columnHeaders': {
               bgcolor: '#13151a',
               color: '#64748b',
               textTransform: 'uppercase',
               fontSize: '0.7rem',
               fontWeight: 600,
               letterSpacing: '0.05em',
               borderBottom: '1px solid #1e293b'
             },
             '& .MuiDataGrid-cell': {
               borderBottom: '1px solid #1e293b',
               py: '4px',
             },
             '& .MuiDataGrid-row': {
               bgcolor: '#0a0b10',
               '&:hover': { bgcolor: '#13151a' }
             },
             '& .MuiDataGrid-row:nth-of-type(even)': {
               bgcolor: '#0f111a',
             },
             '& .MuiDataGrid-footerContainer': {
               borderTop: '1px solid #1e293b',
               bgcolor: '#13151a',
               color: '#64748b'
             },
             '& .MuiTablePagination-root': { color: '#64748b' }
          }}
        />
      </Box>
    </Box>
  );
};

export default Home;
