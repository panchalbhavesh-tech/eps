import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { getThemeTokens, createAppTheme, ThemeTokens, PaletteMode } from './theme';

interface ThemeModeContextType {
  mode: PaletteMode;
  toggleMode: () => void;
  setMode: (mode: PaletteMode) => void;
  tokens: ThemeTokens;
}

const ThemeModeContext = createContext<ThemeModeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'qeps_theme_mode';

export const ThemeModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<PaletteMode>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return (saved === 'light' || saved === 'dark') ? (saved as PaletteMode) : 'dark';
  });

  const toggleMode = () => {
    setModeState((prev: PaletteMode) => {
      const next: PaletteMode = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  };

  const setMode = (newMode: PaletteMode) => {
    localStorage.setItem(THEME_STORAGE_KEY, newMode);
    setModeState(newMode);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    if (mode === 'dark') {
      document.documentElement.style.setProperty('--bg-color', '#0A0A0C');
      document.body.style.backgroundColor = '#0A0A0C';
    } else {
      document.documentElement.style.setProperty('--bg-color', '#F7F8FA');
      document.body.style.backgroundColor = '#F7F8FA';
    }
  }, [mode]);

  const tokens = useMemo(() => getThemeTokens(mode), [mode]);
  const muiTheme = useMemo(() => createAppTheme(mode), [mode]);

  const value = useMemo(
    () => ({ mode, toggleMode, setMode, tokens }),
    [mode, tokens]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeModeContext.Provider>
  );
};

export const useThemeMode = (): ThemeModeContextType => {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeModeProvider');
  }
  return context;
};
