import type { PublicScheduleEntry } from '@/api/public.api';

/** Days shown in the weekly grids, in display order. */
export const WEEK_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const ALL_DAYS = [...WEEK_DAYS, 'Sunday'] as const;

export const DAY_ORDER: Record<string, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

export function scheduleFaculty(entry: PublicScheduleEntry): string {
  return entry.facultyName ?? entry.externalFacultyName ?? 'Unassigned';
}

export function scheduleRoom(entry: PublicScheduleEntry): string {
  return entry.roomNumber ?? entry.externalRoomName ?? '—';
}

export function scheduleRoomKey(entry: PublicScheduleEntry): string {
  const room = entry.roomNumber ?? entry.externalRoomName ?? '';
  return `${room}||${entry.building ?? ''}`;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function formatTimeLabel(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTimeLabel(start)}–${formatTimeLabel(end)}`;
}

export function yearLabel(year: number | null): string {
  if (year == null) return 'Year not set';
  const suffix =
    year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th';
  return `${year}${suffix} Year`;
}
