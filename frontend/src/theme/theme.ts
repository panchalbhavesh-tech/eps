import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#7c4dff', // Deep purple
      light: '#b47cff',
      dark: '#3f1dcb',
    },
    secondary: {
      main: '#00e5ff', // Cyan
    },
    background: {
      default: '#0a0e17', // Very dark blue/grey
      paper: '#13192b',
    },
    text: {
      primary: '#ffffff',
      secondary: '#a0aabf',
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 500 },
    h6: { fontWeight: 500 },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    }
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 24px',
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0 4px 20px 0 rgba(0,0,0,0.4)',
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          }
        }
      }
    }
  }
});

export default theme;
