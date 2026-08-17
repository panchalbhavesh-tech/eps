import React, { useState, useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Box, Typography, Paper, IconButton, Tooltip } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { FilterChipGroup, SearchInput } from '../components/common';
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

  return (
    <Box sx={{ p: 3, maxWidth: 1600, margin: '0 auto' }}>
      


      {/* Filters & Grid */}
      <Paper sx={{ 
        bgcolor: tokens.background.paper, 
        borderRadius: 2,
        border: `1px solid ${tokens.border.main}`,
        overflow: 'hidden'
      }}>
        <Box sx={{ p: 2, borderBottom: `1px solid ${tokens.border.light}`, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <SearchInput 
            placeholder="Search activity..." 
            value={searchQuery} 
            onChange={setSearchQuery}
            sx={{ width: 250 }}
          />
          <FilterChipGroup 
            options={['All Users', 'dt@gmail.com', 'vg@gmail.com', 'SYSTEM'].map(o => ({label: o, value: o}))}
            selectedValue={userFilter}
            onChange={(val) => setUserFilter(val as string)}
          />
        </Box>

        <Box sx={{ height: 600, width: '100%' }}>
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
        </Box>
      </Paper>

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
