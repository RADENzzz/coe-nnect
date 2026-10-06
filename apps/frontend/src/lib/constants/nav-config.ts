import { ROUTES } from '../../router';
import { ROLES, type Role } from './roles';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  /** Shown in the mobile bottom tab bar (max 4 per role). */
  primary?: boolean;
}

export interface RoleNav {
  /** Brand subtitle under "CoE-NNECT". */
  brandSubtitle: string;
  /** Small label in the top bar (desktop only on some shells). */
  topBarLabel: string;
  /** Main nav in the sidebar / drawer. */
  main: NavItem[];
  /** Footer nav in the sidebar / drawer. */
  footer: NavItem[];
  /** Items shown in the mobile bottom tab bar. Max 4. */
  bottom: NavItem[];
}

const DH_NAV: RoleNav = {
  brandSubtitle: 'Department Portal',
  topBarLabel: 'Department Head',
  main: [
    { label: 'Dashboard',        path: ROUTES.DASHBOARD,  icon: 'dashboard' },
    { label: 'Schedule Planner', path: ROUTES.TIMETABLE,  icon: 'calendar_view_month', primary: true },
    { label: 'Faculty Directory',path: ROUTES.FACULTY,    icon: 'groups',              primary: true },
    { label: 'Approvals', path: ROUTES.APPROVALS, icon: 'report_problem', primary: true },
    { label: 'Rooms',            path: ROUTES.ROOMS,      icon: 'meeting_room' },
    { label: 'Subjects',         path: ROUTES.SUBJECTS,   icon: 'menu_book' },
    { label: 'Prospectus',       path: ROUTES.PROSPECTUS, icon: 'library_books' },
    { label: 'Sections',         path: ROUTES.SECTIONS,   icon: 'view_module' },
    { label: 'Reports',          path: ROUTES.REPORTS,    icon: 'bar_chart' },
  ],
  footer: [
    { label: 'Archive', path: ROUTES.AUDIT_TRAIL, icon: 'archive' },
    { label: 'Help',    path: '/help',            icon: 'help_outline' },
  ],
  bottom: [
    { label: 'Dashboard', path: ROUTES.DASHBOARD,  icon: 'dashboard',            primary: true },
    { label: 'Planner',   path: ROUTES.TIMETABLE,  icon: 'calendar_view_month',  primary: true },
    { label: 'Faculty',   path: ROUTES.FACULTY,    icon: 'groups',               primary: true },
    { label: 'Approvals', path: ROUTES.APPROVALS, icon: 'report_problem', primary: true },
  ],
};

const ADMIN_NAV: RoleNav = {
  brandSubtitle: 'Admin Portal',
  topBarLabel: 'System Administrator',
  main: [
    { label: 'Dashboard',        path: '/admin/dashboard',        icon: 'dashboard',          primary: true },
    { label: 'Departments',      path: '/admin/departments',      icon: 'domain',             primary: true },
    { label: 'Users',            path: '/admin/users',            icon: 'manage_accounts',    primary: true },
    { label: 'System Settings',  path: '/admin/system-settings',  icon: 'settings' },
    { label: 'Audit Trail',      path: '/admin/audit-trail',      icon: 'history',            primary: true },
  ],
  footer: [
    { label: 'Help', path: '/help', icon: 'help_outline' },
  ],
  bottom: [
    { label: 'Dashboard',   path: '/admin/dashboard',      icon: 'dashboard',       primary: true },
    { label: 'Departments', path: '/admin/departments',    icon: 'domain',          primary: true },
    { label: 'Users',       path: '/admin/users',          icon: 'manage_accounts', primary: true },
    { label: 'Audit',       path: '/admin/audit-trail',    icon: 'history',         primary: true },
  ],
};

const DEAN_NAV: RoleNav = {
  brandSubtitle: 'Dean Portal',
  topBarLabel: 'College Dean',
  main: [
    { label: 'Dashboard',           path: '/dean/dashboard',   icon: 'dashboard',        primary: true },
    { label: 'Departments',         path: '/dean/departments', icon: 'corporate_fare',   primary: true },
    { label: 'Schedule Approvals',  path: '/dean/approvals',   icon: 'pending_actions',  primary: true },
  ],
  footer: [
    { label: 'Help', path: '/help', icon: 'help_outline' },
  ],
  bottom: [
    { label: 'Dashboard',   path: '/dean/dashboard',   icon: 'dashboard',       primary: true },
    { label: 'Departments', path: '/dean/departments', icon: 'corporate_fare',  primary: true },
    { label: 'Approvals',   path: '/dean/approvals',   icon: 'pending_actions', primary: true },
  ],
};

const VIEWER_NAV: RoleNav = {
  brandSubtitle: 'Viewer',
  topBarLabel: 'Viewer',
  main: [
    { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: 'dashboard' },
  ],
  footer: [],
  bottom: [
    { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: 'dashboard', primary: true },
  ],
};

export const NAV_BY_ROLE: Record<Role, RoleNav> = {
  [ROLES.ADMIN]:     ADMIN_NAV,
  [ROLES.DEAN]:      DEAN_NAV,
  [ROLES.DEPT_HEAD]: DH_NAV,
  [ROLES.VIEWER]:    VIEWER_NAV,
};

export function getNavForRole(role: Role | undefined): RoleNav {
  if (!role) return VIEWER_NAV;
  return NAV_BY_ROLE[role] ?? VIEWER_NAV;
}