export interface SessionsPerWeekValue {
  lectureSessionsPerWeek?: number | null;
  labSessionsPerWeek?: number | null;
}

export interface SessionsPerWeekPatch {
  lectureSessionsPerWeek: number;
  labSessionsPerWeek: number;
}

export const SESSION_LIMITS = {
  lecture: { min: 1, max: 5 },
  lab: { min: 1, max: 3 },
} as const;

function positiveCount(value: number | null | undefined): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function formatSessionsPerWeek(
  value: SessionsPerWeekValue | null | undefined,
): string {
  const lecture = positiveCount(value?.lectureSessionsPerWeek);
  const lab = positiveCount(value?.labSessionsPerWeek);
  const parts: string[] = [];

  if (lecture > 0) parts.push(`${lecture} lec`);
  if (lab > 0) parts.push(`${lab} lab`);

  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function buildSessionsPerWeekPatch(
  draft: SessionsPerWeekPatch,
): SessionsPerWeekPatch {
  return {
    lectureSessionsPerWeek: draft.lectureSessionsPerWeek,
    labSessionsPerWeek: draft.labSessionsPerWeek,
  };
}
