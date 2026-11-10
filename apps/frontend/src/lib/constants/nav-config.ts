import { ROUTES } from '../../router';
import { ROLES, type Role } from './roles';

/**
 * Notification categories emitted by the backend. Mirrors
 * `CATEGORIES` in `apps/backend/src/modules/notifications/dto/list-notifications.dto.ts`.
 */
export type AttentionCategory =
  | 'schedule'
  | 'approvals'
  | 'scheduling'
  | 'academic'
  | 'faculty'
  | 'facility'
  | 'admin';

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
  /** Rail heading. Items sharing a group render together, in config order. */
  group?: string;
  /**
   * Compact label for the collapsed rail and the "Jump back" shortcuts.
   * Defaults to `label`.
   */
  shortLabel?: string;
  /**
   * Which unread notification categories make this page "needs attention".
   *
   * `'all'` claims the whole unread count — only the notifications inbox
   * uses it. A category belongs to the FIRST nav item that lists it, so a
   * duplicated listing can never double-count.
   */
  attention?: AttentionCategory[] | 'all';
}

export interface RoleNav {
  brandSubtitle: string;
  topBarLabel: string;
  main: NavItem[];
  footer: NavItem[];
  bottom: NavItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const UNGROUPED = 'More';

/**
 * Bucket nav items by `group`, preserving config order. Items without a
 * group collect under "More" at the end.
 */
export function groupNav(items: NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  const index = new Map<string, NavGroup>();

  for (const item of items) {
    const key = item.group ?? UNGROUPED;
    let group = index.get(key);
    if (!group) {
      group = { label: key, items: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  // An ungrouped item must never split a labelled section in two, and
  // "More" always sits last.
  const ungrouped = index.get(UNGROUPED);
  if (ungrouped) {
    return [...groups.filter((g) => g !== ungrouped), ungrouped];
  }
  return groups;
}

/** The path of the notifications inbox for a given nav. */
export function notificationsPath(nav: RoleNav): string | null {
  return (
    nav.footer.find((item) => item.path.endsWith('/notifications'))?.path ??
    null
  );
}

/**
 * Department Head navigation.
 */
const DH_NAV: RoleNav = {
  brandSubtitle: 'Department Portal',
  topBarLabel: 'Department Head',
  main: [
    { label: 'Dashboard',         path: ROUTES.DASHBOARD,      icon: 'dashboard',          group: 'Overview' },

    { label: 'Schedule Planner',  path: ROUTES.TIMETABLE,      icon: 'calendar_view_month', group: 'Planning', primary: true, attention: ['schedule', 'scheduling'] },
    { label: 'Approvals',         path: ROUTES.APPROVALS,      icon: 'report_problem',      group: 'Planning', primary: true, attention: ['approvals'] },

    { label: 'Faculty Directory', path: ROUTES.FACULTY,        icon: 'groups',              group: 'Records', primary: true, attention: ['faculty'] },
    { label: 'Subjects',          path: ROUTES.SUBJECTS,       icon: 'menu_book',           group: 'Records' },
    { label: 'Sections',          path: ROUTES.SECTIONS,       icon: 'view_module',         group: 'Records' },
    { label: 'Programs',          path: ROUTES.PROGRAMS,       icon: 'school',              group: 'Records' },
    { label: 'Prospectus',        path: ROUTES.PROSPECTUS,     icon: 'library_books',       group: 'Records' },

    { label: 'Rooms',             path: ROUTES.ROOMS,          icon: 'meeting_room',        group: 'Setup', attention: ['facility'] },
    { label: 'Import Prospectus', path: ROUTES.IMPORT,         icon: 'upload_file',         group: 'Setup', attention: ['academic'] },

    { label: 'Reports',           path: ROUTES.REPORTS_HUB,    icon: 'bar_chart',           group: 'Insights' },
  ],
  footer: [
    { label: 'Notifications', shortLabel: 'Inbox', path: '/notifications', icon: 'inbox', attention: 'all' },
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
    { label: 'Dashboard',          path: '/dean/dashboard',       icon: 'dashboard',         group: 'Overview', primary: true },

    // ── Organization ──
    { label: 'Departments',        path: '/dean/departments',     icon: 'corporate_fare',    group: 'Organization', primary: true },
    { label: 'Programs',           path: '/dean/programs',        icon: 'school',            group: 'Organization', primary: true },
    { label: 'Users',              path: '/dean/users',           icon: 'manage_accounts',   group: 'Organization', primary: true, attention: ['admin'] },
    { label: 'Faculty',            path: '/dean/faculty',         icon: 'groups',            group: 'Organization', primary: true, attention: ['faculty'] },

    // ── Work ──
    { label: 'Schedule Approvals', path: '/dean/approvals',       icon: 'pending_actions',   group: 'Planning', primary: true, attention: ['schedule', 'scheduling'] },
    { label: 'Faculty Requests',   path: '/dean/requests',        icon: 'swap_horiz',        group: 'Planning', primary: true, attention: ['approvals'] },
    { label: 'Timetable',          path: '/dean/timetable',       icon: 'calendar_view_month', group: 'Planning' },

    // ── Academics ──
    { label: 'Import Prospectus',  path: '/dean/import',          icon: 'upload_file',       group: 'Academics', attention: ['academic'] },
    { label: 'Reports',            path: '/dean/reports',         icon: 'bar_chart',         group: 'Academics' },

    // ── Configuration + Governance ──
    { label: 'System Settings',    path: '/dean/system-settings', icon: 'settings',          group: 'Governance' },
    { label: 'Audit Trail',        path: '/dean/audit-trail',     icon: 'history',           group: 'Governance' },
  ],
  footer: [
    { label: 'Notifications', shortLabel: 'Inbox', path: '/dean/notifications', icon: 'inbox', attention: 'all' },
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
 * College Secretary navigation.
 *
 * The secretary is college-wide: every operational page the Dean has,
 * minus approvals, audit trail, reports and dev tools.
 */
const SECRETARY_NAV: RoleNav = {
  brandSubtitle: 'College Secretary',
  topBarLabel: 'College Secretary',
  main: [
    { label: 'Dashboard',         path: '/dean/dashboard',       icon: 'dashboard',        group: 'Overview', primary: true },

    { label: 'Departments',       path: '/dean/departments',     icon: 'corporate_fare',   group: 'Organization', primary: true },
    { label: 'Programs',          path: '/dean/programs',        icon: 'school',           group: 'Organization' },
    { label: 'Subjects',          path: '/dean/subjects',        icon: 'menu_book',        group: 'Organization' },
    { label: 'Sections',          path: '/dean/sections',        icon: 'view_module',      group: 'Organization' },
    { label: 'Rooms',             path: '/dean/rooms',           icon: 'meeting_room',     group: 'Organization', attention: ['facility'] },
    { label: 'Faculty',           path: '/dean/faculty',         icon: 'groups',           group: 'Organization', primary: true, attention: ['faculty'] },
    { label: 'Users',             path: '/dean/users',           icon: 'manage_accounts',  group: 'Organization', primary: true, attention: ['admin'] },

    { label: 'Import Prospectus', path: '/dean/import',          icon: 'upload_file',      group: 'Academics', attention: ['academic'] },

    { label: 'System Settings',   path: '/dean/system-settings', icon: 'settings',         group: 'Governance' },
  ],
  footer: [
    { label: 'Notifications', shortLabel: 'Inbox', path: '/dean/notifications', icon: 'inbox', attention: 'all' },
    { label: 'Help', path: '/dean/help', icon: 'help_outline' },
  ],
  bottom: [
    { label: 'Dashboard',   path: '/dean/dashboard',   icon: 'dashboard',        primary: true },
    { label: 'Departments', path: '/dean/departments', icon: 'corporate_fare',   primary: true },
    { label: 'Users',       path: '/dean/users',       icon: 'manage_accounts',  primary: true },
    { label: 'Faculty',     path: '/dean/faculty',     icon: 'groups',           primary: true },
  ],
};

/**
 * Developer navigation.
 *
 * Used ONLY by the hidden `administrator` role (dev-admin@wmsu.edu.ph).
 * Intentionally minimal — the dev account is a maintenance account,
 * not a user persona. It must not see Dean or DH pages.
 *
 * The dev account also skips the notification surface entirely, so it
 * claims no attention categories.
 */
const DEV_NAV: RoleNav = {
  brandSubtitle: 'Developer',
  topBarLabel: 'Developer Tools',
  main: [
    {
      label: 'Dev Tools',
      path: '/dean/dev-tools',
      icon: 'terminal',
      group: 'Overview',
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
  [ROLES.SECRETARY]: SECRETARY_NAV,
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
