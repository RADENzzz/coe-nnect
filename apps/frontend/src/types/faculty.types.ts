export type FacultyClassification = 'full_time' | 'visiting_lecturer' | 'part_time';
export type SyncStatus = 'synced' | 'stale' | 'failed';

export interface Faculty {
  id: string;
  wmsuId: string;
  employeeId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  contact?: string;
  deptId: string;
  designationId?: string;
  classification: FacultyClassification;
  requiredHours: number;
  assignedHours: number;
  syncStatus: SyncStatus;
  lastSyncedAt: string;
  isActive: boolean;
}