export const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_ABBR: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
};

export interface PlotFormState {
  subjectId: string;
  section: string;
  facultyId: string;
  externalFacultyName: string;
  roomId: string;
  externalRoomName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  loadType: 'lecture' | 'laboratory' | 'other';
}

export const EMPTY_FORM: PlotFormState = {
  subjectId: '',
  section: '',
  facultyId: '',
  externalFacultyName: '',
  roomId: '',
  externalRoomName: '',
  dayOfWeek: 'Monday',
  startTime: '08:00',
  endTime: '09:30',
  loadType: 'lecture',
};

export interface MultiDayRow {
  day: (typeof DAYS)[number];
  enabled: boolean;
  startTime: string;
  endTime: string;
}
