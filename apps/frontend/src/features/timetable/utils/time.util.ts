export type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

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

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatTimeShort(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  if (m === 0) return `${displayH}${period}`;
  return `${displayH}:${String(m).padStart(2, '0')}${period}`;
}