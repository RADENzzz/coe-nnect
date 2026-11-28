import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service';
import {
  DEFAULT_SCHEDULING_CONFIG,
  type RuleContext,
  type SubjectContext,
  type SectionContext,
  type FacultyContext,
  type RoomContext,
  type TimeSlotContext,
  type ScheduleEntryContext,
  type FacultyCommitmentContext,
  type MinorBlockContext,
  type SchedulingConfig,
  type FacultyUnavailabilityContext,
  type SubjectRestrictionContext,
  type ApprovedFacultyRequestContext,
} from '@coe-nnect/constraint-rules';

export interface BuildContextInput {
  termId: string;
  /** Department receiving the schedule; used by F-8 instead of catalog owner. */
  scheduleDeptId?: string | null;
  subjectId: string;
  facultyId?: string;
  roomId?: string;
  section?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  loadType?: 'lecture' | 'laboratory' | 'other';
  excludeScheduleId?: string;
  excludeScheduleIds?: string[];
  /** Request-scoped memoization for repeated lookups within one draft load. */
  cache?: RuleContextCache;

  /**
   * External room name (2026-10-15).
   *
   * When set, the candidate plot has no internal room. Room rules
   * (R-1, R-3, R-4, S-5, S-6, S-8, S-10) and H-2 (Room Overlap)
   * must early-return 'pass'.
   */
  externalRoomName?: string;
}

/** Cache for one call to draft load validation. Never shared across requests. */
export interface RuleContextCache {
  subjects: Map<string, Promise<SubjectContext>>;
  faculties: Map<string, Promise<FacultyContext | null>>;
  rooms: Map<string, Promise<RoomContext>>;
  sections: Map<string, Promise<SectionContext>>;
  existingSchedule: Map<string, Promise<ScheduleEntryContext[]>>;
  facultyCommitments: Map<string, Promise<FacultyCommitmentContext[]>>;
  minorBlocks: Map<string, Promise<MinorBlockContext[]>>;
  subjectRestrictions: Map<string, Promise<SubjectRestrictionContext[]>>;
  approvedRequests: Map<string, Promise<ApprovedFacultyRequestContext[]>>;
  config: Promise<SchedulingConfig> | null;
}

export function createRuleContextCache(): RuleContextCache {
  return {
    subjects: new Map(),
    faculties: new Map(),
    rooms: new Map(),
    sections: new Map(),
    existingSchedule: new Map(),
    facultyCommitments: new Map(),
    minorBlocks: new Map(),
    subjectRestrictions: new Map(),
    approvedRequests: new Map(),
    config: null,
  };
}

function memoize<T>(
  cache: Map<string, Promise<T>> | undefined,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = cache?.get(key);
  if (existing) return existing;
  const pending = load();
  cache?.set(key, pending);
  return pending;
}

@Injectable()
export class RuleContextBuilder {
  private readonly logger = new Logger(RuleContextBuilder.name);

  constructor(private readonly supabase: SupabaseService) {}

  async build(input: BuildContextInput): Promise<RuleContext> {
    const [
      subject,
      faculty,
      room,
      existingSchedule,
      facultyCommitments,
      minorBlocks,
      subjectRestrictions,
      approvedFacultyRequests,
      config,
    ] = await Promise.all([
      this.loadSubject(input.subjectId, input.cache),
      input.facultyId
        ? this.loadFaculty(
            input.facultyId,
            input.termId,
            input.excludeScheduleIds,
            input.cache,
          )
        : Promise.resolve(null),
      input.roomId
        ? this.loadRoom(input.roomId, input.cache)
        : Promise.resolve(null),
      this.loadExistingSchedule(
        input.termId,
        input.dayOfWeek,
        input.excludeScheduleIds,
        input.cache,
      ),
      input.facultyId
        ? this.loadFacultyCommitments(
            input.facultyId,
            input.termId,
            input.dayOfWeek,
            input.cache,
          )
        : Promise.resolve([]),
      this.loadMinorBlocks(input.termId, input.dayOfWeek, input.cache),
      this.loadSubjectRestrictions(input.termId, input.cache),
      this.loadApprovedFacultyRequests(
        input.facultyId,
        input.termId,
        input.cache,
      ),
      this.loadConfig(input.cache),
    ]);

    const section = await this.loadSection(
      input.section ?? undefined,
      input.cache,
    );
    const timeSlot: TimeSlotContext = {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    };

    return {
      termId: input.termId,
      scheduleDeptId: input.scheduleDeptId ?? null,
      subject,
      section,
      faculty,
      room,
      timeSlot,
      loadType: input.loadType ?? null,
      existingSchedule: [...existingSchedule],
      facultyCommitments,
      minorBlocks,
      subjectRestrictions,
      approvedFacultyRequests,
      config,
      excludeScheduleId: input.excludeScheduleId,

      // ── External room (2026-10-15) ──
      externalRoomName: input.externalRoomName ?? null,
    };
  }

  // ─────────────────────────────────────────
  // Loaders — all use the ADMIN client so RLS doesn't
  // silently return empty arrays for internal reads.
  // ─────────────────────────────────────────

  private get db() {
    return this.supabase.getAdminClient();
  }

  private loadSubject(
    subjectId: string,
    cache?: RuleContextCache,
  ): Promise<SubjectContext> {
    return memoize(cache?.subjects, subjectId, async () => {
      const { data, error } = await this.db
        .from('subject')
        .select(
          'subject_id, subject_code, title, total_units, lecture_units, lab_units, required_room_type, dept_id',
        )
        .eq('subject_id', subjectId)
        .single();

      if (error || !data) {
        this.logger.error(
          `loadSubject(${subjectId}) failed: ${error?.message}`,
        );
        throw new Error(`Subject ${subjectId} not found: ${error?.message}`);
      }

      return {
        subjectId: String(data.subject_id),
        subjectCode: data.subject_code,
        title: data.title,
        totalUnits: Number(data.total_units),
        lectureUnits: Number(data.lecture_units),
        labUnits: Number(data.lab_units),
        requiredRoomType: data.required_room_type ?? null,
        deptId: String(data.dept_id),
      };
    });
  }

  private loadFaculty(
    facultyId: string,
    termId: string,
    excludeScheduleIds?: string[],
    cache?: RuleContextCache,
  ): Promise<FacultyContext> {
    const key = `${facultyId}|${termId}|${(excludeScheduleIds ?? []).join(',')}`;
    return memoize(cache?.faculties, key, async () => {
      const { data, error } = await this.db
        .from('faculty')
        .select(
          'faculty_id, first_name, last_name, dept_id, classification, designation_id, required_hours',
        )
        .eq('faculty_id', facultyId)
        .single();

      if (error || !data) {
        this.logger.error(
          `loadFaculty(${facultyId}) failed: ${error?.message}`,
        );
        throw new Error(`Faculty ${facultyId} not found: ${error?.message}`);
      }

      let releaseHours = 0;
      if (data.designation_id) {
        const { data: d } = await this.db
          .from('designation')
          .select('release_hours')
          .eq('designation_id', data.designation_id)
          .maybeSingle();
        releaseHours = Number(d?.release_hours ?? 0);
      }

      const { data: quals } = await this.db
        .from('faculty_qualification')
        .select('subject_id')
        .eq('faculty_id', facultyId);

      const { data: prefs } = await this.db
        .from('faculty_preference')
        .select('preferred_day, preferred_start_time, preferred_end_time')
        .eq('faculty_id', facultyId);

      const preferences =
        prefs && prefs.length > 0
          ? prefs.map((p) => ({
              preferredDay: p.preferred_day,
              preferredStartTime: p.preferred_start_time,
              preferredEndTime: p.preferred_end_time,
            }))
          : undefined;

      const { data: unavailRows, error: unavailErr } = await this.db
        .from('faculty_unavailability')
        .select(
          'unavailability_id, faculty_id, term_id, day_of_week, start_time, end_time, reason',
        )
        .eq('faculty_id', facultyId)
        .or(`term_id.eq.${termId},term_id.is.null`);

      if (unavailErr) {
        this.logger.warn(
          `Failed to load unavailability for faculty ${facultyId}: ${unavailErr.message}`,
        );
      }

      const unavailability: FacultyUnavailabilityContext[] | undefined =
        unavailRows && unavailRows.length > 0
          ? unavailRows.map((u) => ({
              unavailabilityId: String(u.unavailability_id),
              facultyId: String(u.faculty_id),
              termId: u.term_id ? String(u.term_id) : null,
              dayOfWeek: u.day_of_week,
              startTime: u.start_time,
              endTime: u.end_time,
              reason: u.reason ?? null,
            }))
          : undefined;

      const qualifiedSubjectIds =
        quals && quals.length > 0
          ? quals.map((q) => String(q.subject_id))
          : undefined;

      const requiredHours =
        data.required_hours != null
          ? Number(data.required_hours)
          : Math.max(0, 18 - releaseHours);

      let assignedQuery = this.db
        .from('schedule')
        .select(
          `
        schedule_id,
        subject:subject_id ( lecture_units, lab_units )
        `,
        )
        .eq('term_id', termId)
        .eq('faculty_id', facultyId);
      if (excludeScheduleIds && excludeScheduleIds.length > 0) {
        assignedQuery = assignedQuery.not(
          'schedule_id',
          'in',
          `(${excludeScheduleIds.join(',')})`,
        );
      }
      const { data: assigned, error: assignedErr } = await assignedQuery;

      if (assignedErr) {
        this.logger.warn(
          `Failed to load assigned workload for faculty ${facultyId}: ${assignedErr.message}`,
        );
      }

      let assignedHours = 0;
      let assignedUnits = 0;
      for (const row of assigned ?? []) {
        const lec = Number((row as any).subject?.lecture_units ?? 0);
        const lab = Number((row as any).subject?.lab_units ?? 0);
        assignedHours += lec * 1 + lab * 3;
        assignedUnits += lec + lab;
      }

      return {
        facultyId: String(data.faculty_id),
        firstName: data.first_name,
        lastName: data.last_name,
        deptId: data.dept_id ? String(data.dept_id) : null,
        classification: data.classification ?? 'regular',
        releaseHours,
        requiredHours,
        qualifiedSubjectIds,
        assignedHours,
        assignedUnits,
        preferences,
        unavailability,
      };
    });
  }

  private loadRoom(
    roomId: string,
    cache?: RuleContextCache,
  ): Promise<RoomContext> {
    return memoize(cache?.rooms, roomId, async () => {
      const { data, error } = await this.db
        .from('room')
        .select('room_id, room_number, building, room_type, capacity, dept_id')
        .eq('room_id', roomId)
        .single();

      if (error || !data) {
        this.logger.error(`loadRoom(${roomId}) failed: ${error?.message}`);
        throw new Error(`Room ${roomId} not found: ${error?.message}`);
      }

      return {
        roomId: String(data.room_id),
        roomNumber: data.room_number,
        building: data.building,
        roomType: data.room_type,
        capacity: data.capacity ?? null,
        deptId: data.dept_id ? String(data.dept_id) : null,
      };
    });
  }

  private loadExistingSchedule(
    termId: string,
    dayOfWeek: string,
    excludeScheduleIds?: string[],
    cache?: RuleContextCache,
  ): Promise<ScheduleEntryContext[]> {
    const key = `${termId}|${dayOfWeek}|${(excludeScheduleIds ?? []).join(',')}`;
    return memoize(cache?.existingSchedule, key, async () => {
      let query = this.db
        .from('schedule')
        .select(
          'schedule_id, term_id, subject_id, faculty_id, room_id, external_room_name, section, load_type, day_of_week, start_time, end_time',
        )
        .eq('term_id', termId)
        .eq('day_of_week', dayOfWeek);
      if (excludeScheduleIds && excludeScheduleIds.length > 0) {
        query = query.not(
          'schedule_id',
          'in',
          `(${excludeScheduleIds.join(',')})`,
        );
      }
      const { data, error } = await query;

      if (error) {
        this.logger.error(`loadExistingSchedule failed: ${error.message}`);
        throw new Error(`Failed to load schedule: ${error.message}`);
      }

      return (data ?? []).map((row) => ({
        scheduleId: String(row.schedule_id),
        termId: String(row.term_id),
        subjectId: String(row.subject_id),
        facultyId: row.faculty_id ? String(row.faculty_id) : null,
        roomId: row.room_id ? String(row.room_id) : null,
        externalRoomName: (row as any).external_room_name ?? null, // ← NEW
        section: row.section ?? null,
        loadType: row.load_type ?? null,
        dayOfWeek: row.day_of_week ?? dayOfWeek,
        startTime: row.start_time ?? '00:00',
        endTime: row.end_time ?? '00:00',
      }));
    });
  }

  private loadFacultyCommitments(
    facultyId: string,
    termId: string,
    dayOfWeek: string,
    cache?: RuleContextCache,
  ): Promise<FacultyCommitmentContext[]> {
    const key = `${facultyId}|${termId}|${dayOfWeek}`;
    return memoize(cache?.facultyCommitments, key, async () => {
      const { data } = await this.db
        .from('faculty_commitment')
        .select('day_of_week, start_time, end_time, title')
        .eq('faculty_id', facultyId)
        .eq('term_id', termId)
        .eq('day_of_week', dayOfWeek);

      return (data ?? []).map((row) => ({
        dayOfWeek: row.day_of_week,
        startTime: row.start_time,
        endTime: row.end_time,
        title: row.title ?? undefined,
      }));
    });
  }

  private loadMinorBlocks(
    termId: string,
    dayOfWeek: string,
    cache?: RuleContextCache,
  ): Promise<MinorBlockContext[]> {
    const key = `${termId}|${dayOfWeek}`;
    return memoize(cache?.minorBlocks, key, async () => {
      const { data } = await this.db
        .from('minor_subject_schedule')
        .select('day_of_week, start_time, end_time, subject_code, source_dept')
        .eq('term_id', termId)
        .eq('day_of_week', dayOfWeek);

      return (data ?? [])
        .filter((r) => r.start_time && r.end_time)
        .map((row) => ({
          dayOfWeek: row.day_of_week ?? dayOfWeek,
          startTime: row.start_time as string,
          endTime: row.end_time as string,
          subjectCode: row.subject_code ?? undefined,
          sourceDept: row.source_dept ?? undefined,
        }));
    });
  }

  private loadConfig(cache?: RuleContextCache): Promise<SchedulingConfig> {
    if (cache?.config) return cache.config;
    const pending = this.fetchConfig();
    if (cache) cache.config = pending;
    return pending;
  }

  private async fetchConfig(): Promise<SchedulingConfig> {
    const { data } = await this.db
      .from('scheduling_setting')
      .select('setting_key, value');

    const map = new Map<string, unknown>(
      (data ?? []).map((r) => [r.setting_key, r.value]),
    );

    const num = (key: string, fallback: number) => {
      const v = map.get(key);
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim() !== '') return Number(v);
      return fallback;
    };
    const str = (key: string, fallback: string) => {
      const v = map.get(key);
      return typeof v === 'string' && v.trim() !== '' ? v : fallback;
    };

    const defaults = DEFAULT_SCHEDULING_CONFIG;

    return {
      operatingHoursStart: str(
        'operating_hours_start',
        defaults.operatingHoursStart,
      ),
      operatingHoursEnd: str('operating_hours_end', defaults.operatingHoursEnd),
      maxConsecutiveHours: num(
        'max_consecutive_hours',
        defaults.maxConsecutiveHours,
      ),
      minBreakMinutes: num('min_break_minutes', defaults.minBreakMinutes),
      lunchStart: str('lunch_start', defaults.lunchStart),
      lunchEnd: str('lunch_end', defaults.lunchEnd),
      lunchBreakMinutes: num('lunch_break_minutes', defaults.lunchBreakMinutes),
      lunchBreakOverlapMinutes: num(
        'lunch_break_overlap_minutes',
        defaults.lunchBreakOverlapMinutes,
      ),
      visitingLecturerMaxHours: num(
        'visiting_lecturer_max_hours',
        defaults.visitingLecturerMaxHours,
      ),
      defaultRequiredHours: num(
        'default_required_hours',
        defaults.defaultRequiredHours,
      ),
      releaseHoursGranularity: num(
        'release_hours_granularity',
        defaults.releaseHoursGranularity,
      ),
      labSplitHours: num('lab_split_hours', defaults.labSplitHours),
      lectureBlockMinutes: num(
        'lecture_block_minutes',
        defaults.lectureBlockMinutes,
      ),
      daytimePriorityEndHour: str(
        'daytime_priority_end_hour',
        defaults.daytimePriorityEndHour,
      ),
    };
  }

  private loadSubjectRestrictions(
    termId: string,
    cache?: RuleContextCache,
  ): Promise<SubjectRestrictionContext[]> {
    return memoize(cache?.subjectRestrictions, termId, async () => {
      const { data } = await this.db
        .from('subject_restriction')
        .select(
          'subject_id_1, subject_id_2, warning_message, term_id, is_active',
        )
        .eq('is_active', true)
        .or(`term_id.is.null,term_id.eq.${termId}`);

      return (data ?? []).map((row) => ({
        subjectIdA: String(row.subject_id_1),
        subjectIdB: String(row.subject_id_2),
        warningMessage: row.warning_message ?? undefined,
      }));
    });
  }

  private loadSection(
    sectionCode: string | undefined,
    cache?: RuleContextCache,
  ): Promise<SectionContext> {
    if (!sectionCode) return Promise.resolve({ sectionCode: null });
    return memoize(cache?.sections, sectionCode, async () => {
      const { data, error } = await this.db
        .from('section')
        .select('section_code, student_count')
        .eq('section_code', sectionCode)
        .maybeSingle();

      if (error) {
        this.logger.warn(
          `Failed to load section ${sectionCode}: ${error.message}`,
        );
        return { sectionCode };
      }

      return {
        sectionCode,
        studentCount: data?.student_count ?? undefined,
      };
    });
  }

  private loadApprovedFacultyRequests(
    facultyId: string | undefined,
    termId: string,
    cache?: RuleContextCache,
  ): Promise<ApprovedFacultyRequestContext[]> {
    if (!facultyId) return Promise.resolve([]);
    return memoize(
      cache?.approvedRequests,
      `${facultyId}|${termId}`,
      async () => {
        const { data } = await this.db
          .from('faculty_request')
          .select('request_id, faculty_id, subject_id, term_id')
          .in('status', ['pending', 'approved'])
          .eq('faculty_id', facultyId)
          .eq('term_id', termId);

        return (data ?? []).map((row) => ({
          requestId: String(row.request_id),
          facultyId: String(row.faculty_id),
          subjectId: String(row.subject_id),
          termId: String(row.term_id),
        }));
      },
    );
  }
}
