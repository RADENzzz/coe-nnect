import { api } from './client';

export type FacultyRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface FacultyRequest {
  requestId: string;
  requestingDeptId: string;
  targetDeptId: string;
  facultyId: string | null;
  subjectId: string;
  termId: string;
  reason: string;
  status: FacultyRequestStatus;
  createdBy: string | null;
  createdAt: string;
  respondedBy: string | null;
  respondedAt: string | null;
  responseRemarks: string | null;
}

export interface CreateFacultyRequestInput {
  targetDeptId: string;
  facultyId?: string;
  subjectId: string;
  termId: string;
  reason: string;
}

export async function fetchFacultyRequests(): Promise<FacultyRequest[]> {
  const { data } = await api.get('/v1/faculty-requests');
  return data.data;
}

export async function fetchFacultyRequest(id: string): Promise<FacultyRequest> {
  const { data } = await api.get(`/v1/faculty-requests/${id}`);
  return data.data;
}

export async function createFacultyRequest(
  input: CreateFacultyRequestInput,
): Promise<FacultyRequest> {
  const { data } = await api.post('/v1/faculty-requests', input);
  return data.data;
}

export async function approveFacultyRequest(
  id: string,
  remarks?: string,
): Promise<FacultyRequest> {
  const { data } = await api.patch(`/v1/faculty-requests/${id}/approve`, {
    remarks,
  });
  return data.data;
}

export async function rejectFacultyRequest(
  id: string,
  remarks: string,
): Promise<FacultyRequest> {
  const { data } = await api.patch(`/v1/faculty-requests/${id}/reject`, {
    remarks,
  });
  return data.data;
}

export async function cancelFacultyRequest(id: string): Promise<FacultyRequest> {
  const { data } = await api.delete(`/v1/faculty-requests/${id}`);
  return data.data;
}