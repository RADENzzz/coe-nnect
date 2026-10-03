import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './features/auth/LoginPage';
import DashboardPage from './features/dashboard/DashboardPage';
import TimetablePage from './features/timetable/TimetablePage';
import AppShell from './components/layout/AppShell';
import AdminShell from './components/layout/AdminShell';
import AdminDashboardPage from './features/admin/AdminDashboardPage';
import AdminDepartmentsPage from './features/admin/AdminDepartmentsPage';
import AdminUsersPage from './features/admin/AdminUsersPage';
import DeanDashboardPage from './features/dean/DeanDashboardPage';
import DeanDepartmentsPage from './features/dean/DeanDepartmentsPage';
import DeanApprovalsPage from './features/dean/DeanApprovalsPage';
import DeanShell from './components/layout/DeanShell';
import ProtectedRoute from './components/auth/ProtectedRoute';

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Admin-only portal */}
      <Route
        element={
          <ProtectedRoute
            allowedRoles={['administrator']}
            redirectTo="/login"
          />
        }
      >
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="departments" element={<AdminDepartmentsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
        </Route>
      </Route>

      {/* Dean portal */}
      <Route
        element={
          <ProtectedRoute
            allowedRoles={['college_dean']}
            redirectTo="/login"
          />
        }
      >
        <Route path="/dean" element={<DeanShell />}>
          <Route index element={<Navigate to="/dean/dashboard" replace />} />
          <Route path="dashboard" element={<DeanDashboardPage />} />
          <Route path="departments" element={<DeanDepartmentsPage />} />
          <Route path="approvals" element={<DeanApprovalsPage />} />
        </Route>
      </Route>

      {/* Department heads */}
      <Route
        element={
          <ProtectedRoute
            allowedRoles={['department_head']}
            redirectTo="/login"
          />
        }
      >
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="timetable" element={<TimetablePage />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;