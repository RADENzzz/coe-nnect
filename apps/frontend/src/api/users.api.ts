import { api } from './client';

export type UserRole =
  | 'administrator'
  | 'college_dean'
  | 'college_secretary'
  | 'department_head'
  | 'viewer';

export interface UserRecord {
  userId: string;
  username: string;
  email: string;
  employeeId: string | null;
  wmsuId: string | null;
  role: UserRole;
  deptId: string | null;
  facultyId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Minimal, presence-safe projection returned by GET /v1/users/directory.
 * Accessible to administrator, college_dean, and department_head.
 * Uses snake_case to match the presence payload from Supabase Realtime.
 */
export interface UserDirectoryRecord {
  user_id: string;
  username: string;
  role: UserRole;
  dept_id: number | null;
  is_active: boolean;
  /** Last heartbeat from the user's browser; null if they never checked in. */
  last_seen_at: string | null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  username: string;
  role: UserRole;
  deptId?: string;
  facultyId?: string;
}

export async function fetchUsers(): Promise<UserRecord[]> {
  const { data } = await api.get('/v1/users');
  return data.data;
}

export async function fetchUserDirectory(): Promise<UserDirectoryRecord[]> {
  const { data } = await api.get('/v1/users/directory');
  return data.data;
}

/**
 * Record that this browser is still signed in. Called once a minute by the
 * session-scoped presence provider and once more just before logout.
 */
export async function heartbeatPresence(timeoutMs = 10_000): Promise<void> {
  await api.post('/v1/users/me/heartbeat', undefined, {
    timeout: timeoutMs,
  });
}

export async function fetchUser(id: string): Promise<UserRecord> {
  const { data } = await api.get(`/v1/users/${id}`);
  return data.data;
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const { data } = await api.post('/v1/users', input);
  return data.data;
}

export async function toggleUserActive(id: string): Promise<UserRecord> {
  const { data } = await api.patch(`/v1/users/${id}/toggle-active`);
  return data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/v1/users/${id}`);
}

export interface UpdateUserInput {
  username?: string;
  role?: UserRole;
  deptId?: string | null;
  facultyId?: string | null;
  isActive?: boolean;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<UserRecord> {
  const { data } = await api.patch(`/v1/users/${id}`, input);
  return data.data;
}

export async function changeOwnPassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: true }> {
  const { data } = await api.post('/v1/users/me/password', payload);
  return data;
}