import { api } from './client';

export type UserRole = 'administrator' | 'college_dean' | 'department_head' | 'viewer';

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