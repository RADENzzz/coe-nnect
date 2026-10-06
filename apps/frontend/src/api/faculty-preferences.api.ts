import { api } from './client';

export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface FacultyPreference {
  preferenceId: string;
  facultyId: string;
  preferredDay: DayOfWeek;
  preferredStartTime: string; // "HH:MM:SS"
  preferredEndTime: string;   // "HH:MM:SS"
}

export interface CreatePreferenceInput {
  preferredDay: DayOfWeek;
  preferredStartTime: string; // "HH:MM"
  preferredEndTime: string;   // "HH:MM"
}

export interface UpdatePreferenceInput {
  preferredDay?: DayOfWeek;
  preferredStartTime?: string;
  preferredEndTime?: string;
}

export async function fetchFacultyPreferences(
  facultyId: string,
): Promise<FacultyPreference[]> {
  const { data } = await api.get(`/v1/faculty/${facultyId}/preferences`);
  return data.data;
}

export async function addFacultyPreference(
  facultyId: string,
  input: CreatePreferenceInput,
): Promise<FacultyPreference> {
  const { data } = await api.post(`/v1/faculty/${facultyId}/preferences`, input);
  return data.data;
}

export async function updateFacultyPreference(
  facultyId: string,
  preferenceId: string,
  input: UpdatePreferenceInput,
): Promise<FacultyPreference> {
  const { data } = await api.patch(
    `/v1/faculty/${facultyId}/preferences/${preferenceId}`,
    input,
  );
  return data.data;
}

export async function removeFacultyPreference(
  facultyId: string,
  preferenceId: string,
): Promise<{ success: boolean }> {
  const { data } = await api.delete(
    `/v1/faculty/${facultyId}/preferences/${preferenceId}`,
  );
  return data;
}