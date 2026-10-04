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
  subject?: { subjectId: string; subjectCode: string; title: string };
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