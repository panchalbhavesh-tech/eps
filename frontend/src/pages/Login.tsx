import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import { useMutation } from '@apollo/client';
import { LOGIN_MUTATION } from '../graphql/operations';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';

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
    <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Paper elevation={3} sx={{ p: 4, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="h4" component="h1" align="center" color="primary" gutterBottom>
          QEPS
        </Typography>
        <Typography variant="body1" align="center" color="text.secondary">
          Quarterly Earnings Prediction System
        </Typography>

        {error && <Alert severity="error">{error.message}</Alert>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <TextField
            label="Email"
            variant="outlined"
            type="email"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="Password"
            variant="outlined"
            type="password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button 
            type="submit" 
            variant="contained" 
            color="primary" 
            size="large" 
            disabled={loading}
            fullWidth
          >
            {loading ? <CircularProgress size={24} /> : 'Login'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
};

export default Login;
