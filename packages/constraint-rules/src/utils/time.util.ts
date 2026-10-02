export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map((s) => parseInt(s, 10));
  return (h || 0) * 60 + (m || 0);
}

export function timesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}