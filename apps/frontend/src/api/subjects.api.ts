import { api } from './client';

export interface SubjectRecord {
  subjectId: string;
  subjectCode: string;
  title: string;
  totalUnits: number;
  lectureUnits: number;
  labUnits: number;
  deptId: string;
  requiredRoomType: string | null;
  isActive: boolean;
}

export interface CreateSubjectInput {
  subjectCode: string;
  title: string;
  totalUnits: number;
  lectureUnits: number;
  labUnits: number;
  requiredRoomType?: string | null;
  deptId: string;
}

export async function fetchSubjects(
  includeInactive: boolean = false,
): Promise<SubjectRecord[]> {
  const params = includeInactive === true ? { includeInactive: 'true' } : {};
  const { data } = await api.get('/v1/subjects', { params });
  return data.data;
}

export async function createSubject(
  input: CreateSubjectInput,
): Promise<SubjectRecord> {
  const { data } = await api.post('/v1/subjects', input);
  return data.data;
}

export async function updateSubject(
  id: string,
  input: Partial<CreateSubjectInput>,
): Promise<SubjectRecord> {
  const { data } = await api.patch(`/v1/subjects/${id}`, input);
  return data.data;
}

export async function toggleSubjectActive(id: string): Promise<SubjectRecord> {
  const { data } = await api.patch(`/v1/subjects/${id}/toggle-active`);
  return data.data;
}

export async function deleteSubject(id: string): Promise<void> {
  await api.delete(`/v1/subjects/${id}`);
}

// ────────────────────────────────────────────
// S-11 — Subject Restrictions
// ────────────────────────────────────────────

export interface SubjectRestriction {
  restrictionId: string;
  subjectId1: string;
  subjectId2: string;
  termId: string | null;
  warningMessage: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateSubjectRestrictionInput {
  subjectId1: string;
  subjectId2: string;
  termId?: string;
  warningMessage?: string;
}

export async function fetchSubjectRestrictions(
  termId?: string,
): Promise<SubjectRestriction[]> {
  const params = termId ? { termId } : {};
  const { data } = await api.get('/v1/subjects/restrictions', { params });
  return data.data;
}

export async function createSubjectRestriction(
  input: CreateSubjectRestrictionInput,
): Promise<SubjectRestriction> {
  const { data } = await api.post('/v1/subjects/restrictions', input);
  return data.data;
}

export async function updateSubjectRestriction(
  id: string,
  input: { warningMessage?: string; isActive?: boolean },
): Promise<SubjectRestriction> {
  const { data } = await api.patch(`/v1/subjects/restrictions/${id}`, input);
  return data.data;
}

export async function deleteSubjectRestriction(id: string): Promise<void> {
  await api.delete(`/v1/subjects/restrictions/${id}`);
}