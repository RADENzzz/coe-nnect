import type { SemesterType } from './types';

/** Year levels a prospectus can define. Keep in sync with the backend DTO. */
export const YEAR_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export const SEMESTERS: { value: SemesterType; label: string }[] = [
  { value: '1st', label: '1st Semester' },
  { value: '2nd', label: '2nd Semester' },
  { value: 'summer', label: 'Summer' },
];

/**
 * One table per (year level, semester). This used to be hard-coded to 12
 * (4 years × 3 semesters), which made Summer impossible to add for 5- and
 * 6-year programs once the other pairs were mapped.
 */
export const MAX_TABLES = YEAR_LEVELS.length * SEMESTERS.length;

export const SEMESTER_ORDER: Record<SemesterType, number> = {
  '1st': 1,
  '2nd': 2,
  summer: 3,
};

export function nextFreeCombination(
  existing: { yearLevel: number; semester: SemesterType }[],
): { yearLevel: number; semester: SemesterType } | null {
  for (const yearLevel of YEAR_LEVELS) {
    for (const { value: semester } of SEMESTERS) {
      if (!existing.some((t) => t.yearLevel === yearLevel && t.semester === semester)) {
        return { yearLevel, semester };
      }
    }
  }
  return null;
}
