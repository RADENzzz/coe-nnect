import { api } from './client';

/**
 * Dean-approved change requests for schedule entries under review.
 *
 * A DH cannot edit a review/finalized entry directly: the entry goes back to
 * Draft only after the Dean approves the request. Rejection leaves the entry
 * in its current state.
 */

export type ChangeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface ChangeRequestSubject {
  subjectId: string;
  subjectCode: string;
  title: string;
}

export interface ChangeRequestFaculty {
  facultyId: string;
  firstName: string;
  lastName: string;
}

export interface ChangeRequestRoom {
  roomId: string;
  roomNumber: string;
  building?: string | null;
}

export interface ChangeRequestSection {
  sectionId: string;
  sectionCode: string;
}

export interface ChangeRequestTerm {
  termId: string;
  termName: string;
  schoolYear?: string | null;
}

export interface ChangeRequestSchedule {
  scheduleId: string;
  termId: string;
  subjectId: string;
  deptId: string | null;
  section: string | null;
  status: 'draft' | 'review' | 'finalized' | 'published';
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  externalFacultyName: string | null;
  externalRoomName: string | null;
  subject?: ChangeRequestSubject | null;
  faculty?: ChangeRequestFaculty | null;
  room?: ChangeRequestRoom | null;
  sectionRef?: ChangeRequestSection | null;
  term?: ChangeRequestTerm | null;
}

export interface ChangeRequestUser {
  userId: string;
  username: string;
  email: string;
  faculty?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export interface ScheduleChangeRequest {
  requestId: string;
  scheduleId: string;
  deptId: string | null;
  requestedBy: string | null;
  reason: string;
  status: ChangeRequestStatus;
  respondedBy: string | null;
  respondedAt: string | null;
  responseRemarks: string | null;
  createdAt: string;
  updatedAt: string;
  schedule?: ChangeRequestSchedule;
  requestedByUser?: ChangeRequestUser | null;
  respondedByUser?: ChangeRequestUser | null;
}

export async function fetchChangeRequests(params?: {
  status?: ChangeRequestStatus;
  termId?: string;
}): Promise<ScheduleChangeRequest[]> {
  const { data } = await api.get('/v1/schedules/change-requests', { params });
  return data.data;
}

export async function fetchScheduleChangeRequest(
  scheduleId: string,
): Promise<ScheduleChangeRequest | null> {
  const { data } = await api.get(`/v1/schedules/${scheduleId}/change-request`);
  return data.data;
}

export async function createChangeRequest(
  scheduleId: string,
  reason: string,
): Promise<ScheduleChangeRequest> {
  const { data } = await api.post(`/v1/schedules/${scheduleId}/change-request`, {
    reason,
  });
  return data.data;
}

export async function respondToChangeRequest(
  requestId: string,
  action: 'approve' | 'reject',
  remarks?: string,
): Promise<ScheduleChangeRequest> {
  const { data } = await api.patch(`/v1/schedules/change-requests/${requestId}`, {
    action,
    remarks,
  });
  return data.data;
}

/** Display helper: subject code + section, falling back to a generic label. */
export function changeRequestLabel(request: ScheduleChangeRequest): string {
  const schedule = request.schedule;
  const subjectCode = schedule?.subject?.subjectCode ?? null;
  const section =
    schedule?.sectionRef?.sectionCode ?? schedule?.section ?? null;
  return [subjectCode, section].filter(Boolean).join(' · ') || 'Schedule entry';
}

/** Display helper: requester's name, falling back to a role label. */
export function changeRequesterName(request: ScheduleChangeRequest): string {
  const user = request.requestedByUser;
  if (!user) return 'Department head';
  const full = [user.faculty?.firstName, user.faculty?.lastName]
    .filter(Boolean)
    .join(' ');
  return full || user.username || user.email || 'Department head';
}
