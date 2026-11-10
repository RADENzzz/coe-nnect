/**
 * Wire types for the CoE-NNECT <-> IDP integration (contract v2.0).
 *
 * These describe the JSON payloads IDP sends to us and the payloads we
 * expect back from the IDP REST API. Keep them in sync with sections 4.1,
 * 4.2, 4.3, and 4.6 of the contract.
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

export interface IdpHealthStatus {
  status: 'ok' | 'degraded' | 'disabled';
  service: 'coe-nnect-idp-integration';
  enabled: boolean;
  configured: {
    baseUrl: boolean;
    apiKey: boolean;
    webhookSecret: boolean;
  };
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
  day_of_week: string;
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

/** Result of a single publish attempt, surfaced to the caller. */
export interface IdpSchedulePushResult {
  termCode: string;
  versionId: string;
  versionNumber: number;
  entryCount: number;
  attempted: boolean;
  delivered: boolean;
  status: number | null;
  attempts: number;
  skipped?: 'disabled' | 'not_configured';
  error?: string;
}
