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
    lectureSessionsPerWeek: number;
    lectureMinutesPerSession: number;
    labSessionsPerWeek: number;
    labMinutesPerSession: number;
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
  isPlaceholder?: boolean;
}

export interface ProspectusRecord {
  prospectusId: string;
  programId: string;
  subjectId: string;
  yearLevel: number;
  semester: SemesterType;
  isActive: boolean;
  /** Set when the row was auto-deactivated because its subject was deactivated. */
  deactivatedBySubject?: boolean;

  slotLabel?: string | null;

  lectureSessionsPerWeek: number;
  lectureMinutesPerSession: number;
  labSessionsPerWeek: number;
  labMinutesPerSession: number;

  program?: ProgramRef;
  subject?: SubjectRef;
}

export interface CreateProspectusInput {
  programId: string;
  subjectId: string;
  yearLevel: number;
  semester: SemesterType;

  lectureSessionsPerWeek?: number;
  lectureMinutesPerSession?: number;
  labSessionsPerWeek?: number;
  labMinutesPerSession?: number;
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

export interface FillSlotInput {
  /** Fill with an existing elective subject. */
  subjectId?: string;
  /** Or type a real code; the backend saves it as an elective. */
  newSubjectCode?: string;
  /** Optional title override for a typed code (defaults to the slot label). */
  newSubjectTitle?: string;
}

export async function fillProspectusSlot(
  prospectusId: string,
  input: string | FillSlotInput,
): Promise<ProspectusRecord> {
  const body = typeof input === 'string' ? { subjectId: input } : input;
  const { data } = await api.patch(
    `/v1/prospectus/${prospectusId}/fill-slot`,
    body,
  );
  return data.data;
}

export async function duplicateProspectusSlot(
  prospectusId: string,
): Promise<ProspectusRecord> {
  const { data } = await api.post(
    `/v1/prospectus/${prospectusId}/duplicate-slot`,
  );
  return data.data;
}