import type { ProspectusPdfTable, SemesterType } from '../types';

/**
 * Human label for a year/term pair.
 *
 * Elective tables are optioned subjects, so they may not be tied to a year or
 * term at all. "Any year / term" makes that explicit instead of showing
 * "Year null · null".
 */
export function yearTermLabel(
  yearLevel: number | null,
  semester: SemesterType | null,
  /** Catalog display text; falls back to the stored code. */
  semesterText?: string | null,
): string {
  const term = semesterText ?? semester;
  if (yearLevel == null && term == null) return 'Any year / term';
  if (yearLevel == null) return `Any year · ${term}`;
  if (term == null) return `Year ${yearLevel} · any term`;
  return `Year ${yearLevel} · ${term}`;
}

/**
 * Label for a PDF table. Regular tables are always year/term specific.
 *
 * Elective tables are groups of optioned subjects, so they use the group
 * heading printed in the PDF (for example "SOFTWARE DEVELOPMENT") as their
 * top name. Tables created before names were captured still fall back to the
 * year/term description.
 */
export function tableLabel(
  table: Pick<
    ProspectusPdfTable,
    'tableKind' | 'yearLevel' | 'semester' | 'label'
  >,
  semesterText?: string | null,
): string {
  const kind = table.tableKind ?? 'regular';
  if (kind === 'elective') {
    const stored = table.label?.trim();
    if (stored) return stored;
    const identity = yearTermLabel(
      table.yearLevel,
      table.semester,
      semesterText,
    );
    return identity === 'Any year / term'
      ? 'Elective · any year / term'
      : `Elective · ${identity}`;
  }
  return yearTermLabel(table.yearLevel, table.semester, semesterText);
}

/** Short label for compact chips and quick-nav buttons. */
export function shortTableLabel(
  table: Pick<
    ProspectusPdfTable,
    'tableKind' | 'yearLevel' | 'semester' | 'label'
  >,
  semesterText?: string | null,
): string {
  const kind = table.tableKind ?? 'regular';
  if (kind === 'elective') {
    const stored = table.label?.trim();
    if (stored) return stored;
    if (table.yearLevel == null && table.semester == null) return 'Elective';
    return `Elective · ${yearTermLabel(
      table.yearLevel,
      table.semester,
      semesterText,
    )}`;
  }
  return yearTermLabel(table.yearLevel, table.semester, semesterText);
}

/** True when a table has the year/term identity a regular table needs. */
export function hasYearTerm(
  table: Pick<ProspectusPdfTable, 'yearLevel' | 'semester'>,
): table is Pick<ProspectusPdfTable, 'yearLevel' | 'semester'> & {
  yearLevel: number;
  semester: SemesterType;
} {
  return table.yearLevel != null && table.semester != null;
}
