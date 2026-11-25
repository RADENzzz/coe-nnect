import type { SemesterTypeRecord } from '../api/semesters.api';

function bySortOrder(types: SemesterTypeRecord[]): SemesterTypeRecord[] {
  return [...types].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Active types for a dropdown, plus the current value when it is inactive so
 * editing an old row does not silently change its semester.
 */
export function buildSemesterOptions(
  types: SemesterTypeRecord[],
  currentCode?: string | null,
): SemesterTypeRecord[] {
  const options = bySortOrder(types).filter((type) => type.isActive);
  if (!currentCode) return options;

  const current = types.find((type) => type.code === currentCode);
  if (
    current &&
    !current.isActive &&
    !options.some((type) => type.code === current.code)
  ) {
    options.push(current);
  }
  return options;
}

/** Next type by sort order, wrapping from the last back to the first. */
export function nextSemesterCode(
  types: SemesterTypeRecord[],
  code: string,
): string | undefined {
  const ordered = bySortOrder(types);
  const index = ordered.findIndex((type) => type.code === code);
  if (index === -1) return undefined;
  return ordered[(index + 1) % ordered.length].code;
}
