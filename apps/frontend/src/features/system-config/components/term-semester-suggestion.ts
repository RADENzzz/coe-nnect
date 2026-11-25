import type { SemesterTypeRecord } from '../../../api/semesters.api';
import { buildSemesterOptions } from '../../../hooks/semester-type-options.ts';

/**
 * Default type for the first term when no terms exist yet. Only active types
 * are eligible: an inactive `1st` would be accepted by the form but rejected
 * by the backend's assertUsable, leaving term creation blocked.
 */
export function initialActiveSemesterCode(
  types: SemesterTypeRecord[],
): string | undefined {
  return buildSemesterOptions(types)[0]?.code;
}

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
