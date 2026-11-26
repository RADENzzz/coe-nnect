import { BadRequestException } from '@nestjs/common';

/**
 * Resolve the department scope for a version comparison. Department heads are
 * always confined to their own department; other readers may request a scope
 * explicitly or see all departments.
 */
export function resolveVersionDeptId(
  actor: { role?: string | null; deptId?: string | number | null } | null | undefined,
  requested?: string | null,
): string | null {
  if (actor?.role === 'department_head') {
    if (actor.deptId == null || String(actor.deptId).trim() === '') {
      throw new BadRequestException(
        'Department head actor is missing a department id for a live source',
      );
    }
    return String(actor.deptId);
  }

  if (requested == null || String(requested).trim() === '') {
    return null;
  }
  return String(requested);
}

/** Keep only rows matching an active scope; an unscoped compare keeps every row. */
export function filterVersionEntries<T extends { dept_id?: string | number | null }>(
  entries: T[],
  deptId: string | null,
): T[] {
  if (deptId === null) return [...entries];
  return entries.filter((entry) => String(entry.dept_id) === deptId);
}
