import { ROUTES } from '../../router';
import { ROLES, type Role } from './roles';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  primary?: boolean;
  /**
   * If set, this item is only rendered when the current user's role
   * matches. Kept for future role-gated entries; currently unused
   * because the administrator role has its own DEV_NAV.
   */
  requiresRole?: Role;
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
    { label: 'Programs',          path: ROUTES.PROGRAMS,       icon: 'school' },
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
 * Mirrors every route registered under `/dean/*` in App.tsx, EXCEPT
 * the developer-only route. The Dean does not see Dev Tools.
 */
const DEAN_NAV: RoleNav = {
  brandSubtitle: 'Dean Portal',
  topBarLabel: 'College Dean',
  main: [
    // ── Overview ──
    { label: 'Dashboard',          path: '/dean/dashboard',       icon: 'dashboard',         primary: true },

    // ── Organization ──
    { label: 'Departments',        path: '/dean/departments',     icon: 'corporate_fare',    primary: true },
    { label: 'Programs',           path: '/dean/programs',        icon: 'school',            primary: true },
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

/**
 * Developer navigation.
 *
 * Used ONLY by the hidden `administrator` role (dev-admin@wmsu.edu.ph).
 * Intentionally minimal — the dev account is a maintenance account,
 * not a user persona. It must not see Dean or DH pages.
 */
const DEV_NAV: RoleNav = {
  brandSubtitle: 'Developer',
  topBarLabel: 'Developer Tools',
  main: [
    {
      label: 'Dev Tools',
      path: '/dean/dev-tools',
      icon: 'terminal',
      primary: true,
    },
  ],
  footer: [],
  bottom: [
    {
      label: 'Dev Tools',
      path: '/dean/dev-tools',
      icon: 'terminal',
      primary: true,
    },
  ],
};

export const NAV_BY_ROLE: Record<Role, RoleNav> = {
  [ROLES.ADMIN]:     DEV_NAV,     // ← was DEAN_NAV
  [ROLES.DEAN]:      DEAN_NAV,
  [ROLES.DEPT_HEAD]: DH_NAV,
  [ROLES.VIEWER]:    DH_NAV,
};

export function getNavForRole(role: Role | undefined): RoleNav {
  if (!role) return DH_NAV;
  return NAV_BY_ROLE[role] ?? DH_NAV;
}

/**
 * Filter a nav list to items whose `requiresRole` either isn't set
 * or matches the current user's role.
 *
 * Kept for future role-gated entries. Currently a no-op for all
 * navs because DEV_NAV/DEAN_NAV/DH_NAV have no requiresRole items.
 */
export function filterNavByRole(
  items: NavItem[],
  role: Role | undefined,
): NavItem[] {
  return items.filter((item) => !item.requiresRole || item.requiresRole === role);
}