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
): string {
  if (yearLevel == null && semester == null) return 'Any year / term';
  if (yearLevel == null) return `Any year · ${semester}`;
  if (semester == null) return `Year ${yearLevel} · any term`;
  return `Year ${yearLevel} · ${semester}`;
}

/**
 * Label for a PDF table. Regular tables are always year/term specific;
 * elective tables may be yearless and are marked as such.
 */
export function tableLabel(
  table: Pick<
    ProspectusPdfTable,
    'tableKind' | 'yearLevel' | 'semester' | 'label'
  >,
): string {
  const kind = table.tableKind ?? 'regular';
  if (kind === 'elective') {
    const identity = yearTermLabel(table.yearLevel, table.semester);
    return identity === 'Any year / term'
      ? 'Elective · any year / term'
      : `Elective · ${identity}`;
  }
  return yearTermLabel(table.yearLevel, table.semester);
}

/** Short label for compact chips and quick-nav buttons. */
export function shortTableLabel(
  table: Pick<ProspectusPdfTable, 'tableKind' | 'yearLevel' | 'semester'>,
): string {
  const kind = table.tableKind ?? 'regular';
  if (kind === 'elective') {
    if (table.yearLevel == null && table.semester == null) return 'Elective';
    return `Elective · ${yearTermLabel(table.yearLevel, table.semester)}`;
  }
  return yearTermLabel(table.yearLevel, table.semester);
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
