import { api } from './client';

export interface ProgramRecord {
  programId: string;
  programCode: string;
  programName: string;
  deptId: string;
  isActive: boolean;
}

export async function fetchPrograms(): Promise<ProgramRecord[]> {
  const { data } = await api.get('/v1/programs');
  return data.data;
}