import type { UserRole } from '../../store/auth.store';

/**
 * Runtime role values. Kept in sync with the Postgres `user_role` enum.
 *
 * User-facing roles (post Admin→Dean consolidation):
 *   - DEAN       (top role — inherits all admin powers)
 *   - DEPT_HEAD  (scoped to one department)
 *
 * Internal roles (never shown in the UI):
 *   - ADMIN      (hidden dev account, seed-only)
 *   - VIEWER     (legacy, no active users)
 *
 * The `viewer` value is intentionally retained in the type for enum
 * sync. Do NOT add it to any nav config or picker.
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

/**
 * Which shell to mount for each role.
 *
 * After the Admin→Dean consolidation:
 *   - `administrator` routes into the Dean portal (dev account still
 *     needs to be able to log in and see the app).
 *   - `viewer` has no shell; it should never reach the app.
 */
export const ROLE_HOME: Record<Role, string> = {
  administrator: '/dean/dashboard',
  college_dean: '/dean/dashboard',
  department_head: '/dashboard',
  viewer: '/login',
};

/**
 * Roles that can be assigned via the Users UI. Excludes the hidden
 * dev-only `administrator` and the legacy `viewer`.
 */
export const ASSIGNABLE_ROLES = ['college_dean', 'department_head'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];