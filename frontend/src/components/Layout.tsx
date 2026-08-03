import React, { useState } from 'react';
import { Box, Drawer, AppBar, Toolbar, List, Typography, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton, Tooltip, Avatar, Menu, MenuItem } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ManageHistoryIcon from '@mui/icons-material/ManageHistory';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import MenuIcon from '@mui/icons-material/Menu';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BiotechIcon from '@mui/icons-material/Biotech';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useThemeMode } from '../theme/ThemeContext';
import { ErrorBoundary, ThemeModeToggle } from './common';

const Layout: React.FC = () => {
  const { logout, user } = useAuth();
  const { mode, tokens } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [hoverLive, setHoverLive] = useState(false);

  const isDark = mode === 'dark';
  const drawerWidth = collapsed ? 56 : 240;

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
      text: 'Processes & Tasks', 
      icon: <ManageHistoryIcon sx={{ fontSize: 20 }} />, 
      path: '/tasks',
      breadcrumb: 'Processes & Tasks / Background Celery Workers',
      description: 'Background Celery Workers & Automated AI Analysis Queue' 
    },
  ];

  const currentItem = menuItems.find(m => m.path === location.pathname) || {
    text: 'QEPS Enterprise Quant Lab',
    breadcrumb: 'QEPS / Advanced Quant Analytics',
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
          bgcolor: tokens.background.header, 
          backdropFilter: 'blur(12px)',
          backgroundImage: 'none', 
          borderBottom: `1px solid ${tokens.border.main}`,
          boxShadow: tokens.shadows.card,
          transition: 'width 0.15s ease-in-out, margin-left 0.15s ease-in-out', 
          zIndex: 1100 
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important', height: 56, px: '24px !important', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left: Breadcrumb */}
          <Box sx={{ display: 'flex', alignItems: 'center', overflow: 'hidden', mr: 2 }}>
            <Typography
              noWrap
              sx={{
                fontFamily: tokens.typography.fontFamily,
                fontSize: '12px',
                fontWeight: 500,
                color: tokens.text.secondary,
                letterSpacing: '0.25px',
              }}
            >
              {currentItem.breadcrumb}
            </Typography>
          </Box>

          {/* Right: System Live + Theme Toggle + User Chip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
            {/* System Live Pill */}
            <Tooltip title="Real-time data feeds active">
              <Box
                onMouseEnter={() => setHoverLive(true)}
                onMouseLeave={() => setHoverLive(false)}
                onClick={() => window.location.reload()}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '28px',
                  padding: '4px 12px',
                  borderRadius: '16px',
                  backgroundColor: tokens.status.success.pillBg,
                  color: tokens.status.success.main,
                  border: `1px solid ${tokens.status.success.border}`,
                  fontSize: '11px',
                  fontWeight: 500,
                  fontFamily: tokens.typography.fontFamily,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                {hoverLive ? (
                  <RefreshIcon sx={{ fontSize: 13, color: tokens.status.success.main, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <FiberManualRecordIcon sx={{ fontSize: 6, color: tokens.status.success.main }} />
                )}
                <span>System Live</span>
              </Box>
            </Tooltip>

            {/* Theme Toggle Button */}
            <ThemeModeToggle />

            {/* User Chip */}
            <Box
              role="button"
              tabIndex={0}
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 8px',
                borderRadius: '12px',
                backgroundColor: tokens.background.card,
                border: `1px solid ${tokens.border.main}`,
                cursor: 'pointer',
                transition: 'border-color 0.15s ease-in-out, background-color 0.15s ease-in-out',
                '&:hover': {
                  backgroundColor: tokens.background.cardHover,
                  borderColor: tokens.border.light,
                },
              }}
            >
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  backgroundColor: tokens.primary.main,
                  color: isDark ? '#0A0A0C' : '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {user?.email?.charAt(0).toUpperCase() || 'A'}
              </Avatar>
              <Typography
                noWrap
                sx={{
                  color: tokens.text.primary,
                  fontSize: '12px',
                  fontWeight: 500,
                  display: { xs: 'none', md: 'block' },
                  maxWidth: '130px',
                }}
              >
                {user?.email || 'Analyst Session'}
              </Typography>
              <ExpandMoreIcon sx={{ fontSize: 16, color: tokens.text.secondary }} />
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
              <MenuItem onClick={handleLogout} sx={{ fontSize: '12px', gap: 1.5, py: 1, px: 2, color: tokens.status.error.main }}>
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
            width: drawerWidth,
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
        variant="permanent"
        anchor="left"
      >
        <Box>
          <Toolbar sx={{ height: 56, minHeight: '56px !important', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', px: collapsed ? '4px !important' : '16px', borderBottom: `1px solid ${tokens.border.main}` }}>
            {!collapsed && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                <Box sx={{ width: 28, height: 28, borderRadius: '8px', backgroundColor: tokens.primary.main, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShowChartIcon sx={{ color: isDark ? '#0A0A0C' : '#FFFFFF', fontSize: 16, fontWeight: 'bold' }} />
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '15px', color: tokens.text.primary }}>
                  QEPS
                </Typography>
              </Box>
            )}
            <Tooltip title={collapsed ? "Expand Menu" : "Condense Menu"} placement="right">
              <IconButton 
                size="small"
                onClick={() => setCollapsed(!collapsed)} 
                sx={{ 
                  color: tokens.text.secondary, 
                  backgroundColor: 'transparent',
                  border: `1px solid ${tokens.border.main}`,
                  width: 28,
                  height: 28,
                  borderRadius: '8px',
                  '&:hover': { color: tokens.text.primary, borderColor: tokens.border.light, backgroundColor: tokens.background.cardHover } 
                }}
              >
                {collapsed ? <MenuIcon sx={{ fontSize: 16 }} /> : <MenuOpenIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          </Toolbar>

          <List sx={{ px: collapsed ? '6px' : '12px', py: '12px' }}>
            {menuItems.map((item) => {
              const selected = location.pathname === item.path;

              return (
                <ListItem key={item.text} disablePadding sx={{ mb: '4px' }}>
                  <Tooltip title={collapsed ? item.text : ''} placement="right">
                    <ListItemButton 
                      selected={selected}
                      onClick={() => navigate(item.path)}
                      sx={{
                        minHeight: 36,
                        borderRadius: '8px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        px: collapsed ? 1 : 1.5,
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
                          mr: collapsed ? 0 : 1.5, 
                          justifyContent: 'center', 
                          color: selected ? tokens.accent.main : tokens.text.secondary,
                          transition: 'color 0.15s ease-in-out',
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      {!collapsed && (
                        <ListItemText 
                          primary={item.text} 
                          primaryTypographyProps={{ fontSize: '12px', fontWeight: selected ? 600 : 400 }} 
                        />
                      )}
                    </ListItemButton>
                  </Tooltip>
                </ListItem>
              );
            })}
          </List>
        </Box>

        {!collapsed && (
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
          minHeight: '100vh',
          overflowX: 'hidden' 
        }}
      >
        <ErrorBoundary fallbackTitle="Page Rendering Error">
          <Outlet />
        </ErrorBoundary>
      </Box>
    </Box>
  );
};

export default Layout;
