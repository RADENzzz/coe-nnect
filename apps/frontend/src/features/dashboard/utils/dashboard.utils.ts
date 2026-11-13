import { timeToMinutes } from '../../timetable/utils/time.util';

export { timeToMinutes };

export const DAY_ABBR_TO_LABEL: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu',
  FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};

export const DAY_ORDER: Record<string, number> = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
  Friday: 5, Saturday: 6, Sunday: 7,
  MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7,
};

export const DAY_FULL_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export function relativeDay(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const then = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor(
    (startOfDay(now) - startOfDay(then)) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return 'Older';
}

export function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

export function humanizeRole(role: string): string {
  const map: Record<string, string> = {
    administrator: 'Administrator',
    college_dean: 'College Dean',
    college_secretary: 'College Secretary',
    department_head: 'Department Head',
    viewer: 'Viewer',
  };
  return map[role] ?? role;
}

// schedule.* accessors (RawSchedule may flatten or nest)
import type { RawSchedule } from '../../../api/schedule.api';
export function scheduleDay(s: RawSchedule): string {
  return s.dayOfWeek ?? s.timeSlot?.dayOfWeek ?? '';
}
export function scheduleStart(s: RawSchedule): string {
  return (s.startTime ?? s.timeSlot?.startTime ?? '').slice(0, 5);
}
export function scheduleEnd(s: RawSchedule): string {
  return (s.endTime ?? s.timeSlot?.endTime ?? '').slice(0, 5);
}

export interface DepartmentSnapshotStats {
  faculty: number;
  rooms: number;
  sections: number;
  weeklyHours: number;
  unassignedFaculty: number;
  missingRoom: number;
  /** Rows missing an instructor, a room, or both — counted once per row. */
  gaps: number;
}

/**
 * Department-level workload snapshot for the dashboard.
 *
 * External faculty / rooms are counted as assignments (they are real people
 * and spaces, just not in the internal tables). A row is only flagged as a
 * gap when neither an internal nor an external value is present.
 */
export function computeDepartmentSnapshot(
  schedules: RawSchedule[],
): DepartmentSnapshotStats {
  const faculty = new Set<string>();
  const rooms = new Set<string>();
  const sections = new Set<string>();
  let minutes = 0;
  let unassignedFaculty = 0;
  let missingRoom = 0;
  let gaps = 0;

  for (const row of schedules) {
    const hasFaculty = Boolean(
      row.facultyId || row.externalFacultyName?.trim(),
    );
    const hasRoom = Boolean(row.roomId || row.externalRoomName?.trim());

    if (row.facultyId) faculty.add(`f:${row.facultyId}`);
    else if (row.externalFacultyName) {
      faculty.add(`x:${row.externalFacultyName.trim().toLowerCase()}`);
    } else {
      unassignedFaculty += 1;
    }

    if (row.roomId) rooms.add(`r:${row.roomId}`);
    else if (row.externalRoomName) {
      rooms.add(`x:${row.externalRoomName.trim().toLowerCase()}`);
    } else {
      missingRoom += 1;
    }

    if (!hasFaculty || !hasRoom) gaps += 1;

    if (row.section) sections.add(row.section.trim());

    if (scheduleDay(row)) {
      const start = timeToMinutes(scheduleStart(row));
      const end = timeToMinutes(scheduleEnd(row));
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        minutes += end - start;
      }
    }
  }

  return {
    faculty: faculty.size,
    rooms: rooms.size,
    sections: sections.size,
    weeklyHours: Math.round((minutes / 60) * 10) / 10,
    unassignedFaculty,
    missingRoom,
    gaps,
  };
}