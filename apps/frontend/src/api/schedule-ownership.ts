export interface ScheduleOwnershipRow {
  /** Schedule row field used by live API responses. */
  deptId?: string | number | null;
  /** Schedule row field used by version snapshots. */
  dept_id?: string | number | null;
  /** Catalog owner. Only a fallback for legacy rows with no row department. */
  subject?: { deptId?: string | number | null } | null;
}

/**
 * A schedule belongs to the department that plotted it, not necessarily to
 * the department that catalogs the subject. PATHFit can be cataloged by CPE
 * while an EE head plots it into the EE schedule, so the row's own department
 * is authoritative. Legacy rows without one still fall back to the catalog.
 */
export function getScheduleDeptId(row: ScheduleOwnershipRow): string {
  const rowDeptId = row.deptId ?? row.dept_id;
  if (rowDeptId != null && String(rowDeptId).trim() !== '') {
    return String(rowDeptId);
  }
  return row.subject?.deptId != null ? String(row.subject.deptId) : '';
}
