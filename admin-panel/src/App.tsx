import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { ToastContainer } from './components/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Users from './pages/Users';
import Permissions from './pages/Permissions';
import AuditLogs from './pages/AuditLogs';
import Files from './pages/Files';
import System from './pages/System';
import Layout from './components/Layout';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="devices" element={<Devices />} />
          <Route path="users" element={<Users />} />
          <Route path="permissions" element={<Permissions />} />
          <Route path="files" element={<Files />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="system" element={<System />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
