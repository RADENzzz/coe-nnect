import { api } from './client';

export type SystemStatusSeverity =
  | 'info'
  | 'warning'
  | 'critical'
  | 'maintenance';

export interface SystemStatus {
  enabled: boolean;
  severity: SystemStatusSeverity;
  title: string | null;
  message: string | null;
  updatedAt: string;
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const { data } = await api.get('/v1/system-status');
  return data.data;
}

export async function updateSystemStatus(input: {
  enabled?: boolean;
  severity?: SystemStatusSeverity;
  title?: string;
  message?: string | null;
}): Promise<SystemStatus> {
  const { data } = await api.patch('/v1/system-status', input);
  return data.data;
}