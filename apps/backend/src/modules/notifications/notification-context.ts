/**
 * Best-effort lookups that turn bare foreign-key ids into the human-readable
 * labels shown in notification titles, bodies, and payload chips.
 *
 * Notifications are fire-and-forget: a lookup failure (missing table, RLS
 * denial, or a partial test double) must never break the business operation
 * that fired the notification. Every helper therefore swallows errors and
 * returns `null` fields.
 */

export interface DeptLabel {
  deptCode: string | null;
  deptName: string | null;
}

export interface SubjectLabel {
  subjectCode: string | null;
  subjectTitle: string | null;
}

export interface RequestContext {
  requestingDeptCode: string | null;
  requestingDeptName: string | null;
  targetDeptCode: string | null;
  targetDeptName: string | null;
  subjectCode: string | null;
  subjectTitle: string | null;
  termName: string | null;
}

const EMPTY_DEPT: DeptLabel = { deptCode: null, deptName: null };
const EMPTY_SUBJECT: SubjectLabel = {
  subjectCode: null,
  subjectTitle: null,
};
const EMPTY_REQUEST_CONTEXT: RequestContext = {
  requestingDeptCode: null,
  requestingDeptName: null,
  targetDeptCode: null,
  targetDeptName: null,
  subjectCode: null,
  subjectTitle: null,
  termName: null,
};

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** `department.dept_code` / `dept_name` for a department id. */
export async function loadDeptLabel(
  db: any,
  deptId: unknown,
): Promise<DeptLabel> {
  if (!db || isBlank(deptId)) return { ...EMPTY_DEPT };
  try {
    const { data } = await db
      .from('department')
      .select('dept_code, dept_name')
      .eq('dept_id', deptId)
      .maybeSingle();
    return {
      deptCode: data?.dept_code ?? null,
      deptName: data?.dept_name ?? null,
    };
  } catch {
    return { ...EMPTY_DEPT };
  }
}

/** `subject.subject_code` / `title` for a subject id. */
export async function loadSubjectLabel(
  db: any,
  subjectId: unknown,
): Promise<SubjectLabel> {
  if (!db || isBlank(subjectId)) return { ...EMPTY_SUBJECT };
  try {
    const { data } = await db
      .from('subject')
      .select('subject_code, title')
      .eq('subject_id', subjectId)
      .maybeSingle();
    return {
      subjectCode: data?.subject_code ?? null,
      subjectTitle: data?.title ?? null,
    };
  } catch {
    return { ...EMPTY_SUBJECT };
  }
}

/** `term.term_name` for a term id. */
export async function loadTermName(
  db: any,
  termId: unknown,
): Promise<string | null> {
  if (!db || isBlank(termId)) return null;
  try {
    const { data } = await db
      .from('term')
      .select('term_name')
      .eq('term_id', termId)
      .maybeSingle();
    return data?.term_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Everything a cross-department faculty request needs to read well:
 * both department codes, the subject code/title, and the term name.
 */
export async function loadRequestContext(
  db: any,
  input: {
    requestingDeptId?: unknown;
    targetDeptId?: unknown;
    subjectId?: unknown;
    termId?: unknown;
  },
): Promise<RequestContext> {
  if (!db) return { ...EMPTY_REQUEST_CONTEXT };

  const [requesting, target, subject, termName] = await Promise.all([
    loadDeptLabel(db, input.requestingDeptId),
    loadDeptLabel(db, input.targetDeptId),
    loadSubjectLabel(db, input.subjectId),
    loadTermName(db, input.termId),
  ]);

  return {
    requestingDeptCode: requesting.deptCode,
    requestingDeptName: requesting.deptName,
    targetDeptCode: target.deptCode,
    targetDeptName: target.deptName,
    subjectCode: subject.subjectCode,
    subjectTitle: subject.subjectTitle,
    termName,
  };
}

/** "CPE → EE" when both codes are known, otherwise the singular label. */
export function deptTransition(
  requestingDeptCode: string | null,
  targetDeptCode: string | null,
): string | null {
  if (requestingDeptCode && targetDeptCode) {
    return `${requestingDeptCode} → ${targetDeptCode}`;
  }
  return requestingDeptCode ?? targetDeptCode ?? null;
}
