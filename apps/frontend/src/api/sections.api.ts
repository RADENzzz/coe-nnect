import { api } from './client';

export interface Section {
  sectionId: string;
  sectionCode: string;
  programId: string | null;
  yearLevel: number | null;
  /** @deprecated Retained for backward compat only; not used by the scheduler. */
  studentCount: number | null;
  isActive: boolean;
}

export interface CreateSectionInput {
  sectionCode: string;
  programId?: string;
  yearLevel?: number;
  // studentCount intentionally removed — see PM note (Oct 2026)
}

export async function fetchSections(): Promise<Section[]> {
  const { data } = await api.get('/v1/sections');
  return data.data;
}

export async function createSection(input: CreateSectionInput): Promise<Section> {
  const { data } = await api.post('/v1/sections', input);
  return data.data;
}

export async function updateSection(
  id: string,
  input: Partial<CreateSectionInput>,
): Promise<Section> {
  const { data } = await api.patch(`/v1/sections/${id}`, input);
  return data.data;
}

export async function toggleSectionActive(id: string): Promise<Section> {
  const { data } = await api.patch(`/v1/sections/${id}/toggle-active`);
  return data.data;
}

export async function deleteSection(id: string): Promise<void> {
  await api.delete(`/v1/sections/${id}`);
}

// ────────────────────────────────────────────
// S-11 Subject Restrictions
// (lives here for historical reasons; consider moving to subjects.api.ts later)
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