import { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AutorenewIcon from '@mui/icons-material/Autorenew';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  stackTrace: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
    stackTrace: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || String(error),
      stackTrace: error?.stack || ''
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React rendering exception:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, m: 2, bgcolor: '#fff1f2', border: '1px solid #fda4af', borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ErrorOutlineIcon sx={{ color: '#e11d48', fontSize: 28 }} />
            <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: '#9f1239' }}>
              {this.props.fallbackTitle || "Component Rendering Error"}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.9rem', color: '#881337', fontWeight: 600 }}>
            This section is temporarily unavailable. Something went wrong while loading this content.
          </Typography>
          <Button
            variant="contained"
            onClick={() => this.setState({ hasError: false, errorMessage: '', stackTrace: '' })}
            startIcon={<AutorenewIcon />}
            sx={{ bgcolor: '#e11d48', '&:hover': { bgcolor: '#be123c' }, textTransform: 'none', fontWeight: 700 }}
          >
            Retry Component
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}
