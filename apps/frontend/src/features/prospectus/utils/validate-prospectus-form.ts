import type { FieldError } from '../../../components/ui/form-errors';

export interface ProspectusFormValues {
  programId: string;
  subjectId: string;
  yearLevel: string | number;
  semester: string;
  lectureSessionsPerWeek: string | number;
  lectureMinutesPerSession: string | number;
  labSessionsPerWeek: string | number;
  labMinutesPerSession: string | number;
}

function numberValue(value: string | number): number {
  if (typeof value === 'string' && !value.trim()) return NaN;
  return Number(value);
}

function inRange(value: string | number, min: number, max: number): boolean {
  const number = numberValue(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

/** Report every invalid prospectus field at once, in form order. */
export function validateProspectusForm(
  input: ProspectusFormValues,
): FieldError[] {
  const errors: FieldError[] = [];

  if (!String(input.programId).trim()) {
    errors.push({ field: 'programId', message: 'Choose a program.' });
  }
  if (!String(input.subjectId).trim()) {
    errors.push({ field: 'subjectId', message: 'Choose a subject.' });
  }
  if (!inRange(input.yearLevel, 1, 6)) {
    errors.push({ field: 'yearLevel', message: 'Choose a year level between 1 and 6.' });
  }
  if (!String(input.semester).trim()) {
    errors.push({ field: 'semester', message: 'Choose a semester.' });
  }
  if (!inRange(input.lectureSessionsPerWeek, 1, 5)) {
    errors.push({
      field: 'lectureSessionsPerWeek',
      message: 'Lecture sessions must be between 1 and 5.',
    });
  }
  if (!inRange(input.lectureMinutesPerSession, 30, 240)) {
    errors.push({
      field: 'lectureMinutesPerSession',
      message: 'Lecture minutes must be between 30 and 240.',
    });
  }
  if (!inRange(input.labSessionsPerWeek, 1, 3)) {
    errors.push({
      field: 'labSessionsPerWeek',
      message: 'Lab sessions must be between 1 and 3.',
    });
  }
  if (!inRange(input.labMinutesPerSession, 60, 300)) {
    errors.push({
      field: 'labMinutesPerSession',
      message: 'Lab minutes must be between 60 and 300.',
    });
  }

  return errors;
}
