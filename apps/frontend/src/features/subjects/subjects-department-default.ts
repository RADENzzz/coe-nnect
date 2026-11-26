const SUBJECT_FILTER_PARAMS = [
  'q',
  'dept',
  'room',
  'minor',
  'kind',
  'comp',
  'status',
  'ecat',
  'eyear',
  'eterm',
  'sort',
  'dir',
];

export function getSubjectsDefaultDepartment(
  role: string | undefined,
  deptId: string | null | undefined,
  explicitDepartment: string | null | undefined,
): string {
  return explicitDepartment ?? '';
}

export function restoreSubjectsDepartmentFilter(
  role: string | undefined,
  deptId: string | null | undefined,
  searchParams: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  for (const key of SUBJECT_FILTER_PARAMS) next.delete(key);
  return next;
}
