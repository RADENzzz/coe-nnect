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

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* ═══════════════ ADMIN ═══════════════ */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['administrator']} redirectTo="/login" />
        }
      >
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="departments" element={<AdminDepartmentsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="system-settings" element={<SystemConfigPage />} />
          <Route path="audit-trail" element={<AuditTrailPage />} />
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
        </Route>
      </Route>

      {/* ═══════════════ DEAN ═══════════════ */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['college_dean']} redirectTo="/login" />
        }
      >
        <Route path="/dean" element={<DeanShell />}>
          <Route index element={<Navigate to="/dean/dashboard" replace />} />
          <Route path="dashboard" element={<DeanDashboardPage />} />
          <Route path="departments" element={<DeanDepartmentsPage />} />
          <Route path="approvals" element={<DeanApprovalsPage />} />
          <Route path="reports" element={<ReportsHubPage />} />
          <Route path="reports/workload" element={<FacultyWorkloadPage />} />
          <Route path="reports/approvals" element={<ApprovalsReportPage />} />
          <Route path="timetable" element={<TimetablePage readOnly />} />
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
        </Route>
      </Route>

      {/* ═══════════════ DEPARTMENT HEAD ═══════════════ */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['department_head']} redirectTo="/login" />
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
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;