export const ROLES = {
  ADMIN: 'ADMIN',
  DEPT_HEAD: 'DEPT_HEAD',
  DEAN: 'DEAN',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  DEPT_HEAD: 'Department Head',
  DEAN: 'College Dean',
};