import type { UserRecord, UserRole } from '../../../api/users.api';

export type { UserRecord, UserRole };

/** Structural types — decouple the UI from the exact API module shape. */
export interface DeptLite {
  deptId: string | number;
  deptCode: string;
  deptName: string;
  isActive: boolean;
}

export interface FacultyLite {
  facultyId: string | number;
  firstName: string;
  lastName: string;
  email?: string | null;
  deptId?: string | number | null;
  isActive: boolean;
}