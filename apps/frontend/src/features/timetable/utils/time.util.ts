export type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';


export const DAYS: Day[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const OPERATING_HOURS = {
  start: '07:00',
  end: '19:00',
} as const;

export const SLOT_MINUTES = 30;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Returns the list of START times for slots within operating hours.
 *
 * generateTimeSlots('07:00', '19:00', 30)
 *   → ['07:00', '07:30', ..., '18:30']
 *
 * Note: the last start is 18:30 because the last slot spans 18:30–19:00.
 * If you need the boundary list including 19:00, see `generateSlotBoundaries`.
 */
export function generateTimeSlots(
  start = OPERATING_HOURS.start,
  end = OPERATING_HOURS.end,
  step = SLOT_MINUTES,
): string[] {
  const slots: string[] = [];
  let current = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  while (current < endMin) {
    slots.push(minutesToTime(current));
    current += step;
  }
  return slots;
}

/**
 * Returns the list of boundary times, INCLUSIVE of the operating-hours end.
 *
 * generateSlotBoundaries('07:00', '19:00', 30)
 *   → ['07:00', '07:30', ..., '18:30', '19:00']
 *
 * Use this when you need N+1 boundaries for N slots (e.g. grid cells, dropdowns
 * that allow 19:00 as a valid END time).
 */
export function generateSlotBoundaries(
  start = OPERATING_HOURS.start,
  end = OPERATING_HOURS.end,
  step = SLOT_MINUTES,
): string[] {
  const slots: string[] = [];
  let current = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  while (current <= endMin) {
    slots.push(minutesToTime(current));
    current += step;
  }
  return slots;
}

export function durationMinutes(start: string, end: string): number {
  return timeToMinutes(end) - timeToMinutes(start);
}

export function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const a1 = timeToMinutes(aStart);
  const a2 = timeToMinutes(aEnd);
  const b1 = timeToMinutes(bStart);
  const b2 = timeToMinutes(bEnd);
  return a1 < b2 && b1 < a2;
}

/**
 * "HH:MM" or "HH:MM:SS" → "h:MM AM/PM".
 * 7:00     → "7:00 AM"
 * 12:00    → "12:00 PM"
 * 13:30    → "1:30 PM"
 * 19:00    → "7:00 PM"
 */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * "HH:MM" → "h AM" / "h PM" when m === 0, else "h:MM AM/PM".
 * 7:00     → "7AM"
 * 7:30     → "7:30AM"
 * 13:00    → "1PM"
 */
export function formatTimeShort(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  if (m === 0) return `${displayH}${period}`;
  return `${displayH}:${String(m).padStart(2, '0')}${period}`;
}

/**
 * Same as formatTime, but inserts a thin space before AM/PM for grid labels.
 * 7:00   → "7:00 AM"
 * 12:00  → "12:00 PM"
 */
export function formatTimeLabel(time: string): string {
  return formatTime(time);
}