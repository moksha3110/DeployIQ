import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';
import { DeploymentAnalytics } from './pages/DeploymentAnalytics';
import { DeploymentDetail } from './pages/DeploymentDetail';
import { Login } from './pages/Login';
import { RepoDetail } from './pages/RepoDetail';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/repos/:id"
        element={
          <ProtectedRoute>
            <RepoDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deployments/:id"
        element={
          <ProtectedRoute>
            <DeploymentDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deployments/:id/analytics"
        element={
          <ProtectedRoute>
            <DeploymentAnalytics />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
