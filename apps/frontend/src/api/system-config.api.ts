import { api } from './client';

// ────────────────────────────────────────────
// Settings
// ────────────────────────────────────────────

export interface SchedulingSetting {
  settingKey: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
}

export async function fetchSettings(): Promise<SchedulingSetting[]> {
  const { data } = await api.get('/v1/system-config');
  return data.data;
}

export async function updateSettings(
  settings: Record<string, unknown>,
): Promise<SchedulingSetting[]> {
  const { data } = await api.patch('/v1/system-config', { settings });
  return data.data;
}

// ────────────────────────────────────────────
// Designations
// ────────────────────────────────────────────

export interface Designation {
  designationId: string;
  designationName: string;
  releaseHours: number;
}

export interface CreateDesignationInput {
  designationName: string;
  releaseHours: number;
}

export async function fetchDesignations(): Promise<Designation[]> {
  const { data } = await api.get('/v1/designations');
  return data.data;
}

export async function createDesignation(
  input: CreateDesignationInput,
): Promise<Designation> {
  const { data } = await api.post('/v1/designations', input);
  return data.data;
}

export async function updateDesignation(
  id: string,
  input: Partial<CreateDesignationInput>,
): Promise<Designation> {
  const { data } = await api.patch(`/v1/designations/${id}`, input);
  return data.data;
}

export async function deleteDesignation(id: string): Promise<void> {
  await api.delete(`/v1/designations/${id}`);
}