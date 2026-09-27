export const DAYS: Day[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const OPERATING_HOURS = {
  start: '07:00',
  end: '19:00',
} as const;

export const SLOT_MINUTES = 30;

/**
 * Convert "HH:MM" to minutes since midnight.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convert minutes since midnight to "HH:MM".
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Generate all 30-minute slot boundaries between start and end.
 * Example: "07:00" → "19:00" returns ["07:00", "07:30", ..., "18:30"]
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
 * Duration in minutes between two times.
 */
export function durationMinutes(start: string, end: string): number {
  return timeToMinutes(end) - timeToMinutes(start);
}

/**
 * Do two time ranges overlap?
 * Ranges are [start, end) — half-open.
 */
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
 * Format "14:30" → "2:30 PM" for display.
 */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}