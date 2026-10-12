import { api } from './client';

export type SemesterType = '1st' | '2nd' | 'summer';

export interface Term {
  termId: string;
  termName: string;
  schoolYear: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  semester: SemesterType | null;
}

export interface CreateTermInput {
  termName: string;
  schoolYear: string;
  startDate: string;
  endDate: string;
  semester: SemesterType;
  setActive?: boolean;
}

export async function fetchTerms(): Promise<Term[]> {
  const { data } = await api.get('/v1/terms');
  return data.data;
}

export async function fetchActiveTerm(): Promise<Term | null> {
  const { data } = await api.get('/v1/terms/active');
  return data.data;
}

export async function createTerm(input: CreateTermInput): Promise<Term> {
  const { data } = await api.post('/v1/terms', input);
  return data.data;
}

export async function activateTerm(id: string): Promise<Term> {
  const { data } = await api.patch(`/v1/terms/${id}/activate`);
  return data.data;
}

export async function deactivateTerm(id: string): Promise<Term> {
  const { data } = await api.patch(`/v1/terms/${id}/deactivate`);
  return data.data;
}

export async function deleteTerm(id: string): Promise<{ success: boolean }> {
  const { data } = await api.delete(`/v1/terms/${id}`);
  return data.data;
}