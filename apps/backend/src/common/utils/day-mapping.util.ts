/**
 * Mapping between the 3-letter day abbreviations used by the frontend
 * (MON, TUE, ...) and the full day names used in the database enum
 * (Monday, Tuesday, ...).
 *
 * Every API boundary that touches day names must convert:
 *   - Frontend → Backend: abbrToFull
 *   - Backend → Frontend: fullToAbbr
 */

export type DayAbbr = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type DayFull =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export const ABBR_TO_FULL: Record<DayAbbr, DayFull> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

export const FULL_TO_ABBR: Record<DayFull, DayAbbr> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'SUN',
};

export function abbrToFull(abbr: string): DayFull {
  const key = abbr.toUpperCase() as DayAbbr;
  const result = ABBR_TO_FULL[key];
  if (!result) throw new Error(`Unknown day abbreviation: ${abbr}`);
  return result;
}

export function fullToAbbr(full: string): DayAbbr {
  const key = full as DayFull;
  const result = FULL_TO_ABBR[key];
  if (!result) throw new Error(`Unknown full day name: ${full}`);
  return result;
}

export function abbrToFullSafe(abbr: string | null | undefined): DayFull | null {
  if (!abbr) return null;
  return ABBR_TO_FULL[abbr.toUpperCase() as DayAbbr] ?? null;
}

export function fullToAbbrSafe(full: string | null | undefined): DayAbbr | null {
  if (!full) return null;
  return FULL_TO_ABBR[full as DayFull] ?? null;
}