import type { SemesterTypeRecord } from '../../../api/semesters.api';

/**
 * Next selectable type after `currentCode`, ordered by sort order and wrapping
 * around the active types only. Inactive types are never suggested for a new
 * term; an unknown or inactive current code starts at the first active type.
 */
export function nextActiveSemesterCode(
  types: SemesterTypeRecord[],
  currentCode?: string | null,
): string | undefined {
  const active = types
    .filter((type) => type.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (active.length === 0) return undefined;

  const index = active.findIndex((type) => type.code === currentCode);
  if (index === -1) return active[0].code;
  return active[(index + 1) % active.length].code;
}
