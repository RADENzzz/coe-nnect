import { api } from './client';

export interface Department {
  deptId: string;
  deptCode: string;
  deptName: string;
  description: string | null;
  isActive: boolean;
}

export interface CreateDepartmentInput {
  deptCode: string;
  deptName: string;
  description?: string;
}

export interface UpdateDepartmentInput {
  deptCode?: string;
  deptName?: string;
  description?: string;
}

export async function fetchDepartments(): Promise<Department[]> {
  const { data } = await api.get('/v1/departments');
  return data.data;
}

export async function fetchDepartment(id: string): Promise<Department> {
  const { data } = await api.get(`/v1/departments/${id}`);
  return data.data;
}

export async function createDepartment(input: CreateDepartmentInput): Promise<Department> {
  const { data } = await api.post('/v1/departments', input);
  return data.data;
}

export async function updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
): Promise<Department> {
  const { data } = await api.patch(`/v1/departments/${id}`, input);
  return data.data;
}

export async function toggleDepartmentActive(id: string): Promise<Department> {
  const { data } = await api.patch(`/v1/departments/${id}/toggle-active`);
  return data.data;
}

export async function deleteDepartment(id: string): Promise<void> {
  await api.delete(`/v1/departments/${id}`);
}