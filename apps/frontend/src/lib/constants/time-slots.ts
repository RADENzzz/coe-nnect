export const OPERATING_HOURS = {
  start: '07:00',
  end: '19:00',
} as const;

export const TIME_SLOT_MINUTES = 30;
export const BLOCK_DURATIONS = {
  LECTURE: 90,
  LAB: 180,
} as const;

export function generateTimeSlots(
  start = OPERATING_HOURS.start,
  end = OPERATING_HOURS.end,
  stepMinutes = TIME_SLOT_MINUTES,
): string[] {
  const slots: string[] = [];
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  let current = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (current < endMinutes) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    current += stepMinutes;
  }
  return slots;
}