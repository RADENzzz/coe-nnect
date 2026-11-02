import { supabase } from '../lib/supabase';
import { api } from './client';

export type SystemStatusSeverity =
  | 'info'
  | 'warning'
  | 'critical'
  | 'maintenance';

export interface SystemStatus {
  enabled: boolean;
  severity: SystemStatusSeverity;
  /** When true, only the hidden dev account may sign in or use the app. */
  maintenanceMode: boolean;
  title: string | null;
  message: string | null;
  updatedAt: string;
}

/**
 * READ — goes to Supabase directly (anon key + RLS).
 *
 * Why not the backend? Because the whole point of this banner is to
 * warn users the BACKEND is asleep. Fetching the warning from a
 * sleeping backend defeats the purpose. Supabase is always up.
 *
 * RLS policy `system_status_public_read` (TO anon, FOR SELECT,
 * USING true) is what makes this work without auth.
 */
export async function fetchSystemStatus(): Promise<SystemStatus> {
  const { data, error } = await supabase
    .from('system_status')
    .select('enabled, severity, maintenance_mode, title, message, updated_at')
    .eq('status_id', 1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      enabled: false,
      severity: 'info',
      maintenanceMode: false,
      title: null,
      message: null,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    enabled: data.enabled,
    severity: data.severity as SystemStatusSeverity,
    maintenanceMode: data.maintenance_mode === true,
    title: data.title,
    message: data.message,
    updatedAt: data.updated_at,
  };
}

/**
 * WRITE — goes through the backend so we keep validation
 * (title required when enabled) and the @Auditable trail.
 *
 * Backend enforces @Roles('administrator'). Only the dev account
 * can write.
 */
export async function updateSystemStatus(input: {
  enabled?: boolean;
  severity?: SystemStatusSeverity;
  maintenanceMode?: boolean;
  title?: string;
  message?: string | null;
}): Promise<SystemStatus> {
  const { data } = await api.patch('/v1/system-status', input);
  return data.data;
}