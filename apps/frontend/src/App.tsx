import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import LoginPage from './features/auth/LoginPage';
import LandingPage from './features/landing/LandingPage';
import MaintenancePage from './features/auth/MaintenancePage';
import DepartmentDeactivatedPage from './features/auth/DepartmentDeactivatedPage';
import DashboardPage from './features/dashboard/DashboardPage';
import TimetablePage from './features/timetable/TimetablePage';
import AppShell from './components/layout/AppShell';
import DeanShell from './components/layout/DeanShell';
import ProtectedRoute from './components/auth/ProtectedRoute';
import DepartmentActiveGate from './components/auth/DepartmentActiveGate';
import MaintenanceGate from './components/auth/MaintenanceGate';
import DeanDashboardPage from './features/dean/DeanDashboardPage';
import DeanDepartmentsPage from './features/dean/DeanDepartmentsPage';
import DeanDepartmentsManagePage from './features/dean/DeanDepartmentsManagePage';
import DeanApprovalsPage from './features/dean/DeanApprovalsPage';
import AdminUsersPage from './features/admin/AdminUsersPage';
import SectionsPage from './features/sections/SectionsPage';
import ApprovalsPage from './features/approvals/ApprovalsPage';
import SubjectsPage from './features/subjects/SubjectsPage';
import FacultyPage from './features/faculty/FacultyPage';
import RoomsPage from './features/rooms/RoomsPage';
import ProspectusPage from './features/prospectus/ProspectusPage';
import ProgramsPage from './features/programs/ProgramsPage';
import SystemConfigPage from './features/system-config/SystemConfigPage';
import AuditTrailPage from './features/audit-trail/AuditTrailPage';
import FacultyWorkloadPage from './features/reports/FacultyWorkloadPage';
import ReportsHubPage from './features/reports/ReportsHubPage';
import ApprovalsReportPage from './features/reports/ApprovalsReportPage';
import RoomSufficiencyPage from './features/reports/RoomSufficiencyPage';
import ProspectusPdfListPage from './features/import/ProspectusPdfListPage';
import ProspectusPdfEditorPage from './features/import/ProspectusPdfEditorPage';
import RequireDesktop from './features/import/components/RequireDesktop';
import NotificationsInboxPage from './features/notifications/NotificationsInboxPage';
import SettingsPage from './features/settings/SettingsPage';
import HelpPage from './features/help/HelpPage';
import DevToolsPage from './features/dev-tools/DevToolsPage';
import PresenceProvider from './components/presence/PresenceProvider';
import { useAuthStore } from './store/auth.store';

function DeanRouteGuard() {
  const profile = useAuthStore((s) => s.profile);
  const location = useLocation();

  if (
    profile?.role === 'administrator' &&
    location.pathname !== '/dean/dev-tools'
  ) {
    return <Navigate to="/dean/dev-tools" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <MaintenanceGate>
      {/* Session-scoped Realtime presence + last-seen heartbeat. Sits above
          the router so changing pages never untracks the signed-in user. */}
      <PresenceProvider />
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/maintenance" element={<MaintenancePage />} />

      {/* Wall page — reachable only when a DH is walled. Login, AuthProvider,
          and the wall page's "Refresh status" all key off profile.dept_active. */}
      <Route
        path="/department-deactivated"
        element={
          <ProtectedRoute
            allowedRoles={['department_head']}
            redirectTo="/login"
          />
        }
      >
        <Route index element={<DepartmentDeactivatedPage />} />
      </Route>

      {/* ═══════════════ DEAN (also serves the hidden dev account) ═══════════════ */}
      <Route
        element={
          <ProtectedRoute
            allowedRoles={['administrator', 'college_dean', 'college_secretary']}
            redirectTo="/login"
          />
        }
      >
        <Route element={<DeanRouteGuard />}>
          <Route path="/dean" element={<DeanShell />}>
            <Route index element={<Navigate to="/dean/dashboard" replace />} />
            <Route path="dashboard" element={<DeanDashboardPage />} />
            <Route path="departments" element={<DeanDepartmentsPage />} />
            <Route path="programs" element={<ProgramsPage />} />
            <Route
              path="departments/manage"
              element={<DeanDepartmentsManagePage />}
            />
            <Route path="approvals" element={<DeanApprovalsPage />} />
            <Route path="requests" element={<ApprovalsPage />} />
            <Route path="timetable" element={<TimetablePage readOnly />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="faculty" element={<FacultyPage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="sections" element={<SectionsPage />} />
            <Route path="rooms" element={<RoomsPage />} />
            <Route path="system-settings" element={<SystemConfigPage />} />
            <Route path="audit-trail" element={<AuditTrailPage />} />
            <Route path="dev-tools" element={<DevToolsPage />} />
            <Route path="reports" element={<ReportsHubPage />} />
            <Route path="reports/workload" element={<FacultyWorkloadPage />} />
            <Route path="reports/approvals" element={<ApprovalsReportPage />} />
            <Route path="reports/rooms" element={<RoomSufficiencyPage />} />
            <Route path="import" element={<ProspectusPdfListPage />} />
            <Route
              path="import/:id"
              element={
                <RequireDesktop>
                  <ProspectusPdfEditorPage />
                </RequireDesktop>
              }
            />
            <Route path="notifications" element={<NotificationsInboxPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="help" element={<HelpPage />} />
          </Route>
        </Route>
      </Route>

      {/* ═══════════════ DEPARTMENT HEAD ═══════════════ */}
      <Route
        element={
          <ProtectedRoute
            allowedRoles={['department_head']}
            redirectTo="/login"
          />
        }
      >
        {/*
         * The gate sits BEFORE the AppShell. If the DH's dept is
         * deactivated, it redirects to /department-deactivated before
         * AppShell (or its notification/chat providers) ever mounts.
         * That's the point — no chrome, no polling, no stale fetches.
         */}
        <Route element={<DepartmentActiveGate />}>
          <Route element={<AppShell />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="timetable" element={<TimetablePage />} />
            <Route path="sections" element={<SectionsPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="programs" element={<ProgramsPage />} />
            <Route path="prospectus" element={<ProspectusPage />} />
            <Route path="faculty" element={<FacultyPage />} />
            <Route path="rooms" element={<RoomsPage />} />
            <Route path="reports" element={<ReportsHubPage />} />
            <Route path="reports/workload" element={<FacultyWorkloadPage />} />
            <Route path="reports/approvals" element={<ApprovalsReportPage />} />
            <Route path="reports/rooms" element={<RoomSufficiencyPage />} />
            <Route path="import" element={<ProspectusPdfListPage />} />
            <Route
              path="import/:id"
              element={
                <RequireDesktop>
                  <ProspectusPdfEditorPage />
                </RequireDesktop>
              }
            />
            <Route path="notifications" element={<NotificationsInboxPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="help" element={<HelpPage />} />
          </Route>
        </Route>
      </Route>

      {/* Legacy /admin/* — redirect anything that hits it */}
      <Route
        path="/admin/*"
        element={<Navigate to="/dean/dashboard" replace />}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MaintenanceGate>
  );
}

export default App;