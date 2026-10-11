import { api } from './client';

// ────────────────────────────────────────────
// Core types
// ────────────────────────────────────────────

export interface RawSchedule {
  scheduleId: string;
  termId: string;
  subjectId: string;
  facultyId: string | null;
  roomId: string | null;
  timeslotId: string | null;
  section: string | null;
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

export interface AutoGenerateResult {
  success: boolean;
  message?: string;
  scheduleCount?: number;
  solveTimeSeconds?: number | null;
  warnings?: Array<{ ruleId: string; ruleName: string; reason: string }>;
  failures?: Array<{ ruleId: string; ruleName: string; reason: string }>;
  unscheduled?: UnscheduledBlock[];
  roomDeficits?: RoomDeficit[];   // ← NEW
}

export async function autoGenerateSchedule(
  termId: string,
  deptId: string,
): Promise<AutoGenerateResult> {
  const { data } = await api.post(
    '/v1/schedules/auto-generate',
    { termId, deptId },
    { timeout: 120_000 }, // 2 min — CP-SAT can take up to 60s
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
  roomId?: string;
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
  roomId?: string;
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

export async function validatePlot(payload: ValidatePlotPayload): Promise<ValidateResult> {
  const { data } = await api.post('/v1/schedules/validate', payload);
  return data.data;
}

export async function updateSchedule(
  id: string,
  payload: {
    dayOfWeek?: string;
    startTime?: string;
    endTime?: string;
    roomId?: string;
    facultyId?: string;
  },
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