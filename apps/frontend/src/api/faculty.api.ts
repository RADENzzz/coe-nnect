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