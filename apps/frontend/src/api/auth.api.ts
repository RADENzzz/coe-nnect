import { api } from './client';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'administrator' | 'college_dean' | 'department_head' | 'viewer';
  deptId: string | null;
  deptCode: string | null;
  deptName: string | null;
  facultyId: string | null;
  firstName: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await api.post('/v1/auth/login', payload);
  return data;
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get('/v1/auth/me');
  return data;
}