/**
 * Centralized route definitions.
 * App.tsx uses inline routes for now.
 * This file exists for future use if we migrate to a data router (createBrowserRouter).
 */

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  TIMETABLE: '/timetable',
  FACULTY: '/faculty',
  ROOMS: '/rooms',
  SUBJECTS: '/subjects',
  PROSPECTUS: '/prospectus',
  SECTIONS: '/sections',
  APPROVALS: '/approvals',
  REPORTS: '/reports',
  COLLEGE_WIDE: '/college-wide',
  MINOR_IMPORT: '/minor-import',
  SYSTEM_CONFIG: '/system-config',
  AUDIT_TRAIL: '/audit-trail',
  USERS: '/users',
  VACANT_SLOTS: '/vacant-slots',
  CREATE_DEPARTMENT: '/admin/create-department',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = typeof ROUTES[RouteKey];