import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import LandingPage from './features/landing/LandingPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import DepartmentActiveGate from './components/auth/DepartmentActiveGate';
import MaintenanceGate from './components/auth/MaintenanceGate';
import RequireDesktop from './features/import/components/RequireDesktop';
import PresenceProvider from './components/presence/PresenceProvider';
import { useAuthStore } from './store/auth.store';

// The public landing page is the entry point, so it stays in the initial
// bundle. Authenticated pages and their shells are split into chunks and
// fetched on first visit instead of shipping one multi-megabyte bundle.
const AppShell = lazy(() => import('./components/layout/AppShell'));
const DeanShell = lazy(() => import('./components/layout/DeanShell'));
const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const MaintenancePage = lazy(() => import('./features/auth/MaintenancePage'));
const DepartmentDeactivatedPage = lazy(
  () => import('./features/auth/DepartmentDeactivatedPage'),
);
const RecoveryVerifyPage = lazy(
  () => import('./features/auth/RecoveryVerifyPage'),
);
const ResetPasswordPage = lazy(
  () => import('./features/auth/ResetPasswordPage'),
);
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const TimetablePage = lazy(() => import('./features/timetable/TimetablePage'));
const DeanDashboardPage = lazy(
  () => import('./features/dean/DeanDashboardPage'),
);
const DeanDepartmentsPage = lazy(
  () => import('./features/dean/DeanDepartmentsPage'),
);
const DeanDepartmentsManagePage = lazy(
  () => import('./features/dean/DeanDepartmentsManagePage'),
);
const DeanApprovalsPage = lazy(
  () => import('./features/dean/DeanApprovalsPage'),
);
const IdpChangeRequestsPage = lazy(
  () => import('./features/idp/IdpChangeRequestsPage'),
);
const AdminUsersPage = lazy(() => import('./features/admin/AdminUsersPage'));
const SectionsPage = lazy(() => import('./features/sections/SectionsPage'));
const ApprovalsPage = lazy(() => import('./features/approvals/ApprovalsPage'));
const SubjectsPage = lazy(() => import('./features/subjects/SubjectsPage'));
const FacultyPage = lazy(() => import('./features/faculty/FacultyPage'));
const RoomsPage = lazy(() => import('./features/rooms/RoomsPage'));
const ProspectusPage = lazy(() => import('./features/prospectus/ProspectusPage'));
const ProgramsPage = lazy(() => import('./features/programs/ProgramsPage'));
const SystemConfigPage = lazy(
  () => import('./features/system-config/SystemConfigPage'),
);
const AuditTrailPage = lazy(
  () => import('./features/audit-trail/AuditTrailPage'),
);
const FacultyWorkloadPage = lazy(
  () => import('./features/reports/FacultyWorkloadPage'),
);
const ReportsHubPage = lazy(() => import('./features/reports/ReportsHubPage'));
const ApprovalsReportPage = lazy(
  () => import('./features/reports/ApprovalsReportPage'),
);
const RoomSufficiencyPage = lazy(
  () => import('./features/reports/RoomSufficiencyPage'),
);
const ProspectusPdfListPage = lazy(
  () => import('./features/import/ProspectusPdfListPage'),
);
const ProspectusPdfEditorPage = lazy(
  () => import('./features/import/ProspectusPdfEditorPage'),
);
const NotificationsInboxPage = lazy(
  () => import('./features/notifications/NotificationsInboxPage'),
);
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));
const HelpPage = lazy(() => import('./features/help/HelpPage'));
const DevToolsPage = lazy(() => import('./features/dev-tools/DevToolsPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-on-background">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
          aria-hidden="true"
        />
        Loading…
      </div>
    </div>
  );
}

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
      <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="/recovery/verify" element={<RecoveryVerifyPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

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
            <Route path="idp/change-requests" element={<IdpChangeRequestsPage />} />
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
      </Suspense>
    </MaintenanceGate>
  );
}

export default App;