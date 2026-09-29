import React, { useState, useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { FilterChipGroup, SearchInput, MobileCardList } from '../components/common';
import { useIsMobile } from '../hooks/useResponsive';
import { useThemeMode } from '../theme/ThemeContext';
import AdminLogDetailDrawer from '../components/admin/AdminLogDetailDrawer';
import { formatToIST } from '../utils';

const GET_ADMIN_LOGS = gql`
  query GetAdminLogs($limit: Int!, $offset: Int!) {
    adminActivityLogs(limit: $limit, offset: $offset) {
      id
      userEmail
      eventType
      eventName
      eventDescription
      status
      startedAt
      completedAt
      durationMs
      createdAt
      metadataJson
    }
  }
`;

export interface AdminActivityLog {
  id: string;
  userEmail: string;
  eventType: string;
  eventName: string;
  eventDescription?: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  createdAt: string;
  metadataJson?: string;
  celeryTaskId?: string;
}

const AdminLogs: React.FC = () => {
  const { mode, tokens } = useThemeMode();
  const isMobile = useIsMobile();
  const isDark = mode === 'dark';

  const { loading, data } = useQuery(GET_ADMIN_LOGS, {
    variables: { limit: 1000, offset: 0 },
    pollInterval: 10000,
    fetchPolicy: 'network-only'
  });

  const [selectedLog, setSelectedLog] = useState<AdminActivityLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState('All Users');

  const rows: AdminActivityLog[] = data?.adminActivityLogs || [];

  const handleOpenDetails = (log: AdminActivityLog) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };



  const filteredRows = useMemo(() => {
    return rows.filter((log) => {
      if (userFilter !== 'All Users' && log.userEmail !== userFilter) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesName = log.eventName?.toLowerCase().includes(q);
        const matchesUser = log.userEmail?.toLowerCase().includes(q);
        const matchesDesc = log.eventDescription?.toLowerCase().includes(q);
        if (!matchesName && !matchesUser && !matchesDesc) return false;
      }
      return true;
    });
  }, [rows, userFilter, searchQuery]);

  const columns: GridColDef[] = [
    { 
      field: 'createdAt', 
      headerName: 'TIME', 
      flex: 1.5,
      renderCell: (params: GridRenderCellParams) => {
        const { dateStr, timeStr } = formatToIST(params.value as string | number);

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: tokens.text.primary }}>
              {dateStr} <span style={{ color: tokens.text.secondary }}>· {timeStr}</span>
            </Typography>
          </Box>
        );
      }
    },
    { 
      field: 'userEmail', 
      headerName: 'USER', 
      flex: 1,
      renderCell: (params: GridRenderCellParams) => {
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: tokens.text.primary }}>
              {params.value}
            </Typography>
          </Box>
        );
      }
    },
    { 
      field: 'eventName', 
      headerName: 'EVENT', 
      flex: 2,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" sx={{ fontWeight: 500, color: tokens.text.primary }}>
            {params.value}
          </Typography>
        </Box>
      )
    },
    {
      field: 'actions',
      headerName: 'DETAILS',
      flex: 0.5,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Tooltip title="View Details">
            <IconButton 
              size="small" 
              onClick={(e) => { e.stopPropagation(); handleOpenDetails(params.row as AdminActivityLog); }}
              sx={{ color: tokens.text.secondary, '&:hover': { color: tokens.primary.main } }}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )
    }
  ];

  const renderLogCard = (row: any) => {
    const { dateStr, timeStr } = formatToIST(row.createdAt as string | number);
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '13px', fontWeight: 600, color: tokens.text.primary, lineHeight: '18px' }}>{row.eventName}</Typography>
          <Typography noWrap sx={{ fontSize: '12px', color: tokens.text.secondary }}>{dateStr} · {timeStr} · {row.userEmail}</Typography>
        </Box>
        <OpenInNewIcon sx={{ fontSize: 18, color: tokens.text.secondary }} />
      </Box>
    );
  };

  return (
    <Box sx={{ minHeight: '100vh', width: '100%', bgcolor: tokens.background.default, overflowX: 'hidden' }}>
      


      {/* Filters & Grid */}
      <Box sx={{ bgcolor: tokens.background.paper, overflow: 'hidden', width: '100%', borderBottom: `1px solid ${tokens.border.main}` }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, borderBottom: `1px solid ${tokens.border.light}`, display: 'flex', flexWrap: 'wrap', gap: { xs: 1, md: 2 }, alignItems: 'center' }}>
          <SearchInput 
            placeholder="Search activity..." 
            value={searchQuery} 
            onChange={setSearchQuery}
            width={{ xs: '100%', sm: 250 }}
          />
          <FilterChipGroup 
            options={['All Users', 'dt@gmail.com', 'vg@gmail.com', 'SYSTEM'].map(o => ({label: o, value: o}))}
            selectedValue={userFilter}
            onChange={(val) => setUserFilter(val as string)}
          />
        </Box>

        <Box sx={{ height: { xs: 'auto', sm: 'calc(100vh - 130px)' }, width: '100%' }}>
          {isMobile ? (
            <MobileCardList rows={filteredRows} renderCard={renderLogCard} loading={loading} emptyText="No activity found."
              sortOptions={[{ key: 'time', label: 'Newest first', get: (r) => new Date(r.createdAt).getTime() }]}
              onRowClick={(p: any) => handleOpenDetails(p.row as AdminActivityLog)} />
          ) : (
          <DataGrid
            rows={filteredRows}
            columns={columns}
            loading={loading}
            disableRowSelectionOnClick
            onRowClick={(params) => handleOpenDetails(params.row as AdminActivityLog)}
            initialState={{
              pagination: { paginationModel: { pageSize: 50 } },
              sorting: { sortModel: [{ field: 'createdAt', sort: 'desc' }] },
            }}
            rowHeight={44}
            pageSizeOptions={[25, 50, 100]}
            sx={{
              border: 'none',
              '& .MuiDataGrid-cell': {
                borderBottom: `1px solid ${tokens.border.light}`,
                color: tokens.text.secondary,
              },
              '& .MuiDataGrid-columnHeaders': {
                bgcolor: isDark ? 'rgba(0,0,0,0.2)' : tokens.background.default,
                borderBottom: `1px solid ${tokens.border.main}`,
                color: tokens.text.secondary,
              },
              '& .MuiDataGrid-row:hover': {
                bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                cursor: 'pointer'
              }
            }}
          />
          )}
        </Box>
      </Box>

      {selectedLog && (
        <AdminLogDetailDrawer 
          open={drawerOpen} 
          onClose={() => setDrawerOpen(false)} 
          log={selectedLog} 
        />
      )}
    </Box>
  );
};

export default AdminLogs;
