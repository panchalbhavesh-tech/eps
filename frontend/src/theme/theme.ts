import { createTheme } from '@mui/material/styles';

// Complete centralized color tokens for QEPS Nexchange Light SaaS Design System
export const saasTokens = {
  background: {
    default: 'transparent', // Let the ambient lavender body gradient shine through
    paper: '#ffffff',       // Pure white surface for cards, modals, sidebar
    card: '#ffffff',        // Interactive tile surface
    cardHover: '#f8fafc',   // Soft slate hover state
    header: '#ffffff',      // Table & Navigation headers
  },
  border: {
    main: '#e2e8f0',        // Slate-200 hairline divider & card border
    light: '#cbd5e1',       // Slate-300 highlighted border
    focus: '#0f172a',       // Slate-900 sharp active keyboard focus ring
  },
  text: {
    primary: '#0f172a',     // Slate-900 crisp dark text
    secondary: '#64748b',   // Slate-500 muted text
    disabled: '#94a3b8',    // Slate-400 disabled text
  },
  primary: {
    main: '#0f172a',        // Solid Slate-900 primary action buttons and active pills
    light: '#334155',
    dark: '#020617',
    tint: '#f1f5f9',        // Slate-100 soft background tint for active states
    border: '#cbd5e1',
  },
  secondary: {
    main: '#6366f1',        // Indigo brand accent highlight
    light: '#818cf8',
    tint: 'rgba(99, 102, 241, 0.1)',
    border: 'rgba(99, 102, 241, 0.3)',
  },
  status: {
    success: {
      main: '#10b981',
      light: '#059669',
      tint: '#ecfdf5',
      border: '#6ee7b7',
    },
    error: {
      main: '#f43f5e',
      light: '#e11d48',
      tint: '#fff1f2',
      border: '#fda4af',
    },
    warning: {
      main: '#f59e0b',
      light: '#d97706',
      tint: '#fffbeb',
      border: '#fcd34d',
    },
    info: {
      main: '#3b82f6',
      light: '#2563eb',
      tint: '#eff6ff',
      border: '#93c5fd',
    },
    neutral: {
      main: '#64748b',
      light: '#475569',
      tint: '#f1f5f9',
      border: '#cbd5e1',
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    tabularNums: 'tabular-nums',
  }
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: saasTokens.primary.main,
      light: saasTokens.primary.light,
      dark: saasTokens.primary.dark,
    },
    secondary: {
      main: saasTokens.secondary.main,
    },
    background: {
      default: '#f8fafc',
      paper: saasTokens.background.paper,
    },
    text: {
      primary: saasTokens.text.primary,
      secondary: saasTokens.text.secondary,
    }
  },
  typography: {
    fontFamily: saasTokens.typography.fontFamily,
    h1: { fontWeight: 700, letterSpacing: '-0.02em', color: saasTokens.text.primary },
    h2: { fontWeight: 700, letterSpacing: '-0.015em', color: saasTokens.text.primary },
    h3: { fontWeight: 600, letterSpacing: '-0.01em', color: saasTokens.text.primary },
    h4: { fontWeight: 600, color: saasTokens.text.primary },
    h5: { fontWeight: 600, color: saasTokens.text.primary },
    h6: { fontWeight: 600, color: saasTokens.text.primary },
    body1: { fontSize: '0.95rem', lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' },
    body2: { fontSize: '0.85rem', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: '0.01em',
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
          padding: '8px 18px',
          fontWeight: 600,
          transition: 'all 0.15s ease-in-out',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            transform: 'translateY(-1px)',
          }
        },
        containedPrimary: {
          backgroundColor: '#0f172a',
          color: '#ffffff',
          '&:hover': {
            backgroundColor: '#1e293b',
          }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: saasTokens.background.paper,
          border: `1px solid ${saasTokens.border.main}`,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: saasTokens.background.card,
          border: `1px solid ${saasTokens.border.main}`,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.01em',
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: '#f8fafc',
            '& fieldset': {
              borderColor: saasTokens.border.main,
              transition: 'border-color 0.15s ease',
            },
            '&:hover fieldset': {
              borderColor: saasTokens.border.light,
            },
            '&.Mui-focused fieldset': {
              borderColor: saasTokens.border.focus,
              boxShadow: '0 0 0 3px rgba(15, 23, 42, 0.08)',
            }
          }
        }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#0f172a',
          color: '#ffffff',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
          borderRadius: 8,
          fontSize: '0.8rem',
          padding: '8px 12px',
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${saasTokens.border.main}`,
          fontVariantNumeric: 'tabular-nums',
          padding: '12px 16px',
        },
        head: {
          backgroundColor: '#ffffff',
          color: saasTokens.text.secondary,
          fontWeight: 600,
          textTransform: 'uppercase',
          fontSize: '0.72rem',
          letterSpacing: '0.04em',
        }
      }
    }
  }
});

export default theme;
