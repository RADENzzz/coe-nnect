import type { UserRole } from '../../store/auth.store';

/**
 * Runtime role values. These MUST match the Supabase `user_role` enum
 * (see handoff §3): administrator, college_dean, department_head, viewer.
 *
 * Previously these were 'ADMIN' / 'DEPT_HEAD' / 'DEAN', which did not
 * match the runtime profile.role value, so ROLE_PERMISSIONS lookups
 * returned undefined. This file is the single source of truth now.
 */
export const ROLES = {
  ADMIN: 'administrator',
  DEAN: 'college_dean',
  DEPT_HEAD: 'department_head',
  VIEWER: 'viewer',
} as const satisfies Record<string, UserRole>;

export type Role = UserRole;

export const ROLE_LABELS: Record<Role, string> = {
  administrator: 'Administrator',
  college_dean: 'College Dean',
  department_head: 'Department Head',
  viewer: 'Viewer',
};

/** Which shell to mount for each role. */
export const ROLE_HOME: Record<Role, string> = {
  administrator: '/admin/dashboard',
  college_dean: '/dean/dashboard',
  department_head: '/dashboard',
  viewer: '/dashboard',
};