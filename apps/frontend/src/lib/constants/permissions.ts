import { ROLES } from './roles';

export const PERMISSIONS = {
  MANAGE_USERS: 'manage_users',
  MANAGE_DEPARTMENTS: 'manage_departments',
  MANAGE_SUBJECTS: 'manage_subjects',
  MANAGE_PROSPECTUS: 'manage_prospectus',
  MANAGE_SECTIONS: 'manage_sections',
  MANAGE_ROOMS: 'manage_rooms',
  MANAGE_FACULTY: 'manage_faculty',
  CONFIGURE_SYSTEM: 'configure_system',
  IMPORT_MINOR_SCHEDULES: 'import_minor_schedules',
  PLOT_SUBJECT: 'plot_subject',
  EDIT_SCHEDULE: 'edit_schedule',
  FINALIZE_SCHEDULE: 'finalize_schedule',
  PUBLISH_SCHEDULE: 'publish_schedule',
  VIEW_DEPT_SCHEDULE: 'view_dept_schedule',
  VIEW_COLLEGE_SCHEDULE: 'view_college_schedule',
  OVERRIDE_CROSS_DEPT_CONFLICT: 'override_cross_dept_conflict',
  GENERATE_REPORTS: 'generate_reports',
  VIEW_AUDIT_TRAIL: 'view_audit_trail',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Keys are the runtime role strings (Supabase user_role enum).
 *
 * After the Admin→Dean consolidation, the Dean inherits every admin
 * permission. The `administrator` role gets the same permission set
 * as the Dean (dev account parity) — but it never sees its own
 * portal; it's routed into the Dean portal by ROLE_HOME.
 *
 * `viewer` has no permissions.
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [ROLES.ADMIN]: [
    // Dev account parity with Dean — everything
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_DEPARTMENTS,
    PERMISSIONS.MANAGE_SUBJECTS,
    PERMISSIONS.MANAGE_PROSPECTUS,
    PERMISSIONS.MANAGE_SECTIONS,
    PERMISSIONS.MANAGE_ROOMS,
    PERMISSIONS.MANAGE_FACULTY,
    PERMISSIONS.CONFIGURE_SYSTEM,
    PERMISSIONS.IMPORT_MINOR_SCHEDULES,
    PERMISSIONS.PLOT_SUBJECT,
    PERMISSIONS.EDIT_SCHEDULE,
    PERMISSIONS.FINALIZE_SCHEDULE,
    PERMISSIONS.PUBLISH_SCHEDULE,
    PERMISSIONS.VIEW_DEPT_SCHEDULE,
    PERMISSIONS.VIEW_COLLEGE_SCHEDULE,
    PERMISSIONS.OVERRIDE_CROSS_DEPT_CONFLICT,
    PERMISSIONS.GENERATE_REPORTS,
    PERMISSIONS.VIEW_AUDIT_TRAIL,
  ],
  [ROLES.DEAN]: [
    // Dean inherits the full admin capability set
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_DEPARTMENTS,
    PERMISSIONS.MANAGE_SUBJECTS,
    PERMISSIONS.MANAGE_PROSPECTUS,
    PERMISSIONS.MANAGE_SECTIONS,
    PERMISSIONS.MANAGE_ROOMS,
    PERMISSIONS.MANAGE_FACULTY,
    PERMISSIONS.CONFIGURE_SYSTEM,
    PERMISSIONS.IMPORT_MINOR_SCHEDULES,
    PERMISSIONS.PLOT_SUBJECT,
    PERMISSIONS.EDIT_SCHEDULE,
    PERMISSIONS.FINALIZE_SCHEDULE,
    PERMISSIONS.PUBLISH_SCHEDULE,
    PERMISSIONS.VIEW_DEPT_SCHEDULE,
    PERMISSIONS.VIEW_COLLEGE_SCHEDULE,
    PERMISSIONS.OVERRIDE_CROSS_DEPT_CONFLICT,
    PERMISSIONS.GENERATE_REPORTS,
    PERMISSIONS.VIEW_AUDIT_TRAIL,
  ],
  [ROLES.DEPT_HEAD]: [
    PERMISSIONS.PLOT_SUBJECT,
    PERMISSIONS.EDIT_SCHEDULE,
    PERMISSIONS.FINALIZE_SCHEDULE,
    PERMISSIONS.PUBLISH_SCHEDULE,
    PERMISSIONS.VIEW_DEPT_SCHEDULE,
    PERMISSIONS.MANAGE_SUBJECTS,
    PERMISSIONS.MANAGE_PROSPECTUS,
    PERMISSIONS.MANAGE_SECTIONS,
    PERMISSIONS.MANAGE_ROOMS,
    PERMISSIONS.MANAGE_FACULTY,
    PERMISSIONS.IMPORT_MINOR_SCHEDULES,
    PERMISSIONS.GENERATE_REPORTS,
  ],
  // `viewer` intentionally absent — no permissions
};

export function hasPermission(
  role: string | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}