import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Paper, CircularProgress, Alert, InputAdornment } from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useMutation } from '@apollo/client';
import { LOGIN_MUTATION } from '../graphql/operations';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import { saasTokens } from '../theme/theme';

const Login: React.FC = () => {
  const [email, setEmail] = useState('admin@qeps.com');
  const [password, setPassword] = useState('adminpassword');
  const { login } = useAuth();
  const navigate = useNavigate();

  const [loginMutation, { loading, error }] = useMutation(LOGIN_MUTATION, {
    onCompleted: (data) => {
      login(data.login.accessToken);
      navigate('/');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation({ variables: { email, password } });
  };

  return (
    <Box 
      sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: 'transparent', // Uses ambient body gradient
        position: 'relative',
        overflow: 'hidden',
        px: 2,
      }}
    >
      <Paper 
        elevation={0} 
        sx={{ 
          p: { xs: 4, md: 5 }, 
          width: '100%', 
          maxWidth: 440, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 3.5,
          bgcolor: '#ffffff',
          border: `1px solid ${saasTokens.border.main}`,
          borderRadius: 4,
          boxShadow: '0 10px 30px -5px rgba(15, 23, 42, 0.08)',
          zIndex: 1,
          position: 'relative',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
          <Box 
            sx={{ 
              width: 52, 
              height: 52, 
              borderRadius: 3, 
              bgcolor: '#0f172a', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
              mb: 1
            }}
          >
            <ShowChartIcon sx={{ color: '#ffffff', fontSize: 28 }} />
          </Box>
          
          <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: saasTokens.text.primary, letterSpacing: '-0.02em' }}>
            QEPS Quant Lab
          </Typography>
          
          <Typography variant="body2" sx={{ color: saasTokens.text.secondary, fontSize: '0.9rem', maxWidth: '320px', lineHeight: 1.5 }}>
            Enterprise Quantitative Earnings Prediction & Institutional AI Market Analytics
          </Typography>
        </Box>

        {error && (
          <Alert 
            severity="error" 
            sx={{ 
              bgcolor: '#fff1f2', 
              color: '#e11d48', 
              border: '1px solid #fda4af',
              borderRadius: 2,
              fontSize: '0.85rem',
            }}
          >
            {error.message || 'Authentication failed. Please verify credentials.'}
          </Alert>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Box>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: saasTokens.text.secondary, mb: 0.8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Analyst Email
            </Typography>
            <TextField
              variant="outlined"
              type="email"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="name@qeps.com"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailOutlinedIcon sx={{ color: saasTokens.text.secondary, fontSize: 20 }} />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: saasTokens.text.secondary, mb: 0.8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Security Token / Password
            </Typography>
            <TextField
              variant="outlined"
              type="password"
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••••••"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon sx={{ color: saasTokens.text.secondary, fontSize: 20 }} />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Button 
            type="submit" 
            variant="contained" 
            color="primary" 
            size="large" 
            disabled={loading}
            fullWidth
            sx={{ 
              height: 46, 
              fontSize: '0.95rem', 
              fontWeight: 600,
              mt: 1,
              bgcolor: '#0f172a',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)',
              '&:hover': {
                bgcolor: '#1e293b',
              }
            }}
          >
            {loading ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : 'Initialize Institutional Session →'}
          </Button>
        </form>

        <Box sx={{ pt: 2, borderTop: `1px solid ${saasTokens.border.main}`, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.72rem', color: saasTokens.text.secondary, opacity: 0.8 }}>
            Protected by QEPS Zero-Trust Authentication. Powered by Docker & Celery Workers.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default Login;
