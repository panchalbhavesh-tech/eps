import React, { useState } from 'react';
import { Box, Drawer, AppBar, Toolbar, List, Typography, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton, Tooltip, Avatar } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ManageHistoryIcon from '@mui/icons-material/ManageHistory';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import MenuIcon from '@mui/icons-material/Menu';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { saasTokens } from '../theme/theme';

const Layout: React.FC = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const drawerWidth = collapsed ? 76 : 240;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { 
      text: 'Dashboard & Analytics', 
      icon: <DashboardIcon />, 
      path: '/',
      description: 'NSE Incoming Earnings Fixtures & Comprehensive Health Grades' 
    },
    { 
      text: 'Momentum & Attention', 
      icon: <TrendingUpIcon />, 
      path: '/momentum',
      description: 'Real-time cross-sectional percentile rankings and anomaly attention tracker' 
    },
    { 
      text: 'Processes & Tasks', 
      icon: <ManageHistoryIcon />, 
      path: '/tasks',
      description: 'Live monitoring of asynchronous Celery background workers & quant pipelines' 
    },
  ];

  const currentItem = menuItems.find(m => m.path === location.pathname) || {
    text: 'QEPS Enterprise Quant Lab',
    description: 'Advanced Institutional Equity Analytics & Machine Learning Platform'
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'transparent' }}>
      {/* Top Floating Header */}
      <AppBar 
        position="fixed" 
        sx={{ 
          width: `calc(100% - ${drawerWidth}px)`, 
          ml: `${drawerWidth}px`, 
          bgcolor: 'rgba(255, 255, 255, 0.9)', 
          backdropFilter: 'blur(12px)',
          backgroundImage: 'none', 
          borderBottom: `1px solid ${saasTokens.border.main}`,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
          transition: 'width 0.2s ease, margin-left 0.2s ease', 
          zIndex: 1100 
        }}
      >
        <Toolbar sx={{ height: 68, px: { xs: 2, md: 4 } }}>
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Typography variant="h6" noWrap component="div" sx={{ fontSize: '1.1rem', fontWeight: 700, color: saasTokens.text.primary, letterSpacing: '-0.01em' }}>
              {currentItem.text}
            </Typography>
            <Typography variant="caption" noWrap sx={{ color: saasTokens.text.secondary, fontSize: '0.78rem', display: { xs: 'none', md: 'block' } }}>
              {currentItem.description}
            </Typography>
          </Box>

          {/* System Status Indicator Pill */}
          <Tooltip title="Real-time workers and GraphQL engine connected with active polling">
            <Box 
              sx={{ 
                display: { xs: 'none', lg: 'flex' }, 
                alignItems: 'center', 
                gap: 0.75, 
                px: 1.5, 
                py: 0.5, 
                mr: 3,
                borderRadius: '20px', 
                bgcolor: '#ecfdf5', 
                border: '1px solid #6ee7b7',
                color: '#059669',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              <FiberManualRecordIcon sx={{ fontSize: 10, color: '#10b981' }} />
              <span>System Live</span>
            </Box>
          </Tooltip>

          {/* User Profile & Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 0.5, pr: 1.5, borderRadius: 3, bgcolor: '#f8fafc', border: `1px solid ${saasTokens.border.main}` }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: '#0f172a', color: '#ffffff', fontSize: '0.85rem', fontWeight: 700 }}>
              {user?.email?.charAt(0).toUpperCase() || 'Q'}
            </Avatar>
            <Typography variant="body2" sx={{ color: saasTokens.text.primary, fontSize: '0.82rem', fontWeight: 600, display: { xs: 'none', sm: 'block' } }}>
              {user?.email || 'Analyst Session'}
            </Typography>
            <Tooltip title="Sign Out">
              <IconButton 
                size="small"
                onClick={handleLogout}
                sx={{ 
                  color: saasTokens.text.secondary, 
                  ml: 0.5,
                  '&:hover': { color: '#e11d48', bgcolor: '#fff1f2' } 
                }}
              >
                <LogoutIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Executive Sidebar Rail */}
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          transition: 'width 0.2s ease',
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            transition: 'width 0.2s ease',
            overflowX: 'hidden',
            boxSizing: 'border-box',
            bgcolor: '#ffffff',
            borderRight: `1px solid ${saasTokens.border.main}`,
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
          <Toolbar sx={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', px: collapsed ? '12px !important' : '20px', borderBottom: `1px solid ${saasTokens.border.main}` }}>
            {!collapsed && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(15, 23, 42, 0.15)' }}>
                  <ShowChartIcon sx={{ color: '#ffffff', fontSize: 20 }} />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em', color: saasTokens.text.primary }}>
                    QEPS
                  </Typography>
                </Box>
              </Box>
            )}
            <Tooltip title={collapsed ? "Expand Menu" : "Condense Menu"} placement="right">
              <IconButton 
                onClick={() => setCollapsed(!collapsed)} 
                sx={{ 
                  color: saasTokens.text.secondary, 
                  bgcolor: '#f8fafc', 
                  border: `1px solid ${saasTokens.border.main}`,
                  width: 32,
                  height: 32,
                  '&:hover': { color: saasTokens.text.primary, bgcolor: '#f1f5f9' } 
                }}
              >
                {collapsed ? <MenuIcon sx={{ fontSize: 18 }} /> : <MenuOpenIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          </Toolbar>

          <Typography 
            sx={{ 
              px: collapsed ? 0 : 2.5, 
              py: 1.5, 
              pb: 0.5,
              fontSize: '0.68rem', 
              fontWeight: 700, 
              color: saasTokens.text.secondary, 
              textTransform: 'uppercase', 
              letterSpacing: '0.08em',
              textAlign: collapsed ? 'center' : 'left',
              opacity: 0.7
            }}
          >
            {collapsed ? '—' : 'Menu & Models'}
          </Typography>

          <List sx={{ px: 1.5 }}>
            {menuItems.map((item) => {
              const selected = location.pathname === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                  <Tooltip title={collapsed ? item.text : ''} placement="right">
                    <ListItemButton 
                      selected={selected}
                      onClick={() => navigate(item.path)}
                      sx={{
                        minHeight: 40,
                        borderRadius: 2,
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        px: 1.5,
                        py: 1,
                        transition: 'all 0.15s ease',
                        position: 'relative',
                        color: selected ? '#0f172a' : saasTokens.text.secondary,
                        bgcolor: selected ? '#f1f5f9' : 'transparent',
                        '&:hover': {
                          bgcolor: selected ? '#e2e8f0' : '#f8fafc',
                          color: '#0f172a',
                          '& .MuiListItemIcon-root': {
                            color: '#0f172a',
                          }
                        },
                        '&.Mui-selected': {
                          bgcolor: '#f1f5f9',
                          fontWeight: 600,
                        }
                      }}
                    >
                      <ListItemIcon 
                        sx={{ 
                          minWidth: 0, 
                          mr: collapsed ? 0 : 1.75, 
                          justifyContent: 'center', 
                          color: selected ? '#0f172a' : saasTokens.text.secondary,
                          transition: 'color 0.15s ease',
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      {!collapsed && (
                        <ListItemText 
                          primary={item.text} 
                          primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: selected ? 600 : 500 }} 
                        />
                      )}
                    </ListItemButton>
                  </Tooltip>
                </ListItem>
              );
            })}
          </List>
        </Box>

        {/* Footer info block */}
        {!collapsed && (
          <Box sx={{ p: 2, m: 1.5, mb: 2, bgcolor: '#f8fafc', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#10b981' }} />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: saasTokens.text.primary }}>
                Quant Engine v3.1
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.72rem', color: saasTokens.text.secondary, lineHeight: 1.4 }}>
              LightGBM + Gemini AI catalyst models active across NSE universe.
            </Typography>
          </Box>
        )}
      </Drawer>

      {/* Main Content Area over Ambient Gradient Canvas */}
      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1, 
          bgcolor: 'transparent', 
          p: location.pathname === '/' ? 0 : { xs: 2.5, md: 4 }, 
          pt: location.pathname === '/' ? '68px' : '100px', 
          transition: '0.2s ease', 
          width: `calc(100% - ${drawerWidth}px)`, 
          minHeight: '100vh',
          overflowX: 'hidden' 
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
