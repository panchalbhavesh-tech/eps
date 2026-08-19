import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Paper, CircularProgress, Alert, InputAdornment, IconButton } from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { useMutation } from '@apollo/client';
import { LOGIN_MUTATION } from '../graphql/operations';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useThemeMode } from '../theme/ThemeContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const { tokens, mode } = useThemeMode();
  const isDark = mode === 'dark';

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

  const handleClickShowPassword = () => setShowPassword((show) => !show);

  // Common input styles matching institutional theme
  const inputStyles = {
    '& .MuiOutlinedInput-root': {
      backgroundColor: tokens.background.default,
      color: tokens.text.primary,
      fontSize: '14px',
      fontWeight: 500,
      transition: 'all 0.2s ease-in-out',
      '& fieldset': {
        borderColor: tokens.border.main,
        borderWidth: '1px',
        transition: 'border-color 0.2s',
      },
      '&:hover fieldset': {
        borderColor: tokens.border.main,
      },
      '&.Mui-focused fieldset': {
        borderColor: tokens.accent.main,
        borderWidth: '1px',
      },
      '& input': {
        padding: '12px 14px',
        color: tokens.text.primary,
        '&::placeholder': {
          color: tokens.text.tertiary,
          opacity: 1,
        }
      }
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(circle at 50% 0%, ${tokens.background.cardHover}, ${tokens.background.default} 60%)`,
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
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 3.5,
          bgcolor: tokens.background.card,
          border: `1px solid ${tokens.border.light}`,
          borderRadius: 3,
          boxShadow: isDark ? '0 12px 40px -10px rgba(0, 0, 0, 0.5)' : '0 10px 30px -5px rgba(15, 23, 42, 0.08)',
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
              bgcolor: tokens.background.cardHover,
              border: `1px solid ${tokens.border.light}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 1
            }}
          >
            <ShowChartIcon sx={{ color: tokens.accent.main, fontSize: 26 }} />
          </Box>

          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, color: tokens.text.primary, letterSpacing: '-0.02em', fontSize: '1.4rem' }}>
            VD Quant Lab
          </Typography>

          <Typography variant="body2" sx={{ color: tokens.text.secondary, fontSize: '0.85rem', maxWidth: '320px', lineHeight: 1.5, fontWeight: 400 }}>
            Enterprise Quantitative Earnings Prediction & Institutional AI Market Analytics
          </Typography>
        </Box>

        {error && (
          <Alert
            severity="error"
            sx={{
              bgcolor: tokens.status.error.wash,
              color: tokens.status.error.main,
              border: `1px solid ${tokens.status.error.border || tokens.status.error.main}`,
              borderRadius: 2,
              fontSize: '0.85rem',
              '& .MuiAlert-icon': {
                color: tokens.status.error.main
              }
            }}
          >
            {error.message || 'Authentication failed. Please verify credentials.'}
          </Alert>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.text.secondary, mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
              sx={inputStyles}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ ml: 0.5 }}>
                    <EmailOutlinedIcon sx={{ color: tokens.text.tertiary, fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.text.secondary, mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Security Token / Password
            </Typography>
            <TextField
              variant="outlined"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••••••"
              sx={inputStyles}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ ml: 0.5 }}>
                    <LockOutlinedIcon sx={{ color: tokens.text.tertiary, fontSize: 18 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={handleClickShowPassword}
                      edge="end"
                      sx={{ color: tokens.text.tertiary, '&:hover': { color: tokens.text.primary } }}
                    >
                      {showPassword ? <VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
          </Box>

          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            fullWidth
            sx={{
              height: 48,
              fontSize: '0.9rem',
              fontWeight: 600,
              mt: 1,
              bgcolor: tokens.primary.main,
              color: '#000000', // Ensure contrast on primary button
              textTransform: 'none',
              borderRadius: '4px',
              border: `1px solid ${tokens.primary.border || tokens.primary.main}`,
              boxShadow: 'none',
              '&:hover': {
                bgcolor: tokens.primary.dark,
                boxShadow: 'none',
              },
              '&.Mui-disabled': {
                bgcolor: tokens.primary.tint,
                color: tokens.text.tertiary,
              }
            }}
          >
            {loading ? <CircularProgress size={24} sx={{ color: '#000000' }} /> : 'Initialize Institutional Session →'}
          </Button>
        </form>

        <Box sx={{ pt: 2.5, mt: 1, borderTop: `1px solid ${tokens.border.light}`, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.72rem', color: tokens.text.muted || tokens.text.tertiary, fontWeight: 500 }}>
            Protected by VD EPS Zero-Trust Authentication.
            <br />
            Powered by Docker & Celery Workers.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default Login;
