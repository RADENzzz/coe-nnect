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
  externalFacultyName: string | null;
  roomId: string;
  roomNumber: string;
  /**
   * External room name (2026-10-15).
   *
   * Set when the row's room is not in the internal `room` table.
   * The grid and drawer show this in place of `roomNumber`.
   * May be null when the row uses only an internal room.
   */
  externalRoomName: string | null;
  pendingFacultyRequestId: string | null;
  pendingFacultyDeptId: string | null;
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

  // ── Version-view marker ──
  // Set only while rendering a historical version snapshot in
  // read-only mode. Undefined for the live/latest schedule.
  versionContext?: {
    versionId: string;
    versionNumber: number;
  };
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

export type ViewMode = 'master' | 'byDepartment' | 'byRoom' | 'byFaculty';
export type SubMode = 'all' | 'bySection' | 'byFaculty';
export type LayoutMode = 'agenda' | 'grid';