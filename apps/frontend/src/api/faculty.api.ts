import { api } from './client';

export interface FacultyRecord {
  facultyId: string;
  firstName: string;
  lastName: string;
  deptId: string | null;
  classification: string;
}

export async function fetchFaculty(): Promise<FacultyRecord[]> {
  const { data } = await api.get('/v1/faculty');
  return data.data;
}