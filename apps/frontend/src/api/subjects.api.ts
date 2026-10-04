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
  includeInactive = false,
): Promise<SubjectRecord[]> {
  const params = includeInactive ? { includeInactive: 'true' } : {};
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