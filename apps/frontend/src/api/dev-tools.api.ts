import { api } from './client';
import type { SystemStatus } from './system-status.api';

export interface DevSystemState {
  counts: Record<string, number>;
  activeTerm: {
    termId: string;
    termName: string;
    schoolYear: string;
    semester: string | null;
  } | null;
}

export interface DevUserRecord {
  userId: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  deptId: string | null;
}

export type DevJobKind = 'seed' | 'reset' | 'reset-and-seed' | 'seed-demo-full';

export interface DevJob {
  jobId: string;
  kind: DevJobKind;
  status: 'running' | 'success' | 'failed';
  startedAt: number;
  finishedAt: number | null;
  output: string;
  error: string | null;
}

export async function fetchSystemState(): Promise<DevSystemState> {
  const { data } = await api.get('/v1/dev-tools/state');
  return data.data;
}

export async function startSeed(): Promise<{ jobId: string }> {
  const { data } = await api.post('/v1/dev-tools/seed');
  return data.data;
}

// The backend owns the reset/seed process. The frontend only starts the job
// and polls its status, so the signed-in administrator survives a reset.
 export async function startReset(
   reseed = false,
   full = false,
 ): Promise<{ jobId: string }> {
  const { data } = await api.post('/v1/dev-tools/reset', { reseed, full });
   return data.data;
 }

export async function fetchJob(jobId: string): Promise<DevJob | null> {
  const { data } = await api.get(`/v1/dev-tools/jobs/${jobId}`);
  return data.data;
}

export async function listDevUsers(): Promise<DevUserRecord[]> {
  const { data } = await api.get('/v1/dev-tools/users');
  return data.data;
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ success: true }> {
  const { data } = await api.post(
    `/v1/dev-tools/users/${userId}/password`,
    { newPassword },
  );
  return data.data;
}

export async function renameUser(
  userId: string,
  newUsername: string,
): Promise<{ success: true; username: string }> {
  const { data } = await api.post(
    `/v1/dev-tools/users/${userId}/username`,
    { newUsername },
  );
  return data.data;
}

export async function toggleDevUserActive(
  userId: string,
): Promise<{ userId: string; isActive: boolean }> {
  const { data } = await api.patch(
    `/v1/dev-tools/users/${userId}/toggle-active`,
  );
  return data.data;
}

export async function fetchSystemStatusForDev(): Promise<SystemStatus> {
  // Same public endpoint — no need for a separate dev-only route.
  const { data } = await api.get('/v1/system-status');
  return data.data;
}

export async function startSeedDemoFull(): Promise<{ jobId: string }> {
  const { data } = await api.post<{ data: { jobId: string } }>(
    '/v1/dev-tools/seed-demo-full',
  );
  return data.data;
}