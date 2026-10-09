import React, { useState } from 'react';
import { Box, Drawer, AppBar, Toolbar, List, Typography, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton, Tooltip, Avatar, Menu, MenuItem } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import MenuIcon from '@mui/icons-material/Menu';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BiotechIcon from '@mui/icons-material/Biotech';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RadarIcon from '@mui/icons-material/Radar';
import StorageIcon from '@mui/icons-material/Storage';
import EventNoteIcon from '@mui/icons-material/EventNote';
import GridViewIcon from '@mui/icons-material/GridView';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useThemeMode } from '../theme/ThemeContext';
import { ErrorBoundary, ThemeModeToggle, LiveClock } from './common';
import { useIsCompact, useIsMobile } from '../hooks/useResponsive';

const Layout: React.FC = () => {
  const { logout, user } = useAuth();
  const { mode, tokens } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Phones/tablets (< 900px): off-canvas navigation; the permanent rail is desktop-only.
  const isCompact = useIsCompact();
  const isMobile = useIsMobile();

  const isDark = mode === 'dark';
  const navExpanded = isCompact ? true : !collapsed;
  const drawerWidth = isCompact ? 0 : (collapsed ? 56 : 240);
  const goTo = (path: string) => {
    navigate(path);
    if (isCompact) setMobileNavOpen(false);
  };

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate('/login');
  };

  const menuItems = [
    {
      text: 'Events',
      icon: <DashboardIcon sx={{ fontSize: 20 }} />,
      path: '/',
      breadcrumb: 'Events / NSE Incoming Earnings Fixtures & Comprehensive Health Grades',
      description: 'NSE Incoming Earnings Fixtures & Comprehensive Health Grades'
    },
    {
      text: 'Impactful Events',
      icon: <EventNoteIcon sx={{ fontSize: 20 }} />,
      path: '/impactful-events',
      breadcrumb: 'Impactful Events / Dividends, Bonus, Splits, Buybacks, Rights & Demergers',
      description: 'Corporate actions graded against 5 years of NSE evidence'
    },
    {
      text: 'Momentum & Attention',
      icon: <TrendingUpIcon sx={{ fontSize: 20 }} />,
      path: '/momentum',
      breadcrumb: 'Momentum & Attention / Real-Time Cross-Sectional Scanner',
      description: 'Real-time cross-sectional percentile rankings and anomaly attention tracker'
    },
    {
      text: 'Hypothesis Lab (QHLM)',
      icon: <BiotechIcon sx={{ fontSize: 20 }} />,
      path: '/research',
      breadcrumb: 'Hypothesis Lab / Deflated Sharpe & Autonomous AI Factor Discovery',
      description: 'Quantitative Hypothesis Lifecycle Management & Bailey-Lopez de Prado statistical audit'
    },
    {
      text: 'Portfolio Simulation',
      icon: <ShowChartIcon sx={{ fontSize: 20 }} />,
      path: '/portfolio',
      breadcrumb: 'Portfolio Simulation / Cross-Sectional Historical Performance',
      description: 'Vectorized historical P&L engine with survivorship bias protection'
    },
    {
      text: 'Celery Schedules',
      icon: <ScheduleIcon sx={{ fontSize: 20 }} />,
      path: '/schedules',
      breadcrumb: 'Celery Schedules / Beat Timers & Automated Research Workflows',
      description: 'Inspect all scheduled Celery Beat tasks, intervals, and automated execution loops'
    },
    {
      text: 'Admin Logs',
      icon: <ReceiptLongIcon sx={{ fontSize: 20 }} />,
      path: '/admin-logs',
      breadcrumb: 'Admin Logs / System Activity & Execution History',
      description: 'Centralized Admin Logs / Activity Logs page where you can see important system actions'
    },
    {
      text: 'Catalyst Radar',
      icon: <RadarIcon sx={{ fontSize: 20 }} />,
      path: '/catalyst',
      breadcrumb: 'Catalyst Radar / Early-Detection Catalyst Engine',
      description: 'Advanced early-catalyst detection and market-repricing intelligence'
    },
    {
      text: 'Historical Data',
      icon: <StorageIcon sx={{ fontSize: 20 }} />,
      path: '/data-lake',
      breadcrumb: 'Historical Data / Parquet Data Lake View',
      description: 'Search and visualize OHLCV historical time-series data from the Parquet data lake'
    },
    {
      text: 'ETF Matrix',
      icon: <GridViewIcon sx={{ fontSize: 20 }} />,
      path: '/etf-matrix',
      breadcrumb: 'ETF Matrix / Systematic Indian ETF Mean-Reversion Engine',
      description: 'Systematic Indian ETF dip accumulation & 6% profit-booking matrix'
    },
  ];

  const currentItem = menuItems.find(m => m.path === location.pathname) || {
    text: 'VD Enterprise Quant Lab',
    breadcrumb: 'VD / Advanced Quant Analytics',
    description: 'Advanced Institutional Equity Analytics & Machine Learning Platform'
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'transparent' }}>
      {/* Top Fixed Header Bar - exactly 56px height, 12px 24px padding */}
      <AppBar
        position="fixed"
        sx={{
          width: `calc(100% - ${drawerWidth}px)`,
          ml: `${drawerWidth}px`,
          bgcolor: tokens.background.default,
          backgroundImage: 'none',
          borderBottom: `1px solid ${tokens.border.main}`,
          boxShadow: 'none',
          transition: 'width 0.15s ease-in-out, margin-left 0.15s ease-in-out',
          zIndex: 1100
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important', height: 56, px: { xs: '8px !important', md: '24px !important' }, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left: Breadcrumb (phones/tablets: menu button + page title) */}
          <Box sx={{ display: 'flex', alignItems: 'center', overflow: 'hidden', mr: { xs: 1, md: 2 }, gap: '8px', minWidth: 0 }}>
            {isCompact && (
              <IconButton aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}
                sx={{ width: 40, height: 40, color: tokens.text.primary, flexShrink: 0 }}>
                <MenuIcon sx={{ fontSize: 22 }} />
              </IconButton>
            )}
            {(() => {
              const parts = currentItem.breadcrumb.split(' / ');
              const hasParent = parts.length > 1;
              const parentText = hasParent ? parts[0] : '';
              const childText = hasParent ? parts[1] : parts[0];
              if (isCompact) {
                return (
                  <Typography noWrap sx={{ fontFamily: tokens.typography.fontFamily, fontSize: '15px', fontWeight: 700, color: tokens.text.primary, minWidth: 0 }}>
                    {location.pathname.startsWith('/tasks') ? 'Task Manager'
                      : location.pathname.startsWith('/companies/') ? 'Company'
                      : ('text' in currentItem && currentItem.text) || childText}
                  </Typography>
                );
              }
              return (
                <Typography noWrap sx={{ fontFamily: tokens.typography.fontFamily, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {hasParent && (
                    <>
                      <Box component="span" sx={{ color: tokens.text.tertiary, fontWeight: 500 }}>{parentText}</Box>
                      <Box component="span" sx={{ color: tokens.border.main }}>/</Box>
                    </>
                  )}
                  <Box component="span" sx={{ color: tokens.text.primary, fontWeight: 600 }}>{childText}</Box>
                </Typography>
              );
            })()}
          </Box>

          {/* Right: System Live + Theme Toggle + User Chip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '10px', md: '16px' }, flexShrink: 0 }}>
            {!isMobile && <LiveClock />}

            <Tooltip title="Real-time data feeds active">
              <Box
                onClick={() => window.location.reload()}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  '&:hover .live-text': { color: tokens.text.primary },
                  '&:hover .live-dot': { opacity: 0.8 },
                }}
              >
                <FiberManualRecordIcon className="live-dot" sx={{ fontSize: 8, color: tokens.status.success.main, transition: 'opacity 0.15s' }} />
                {!isMobile && (
                  <Typography className="live-text" sx={{ fontSize: '12px', fontWeight: 500, color: tokens.text.secondary, transition: 'color 0.15s' }}>
                    System Live
                  </Typography>
                )}
              </Box>
            </Tooltip>

            {/* Subtle Separator */}
            <Box sx={{ width: '1px', height: '14px', bgcolor: tokens.border.main, display: { xs: 'none', sm: 'block' } }} />

            {/* Theme Toggle Button */}
            <ThemeModeToggle />

            {/* Subtle Separator */}
            <Box sx={{ width: '1px', height: '14px', bgcolor: tokens.border.main }} />

            {/* User Profile */}
            <Box
              role="button"
              tabIndex={0}
              onClick={(e) => setAnchorEl(e.currentTarget)}
              aria-label="Account menu"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                borderRadius: '4px',
                padding: { xs: '8px 4px', md: '2px 4px' },
                transition: 'background-color 0.15s ease-in-out',
                '&:hover': {
                  backgroundColor: tokens.background.cardHover,
                },
              }}
            >
              <Avatar
                sx={{
                  width: 20,
                  height: 20,
                  backgroundColor: 'transparent',
                  border: `1px solid ${tokens.border.main}`,
                  color: tokens.text.secondary,
                  fontSize: '10px',
                  fontWeight: 600,
                }}
              >
                {user?.email?.charAt(0).toUpperCase() || 'A'}
              </Avatar>
              <Typography
                noWrap
                sx={{
                  display: { xs: 'none', md: 'block' },
                  color: tokens.text.secondary,
                  fontSize: '12px',
                  fontWeight: 500,
                  fontFamily: tokens.typography.fontFamily,
                  transition: 'color 0.15s',
                  '.MuiBox-root:hover &': { color: tokens.text.primary }
                }}
              >
                {user?.email || 'admin@qeps.com'}
              </Typography>
              <ExpandMoreIcon sx={{ fontSize: 14, color: tokens.text.tertiary, display: { xs: 'none', md: 'block' } }} />
            </Box>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              PaperProps={{
                sx: {
                  mt: 1,
                  borderRadius: '12px',
                  backgroundColor: tokens.background.paper,
                  border: `1px solid ${tokens.border.main}`,
                  boxShadow: tokens.shadows.dropdown,
                  minWidth: 160,
                },
              }}
            >
              {isCompact && (
                <MenuItem disabled sx={{ fontSize: '12px', py: 1, px: 2, opacity: '1 !important', color: tokens.text.secondary }}>
                  {user?.email || 'admin@qeps.com'}
                </MenuItem>
              )}
              <MenuItem onClick={handleLogout} sx={{ fontSize: '12px', gap: 1.5, py: { xs: 1.5, md: 1 }, px: 2, color: tokens.status.error.main }}>
                <LogoutIcon sx={{ fontSize: 16 }} />
                <span>Sign Out</span>
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Left Navigation Sidebar Rail */}
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          transition: 'width 0.15s ease-in-out',
          '& .MuiDrawer-paper': {
            width: isCompact ? 'min(84vw, 300px)' : drawerWidth,
            transition: 'width 0.15s ease-in-out',
            overflowX: 'hidden',
            boxSizing: 'border-box',
            backgroundColor: tokens.background.paper,
            borderRight: `1px solid ${tokens.border.main}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: 'none',
          },
        }}
        variant={isCompact ? 'temporary' : 'permanent'}
        open={isCompact ? mobileNavOpen : true}
        onClose={() => setMobileNavOpen(false)}
        ModalProps={{ keepMounted: true }}
        anchor="left"
      >
        <Box>
          <Toolbar sx={{ height: 56, minHeight: '56px !important', display: 'flex', alignItems: 'center', justifyContent: navExpanded ? 'space-between' : 'center', px: navExpanded ? '16px' : '4px !important', borderBottom: `1px solid ${tokens.border.main}` }}>
            {navExpanded && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                <Box sx={{ width: 28, height: 28, borderRadius: '8px', backgroundColor: tokens.primary.main, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShowChartIcon sx={{ color: isDark ? '#0A0A0C' : '#FFFFFF', fontSize: 16, fontWeight: 'bold' }} />
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '15px', color: tokens.text.primary }}>
                  VD EPS
                </Typography>
              </Box>
            )}
            <Tooltip title={isCompact ? 'Close menu' : (collapsed ? "Expand Menu" : "Condense Menu")} placement="right">
              <IconButton
                size="small"
                aria-label={isCompact ? 'Close navigation' : 'Toggle navigation width'}
                onClick={() => (isCompact ? setMobileNavOpen(false) : setCollapsed(!collapsed))}
                sx={{
                  color: tokens.text.secondary,
                  backgroundColor: 'transparent',
                  border: `1px solid ${tokens.border.main}`,
                  width: isCompact ? 36 : 28,
                  height: isCompact ? 36 : 28,
                  borderRadius: '8px',
                  '&:hover': { color: tokens.text.primary, borderColor: tokens.border.light, backgroundColor: tokens.background.cardHover }
                }}
              >
                {!navExpanded ? <MenuIcon sx={{ fontSize: 16 }} /> : <MenuOpenIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          </Toolbar>

          <List sx={{ px: navExpanded ? '12px' : '6px', py: '12px' }}>
            {menuItems.map((item) => {
              const selected = location.pathname === item.path;

              return (
                <ListItem key={item.text} disablePadding sx={{ mb: '4px' }}>
                  <Tooltip title={navExpanded ? '' : item.text} placement="right">
                    <ListItemButton
                      selected={selected}
                      onClick={() => goTo(item.path)}
                      sx={{
                        minHeight: isCompact ? 48 : 36,
                        borderRadius: '8px',
                        justifyContent: navExpanded ? 'flex-start' : 'center',
                        px: navExpanded ? 1.5 : 1,
                        py: 0.75,
                        transition: 'all 0.15s ease-in-out',
                        color: selected ? tokens.text.primary : tokens.text.secondary,
                        backgroundColor: selected ? tokens.primary.tint : 'transparent',
                        border: selected ? `1px solid ${tokens.primary.border}` : '1px solid transparent',
                        '&:hover': {
                          backgroundColor: tokens.background.cardHover,
                          color: tokens.text.primary,
                          '& .MuiListItemIcon-root': {
                            color: tokens.accent.main,
                          }
                        },
                        '&.Mui-selected': {
                          backgroundColor: tokens.primary.tint,
                        }
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: 0,
                          mr: navExpanded ? 1.5 : 0,
                          justifyContent: 'center',
                          color: selected ? tokens.accent.main : tokens.text.secondary,
                          transition: 'color 0.15s ease-in-out',
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      {navExpanded && (
                        <ListItemText
                          primary={item.text}
                          primaryTypographyProps={{ fontSize: isCompact ? '14px' : '12px', fontWeight: selected ? 600 : 400 }}
                        />
                      )}
                    </ListItemButton>
                  </Tooltip>
                </ListItem>
              );
            })}
          </List>
        </Box>

        {navExpanded && (
          <Box sx={{ p: '12px', m: '12px', mb: '16px', backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '8px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '4px' }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: tokens.status.success.main }} />
              <Typography sx={{ fontSize: '11px', fontWeight: 600, color: tokens.text.primary }}>
                Quant Engine v3.2
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '10px', color: tokens.text.tertiary, lineHeight: '14px' }}>
              LightGBM + Gemini AI catalyst models active across NSE universe.
            </Typography>
          </Box>
        )}
      </Drawer>

      {/* Main Viewport */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: tokens.background.default,
          p: 0,
          pt: '56px',
          transition: '0.15s ease-in-out',
          width: `calc(100% - ${drawerWidth}px)`,
          minWidth: 0,
          minHeight: '100vh',
          overflowX: 'hidden'
        }}
      >
        <ErrorBoundary key={location.pathname} fallbackTitle="Page Rendering Error">
          <Outlet />
        </ErrorBoundary>
      </Box>
    </Box>
  );
};

export default Layout;
