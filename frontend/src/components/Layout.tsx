import React, { useState } from 'react';
import { Box, Drawer, AppBar, Toolbar, List, Typography, Divider, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton, Tooltip } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import ManageHistoryIcon from '@mui/icons-material/ManageHistory';
import LogoutIcon from '@mui/icons-material/Logout';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

const Layout: React.FC = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);

  const drawerWidth = collapsed ? 72 : 190;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { text: 'Home', icon: <DashboardIcon />, path: '/' },
    { text: 'Processes', icon: <ManageHistoryIcon />, path: '/tasks' },
  ];

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ width: `calc(100% - ${drawerWidth}px)`, ml: `${drawerWidth}px`, bgcolor: 'background.paper', backgroundImage: 'none', transition: 'width 0.2s, margin-left 0.2s' }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, color: 'text.primary' }}>
            {menuItems.find(m => m.path === location.pathname)?.text || 'QEPS'}
          </Typography>
          <Typography variant="body2" sx={{ mr: 2, color: 'text.secondary' }}>
            {user?.email}
          </Typography>
          <IconButton color="primary" onClick={handleLogout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          transition: 'width 0.2s',
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            transition: 'width 0.2s',
            overflowX: 'hidden',
            boxSizing: 'border-box',
            bgcolor: 'background.default',
            borderRight: '1px solid rgba(255, 255, 255, 0.12)'
          },
        }}
        variant="permanent"
        anchor="left"
      >
        <Toolbar sx={{ display: 'flex', justifyContent: collapsed ? 'center' : 'space-between', px: collapsed ? '8px !important' : '16px' }}>
          {!collapsed && <Typography variant="h5" color="primary" sx={{ fontWeight: 'bold' }}>QEPS</Typography>}
          <Tooltip title={collapsed ? "Expand Menu" : "Condense Menu"}>
            <IconButton onClick={() => setCollapsed(!collapsed)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
        <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.12)' }} />
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <Tooltip title={collapsed ? item.text : ''} placement="right">
                <ListItemButton 
                  selected={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  sx={{
                    minHeight: 48,
                    justifyContent: collapsed ? 'center' : 'initial',
                    px: 2.5,
                    '&.Mui-selected': {
                      bgcolor: 'rgba(124, 77, 255, 0.15)',
                      borderRight: '3px solid #7c4dff',
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: collapsed ? 0 : 2, justifyContent: 'center', color: location.pathname === item.path ? 'primary.main' : 'text.secondary' }}>
                    {item.icon}
                  </ListItemIcon>
                  {!collapsed && <ListItemText primary={item.text} />}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', p: 3, pt: 10, transition: '0.2s', width: `calc(100% - ${drawerWidth}px)` }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
