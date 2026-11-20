import { api } from './client';

/**
 * CoE-NNECT ↔ IDP change requests (contract 4.7 / 4.8).
 *
 * The backend persists each inbound request under its `idp_request_id` and
 * exposes a reviewer queue. A reviewer records exactly one decision; the ack
 * is queued for the offline IDP desktop and, when Pattern A is configured,
 * pushed upstream immediately.
 */

export const IDP_CHANGE_REQUEST_TYPES = [
  'faculty_create',
  'faculty_update',
  'faculty_deactivate',
  'faculty_transfer',
  'qualification_add',
  'qualification_remove',
  'unavailability_change',
  'schedule_override',
] as const;

export type IdpChangeRequestType =
  (typeof IDP_CHANGE_REQUEST_TYPES)[number];

export type IdpChangeRequestStatus =
  | 'pending'
  | 'acknowledged'
  | 'rejected';

export type IdpChangeRequestSeverity = 'info' | 'warning' | 'critical';

export type IdpChangeRequestAckAction =
  | 'accepted'
  | 'rejected'
  | 'modified';

export interface IdpChangeRequestAck {
  action: IdpChangeRequestAckAction;
  notes: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string;
}

export interface IdpChangeRequest {
  idp_request_id: string;
  type: string;
  status: IdpChangeRequestStatus;
  severity: string;
  requires_ack: boolean;
  faculty_id: string | null;
  faculty_wmsu_id: string | null;
  faculty_employee_id: string | null;
  affected_dates: string[];
  details: Record<string, unknown>;
  created_at: string;
  received_at: string;
  ack: IdpChangeRequestAck | null;
}

export interface IdpChangeRequestListFilters {
  status?: IdpChangeRequestStatus;
  type?: IdpChangeRequestType;
  limit?: number;
}

export interface IdpChangeRequestAckInput {
  action: IdpChangeRequestAckAction;
  notes?: string | null;
}

export interface IdpChangeRequestAckResult {
  idp_request_id: string;
  action: IdpChangeRequestAckAction;
  acknowledged_at: string;
  duplicate: boolean;
  queued: boolean;
  outbox_id: string | null;
  queued_at: string | null;
  attempted: boolean;
  delivered: boolean;
  status: number | null;
  attempts: number;
  skipped?: 'disabled' | 'not_configured';
  error?: string;
}

export interface IdpSchedulePublishResult {
  termCode: string;
  versionId: string;
  versionNumber: number;
  entryCount: number;
  queued: boolean;
  outboxId: string | null;
  queuedAt: string | null;
  attempted: boolean;
  delivered: boolean;
  status: number | null;
  attempts: number;
  skipped?: 'disabled' | 'not_configured';
  error?: string;
}

export interface IdpHealth {
  status: 'ok' | 'degraded' | 'disabled';
  service: 'coe-nnect-idp-integration';
  enabled: boolean;
  configured: {
    baseUrl: boolean;
    apiKey: boolean;
    webhookSecret: boolean;
    deviceApiKey: boolean;
  };
  inboundReady: boolean;
  outboundReady: boolean;
  lastSyncAt: string | null;
  timestamp: string;
}

export async function fetchIdpChangeRequests(
  filters: IdpChangeRequestListFilters = {},
): Promise<IdpChangeRequest[]> {
  const { data } = await api.get('/v1/idp/change-requests', {
    params: filters,
  });
  return data.data.items;
}

export async function fetchIdpChangeRequest(
  idpRequestId: string,
): Promise<IdpChangeRequest> {
  const { data } = await api.get(
    `/v1/idp/change-requests/${encodeURIComponent(idpRequestId)}`,
  );
  return data.data;
}

export async function acknowledgeIdpChangeRequest(
  idpRequestId: string,
  input: IdpChangeRequestAckInput,
): Promise<IdpChangeRequestAckResult> {
  const { data } = await api.post(
    `/v1/idp/change-requests/${encodeURIComponent(idpRequestId)}/ack`,
    input,
  );
  return data.data;
}

/** Queue a finalized term schedule for IDP polling (Pattern C). */
export async function publishIdpSchedule(
  termCode: string,
): Promise<IdpSchedulePublishResult> {
  const { data } = await api.post('/v1/idp/schedules/publish', { termCode });
  return data.data;
}

/** Public readiness endpoint. Used to show whether Pattern C is ready. */
export async function fetchIdpHealth(): Promise<IdpHealth> {
  const { data } = await api.get('/idp/v1/health');
  return data.data;
}

// ────────────────────────────────────────────────────────────
// Schedule-change review (faculty / IDP requests)
// ────────────────────────────────────────────────────────────

export type ScheduleChangeConflictState =
  'ok' | 'warning' | 'conflict' | 'unknown';

export interface ScheduleChangeConflictItem {
  severity: 'hard' | 'soft' | 'info';
  ruleId: string;
  ruleName: string;
  reason: string;
}

export interface ScheduleChangeFaculty {
  facultyId: string;
  name: string;
  deptId: string | null;
  deptCode: string | null;
  deptName: string | null;
}

export interface ScheduleChangeSubject {
  subjectId: string;
  subjectCode: string;
  title: string;
  deptId: string | null;
}

export interface ScheduleChangeTerm {
  termId: string;
  label: string;
  schoolYear: string;
  semester: string | null;
  isActive: boolean;
}

export interface ScheduleChangeSchedule {
  scheduleId: string;
  subjectCode: string | null;
  subjectTitle: string | null;
  section: string | null;
  facultyName: string | null;
  room: string | null;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  status: string;
}

export interface ScheduleChangeProposal {
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  loadType: string | null;
  sectionCode: string | null;
  roomId: string | null;
  reason: string | null;
  affectedDates: string[];
}

export interface ScheduleChangeAck {
  action: string;
  notes: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string;
}

export interface ScheduleChangeRequest {
  idpRequestId: string;
  type: string;
  status: IdpChangeRequestStatus;
  severity: string;
  requiresAck: boolean;
  requestedAt: string;
  receivedAt: string;
  faculty: ScheduleChangeFaculty | null;
  subject: ScheduleChangeSubject | null;
  term: ScheduleChangeTerm | null;
  schedule: ScheduleChangeSchedule | null;
  proposed: ScheduleChangeProposal;
  conflict: {
    state: ScheduleChangeConflictState;
    summary: string;
    items: ScheduleChangeConflictItem[];
  };
  ack: ScheduleChangeAck | null;
  canReview: boolean;
  requiresDeanUnfinalize: boolean;
  details: Record<string, unknown>;
}

export interface ScheduleChangeCounts {
  pending: number;
  ready: number;
  conflicted: number;
  warning: number;
  unknown: number;
}

export interface ScheduleChangeReviewList {
  items: ScheduleChangeRequest[];
  counts: ScheduleChangeCounts;
}

export interface ScheduleChangeDecisionInput {
  action: 'accepted' | 'rejected';
  notes?: string | null;
  acknowledgeConflicts?: boolean;
}

export interface ScheduleChangeDecisionResult {
  request: ScheduleChangeRequest;
  ack: IdpChangeRequestAckResult;
  unfinalize: {
    filed: boolean;
    requestId?: string;
    message?: string;
  };
}

export async function fetchScheduleChangeRequests(
  filters: { status?: IdpChangeRequestStatus; limit?: number } = {},
): Promise<ScheduleChangeReviewList> {
  const { data } = await api.get('/v1/idp/schedule-change-requests', {
    params: filters,
  });
  return data.data;
}

export async function decideScheduleChangeRequest(
  idpRequestId: string,
  input: ScheduleChangeDecisionInput,
): Promise<ScheduleChangeDecisionResult> {
  const { data } = await api.post(
    `/v1/idp/schedule-change-requests/${encodeURIComponent(idpRequestId)}/decision`,
    input,
  );
  return data.data;
}
