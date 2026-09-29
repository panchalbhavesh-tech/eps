import { useMediaQuery, useTheme } from '@mui/material';

/**
 * Shared responsive breakpoints (MUI defaults): phones < 600px, tablets 600-899px, desktop >= 900px.
 * - useIsMobile:  phone layouts (card lists, full-screen dialogs, compact toolbars)
 * - useIsCompact: phone + tablet (off-canvas navigation instead of the permanent sidebar)
 * Desktop (>= 900px) renders exactly as before.
 */
export const useIsMobile = () => useMediaQuery(useTheme().breakpoints.down('sm'), { noSsr: true });
export const useIsCompact = () => useMediaQuery(useTheme().breakpoints.down('md'), { noSsr: true });
