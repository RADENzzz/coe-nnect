import { api } from './client';

// ────────────────────────────────────────────
// Core types
// ────────────────────────────────────────────

export interface RawSchedule {
  scheduleId: string;
  termId: string;
  subjectId: string;
  facultyId: string | null;
  externalFacultyName: string | null;
  roomId: string | null;
  /**
   * External room name (2026-10-15).
   *
   * Set when the row's room is not in the internal `room` table —
   * e.g. a minor subject taught in another college's room, or a
   * temporary space during renovations. May coexist with roomId.
   */
  externalRoomName: string | null;
  timeslotId: string | null;
  section: string | null;
  pendingFacultyRequestId: string | null;
  pendingFacultyDeptId: string | null;
  loadType: 'lecture' | 'laboratory' | 'other' | null;
  status: 'draft' | 'review' | 'finalized' | 'published';
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  remarks: string | null;

  flagged: boolean;
  flaggedBy: string | null;
  flaggedAt: string | null;
  flagReason: string | null;

  subject?: {
    subjectId: string;
    subjectCode: string;
    title: string;
    deptId: string;
  };
  faculty?: { facultyId: string; firstName: string; lastName: string };
  room?: { roomId: string; roomNumber: string; building: string };
  timeSlot?: {
    timeslotId: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  };
}

export interface Term {
  termId: string;
  termName: string;
  schoolYear: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface UnscheduledBlock {
  sectionId: string;
  sectionCode: string;
  subjectId: string;
  subjectCode: string;
  kind: 'lecture' | 'lab';
  sessionIndex: number;
}

export interface RoomDeficitDetail {
  roomType: string;
  neededHours: number;
  availableHours: number;
  shortByHours: number;
  suggestedExtraRooms: number;
}

export interface RoomSufficiencyReport {
  deptId: string;
  deptCode: string;
  deptName: string;
  termId: string;
  termLabel: string | null;
  sufficient: boolean;
  hint: string;
  deficits: RoomDeficitDetail[];
  totals: {
    subjects: number;
    sections: number;
    blocks: number;
    rooms: number;
  };
}

export async function fetchRoomSufficiency(params?: {
  deptId?: string;
  termId?: string;
}): Promise<RoomSufficiencyReport[]> {
  const { data } = await api.get('/v1/schedules/room-sufficiency', {
    params,
  });
  return data.data;
}

export interface RoomDeficit {
  roomType: string;
  neededHours: number;
  availableHours: number;
  shortByHours: number;
  suggestedExtraRooms: number;
}

export interface BlockedMinorSummary {
  subjectId: string;
  subjectCode: string;
  title: string;
  yearLevel: number | null;
  semester: string | null;
  programCode: string | null;
}

export interface AutoGenerateResult {
  success: boolean;
  message?: string;
  scheduleCount?: number;
  solveTimeSeconds?: number | null;
  warnings?: Array<{ ruleId: string; ruleName: string; reason: string }>;
  failures?: Array<{ ruleId: string; ruleName: string; reason: string }>;
  unscheduled?: UnscheduledBlock[];
  roomDeficits?: RoomDeficit[];

  /** Set when auto-generate refused to run because unplotted minors exist. */
  blockedByUnplottedMinors?: boolean;
  unplottedMinors?: BlockedMinorSummary[];
}

export async function autoGenerateSchedule(
  termId: string,
  deptId: string,
  options?: { acknowledgeUnplottedMinors?: boolean },
): Promise<AutoGenerateResult> {
  const { data } = await api.post(
    '/v1/schedules/auto-generate',
    {
      termId,
      deptId,
      acknowledgeUnplottedMinors:
        options?.acknowledgeUnplottedMinors === true,
    },
    { timeout: 120_000 },
  );
  return data.data;
}

export async function confirmAutoGenerate(
  termId: string,
): Promise<{ success: boolean }> {
  const { data } = await api.post('/v1/schedules/auto-generate/confirm', {
    termId,
  });
  return data.data;
}

export async function discardAutoGenerate(
  termId: string,
): Promise<{ deleted: number }> {
  const { data } = await api.post('/v1/schedules/auto-generate/discard', {
    termId,
  });
  return data.data;
}

export async function abandonAutoGenerate(
  termId: string,
): Promise<{ success: boolean }> {
  const { data } = await api.post('/v1/schedules/auto-generate/abandon', {
    termId,
  });
  return data.data;
}

export async function clearAutoDrafts(
  termId: string,
): Promise<{ deleted: number }> {
  const { data } = await api.delete('/v1/schedules/auto-drafts', {
    params: { termId },
  });
  return data.data;
}

export interface UnscheduledRecord {
  unscheduledId: string;
  sectionId: string | null;
  sectionCode: string;
  subjectId: string;
  subjectCode: string;
  subjectTitle: string;
  kind: 'lecture' | 'lab';
  sessionIndex: number;
  reason: string | null;
}

export interface PendingAutoGenerateInfo {
  heldByUser: boolean;
  state: 'running' | 'pending_confirm';
  expiresAt: string;
}

export async function getPendingAutoGenerate(
  termId: string,
): Promise<PendingAutoGenerateInfo | null> {
  const { data } = await api.get('/v1/schedules/auto-generate/pending', {
    params: { termId },
  });
  return data.data;
}

export async function fetchUnscheduled(
  termId: string,
): Promise<UnscheduledRecord[]> {
  const { data } = await api.get('/v1/schedules/unscheduled', {
    params: { termId },
  });
  return data.data;
}

export async function updateRemarks(
  id: string,
  remarks: string,
): Promise<RawSchedule> {
  const { data } = await api.patch(`/v1/schedules/${id}/remarks`, { remarks });
  return data.data;
}

export async function updateScheduleStatus(
  id: string,
  status: 'draft' | 'review' | 'finalized' | 'published',
): Promise<RawSchedule> {
  const { data } = await api.patch(`/v1/schedules/${id}/status`, { status });
  return data.data;
}

export interface PlotSubjectPayload {
  termId: string;
  subjectId: string;
  facultyId?: string;
  externalFacultyName?: string;
  roomId?: string;
  /**
   * Free-text label for a room outside the internal table.
   * May coexist with `roomId` — the CHECK constraint only requires
   * at least one room identifier.
   */
  externalRoomName?: string;
  section?: string;
  loadType?: 'lecture' | 'laboratory' | 'other';
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

export interface ValidatePlotPayload {
  excludeId?: string;
  termId: string;
  subjectId: string;
  facultyId?: string;
  externalFacultyName?: string;
  roomId?: string;
  externalRoomName?: string;
  section?: string;
  loadType?: 'lecture' | 'laboratory' | 'other';
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

export interface ValidateConflict {
  ruleId: string;
  ruleName: string;
  reason: string;
}

export interface ValidateResult {
  valid: boolean;
  hardConflicts: ValidateConflict[];
  softWarnings: ValidateConflict[];
  alternatives: unknown[];
}

// ────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────

export async function fetchActiveTerm(): Promise<Term | null> {
  const { data } = await api.get('/v1/schedules/active-term');
  return data.data;
}

export async function fetchSchedules(termId?: string): Promise<RawSchedule[]> {
  const params = termId ? { termId } : {};
  const { data } = await api.get('/v1/schedules', { params });
  return data.data;
}

// ────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────

export async function plotSubject(
  payload: PlotSubjectPayload,
): Promise<RawSchedule> {
  const { data } = await api.post('/v1/schedules/plot', payload);
  return data.data;
}

export async function validatePlot(
  payload: ValidatePlotPayload,
): Promise<ValidateResult> {
  const { data } = await api.post('/v1/schedules/validate', payload);
  return data.data;
}

export interface PlotMultiSessionPayload {
  startTime: string;
  endTime: string;
  dayOfWeek: string;
}

export interface PlotMultiPayload {
  termId: string;
  subjectId: string;
  facultyId?: string;
  externalFacultyName?: string;
  roomId?: string;
  externalRoomName?: string;
  section?: string;
  loadType?: 'lecture' | 'laboratory' | 'other';
  sessions: PlotMultiSessionPayload[];
}

export async function plotMulti(
  payload: PlotMultiPayload,
): Promise<RawSchedule[]> {
  const { data } = await api.post('/v1/schedules/plot-multi', payload);
  return data.data;
}

export interface UpdateSchedulePayload {
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  roomId?: string | null;
  /**
   * External room name.
   * Send a value to set. Send `null` to explicitly clear.
   * May coexist with roomId — the backend keeps both.
   */
  externalRoomName?: string | null;
  /**
   * System faculty ID. Send `null` to explicitly clear.
   * Sending a value clears `externalFacultyName` server-side.
   */
  facultyId?: string | null;
  /**
   * Free-text name of a faculty member outside the system.
   * Send `null` to explicitly clear.
   * Sending a value clears `facultyId` server-side.
   */
  externalFacultyName?: string | null;
  section?: string | null;
  sectionId?: string | null;
  loadType?: 'lecture' | 'laboratory' | 'other';
}

export async function updateSchedule(
  id: string,
  payload: UpdateSchedulePayload,
): Promise<RawSchedule> {
  const { data } = await api.patch(`/v1/schedules/${id}`, payload);
  return data.data;
}

export async function deleteSchedule(id: string): Promise<void> {
  await api.delete(`/v1/schedules/${id}`);
}

// ────────────────────────────────────────────
// Flag system
// ────────────────────────────────────────────

export async function flagSchedule(
  id: string,
  reason: string,
): Promise<RawSchedule> {
  const { data } = await api.post(`/v1/schedules/${id}/flag`, { reason });
  return data.data;
}

export async function unflagSchedule(id: string): Promise<RawSchedule> {
  const { data } = await api.delete(`/v1/schedules/${id}/flag`);
  return data.data;
}

export async function fetchFlagged(termId: string): Promise<RawSchedule[]> {
  const { data } = await api.get('/v1/schedules/flagged', {
    params: { termId },
  });
  return data.data;
}

// ────────────────────────────────────────────
// Minor subjects — unplotted detection
// ────────────────────────────────────────────

export interface UnplottedMinor {
  subjectId: string;
  subjectCode: string;
  title: string;
  deptId: string | null;
  yearLevel: number | null;
  semester: string | null;
  programId: string | null;
  programCode: string | null;
}

export async function fetchUnplottedMinors(
  termId: string,
  deptId: string,
): Promise<UnplottedMinor[]> {
  const { data } = await api.get('/v1/schedules/unplotted-minors', {
    params: { termId, deptId },
  });
  return data.data;
}

// ────────────────────────────────────────────
// Coverage indicator (2026-10-15)
// ────────────────────────────────────────────

export interface CoverageMissingItem {
  subjectId: string;
  subjectCode: string;
  title: string;
  isMinor: boolean;
  programId: string;
  programCode: string | null;
  yearLevel: number;
  semester: string;
  sectionId: string;
  sectionCode: string;
  loadTypes: Array<'lecture' | 'laboratory'>;
}

export interface CoverageBySection {
  sectionId: string;
  sectionCode: string;
  expected: number;
  plotted: number;
  missing: number;
}

export interface CoverageByProgram {
  programId: string;
  programCode: string | null;
  expected: number;
  plotted: number;
  missing: number;
}

export interface CoverageReport {
  termId: string;
  deptId: string;
  termSemester: string | null;
  totals: {
    expected: number;
    plotted: number;
    missing: number;
    percent: number;
  };
  missing: CoverageMissingItem[];
  bySection: CoverageBySection[];
  byProgram: CoverageByProgram[];
}

export async function fetchCoverage(
  termId: string,
  deptId: string,
): Promise<CoverageReport> {
  const { data } = await api.get('/v1/schedules/coverage', {
    params: { termId, deptId },
  });
  return data.data;
}

// ────────────────────────────────────────────
// Schedule Version — FR 5.1.8(a)
// ────────────────────────────────────────────

export interface ScheduleVersionSummary {
  versionId: string;
  versionNumber: number;
  termId: string;
  facultyId: string | null;
  finalizedBy: string | null;
  finalizedByName: string | null;
  lastModifiedAt: string;
  entryCount: number;
  capturedAt: string | null;
}

export interface ScheduleVersionEntry {
  schedule_id: string;
  section_id: string | null;
  section_code: string | null;
  subject_id: string;
  subject_code: string | null;
  subject_title: string | null;
  faculty_id: string | null;
  faculty_name: string | null;
  external_faculty_name: string | null;
  room_id: string | null;
  /**
   * External room name captured in the version snapshot
   * (2026-10-15). Read-only display only.
   */
  external_room_name: string | null;
  room_number: string | null;
  building: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  load_type: string | null;
  status: string;
  remarks: string | null;
  dept_id: string | null;
}

export interface ScheduleVersionSnapshot {
  snapshot_version: number;
  term_id: string;
  captured_at: string;
  captured_by: string | null;
  entry_count: number;
  entries: ScheduleVersionEntry[];
}

export interface ScheduleVersionDetail {
  versionId: string;
  termId: string;
  facultyId: string | null;
  versionNumber: number;
  snapshot: ScheduleVersionSnapshot | null;
  lastModifiedAt: string;
  finalizedBy: string | null;
  finalizedByName: string | null;
}

export interface VersionCompareResult {
  versionA: {
    versionId: string;
    versionNumber: number;
    finalizedByName: string | null;
    lastModifiedAt: string;
    entryCount: number;
  };
  versionB: {
    versionId: string;
    versionNumber: number;
    finalizedByName: string | null;
    lastModifiedAt: string;
    entryCount: number;
  };
  added: ScheduleVersionEntry[];
  removed: ScheduleVersionEntry[];
  moved: Array<{
    before: ScheduleVersionEntry;
    after: ScheduleVersionEntry;
    changes: string[];
  }>;
  unchanged: number;
}

export async function fetchVersions(
  termId: string,
): Promise<ScheduleVersionSummary[]> {
  const { data } = await api.get('/v1/schedules/versions', {
    params: { termId },
  });
  return data.data;
}

export async function fetchVersion(
  versionId: string,
): Promise<ScheduleVersionDetail> {
  const { data } = await api.get(`/v1/schedules/versions/${versionId}`);
  return data.data;
}

export async function compareVersions(
  versionAId: string,
  versionBId: string,
): Promise<VersionCompareResult> {
  const { data } = await api.get('/v1/schedules/versions/compare', {
    params: { a: versionAId, b: versionBId },
  });
  return data.data;
}