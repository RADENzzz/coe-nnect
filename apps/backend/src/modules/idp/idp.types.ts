/**
 * Wire types for the CoE-NNECT <-> IDP integration (contract v2.0).
 *
 * These describe the JSON payloads IDP sends to us and the payloads we
 * expect back from the IDP REST API. Keep them in sync with sections 4.1
 * through 4.5 of the contract.
 *
 * All IDs are strings in JSON, including bigint values.
 */

export type IdpFacultyKeyFields = {
  wmsu_id?: string | null;
  employee_id?: string | null;
};

/** Contract 4.1 — Faculty Record. */
export interface IdpFacultyRecord extends IdpFacultyKeyFields {
  first_name: string;
  last_name: string;
  email?: string | null;
  contact?: string | null;
  department_code: string;
  is_active: boolean;
  updated_at?: string | null;
}

/** Contract 4.2 — Faculty Qualification. */
export interface IdpFacultyQualification {
  faculty_wmsu_id?: string | null;
  faculty_employee_id?: string | null;
  subject_code: string;
}

/** Contract 4.3 — Faculty Unavailability. */
export interface IdpFacultyUnavailability {
  faculty_wmsu_id?: string | null;
  faculty_employee_id?: string | null;
  term_code?: string | null;
  day_of_week: string;
  start_time: string;
  end_time: string;
  reason?: string | null;
  external_id: string;
}

/** Contract 4.6 — Faculty Change Event. */
export interface IdpFacultyChangeSummary {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  contact?: string | null;
  department_code?: string | null;
  is_active?: boolean | null;
}

export interface IdpFacultyChangeEvent {
  event_id: string;
  event:
    | 'faculty.created'
    | 'faculty.updated'
    | 'faculty.deactivated'
    | string;
  faculty_wmsu_id?: string | null;
  faculty_employee_id?: string | null;
  change_summary: IdpFacultyChangeSummary;
  changed_at: string;
}

/** Optional filters for the outbound roster pull. */
export interface IdpFacultyQuery {
  departmentCode?: string;
  updatedSince?: string;
}

export type IdpSyncOutcome = 'created' | 'updated' | 'unchanged';

export interface IdpSyncError {
  code: string;
  message: string;
  wmsu_id?: string | null;
  employee_id?: string | null;
  subject_code?: string | null;
  external_id?: string | null;
}

export interface IdpFacultySyncSummary {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  qualificationsAdded: number;
  unavailabilitySynced: number;
  errors: IdpSyncError[];
  startedAt: string;
  finishedAt: string;
}

/** Pattern C faculty snapshot pushed by the IDP desktop client. */
export type IdpFacultyInboxBody =
  | IdpFacultyRecord[]
  | { faculty: IdpFacultyRecord[] };

export interface IdpFacultyInboxSummary {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  errors: IdpSyncError[];
  startedAt: string;
  finishedAt: string;
}

export interface IdpHealthStatus {
  status: 'ok' | 'degraded' | 'disabled';
  service: 'coe-nnect-idp-integration';
  enabled: boolean;
  configured: {
    baseUrl: boolean;
    apiKey: boolean;
    webhookSecret: boolean;
    deviceApiKey: boolean;
  };
  /** Pattern C: IDP desktop pushes faculty and polls the outbox. */
  inboundReady: boolean;
  /** Pattern A: CoE-NNECT can call IDP's REST API. */
  outboundReady: boolean;
  lastSyncAt: string | null;
  timestamp: string;
}

/** Contract 4.4 — one published schedule row. */
export interface IdpPublishedScheduleEntry {
  coe_nnect_schedule_id: string;
  department_code: string;
  section_code: string | null;
  subject_code: string;
  faculty_wmsu_id: string | null;
  external_faculty_name: string | null;
  room_number: string | null;
  external_room_name: string | null;
  /** Contract v2.0 names this field `day` (not `day_of_week`). */
  day: string;
  start_time: string;
  end_time: string;
  load_type: string | null;
}

/** Contract 4.4 — term-wide published schedule push. */
export interface IdpPublishedSchedulePayload {
  coe_nnect_version_id: string;
  version_number: number;
  term_code: string;
  published_at: string;
  entries: IdpPublishedScheduleEntry[];
}

/** Department-scoped class lookup returned to the IDP desktop client. */
export interface IdpClassReference {
  subject_code: string;
  section_code: string | null;
  course_title: string;
  class_code: string;
}

/** Result of a single publish attempt, surfaced to the caller. */
export interface IdpSchedulePushResult {
  termCode: string;
  versionId: string;
  versionNumber: number;
  entryCount: number;
  /** True once the payload is durably stored for Pattern C polling. */
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

/** One durable outbox row returned to the polling IDP desktop client. */
export interface IdpOutboxItem<T = unknown> {
  outbox_id: string;
  kind: string;
  idempotency_key: string;
  created_at: string;
  payload: T;
}

export interface IdpOutboxPage<T = unknown> {
  items: Array<IdpOutboxItem<T>>;
  next_since: string | null;
  server_time: string;
}

export type IdpOutboxScheduleItem = IdpOutboxItem<IdpPublishedSchedulePayload>;
export type IdpOutboxSchedulePage = IdpOutboxPage<IdpPublishedSchedulePayload>;

/** Contract 4.5 — faculty request status pushed to IDP. */
export interface IdpFacultyRequestPayload {
  coe_nnect_request_id: string;
  requesting_dept: string;
  target_dept: string;
  faculty_wmsu_id: string | null;
  subject_code: string;
  term_code: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string;
  created_at: string;
}

/** Result of a faculty-request status publish attempt. */
export interface IdpFacultyRequestPushResult {
  requestId: string;
  status: string;
  queued: boolean;
  outboxId: string | null;
  queuedAt: string | null;
  attempted: boolean;
  delivered: boolean;
  statusCode: number | null;
  attempts: number;
  skipped?: 'disabled' | 'not_configured';
  error?: string;
}

/** Contract 4.5 — the eight change-request types. */
export type IdpChangeRequestType =
  | 'faculty_create'
  | 'faculty_update'
  | 'faculty_deactivate'
  | 'faculty_transfer'
  | 'qualification_add'
  | 'qualification_remove'
  | 'unavailability_change'
  | 'schedule_override';

/** Contract 4.5 — accepted without entering the human review queue. */
export const IDP_AUTO_ACCEPTED_CHANGE_REQUEST_TYPES = [
  'faculty_create',
  'faculty_update',
  'faculty_deactivate',
  'qualification_add',
  'qualification_remove',
] as const satisfies readonly IdpChangeRequestType[];

/** Contract 4.5 — these stay pending until a reviewer decides. */
export const IDP_PENDING_CHANGE_REQUEST_TYPES = [
  'unavailability_change',
  'schedule_override',
  'faculty_transfer',
] as const satisfies readonly IdpChangeRequestType[];

export type IdpChangeRequestSeverity = 'info' | 'warning' | 'critical';

export type IdpChangeRequestAckAction = 'accepted' | 'rejected' | 'modified';

export type IdpChangeRequestStatus = 'pending' | 'acknowledged' | 'rejected';

/**
 * Contract 4.5 — Change Request (IDP -> CoE-NNECT).
 *
 * Only `idp_request_id` and `type` are required by the v2.0 contract. The
 * receiver applies defaults for the remaining fields before storing the
 * request.
 */
export interface IdpChangeRequestPayload {
  idp_request_id: string;
  type: IdpChangeRequestType | string;
  faculty_wmsu_id?: string | null;
  faculty_employee_id?: string | null;
  affected_dates?: string[] | null;
  details?: Record<string, unknown> | null;
  severity?: IdpChangeRequestSeverity | string | null;
  requires_ack?: boolean | null;
  created_at?: string | null;
}

/** Contract 4.5 — Change Request Ack (CoE-NNECT -> IDP). */
export interface IdpChangeRequestAckPayload {
  idp_request_id: string;
  acknowledged_by_coe_nnect_user_id: string;
  action: IdpChangeRequestAckAction;
  notes: string | null;
  acknowledged_at: string;
}

export interface IdpChangeRequestReceipt {
  idp_request_id: string;
  status: 'pending' | 'acknowledged' | 'duplicate';
  requires_ack: boolean;
  faculty_id: string | null;
}

export interface IdpChangeRequestAckView {
  action: IdpChangeRequestAckAction;
  notes: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string;
}

/** Change request as exposed to the authenticated review UI. */
export interface IdpChangeRequestView {
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
  ack: IdpChangeRequestAckView | null;
}

/** Result of acknowledging a change request and queueing/pushing the ack. */
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
