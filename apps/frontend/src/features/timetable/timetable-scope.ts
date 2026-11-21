import type { ViewMode } from './types';

export interface TimetableScopeInput {
  role?: string;
  deptId?: string;
  viewMode: ViewMode;
  viewDeptId: string;
}

export const TIMETABLE_VIEW_TABS: Array<{
  value: ViewMode;
  label: string;
}> = [
  { value: 'master', label: 'Master' },
  { value: 'byDepartment', label: 'Departments' },
  { value: 'byRoom', label: 'Rooms' },
  { value: 'byFaculty', label: 'Faculty' },
];

export function visibleTimetableViewTabs(
  role?: string,
): Array<{ value: ViewMode; label: string }> {
  return TIMETABLE_VIEW_TABS;
}

const DEPARTMENT_DOT_PALETTE = [
  'bg-rose-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-cyan-500',
  'bg-lime-500',
  'bg-fuchsia-500',
  'bg-sky-500',
  'bg-orange-500',
] as const;

export function departmentTabTone(code: string): { dot: string } {
  const normalized = code.trim().toUpperCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return { dot: DEPARTMENT_DOT_PALETTE[hash % DEPARTMENT_DOT_PALETTE.length] };
}

export function normalizeTimetableScope({
  role,
  deptId,
  viewMode,
  viewDeptId,
}: TimetableScopeInput): { viewMode: ViewMode; viewDeptId: string } {
  if (
    role === 'department_head' &&
    deptId &&
    viewMode === 'byDepartment' &&
    !viewDeptId
  ) {
    return { viewMode: 'byDepartment', viewDeptId: deptId };
  }
  return { viewMode, viewDeptId };
}

export function resetTimetableScope(
  role?: string,
  deptId?: string,
): { viewMode: ViewMode; viewDeptId: string } {
  if (role === 'department_head' && deptId) {
    return { viewMode: 'byDepartment', viewDeptId: deptId };
  }
  return { viewMode: 'master', viewDeptId: '' };
}

export function filterEntriesByRole<
  T extends { deptId?: string | null },
>(
  entries: T[],
  role?: string,
  deptId?: string,
): T[] {
  return entries;
}

export interface UnresolvedElectiveSubject {
  subjectId: string;
  isElective: boolean;
  isPlaceholder: boolean;
  subjectCode: string;
  deptId?: string;
}

export function visibleUnresolvedElectives<
  T extends UnresolvedElectiveSubject,
>(
  subjects: T[],
  role?: string,
  deptId?: string,
): T[] {
  if (role !== 'department_head' || !deptId) return [];
  return subjects.filter(
    (subject) =>
      String(subject.deptId ?? '') === String(deptId),
  );
}
