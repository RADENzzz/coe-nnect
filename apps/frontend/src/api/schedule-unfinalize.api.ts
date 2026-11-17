import { api } from './client';

/**
 * Dean-approved unfinalize requests for published schedule entries.
 *
 * A DH can unfinalize a finalized-but-unpublished entry directly through the
 * status endpoint. A published entry is on the public planner and the IDP
 * feed, so the DH files a request and the Dean decides.
 */

export type UnfinalizeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface UnfinalizeRequestSubject {
  subjectId: string;
  subjectCode: string;
  title: string;
}

export interface UnfinalizeRequestFaculty {
  facultyId: string;
  firstName: string;
  lastName: string;
}

export interface UnfinalizeRequestRoom {
  roomId: string;
  roomNumber: string;
  building?: string | null;
}

export interface UnfinalizeRequestSection {
  sectionId: string;
  sectionCode: string;
}

export interface UnfinalizeRequestTerm {
  termId: string;
  termName: string;
  schoolYear?: string | null;
}

export interface UnfinalizeRequestSchedule {
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
  subject?: UnfinalizeRequestSubject | null;
  faculty?: UnfinalizeRequestFaculty | null;
  room?: UnfinalizeRequestRoom | null;
  sectionRef?: UnfinalizeRequestSection | null;
  term?: UnfinalizeRequestTerm | null;
}

export interface UnfinalizeRequestUser {
  userId: string;
  username: string;
  email: string;
  faculty?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export interface ScheduleUnfinalizeRequest {
  requestId: string;
  scheduleId: string;
  deptId: string | null;
  requestedBy: string | null;
  reason: string;
  status: UnfinalizeRequestStatus;
  respondedBy: string | null;
  respondedAt: string | null;
  responseRemarks: string | null;
  createdAt: string;
  updatedAt: string;
  schedule?: UnfinalizeRequestSchedule;
  requestedByUser?: UnfinalizeRequestUser | null;
  respondedByUser?: UnfinalizeRequestUser | null;
}

export async function fetchUnfinalizeRequests(params?: {
  status?: UnfinalizeRequestStatus;
  termId?: string;
}): Promise<ScheduleUnfinalizeRequest[]> {
  const { data } = await api.get('/v1/schedules/unfinalize-requests', {
    params,
  });
  return data.data;
}

export async function fetchPendingUnfinalizeRequest(
  scheduleId: string,
): Promise<ScheduleUnfinalizeRequest | null> {
  const { data } = await api.get(
    `/v1/schedules/${scheduleId}/unfinalize-request`,
  );
  return data.data;
}

export async function createUnfinalizeRequest(
  scheduleId: string,
  reason: string,
): Promise<ScheduleUnfinalizeRequest> {
  const { data } = await api.post(
    `/v1/schedules/${scheduleId}/unfinalize-request`,
    { reason },
  );
  return data.data;
}

export async function respondToUnfinalizeRequest(
  requestId: string,
  action: 'approve' | 'reject',
  remarks?: string,
): Promise<ScheduleUnfinalizeRequest> {
  const { data } = await api.patch(
    `/v1/schedules/unfinalize-requests/${requestId}`,
    { action, remarks },
  );
  return data.data;
}

/** Display helper: subject code + section, falling back to a generic label. */
export function unfinalizeRequestLabel(
  request: ScheduleUnfinalizeRequest,
): string {
  const schedule = request.schedule;
  const subjectCode = schedule?.subject?.subjectCode ?? null;
  const section =
    schedule?.sectionRef?.sectionCode ?? schedule?.section ?? null;
  return [subjectCode, section].filter(Boolean).join(' · ') || 'Schedule entry';
}

/** Display helper: requester's name, falling back to a role label. */
export function unfinalizeRequesterName(
  request: ScheduleUnfinalizeRequest,
): string {
  const user = request.requestedByUser;
  if (!user) return 'Department head';
  const full = [user.faculty?.firstName, user.faculty?.lastName]
    .filter(Boolean)
    .join(' ');
  return full || user.username || user.email || 'Department head';
}
