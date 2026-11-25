/** Year levels a prospectus can define. Keep in sync with the backend DTO. */
export const YEAR_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/**
 * One table per (year level, semester). The semester count comes from the
 * catalog, so dean-configured types such as 3rd automatically get their own
 * slots. Keep at least one slot so the grid stays usable before the catalog
 * loads.
 */
export function maxTables(semesterCount: number): number {
  return YEAR_LEVELS.length * Math.max(1, semesterCount);
}

export function nextFreeCombination(
  existing: { yearLevel: number | null; semester: string | null }[],
  semesters: { code: string }[],
): { yearLevel: number; semester: string } | null {
  for (const yearLevel of YEAR_LEVELS) {
    for (const { code: semester } of semesters) {
      if (
        !existing.some(
          (t) => t.yearLevel === yearLevel && t.semester === semester,
        )
      ) {
        return { yearLevel, semester };
      }
    }
  }
  return null;
}
