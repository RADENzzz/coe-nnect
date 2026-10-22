// apps/frontend/src/api/system-status.api.ts
import { api } from './client';
import { supabase } from '../lib/supabase';

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

/**
 * READ — hits Supabase directly (anon key + RLS).
 *
 * Why not the backend? Because the whole point of the login banner is
 * to warn users the BACKEND is asleep. Fetching the warning from a
 * sleeping backend defeats the purpose. Supabase is always up.
 */
export async function fetchSystemStatus(): Promise<SystemStatus> {
  const { data, error } = await supabase
    .from('system_status')
    .select('enabled, severity, title, message, updated_at')
    .eq('status_id', 1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      enabled: false,
      severity: 'info',
      title: null,
      message: null,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    enabled: data.enabled,
    severity: data.severity as SystemStatusSeverity,
    title: data.title,
    message: data.message,
    updatedAt: data.updated_at,
  };
}

/**
 * WRITE — goes through the backend so we keep validation
 * (title required when enabled) and the @Auditable trail.
 *
 * The backend enforces @Roles('administrator'); this cannot be
 * called by a DH or Dean.
 */
export async function updateSystemStatus(input: {
  enabled?: boolean;
  severity?: SystemStatusSeverity;
  title?: string;
  message?: string | null;
}): Promise<SystemStatus> {
  const { data } = await api.patch('/v1/system-status', input);
  return data.data;
}