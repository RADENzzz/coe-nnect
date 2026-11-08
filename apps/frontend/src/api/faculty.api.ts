import { api } from './client';

export type FacultyClass =
  | 'regular'
  | 'part_time'
  | 'visiting_lecturer'
  | 'other';

export interface FacultyRecord {
  facultyId: string;
  wmsuId: string | null;
  employeeId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  contact: string | null;
  deptId: string | null;
  designationId: string | null;
  classification: FacultyClass;
  requiredHours: number | null;
  isActive: boolean;
  syncStatus?: 'pending' | 'synced' | 'failed';
  lastSyncedAt?: string | null;
}

export interface CreateFacultyInput {
  firstName: string;
  lastName: string;
  email?: string;
  contact?: string;
  wmsuId?: string;
  employeeId?: string;
  deptId?: string;
  designationId?: string;
  classification: FacultyClass;
  requiredHours?: number;
}

// ────────────────────────────────────────────────────────────
// FR 3.1.3 — Status summary (bulk, for the Faculty page chips)
// ────────────────────────────────────────────────────────────

export interface FacultyStatusSummaryRow {
  facultyId: string;
  qualificationCount: number;
  hasQualifications: boolean;
  preferenceCount: number;
  hasPreferences: boolean;
  unavailabilityCount: number;
  hasUnavailability: boolean;
}

export async function fetchFacultyStatusSummary(
  deptId?: string,
): Promise<FacultyStatusSummaryRow[]> {
  const params = deptId ? { deptId } : {};
  const { data } = await api.get('/v1/faculty/status-summary', { params });
  return data.data;
}

export async function fetchFaculty(
  includeInactive: boolean = false,
): Promise<FacultyRecord[]> {
  const params = includeInactive === true ? { includeInactive: 'true' } : {};
  const { data } = await api.get('/v1/faculty', { params });
  return data.data;
}

export async function createFaculty(
  input: CreateFacultyInput,
): Promise<FacultyRecord> {
  const { data } = await api.post('/v1/faculty', input);
  return data.data;
}

export async function updateFaculty(
  id: string,
  input: Partial<CreateFacultyInput>,
): Promise<FacultyRecord> {
  const { data } = await api.patch(`/v1/faculty/${id}`, input);
  return data.data;
}

export async function toggleFacultyActive(id: string): Promise<FacultyRecord> {
  const { data } = await api.patch(`/v1/faculty/${id}/toggle-active`);
  return data.data;
}

export async function deleteFaculty(id: string): Promise<void> {
  await api.delete(`/v1/faculty/${id}`);
}

// ────────────────────────────────────────────────────────────
// FR 3.1.11 — Refresh from IDP (Milestone 1)
// ────────────────────────────────────────────────────────────

export interface IdpSyncError {
  code: string;
  message: string;
  wmsu_id?: string | null;
  employee_id?: string | null;
  subject_code?: string | null;
  external_id?: string | null;
}

export interface IdpSyncSummary {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  qualificationsAdded: number;
  unavailabilitySynced: number;
  errors: IdpSyncError[];
  startedAt: string;
  finishedAt: string;
}

export interface IdpSyncInput {
  departmentCode?: string;
  termCode?: string;
  includeQualifications?: boolean;
  includeUnavailability?: boolean;
}

/**
 * Pull the faculty roster (and optionally qualifications/unavailability)
 * from IDP. Department heads are scoped to their own department server-side.
 */
export async function syncFacultyFromIdp(
  input: IdpSyncInput = {},
): Promise<IdpSyncSummary> {
  const { data } = await api.post('/v1/idp/faculty/sync', input);
  return data.data;
}