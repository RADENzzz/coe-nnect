import { api } from './client';

// ────────────────────────────────────────────
// Core types
// ────────────────────────────────────────────

export type SemesterType = '1st' | '2nd' | 'summer';

export interface ProgramRef {
  programId: string;
  programCode: string;
  programName: string;
}

export async function fetchAllProspectus(): Promise<
  Array<{
    prospectusId: string;
    programId: string;
    subjectId: string;
    yearLevel: number;
    semester: string;
  }>
> {
  const { data } = await api.get('/v1/prospectus');
  return data.data;
}

export interface SubjectRef {
  subjectId: string;
  subjectCode: string;
  title: string;
  totalUnits: number;
  lectureUnits: number;
  labUnits: number;
  deptId: string;
  isActive: boolean;
}

export interface ProspectusRecord {
  prospectusId: string;
  programId: string;
  subjectId: string;
  yearLevel: number;
  semester: SemesterType;
  isActive: boolean;
  program?: ProgramRef;
  subject?: SubjectRef;
}

export interface CreateProspectusInput {
  programId: string;
  subjectId: string;
  yearLevel: number;
  semester: SemesterType;
}

export interface UpdateProspectusInput extends Partial<CreateProspectusInput> {
  isActive?: boolean;
}

// ────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────

export async function fetchProspectus(): Promise<ProspectusRecord[]> {
  const { data } = await api.get('/v1/prospectus');
  return data.data;
}

export async function fetchProspectusByProgram(
  programId: string,
): Promise<ProspectusRecord[]> {
  const { data } = await api.get(`/v1/prospectus/by-program/${programId}`);
  return data.data;
}

export async function fetchProspectusOne(
  id: string,
): Promise<ProspectusRecord> {
  const { data } = await api.get(`/v1/prospectus/${id}`);
  return data.data;
}

// ────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────

export async function createProspectus(
  input: CreateProspectusInput,
): Promise<ProspectusRecord> {
  const { data } = await api.post('/v1/prospectus', input);
  return data.data;
}

export async function updateProspectus(
  id: string,
  input: UpdateProspectusInput,
): Promise<ProspectusRecord> {
  const { data } = await api.patch(`/v1/prospectus/${id}`, input);
  return data.data;
}

export async function toggleProspectusActive(
  id: string,
): Promise<ProspectusRecord> {
  const { data } = await api.patch(`/v1/prospectus/${id}/toggle-active`);
  return data.data;
}

export async function deleteProspectus(id: string): Promise<void> {
  await api.delete(`/v1/prospectus/${id}`);
}   