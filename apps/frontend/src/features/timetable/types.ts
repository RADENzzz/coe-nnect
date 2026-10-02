export type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type LoadType = 'lecture' | 'laboratory';

export interface ScheduleEntry {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectTitle: string;
  sectionId: string;
  sectionCode: string;
  facultyId: string;
  facultyName: string;
  roomId: string;
  roomNumber: string;
  day: Day;
  startTime: string;
  endTime: string;
  loadType: LoadType;
  deptId: string;
  deptColor: string;
  hasConflict?: boolean;
  hasWarning?: boolean;
}

export interface DropCellData {
  day: Day;
  startTime: string;
  endTime: string;
  cellId: string;
}

export interface GridMetrics {
  cellHeight: number;
  dayWidth: number;
  axisWidth: number;
  gridHeight: number;
}