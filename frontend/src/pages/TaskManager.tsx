import React, { useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Box, Typography, CircularProgress, Chip, IconButton, Modal, Paper } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import InfoIcon from '@mui/icons-material/Info';

const GET_BACKGROUND_JOBS = gql`
  query GetBackgroundJobs {
    backgroundJobs(limit: 100) {
      id
      celeryTaskId
      taskName
      status
      queuedAt
      startedAt
      finishedAt
      result
      errorMessage
      duration
    }
  }
`;

const TaskManager: React.FC = () => {
  const { loading, error, data } = useQuery(GET_BACKGROUND_JOBS, { pollInterval: 5000, fetchPolicy: 'network-only' });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState('');
  const [modalTitle, setModalTitle] = useState('');

  const handleOpenModal = (title: string, content: string) => {
    setModalTitle(title);
    setModalContent(content);
    setModalOpen(true);
  };

  if (loading && !data) return <Box display="flex" justifyContent="center" mt={10}><CircularProgress sx={{color: '#7c4dff'}} /></Box>;
  if (error) return <Typography color="error" mt={5}>Error loading data.</Typography>;

  const columns: GridColDef[] = [
    { field: 'taskName', headerName: 'TASK NAME', width: 250, flex: 1, 
      renderCell: (p) => <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: '#e2e8f0' }}>{p.value}</Typography>
    },
    { field: 'status', headerName: 'STATUS', width: 120,
      renderCell: (p) => {
        let color = '#334155';
        let textColor = '#cbd5e1';
        if (p.value === 'QUEUED') { color = '#334155'; textColor = '#cbd5e1'; }
        if (p.value === 'RUNNING') { color = '#0f3460'; textColor = '#4d90fe'; }
        if (p.value === 'SUCCESS') { color = '#0f5132'; textColor = '#75b798'; }
        if (p.value === 'FAILURE') { color = '#842029'; textColor = '#ea868f'; }
        return (
          <Chip label={p.value} size="small" sx={{ bgcolor: color, color: textColor, fontWeight: 600, fontSize: '0.7rem', borderRadius: 1 }} />
        )
      }
    },
    { field: 'queuedAt', headerName: 'QUEUED AT', width: 200,
      renderCell: (p) => <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(p.value + "Z").toLocaleString()}</Typography>
    },
    { field: 'duration', headerName: 'DURATION (s)', width: 120,
      renderCell: (p) => <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8' }}>{p.value ? `${parseFloat(p.value).toFixed(2)}s` : '-'}</Typography>
    },
    { field: 'celeryTaskId', headerName: 'TASK ID', width: 250,
      renderCell: (p) => <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>{p.value}</Typography>
    },
    { field: 'message', headerName: 'MESSAGE', width: 300, flex: 1.5,
      renderCell: (params: GridRenderCellParams) => {
         const msg = params.row.errorMessage || params.row.result;
         if (!msg) return <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>-</Typography>;
         
         const isError = params.row.status === 'FAILURE';
         return (
            <Typography sx={{ 
               fontSize: '0.75rem', 
               color: isError ? '#ea868f' : '#94a3b8',
               whiteSpace: 'nowrap',
               overflow: 'hidden',
               textOverflow: 'ellipsis'
            }}>
               {msg}
            </Typography>
         );
      }
    },
    {
      field: 'action',
      headerName: 'DETAILS',
      width: 100,
      renderCell: (params: GridRenderCellParams) => {
        const hasDetails = params.row.result || params.row.errorMessage;
        return hasDetails ? (
          <IconButton 
            size="small"
            onClick={() => handleOpenModal(
              params.row.status === 'FAILURE' ? 'Error Details' : 'Task Result',
              params.row.errorMessage || params.row.result
            )}
            sx={{ color: params.row.status === 'FAILURE' ? '#ea868f' : '#7c4dff' }}
          >
            <InfoIcon fontSize="small" />
          </IconButton>
        ) : null;
      }
    }
  ];

  const rows = data?.backgroundJobs || [];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0b10', p: 4, fontFamily: 'Inter, sans-serif' }}>
      <Box mb={4}>
        <Typography sx={{ color: '#e2e8f0', fontSize: '1.25rem', fontWeight: 600, mb: 0.5 }}>Task Manager</Typography>
        <Typography sx={{ color: '#64748b', fontSize: '0.85rem' }}>Live tracking of asynchronous Celery background workers</Typography>
      </Box>

      <Box sx={{ height: 'calc(100vh - 150px)', width: '100%', bgcolor: '#0f111a', borderRadius: 2, overflow: 'hidden', border: '1px solid #1e293b' }}>
        <DataGrid 
          rows={rows} 
          columns={columns} 
          disableRowSelectionOnClick
          rowHeight={45}
          headerHeight={40}
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
               display: 'flex',
               alignItems: 'center',
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <Box sx={{ 
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
          width: 800, bgcolor: '#0f111a', border: '1px solid #1e293b', boxShadow: 24, p: 4, borderRadius: 2 
        }}>
          <Typography variant="h6" component="h2" sx={{ color: '#e2e8f0', mb: 2 }}>{modalTitle}</Typography>
          <Paper sx={{ p: 2, bgcolor: '#13151a', maxHeight: '60vh', overflowY: 'auto' }}>
             <pre style={{ color: modalTitle === 'Error Details' ? '#ea868f' : '#75b798', whiteSpace: 'pre-wrap', fontSize: '0.8rem', margin: 0 }}>
                {modalContent}
             </pre>
          </Paper>
        </Box>
      </Modal>

    </Box>
  );
};

export default TaskManager;
