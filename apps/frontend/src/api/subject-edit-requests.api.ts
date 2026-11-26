import { api } from './client';

/**
 * Cross-department subject edit requests. A department head requests access to
 * another department's subject; the owning department (or a college-wide
 * role) decides. Approved grants make a foreign subject editable.
 */

export type SubjectEditRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'revoked';

export type SubjectEditAction = 'approve' | 'reject' | 'revoke';

export interface SubjectEditRequest {
  requestId: string;
  subjectId: string;
  requestingDeptId: string;
  owningDeptId: string;
  reason: string;
  status: SubjectEditRequestStatus;
  createdBy: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  responseRemarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchSubjectEditRequests(params?: {
  status?: SubjectEditRequestStatus;
  subjectId?: string;
}): Promise<SubjectEditRequest[]> {
  const { data } = await api.get('/v1/subjects/edit-requests', { params });
  return data.data;
}

export async function fetchSubjectEditRequestForSubject(
  subjectId: string,
): Promise<SubjectEditRequest | null> {
  const { data } = await api.get(`/v1/subjects/${subjectId}/edit-request`);
  return data.data;
}

export async function createSubjectEditRequest(
  subjectId: string,
  reason: string,
): Promise<SubjectEditRequest> {
  const { data } = await api.post(`/v1/subjects/${subjectId}/edit-request`, {
    reason,
  });
  return data.data;
}

export async function respondToSubjectEditRequest(
  requestId: string,
  action: SubjectEditAction,
  remarks?: string,
): Promise<SubjectEditRequest> {
  const { data } = await api.patch(`/v1/subjects/edit-requests/${requestId}`, {
    action,
    remarks,
  });
  return data.data;
}

export async function cancelSubjectEditRequest(
  requestId: string,
): Promise<SubjectEditRequest> {
  const { data } = await api.delete(`/v1/subjects/edit-requests/${requestId}`);
  return data.data;
}
