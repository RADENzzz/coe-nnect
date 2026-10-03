import type {
  RuleContext,
  FacultyContext,
  RoomContext,
  SubjectContext,
  SectionContext,
  TimeSlotContext,
  ScheduleEntryContext,
  MinorBlockContext,
  FacultyCommitmentContext,
  SchedulingConfig,
} from '../types/rule-context.type';

const defaultSubject: SubjectContext = {
  subjectId: 's1',
  subjectCode: 'CPE 101',
  title: 'Programming Logic & Design',
  totalUnits: 3,
  lectureUnits: 3,
  labUnits: 0,
  requiredRoomType: null,
  deptId: 'd1',
};

const defaultSection: SectionContext = { sectionCode: '1A' };

const defaultFaculty: FacultyContext = {
  facultyId: 'f1',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  deptId: 'd1',
  classification: 'regular',
  requiredHours: 18,
  qualifiedSubjectIds: ['s1'],
  assignedHours: 0,
  assignedUnits: 0,
};

const defaultRoom: RoomContext = {
  roomId: 'r1',
  roomNumber: '206',
  building: 'CE',
  roomType: 'lecture_room',
  capacity: 40,
  deptId: 'd1',
};

const defaultTimeSlot: TimeSlotContext = {
  dayOfWeek: 'Monday',
  startTime: '08:00',
  endTime: '09:30',
};

const defaultConfig: SchedulingConfig = {
  operatingHoursStart: '07:00',
  operatingHoursEnd: '19:00',
  maxConsecutiveHours: 3,
  minBreakMinutes: 30,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  lunchBreakMinutes: 60,
  lunchBreakOverlapMinutes: 30,
  visitingLecturerMaxHours: 24,
  defaultRequiredHours: 18,
  releaseHoursGranularity: 3,
  labSplitHours: 3,
  lectureBlockMinutes: 90,
  daytimePriorityEndHour: '17:30',
};

export interface BaseContextOverrides {
  termId?: string;
  subject?: Partial<SubjectContext>;
  section?: Partial<SectionContext>;
  faculty?: Partial<FacultyContext> | null;
  room?: Partial<RoomContext> | null;
  timeSlot?: Partial<TimeSlotContext>;
  loadType?: 'lecture' | 'laboratory' | 'other' | null;   // ← NEW
  existingSchedule?: ScheduleEntryContext[];
  facultyCommitments?: FacultyCommitmentContext[];
  minorBlocks?: MinorBlockContext[];
  config?: Partial<SchedulingConfig>;
  excludeScheduleId?: string;
}

export function baseContext(overrides: BaseContextOverrides = {}): RuleContext {
  const faculty =
    overrides.faculty === null
      ? null
      : { ...defaultFaculty, ...(overrides.faculty ?? {}) };

  const room =
    overrides.room === null ? null : { ...defaultRoom, ...(overrides.room ?? {}) };

  return {
    termId: overrides.termId ?? 't1',
    subject: { ...defaultSubject, ...(overrides.subject ?? {}) },
    section: { ...defaultSection, ...(overrides.section ?? {}) },
    faculty,
    room,
    timeSlot: { ...defaultTimeSlot, ...(overrides.timeSlot ?? {}) },
    loadType: overrides.loadType ?? 'lecture',              // ← NEW
    existingSchedule: overrides.existingSchedule ?? [],
    facultyCommitments: overrides.facultyCommitments ?? [],
    minorBlocks: overrides.minorBlocks ?? [],
    config: { ...defaultConfig, ...(overrides.config ?? {}) },
    excludeScheduleId: overrides.excludeScheduleId,
  };
}