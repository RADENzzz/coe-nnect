import { api } from './client';

// ────────────────────────────────────────────
// Types — mirror the backend entity + DTOs
// ────────────────────────────────────────────

/** Full day name, matching the DB enum. */
export type FullDayName =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export type UnavailabilitySource = 'local' | 'idp';

export interface FacultyUnavailability {
  unavailabilityId: string;
  facultyId: string;
  termId: string | null;
  dayOfWeek: FullDayName;
  /** "HH:MM:SS" from the DB. */
  startTime: string;
  /** "HH:MM:SS" from the DB. */
  endTime: string;
  reason: string | null;
  source: UnavailabilitySource;
  externalId: string | null;
  syncedAt: string | null;
  createdAt: string;
}

export interface CreateUnavailabilityInput {
  dayOfWeek: FullDayName;
  /** "HH:MM" — the backend normalizes to HH:MM:SS. */
  startTime: string;
  endTime: string;
  reason?: string;
  /** Optional term scope; omit for term-agnostic blocks. */
  termId?: string;
}

export interface UpdateUnavailabilityInput {
  dayOfWeek?: FullDayName;
  startTime?: string;
  endTime?: string;
  reason?: string;
  termId?: string | null;
}

// ────────────────────────────────────────────
// REST
// ────────────────────────────────────────────

export async function fetchFacultyUnavailability(
  facultyId: string,
  termId?: string,
): Promise<FacultyUnavailability[]> {
  const { data } = await api.get(`/v1/faculty/${facultyId}/unavailability`, {
    params: termId ? { termId } : undefined,
  });
  return data.data;
}

export async function addFacultyUnavailability(
  facultyId: string,
  input: CreateUnavailabilityInput,
): Promise<FacultyUnavailability> {
  const { data } = await api.post(
    `/v1/faculty/${facultyId}/unavailability`,
    input,
  );
  return data.data;
}

export async function updateFacultyUnavailability(
  facultyId: string,
  unavailabilityId: string,
  input: UpdateUnavailabilityInput,
): Promise<FacultyUnavailability> {
  const { data } = await api.patch(
    `/v1/faculty/${facultyId}/unavailability/${unavailabilityId}`,
    input,
  );
  return data.data;
}

export async function removeFacultyUnavailability(
  facultyId: string,
  unavailabilityId: string,
): Promise<{ success: boolean }> {
  const { data } = await api.delete(
    `/v1/faculty/${facultyId}/unavailability/${unavailabilityId}`,
  );
  return data.data;
}