import type { SemesterTypeRecord } from '../../../../api/semesters.api';
import type { CreateTermInput, Term } from '../../../../api/terms.api';
import type { FieldError } from '../../../../components/ui/form-errors';
import { matchSemesterType } from '../../../../lib/semester-match';
import {
  initialActiveSemesterCode,
  nextActiveSemesterCode,
} from '../term-semester-suggestion';

/** How many rows the System Settings preview shows. */
export const COMPACT_TERM_LIMIT = 5;

/** Rows per page on the full term management page. */
export const TERM_PAGE_SIZE = 10;

const EMPTY_FORM: CreateTermInput = {
  termName: '1st Semester',
  schoolYear: '',
  startDate: '',
  endDate: '',
  semester: '',
  setActive: false,
};

/**
 * Terms are managed from the Dean area, where only these two roles may write.
 * Every other role gets a read-only view.
 */
export function canWriteTerms(
  profile: { role?: string | null } | null,
): boolean {
  const role = profile?.role;
  return role === 'college_dean' || role === 'college_secretary';
}

/**
 * Defaults for a new term: continue from the latest term's school year and
 * dates, suggest the next active catalog type, and only auto-activate when no
 * term is currently active.
 */
export function buildTermFormDefaults(
  terms: Term[],
  types: SemesterTypeRecord[],
  labelFor: (code: string) => string,
): CreateTermInput {
  const latest = [...terms].sort((a, b) => {
    const byStart = (b.startDate ?? '').localeCompare(a.startDate ?? '');
    return byStart !== 0
      ? byStart
      : b.schoolYear.localeCompare(a.schoolYear);
  })[0];
  if (latest) {
    const [start, end] = latest.schoolYear.split('-');
    const nextSy =
      start && end
        ? `${Number(start) + 1}-${Number(end) + 1}`
        : latest.schoolYear;
    const shiftDate = (iso: string | null) => {
      if (!iso) return '';
      const d = new Date(`${iso}T00:00:00`);
      if (Number.isNaN(d.getTime())) return '';
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    };
    // Suggest the next catalog type after the latest term's semester.
    const inferred = matchSemesterType(latest.termName, types)?.code;
    const nextSemester = nextActiveSemesterCode(types, inferred) ?? '';
    return {
      termName: nextSemester ? labelFor(nextSemester) : latest.termName,
      schoolYear: nextSy,
      startDate: shiftDate(latest.startDate),
      endDate: shiftDate(latest.endDate),
      semester: nextSemester,
      setActive: terms.length > 0 && !terms.some((t) => t.isActive),
    };
  }
  const defaultSemester = initialActiveSemesterCode(types) ?? '';
  return {
    ...EMPTY_FORM,
    termName: defaultSemester ? labelFor(defaultSemester) : EMPTY_FORM.termName,
    semester: defaultSemester,
  };
}

/** Field-level validation shared by blur handling and form submission. */
export function collectTermFormErrors(form: CreateTermInput): FieldError[] {
  const problems: FieldError[] = [];
  if (!form.termName.trim()) {
    problems.push({ field: 'termName', message: 'Choose a term name.' });
  }
  if (!form.schoolYear.trim()) {
    problems.push({ field: 'schoolYear', message: 'Enter a school year.' });
  }
  if (!form.semester) {
    problems.push({ field: 'semester', message: 'Choose a semester.' });
  }
  if (form.startDate && form.endDate && form.endDate <= form.startDate) {
    problems.push({
      field: 'endDate',
      message: 'End date must be after the start date.',
    });
  }
  return problems;
}
