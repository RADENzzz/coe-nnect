export type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
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
  building: string;
  day: Day;
  startTime: string;
  endTime: string;
  loadType: LoadType;
  deptId: string;
  deptColor: string;
  color: string;
  hasConflict?: boolean;
  hasWarning?: boolean;
  status?: 'draft' | 'review' | 'finalized' | 'published';
  remarks?: string | null;

  // ── Flag fields ──
  flagged?: boolean;
  flaggedBy?: string | null;
  flaggedAt?: string | null;
  flagReason?: string | null;
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