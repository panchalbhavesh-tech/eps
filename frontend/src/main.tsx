import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApolloProvider } from '@apollo/client'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { client } from './graphql/client'
import theme from './theme/theme'
import { AuthProvider } from './store/AuthContext'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </ApolloProvider>
  </StrictMode>,
)
