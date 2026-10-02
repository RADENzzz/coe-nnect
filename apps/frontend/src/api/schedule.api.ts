import { api } from './client';

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
  dayOfWeek: string | null;      // ← NEW
  startTime: string | null;      // ← NEW
  endTime: string | null;        // ← NEW
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

export async function fetchActiveTerm(): Promise<Term | null> {
  const { data } = await api.get('/v1/schedules/active-term');
  return data.data;
}

export async function fetchSchedules(termId?: string): Promise<RawSchedule[]> {
  const params = termId ? { termId } : {};
  const { data } = await api.get('/v1/schedules', { params });
  return data.data;
}

export async function plotSubject(payload: {
  termId: string;
  subjectId: string;
  facultyId?: string;
  roomId?: string;
  timeslotId?: string;
  section?: string;
  loadType?: 'lecture' | 'laboratory' | 'other';
}): Promise<RawSchedule> {
  const { data } = await api.post('/v1/schedules/plot', payload);
  return data.data;
}

export async function deleteSchedule(id: string): Promise<void> {
  await api.delete(`/v1/schedules/${id}`);
}

export async function updateScheduleStatus(
  id: string,
  status: 'draft' | 'review' | 'finalized' | 'published',
): Promise<RawSchedule> {
  const { data } = await api.patch(`/v1/schedules/${id}/status`, { status });
  return data.data;
}