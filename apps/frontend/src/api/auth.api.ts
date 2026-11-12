import { api } from './client';
import { resolveApiBaseUrl } from '../lib/api-base';

export interface LoginPayload {
  email: string;
  password: string;
  /** Solved Cap challenge token from the login widget. */
  capToken: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role:
    | 'administrator'
    | 'college_dean'
    | 'college_secretary'
    | 'department_head'
    | 'viewer';
  deptId: string | null;
  deptCode: string | null;
  deptName: string | null;
  /**
   * true  → DH with active dept, or Dean/Admin (never walled)
   * false → DH whose dept is deactivated (show wall)
   * null  → no dept linked (data-integrity edge case)
   */
  deptActive: boolean | null;
  facultyId: string | null;
  firstName: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * Cap Core endpoint prefix for the widget. The trailing slash is required:
 * the widget posts to `<prefix>challenge` and `<prefix>redeem`.
 */
export const CAP_API_ENDPOINT = `${resolveApiBaseUrl().replace(/\/+$/, '')}/v1/auth/cap/`;

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await api.post('/v1/auth/login', payload);
  return data;
}

/**
 * Re-check the signed-in user's password without a fresh Cap solve. Used by
 * sensitive admin actions after the user already has a session.
 */
export async function reauthenticate(password: string): Promise<void> {
  await api.post('/v1/auth/reauth', { password });
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get('/v1/auth/me');
  return data;
}
