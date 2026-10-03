/**
 * The complete set of data a rule needs to make its decision.
 * The backend scheduling service is responsible for populating this
 * before calling the engine — rules never touch the database.
 *
 * Shapes here are intentionally loose (plain objects, not ORM entities)
 * so this package stays free of TypeORM / Supabase coupling.
 */

export interface SubjectContext {
  subjectId: string;
  subjectCode: string;
  title: string;
  totalUnits: number;
  lectureUnits: number;
  labUnits: number;
  requiredRoomType: string | null;
  deptId: string;
}

export interface SectionContext {
  sectionCode: string | null;
  studentCount?: number;
}

export interface FacultyContext {
  facultyId: string;
  firstName: string;
  lastName: string;
  deptId: string | null;
  classification: 'regular' | 'part_time' | 'visiting_lecturer' | 'other';
  /** Designation release time in hours, if any (e.g. Dept Head = 3). */
  releaseHours?: number;
  /** Required weekly teaching hours after release. Defaults to 18. */
  requiredHours?: number;
  /** Subject IDs this faculty is qualified to teach. */
  qualifiedSubjectIds?: string[];
}

export interface RoomContext {
  roomId: string;
  roomNumber: string;
  building: string;
  roomType: string;
  capacity: number | null;
  deptId: string | null; // null => shared across all departments
  equipmentTags?: string[];
}

export interface TimeSlotContext {
  dayOfWeek: string;
  startTime: string; // 'HH:MM' or 'HH:MM:SS'
  endTime: string;
}

/**
 * A schedule row already in the DB. Used for overlap and
 * consecutive-block checks.
 */
export interface ScheduleEntryContext {
  scheduleId: string;
  termId: string;
  subjectId: string;
  facultyId: string | null;
  roomId: string | null;
  section: string | null;
  loadType: 'lecture' | 'laboratory' | 'other' | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

/**
 * One minor-subject block imported from another college.
 * Treated as an unmovable obstacle.
 */
export interface MinorBlockContext {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subjectCode?: string;
  sourceDept?: string;
}

/**
 * An IDP commitment (non-class time) that blocks the faculty.
 */
export interface FacultyCommitmentContext {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  title?: string;
}

/**
 * All tunable knobs, sourced from `scheduling_setting`.
 * Rules must read everything from here rather than hard-coding numbers.
 */
export interface SchedulingConfig {
  operatingHoursStart: string; // '07:00'
  operatingHoursEnd: string;   // '19:00'
  maxConsecutiveHours: number; // e.g. 3 (=> 2 blocks max)
  minBreakMinutes: number;     // e.g. 30
  lunchStart: string;          // '12:00'
  lunchEnd: string;            // '13:00'
  lunchBreakMinutes: number;   // 60
  lunchBreakOverlapMinutes: number; // 30
  visitingLecturerMaxHours: number; // 24
  defaultRequiredHours: number;     // 18
  releaseHoursGranularity: number;  // 3
  labSplitHours: number;            // 3
  lectureBlockMinutes: number;
  daytimePriorityEndHour: string;   // '17:30'
}

/**
 * The full context handed to every rule.
 * `excludeScheduleId` lets edit operations ignore the row being edited.
 */
export interface RuleContext {
  termId: string;
  subject: SubjectContext;
  section: SectionContext;
  faculty: FacultyContext | null;
  room: RoomContext | null;
  timeSlot: TimeSlotContext;
  /** The session type being plotted. Gates lab-only rules. */
  loadType: 'lecture' | 'laboratory' | 'other' | null;   // ← NEW
  existingSchedule: ScheduleEntryContext[];
  facultyCommitments: FacultyCommitmentContext[];
  minorBlocks: MinorBlockContext[];
  config: SchedulingConfig;
  excludeScheduleId?: string;
}