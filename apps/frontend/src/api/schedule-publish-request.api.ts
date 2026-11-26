import { api } from './client';

/**
 * Dean-approved publish requests for finalized schedule entries.
 *
 * A DH cannot publish directly: once an entry is finalized it goes on the
 * public planner and the IDP feed, so the DH files a request and the Dean
 * decides. Rejection returns the entry to Draft.
 */

export type PublishRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface PublishRequestSubject {
  subjectId: string;
  subjectCode: string;
  title: string;
}

export interface PublishRequestFaculty {
  facultyId: string;
  firstName: string;
  lastName: string;
}

export interface PublishRequestRoom {
  roomId: string;
  roomNumber: string;
  building?: string | null;
}

export interface PublishRequestSection {
  sectionId: string;
  sectionCode: string;
}

export interface PublishRequestTerm {
  termId: string;
  termName: string;
  schoolYear?: string | null;
}

export interface PublishRequestSchedule {
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
  subject?: PublishRequestSubject | null;
  faculty?: PublishRequestFaculty | null;
  room?: PublishRequestRoom | null;
  sectionRef?: PublishRequestSection | null;
  term?: PublishRequestTerm | null;
}

export interface PublishRequestUser {
  userId: string;
  username: string;
  email: string;
  faculty?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export interface SchedulePublishRequest {
  requestId: string;
  scheduleId: string;
  deptId: string | null;
  requestedBy: string | null;
  note: string | null;
  status: PublishRequestStatus;
  respondedBy: string | null;
  respondedAt: string | null;
  responseRemarks: string | null;
  createdAt: string;
  updatedAt: string;
  schedule?: PublishRequestSchedule;
  requestedByUser?: PublishRequestUser | null;
  respondedByUser?: PublishRequestUser | null;
}

export async function fetchPublishRequests(params?: {
  status?: PublishRequestStatus;
  termId?: string;
}): Promise<SchedulePublishRequest[]> {
  const { data } = await api.get('/v1/schedules/publish-requests', { params });
  return data.data;
}

export async function fetchSchedulePublishRequest(
  scheduleId: string,
): Promise<SchedulePublishRequest | null> {
  const { data } = await api.get(`/v1/schedules/${scheduleId}/publish-request`);
  return data.data;
}

export async function createPublishRequest(
  scheduleId: string,
  note?: string,
): Promise<SchedulePublishRequest> {
  const { data } = await api.post(`/v1/schedules/${scheduleId}/publish-request`, {
    note,
  });
  return data.data;
}

export async function respondToPublishRequest(
  requestId: string,
  action: 'approve' | 'reject',
  remarks?: string,
): Promise<SchedulePublishRequest> {
  const { data } = await api.patch(`/v1/schedules/publish-requests/${requestId}`, {
    action,
    remarks,
  });
  return data.data;
}

/** Display helper: subject code + section, falling back to a generic label. */
export function publishRequestLabel(request: SchedulePublishRequest): string {
  const schedule = request.schedule;
  const subjectCode = schedule?.subject?.subjectCode ?? null;
  const section =
    schedule?.sectionRef?.sectionCode ?? schedule?.section ?? null;
  return [subjectCode, section].filter(Boolean).join(' · ') || 'Schedule entry';
}

/** Display helper: requester's name, falling back to a role label. */
export function publishRequesterName(request: SchedulePublishRequest): string {
  const user = request.requestedByUser;
  if (!user) return 'Department head';
  const full = [user.faculty?.firstName, user.faculty?.lastName]
    .filter(Boolean)
    .join(' ');
  return full || user.username || user.email || 'Department head';
}
