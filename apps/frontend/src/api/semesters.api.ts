import { api } from './client';

export interface SemesterTypeRecord {
  code: string;
  label: string;
  shortLabel: string;
  sortOrder: number;
  isActive: boolean;
  termCount: number;
  prospectusCount: number;
  pdfTableCount: number;
  electiveCount: number;
}

export interface CreateSemesterTypeInput {
  code: string;
  label: string;
  shortLabel: string;
  sortOrder?: number;
}

export type UpdateSemesterTypeInput = Partial<
  Omit<CreateSemesterTypeInput, 'code'>
> & {
  isActive?: boolean;
};

export async function fetchSemesterTypes(): Promise<SemesterTypeRecord[]> {
  const { data } = await api.get('/v1/semesters');
  return data.data;
}

export async function createSemesterType(
  input: CreateSemesterTypeInput,
): Promise<SemesterTypeRecord> {
  const { data } = await api.post('/v1/semesters', input);
  return data.data;
}

export async function updateSemesterType(
  code: string,
  input: UpdateSemesterTypeInput,
): Promise<SemesterTypeRecord> {
  const { data } = await api.patch(`/v1/semesters/${code}`, input);
  return data.data;
}

export async function reorderSemesterTypes(
  codes: string[],
): Promise<SemesterTypeRecord[]> {
  const { data } = await api.patch('/v1/semesters/reorder', { codes });
  return data.data;
}

export async function deleteSemesterType(
  code: string,
): Promise<{ success: true }> {
  const { data } = await api.delete(`/v1/semesters/${code}`);
  // The delete controller returns { success } directly, not wrapped in { data }.
  return data;
}
