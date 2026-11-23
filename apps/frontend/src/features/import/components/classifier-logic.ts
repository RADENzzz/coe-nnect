import type { SemesterType } from '../types';

export interface ClassifierRow {
  key: string;
  yearLevel: number | null;
  semester: SemesterType | null;
  code: string;
  typedCode: string;
  title: string;
  isMinor: boolean;
  checked: boolean;
}

export interface ClassifierGroup {
  key: string;
  label: string;
  yearLevel: number | null;
  semester: SemesterType | null;
}

export function classifierGroupKeyOf(
  row: Pick<ClassifierRow, 'yearLevel' | 'semester'>,
): string {
  return `${row.yearLevel ?? 'any'}-${row.semester ?? 'any'}`;
}

export function getInitialClassifierGroupKey(
  groups: readonly Pick<ClassifierGroup, 'key'>[],
): string {
  return groups[0]?.key ?? 'all';
}

export function getClassifierRowsForGroup<
  T extends Pick<ClassifierRow, 'yearLevel' | 'semester'>,
>(rows: readonly T[], groupKey: string): readonly T[] {
  return groupKey === 'all'
    ? rows
    : rows.filter((row) => classifierGroupKeyOf(row) === groupKey);
}
