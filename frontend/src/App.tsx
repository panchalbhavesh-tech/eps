import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import CompanyDetail from './pages/CompanyDetail'
import TaskManager from './pages/TaskManager'
import MomentumTracker from './pages/MomentumTracker'
import HypothesisLaboratory from './pages/HypothesisLaboratory'
import Schedules from './pages/Schedules'

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Home />} />
          <Route path="momentum" element={<MomentumTracker />} />
          <Route path="companies/:id" element={<CompanyDetail />} />
          <Route path="tasks" element={<TaskManager />} />
          <Route path="schedules" element={<Schedules />} />
          <Route path="research" element={<HypothesisLaboratory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
