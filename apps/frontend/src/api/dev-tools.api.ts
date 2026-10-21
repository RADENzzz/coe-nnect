import { api } from './client';

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

export interface DevJob {
  jobId: string;
  kind: 'seed' | 'reset';
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

export async function startReset(): Promise<{ jobId: string }> {
  const { data } = await api.post('/v1/dev-tools/reset');
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