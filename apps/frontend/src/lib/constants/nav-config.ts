import { ROUTES } from '../../router';
import { ROLES, type Role } from './roles';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  primary?: boolean;
}

export interface RoleNav {
  brandSubtitle: string;
  topBarLabel: string;
  main: NavItem[];
  footer: NavItem[];
  bottom: NavItem[];
}

/**
 * Department Head navigation.
 */
const DH_NAV: RoleNav = {
  brandSubtitle: 'Department Portal',
  topBarLabel: 'Department Head',
  main: [
    { label: 'Dashboard',         path: ROUTES.DASHBOARD,      icon: 'dashboard' },
    { label: 'Schedule Planner',  path: ROUTES.TIMETABLE,      icon: 'calendar_view_month', primary: true },
    { label: 'Faculty Directory', path: ROUTES.FACULTY,        icon: 'groups',              primary: true },
    { label: 'Approvals',         path: ROUTES.APPROVALS,      icon: 'report_problem',      primary: true },
    { label: 'Rooms',             path: ROUTES.ROOMS,          icon: 'meeting_room' },
    { label: 'Subjects',          path: ROUTES.SUBJECTS,       icon: 'menu_book' },
    { label: 'Prospectus',        path: ROUTES.PROSPECTUS,     icon: 'library_books' },
    { label: 'Import Prospectus', path: ROUTES.IMPORT,         icon: 'upload_file' },
    { label: 'Sections',          path: ROUTES.SECTIONS,       icon: 'view_module' },
    { label: 'Reports',           path: ROUTES.REPORTS_HUB,    icon: 'bar_chart' },
  ],
  footer: [
    { label: 'Help', path: ROUTES.HELP, icon: 'help_outline' },
  ],
  bottom: [
    { label: 'Dashboard', path: ROUTES.DASHBOARD,  icon: 'dashboard',            primary: true },
    { label: 'Planner',   path: ROUTES.TIMETABLE,  icon: 'calendar_view_month',  primary: true },
    { label: 'Faculty',   path: ROUTES.FACULTY,    icon: 'groups',               primary: true },
    { label: 'Approvals', path: ROUTES.APPROVALS,  icon: 'report_problem',       primary: true },
  ],
};

/**
 * Dean navigation.
 *
 * Mirrors every route registered under `/dean/*` in App.tsx.
 * Missing entries here mean a route exists but is unreachable from
 * the sidebar — that was the Audit Trail bug.
 */
const DEAN_NAV: RoleNav = {
  brandSubtitle: 'Dean Portal',
  topBarLabel: 'College Dean',
  main: [
    // ── Overview ──
    { label: 'Dashboard',          path: '/dean/dashboard',       icon: 'dashboard',         primary: true },

    // ── Organization ──
    { label: 'Departments',        path: '/dean/departments',     icon: 'corporate_fare',    primary: true },
    { label: 'Users',              path: '/dean/users',           icon: 'manage_accounts',   primary: true },
    { label: 'Faculty',            path: '/dean/faculty',         icon: 'groups',            primary: true },

    // ── Work ──
    { label: 'Schedule Approvals', path: '/dean/approvals',       icon: 'pending_actions',   primary: true },
    { label: 'Timetable',          path: '/dean/timetable',       icon: 'calendar_view_month' },
    { label: 'Import Prospectus',  path: '/dean/import',          icon: 'upload_file' },
    { label: 'Reports',            path: '/dean/reports',         icon: 'bar_chart' },

    // ── Configuration + Governance ──
    { label: 'System Settings',    path: '/dean/system-settings', icon: 'settings' },
    { label: 'Audit Trail',        path: '/dean/audit-trail',     icon: 'history' },
  ],
  footer: [
    { label: 'Help',          path: '/dean/help',          icon: 'help_outline' },
  ],
  bottom: [
    { label: 'Dashboard',   path: '/dean/dashboard',      icon: 'dashboard',           primary: true },
    { label: 'Departments', path: '/dean/departments',    icon: 'corporate_fare',      primary: true },
    { label: 'Users',       path: '/dean/users',          icon: 'manage_accounts',     primary: true },
    { label: 'Approvals',   path: '/dean/approvals',      icon: 'pending_actions',     primary: true },
  ],
};

export const NAV_BY_ROLE: Record<Role, RoleNav> = {
  [ROLES.ADMIN]:     DEAN_NAV,
  [ROLES.DEAN]:      DEAN_NAV,
  [ROLES.DEPT_HEAD]: DH_NAV,
  [ROLES.VIEWER]:    DH_NAV,
};

export function getNavForRole(role: Role | undefined): RoleNav {
  if (!role) return DH_NAV;
  return NAV_BY_ROLE[role] ?? DH_NAV;
}