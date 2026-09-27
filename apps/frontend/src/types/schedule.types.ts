export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type LoadType = 'lecture' | 'laboratory';

export interface ScheduleEntry {
  id: string;
  termId: string;
  subjectId: string;
  subjectCode: string;
  sectionId: string;
  sectionCode: string;
  facultyId?: string;
  roomId?: string;
  roomNumber?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  loadType: LoadType;
  contactHours: number;
  isFinalized: boolean;
}