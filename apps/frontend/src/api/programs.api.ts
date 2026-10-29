import { api } from './client';

export interface ProgramRecord {
  programId: string;
  programCode: string;
  programName: string;
  deptId: string;
  isActive: boolean;
}

export interface CreateProgramInput {
  programCode: string;
  programName: string;
  deptId: string;
  isActive?: boolean;
}

export type UpdateProgramInput = Partial<CreateProgramInput>;

/**
 * Active programs only. This is the shape every picker expects
 * (prospectus, sections, import) — deactivated programs are hidden.
 *
 * Deliberately zero-argument: it is passed straight to `queryFn`, which
 * calls it with a QueryFunctionContext object.
 */
export async function fetchPrograms(): Promise<ProgramRecord[]> {
  const { data } = await api.get('/v1/programs');
  return data.data;
}

/** Every program, including deactivated ones — for the management page. */
export async function fetchAllPrograms(): Promise<ProgramRecord[]> {
  const { data } = await api.get('/v1/programs', {
    params: { includeInactive: 'true' },
  });
  return data.data;
}

export async function createProgram(
  input: CreateProgramInput,
): Promise<ProgramRecord> {
  const { data } = await api.post('/v1/programs', input);
  return data.data;
}

export async function updateProgram(
  id: string,
  input: UpdateProgramInput,
): Promise<ProgramRecord> {
  const { data } = await api.patch(`/v1/programs/${id}`, input);
  return data.data;
}

export async function toggleProgramActive(
  id: string,
): Promise<ProgramRecord> {
  const { data } = await api.patch(`/v1/programs/${id}/toggle-active`);
  return data.data;
}
