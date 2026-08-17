import { createTheme, Theme } from '@mui/material/styles';

export type PaletteMode = 'light' | 'dark';

export interface ThemeTokens {
  mode: PaletteMode;
  background: {
    default: string;
    paper: string;
    card: string;
    cardHover: string;
    header: string;
  };
  border: {
    main: string;
    light: string;
    focus: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    muted: string;
    disabled: string;
  };
  primary: {
    main: string;
    light: string;
    dark: string;
    tint: string;
    border: string;
  };
  secondary: {
    main: string;
    tint: string;
    wash: string;
  };
  accent: {
    main: string;
    tint: string;
    glow: string;
  };
  rowTint: {
    buy: string;
    avoid: string;
    neutral: string;
    attention: string;
    child: string;
    hoverOverlay: string;
  };
  status: {
    success: {
      main: string;
      wash: string;
      pillBg: string;
      border: string;
      tint: string;
    };
    error: {
      main: string;
      wash: string;
      pillBg: string;
      border: string;
      tint: string;
    };
    warning: {
      main: string;
      wash: string;
      pillBg: string;
      border: string;
      tint: string;
    };
    neutral: {
      main: string;
      wash: string;
      pillBg: string;
      border: string;
      tint: string;
    };
    info: {
      main: string;
      wash: string;
      pillBg: string;
      border: string;
      tint: string;
    };
  };
  typography: {
    fontFamily: string;
    monospace: string;
  };
  shadows: {
    subtle: string;
    elevated: string;
    card: string;
    dropdown: string;
  };
}

export const getThemeTokens = (mode: PaletteMode): ThemeTokens => {
  const isDark = mode === 'dark';

  return {
    mode,
    background: {
      default: isDark ? '#0B0C0E' : '#F7F8FA',
      paper: isDark ? '#111316' : '#FFFFFF',
      card: isDark ? '#111316' : '#FFFFFF',
      cardHover: isDark ? '#15181B' : '#F5F6F8',
      header: isDark ? '#111316' : '#F8FAFC',
    },
    border: {
      main: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
      light: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
      focus: isDark ? '#3B82F6' : '#2563EB',
    },
    text: {
      primary: isDark ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.90)',
      secondary: isDark ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.75)',
      tertiary: isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.60)',
      muted: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.50)',
      disabled: isDark ? 'rgba(255, 255, 255, 0.30)' : 'rgba(0, 0, 0, 0.38)',
    },
    primary: {
      main: isDark ? '#3B82F6' : '#2563EB',
      light: isDark ? '#60A5FA' : '#3B82F6',
      dark: isDark ? '#2563EB' : '#1D4ED8',
      tint: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(37, 99, 235, 0.08)',
      border: isDark ? 'rgba(59, 130, 246, 0.30)' : 'rgba(37, 99, 235, 0.30)',
    },
    secondary: {
      main: '#6366f1',
      tint: isDark ? 'rgba(99, 102, 241, 0.15)' : '#e0e7ff',
      wash: isDark ? 'rgba(99, 102, 241, 0.08)' : '#f3f4f6',
    },
    accent: {
      main: isDark ? '#3B82F6' : '#2563EB',
      tint: isDark ? 'rgba(59, 130, 246, 0.10)' : 'rgba(37, 99, 235, 0.10)',
      glow: isDark ? 'none' : 'none',
    },
    rowTint: {
      buy: 'transparent',
      avoid: 'transparent',
      neutral: 'transparent',
      attention: 'transparent',
      child: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
      hoverOverlay: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
    },
    status: {
      success: {
        main: isDark ? '#20C997' : '#0FAE64',
        wash: isDark ? 'rgba(32, 201, 151, 0.08)' : 'rgba(15, 174, 100, 0.08)',
        pillBg: isDark ? 'rgba(32, 201, 151, 0.10)' : 'rgba(15, 174, 100, 0.10)',
        border: isDark ? 'rgba(32, 201, 151, 0.20)' : 'rgba(15, 174, 100, 0.20)',
        tint: isDark ? 'rgba(32, 201, 151, 0.10)' : '#d1fae5',
      },
      error: {
        main: isDark ? '#F05A67' : '#E53935',
        wash: isDark ? 'rgba(240, 90, 103, 0.08)' : 'rgba(229, 57, 53, 0.08)',
        pillBg: isDark ? 'rgba(240, 90, 103, 0.10)' : 'rgba(229, 57, 53, 0.10)',
        border: isDark ? 'rgba(240, 90, 103, 0.20)' : 'rgba(229, 57, 53, 0.20)',
        tint: isDark ? 'rgba(240, 90, 103, 0.10)' : '#fee2e2',
      },
      warning: {
        main: isDark ? '#E5A93D' : '#F57C00',
        wash: isDark ? 'rgba(229, 169, 61, 0.08)' : 'rgba(245, 124, 0, 0.08)',
        pillBg: isDark ? 'rgba(229, 169, 61, 0.10)' : 'rgba(245, 124, 0, 0.10)',
        border: isDark ? 'rgba(229, 169, 61, 0.20)' : 'rgba(245, 124, 0, 0.20)',
        tint: isDark ? 'rgba(229, 169, 61, 0.10)' : '#fef3c7',
      },
      neutral: {
        main: isDark ? '#8B949E' : 'rgba(0, 0, 0, 0.60)',
        wash: isDark ? 'rgba(139, 148, 158, 0.04)' : 'rgba(0, 0, 0, 0.04)',
        pillBg: isDark ? 'rgba(139, 148, 158, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        border: isDark ? 'rgba(139, 148, 158, 0.20)' : 'rgba(0, 0, 0, 0.15)',
        tint: isDark ? 'rgba(139, 148, 158, 0.05)' : '#f8fafc',
      },
      info: {
        main: isDark ? '#00B4D8' : '#0096C7',
        wash: isDark ? 'rgba(0, 180, 216, 0.08)' : 'rgba(0, 150, 199, 0.08)',
        pillBg: isDark ? 'rgba(0, 180, 216, 0.20)' : 'rgba(0, 150, 199, 0.15)',
        border: isDark ? 'rgba(0, 180, 216, 0.40)' : 'rgba(0, 150, 199, 0.35)',
        tint: isDark ? 'rgba(0, 180, 216, 0.10)' : '#eff6ff',
      }
    },
    typography: {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      monospace: '"JetBrains Mono", "Monaco", "Courier New", monospace',
    },
    shadows: {
      subtle: isDark ? '0 1px 3px rgba(0, 0, 0, 0.30)' : '0 1px 3px rgba(0, 0, 0, 0.15)',
      elevated: isDark ? '0 4px 12px rgba(0, 0, 0, 0.50)' : '0 4px 12px rgba(0, 0, 0, 0.25)',
      card: isDark ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.12)',
      dropdown: isDark ? '0 8px 24px rgba(0, 0, 0, 0.60)' : '0 8px 24px rgba(0, 0, 0, 0.15)',
    }
  };
};

// Legacy support for existing un-redesigned components
export const saasTokens = getThemeTokens('light');

export const createAppTheme = (mode: PaletteMode): Theme => {
  const tokens = getThemeTokens(mode);

  return createTheme({
    palette: {
      mode,
      primary: {
        main: tokens.primary.main,
        light: tokens.primary.light,
        dark: tokens.primary.dark,
      },
      secondary: {
        main: '#6366f1',
      },
      background: {
        default: tokens.background.default,
        paper: tokens.background.paper,
      },
      text: {
        primary: tokens.text.primary,
        secondary: tokens.text.secondary,
      },
      divider: tokens.border.main,
    },
    typography: {
      fontFamily: tokens.typography.fontFamily,
      h1: { fontSize: '24px', fontWeight: 600, letterSpacing: '-0.5px', lineHeight: '32px', color: tokens.text.primary },
      h2: { fontSize: '20px', fontWeight: 600, letterSpacing: '-0.25px', lineHeight: '28px', color: tokens.text.primary },
      h3: { fontSize: '16px', fontWeight: 600, letterSpacing: '0px', lineHeight: '24px', color: tokens.text.primary },
      h4: { fontSize: '15px', fontWeight: 600, color: tokens.text.primary },
      h5: { fontSize: '14px', fontWeight: 600, letterSpacing: '0.25px', lineHeight: '20px', color: tokens.text.primary },
      h6: { fontSize: '13px', fontWeight: 600, letterSpacing: '0.25px', lineHeight: '18px', color: tokens.text.primary },
      body1: { fontSize: '13px', fontWeight: 400, lineHeight: '20px', color: tokens.text.primary },
      body2: { fontSize: '12px', fontWeight: 400, lineHeight: '16px', color: tokens.text.secondary },
      caption: { fontSize: '10px', fontWeight: 400, lineHeight: '14px', color: tokens.text.tertiary },
      button: { textTransform: 'none', fontSize: '12px', fontWeight: 600, letterSpacing: '0.25px' },
    },
    shape: {
      borderRadius: 4,
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: tokens.background.paper,
            border: `1px solid ${tokens.border.main}`,
            boxShadow: tokens.shadows.card,
            transition: 'background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: tokens.background.card,
            border: `1px solid ${tokens.border.main}`,
            boxShadow: tokens.shadows.card,
            overflow: 'hidden',
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            fontWeight: 500,
          }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'dark' ? '#1A1A1E' : '#0F172A',
            color: '#FFFFFF',
            boxShadow: tokens.shadows.dropdown,
            borderRadius: 8,
            fontSize: '11px',
            lineHeight: '16px',
            padding: '8px 12px',
            border: `1px solid ${tokens.border.light}`,
          }
        }
      },
    }
  });
};

export default createAppTheme('dark');
