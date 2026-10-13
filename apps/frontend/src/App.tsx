import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './features/auth/LoginPage';
import DashboardPage from './features/dashboard/DashboardPage';
import TimetablePage from './features/timetable/TimetablePage';
import AppShell from './components/layout/AppShell';
import DeanShell from './components/layout/DeanShell';
import ProtectedRoute from './components/auth/ProtectedRoute';
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

/**
 * Route tree.
 *
 * After the Admin→Dean consolidation:
 *   - The `/admin/*` route group is gone entirely.
 *   - The `/dean/*` route group absorbs every route that used to live
 *     under `/admin/*` plus its existing Dean routes.
 *   - The `administrator` role is routed into `/dean/*` via ROLE_HOME
 *     and ProtectedRoute fallback logic.
 *   - The Department Head portal at `/*` is unchanged.
 *
 * Help is mounted separately inside each shell, so the same component
 * renders with the correct role-aware shell:
 *   - DH:   /help
 *   - Dean: /dean/help
 */
function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* ═══════════════ DEAN (also serves the hidden dev account) ═══════════════ */}
      <Route
        element={
          <ProtectedRoute
            allowedRoles={['administrator', 'college_dean']}
            redirectTo="/login"
          />
        }
      >
        <Route path="/dean" element={<DeanShell />}>
          <Route index element={<Navigate to="/dean/dashboard" replace />} />

          {/* Dean-specific */}
          <Route path="dashboard" element={<DeanDashboardPage />} />
          <Route path="departments" element={<DeanDepartmentsPage />} />
          <Route
            path="departments/manage"
            element={<DeanDepartmentsManagePage />}
          />
          <Route path="approvals" element={<DeanApprovalsPage />} />
          <Route path="timetable" element={<TimetablePage readOnly />} />

          {/* Absorbed from the old Admin portal */}
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="faculty" element={<FacultyPage />} />
          <Route path="system-settings" element={<SystemConfigPage />} />
          <Route path="audit-trail" element={<AuditTrailPage />} />

          {/* Reports */}
          <Route path="reports" element={<ReportsHubPage />} />
          <Route path="reports/workload" element={<FacultyWorkloadPage />} />
          <Route path="reports/approvals" element={<ApprovalsReportPage />} />
          <Route path="reports/rooms" element={<RoomSufficiencyPage />} />

          {/* Prospectus PDF import */}
          <Route path="import" element={<ProspectusPdfListPage />} />
          <Route
            path="import/:id"
            element={
              <RequireDesktop>
                <ProspectusPdfEditorPage />
              </RequireDesktop>
            }
          />

          {/* Notifications + settings */}
          <Route path="notifications" element={<NotificationsInboxPage />} />
          <Route path="settings" element={<SettingsPage />} />

          {/* Help */}
          <Route path="help" element={<HelpPage />} />
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
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="timetable" element={<TimetablePage />} />
          <Route path="sections" element={<SectionsPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="subjects" element={<SubjectsPage />} />
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

          {/* Help */}
          <Route path="help" element={<HelpPage />} />
        </Route>
      </Route>

      {/* Legacy /admin/* — redirect anything that hits it */}
      <Route path="/admin/*" element={<Navigate to="/dean/dashboard" replace />} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;