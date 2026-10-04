import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service';
import type {
  RuleContext,
  SubjectContext,
  SectionContext,
  FacultyContext,
  RoomContext,
  TimeSlotContext,
  ScheduleEntryContext,
  FacultyCommitmentContext,
  MinorBlockContext,
  SchedulingConfig,
} from '@coe-nnect/constraint-rules';

export interface BuildContextInput {
  termId: string;
  subjectId: string;
  facultyId?: string;
  roomId?: string;
  section?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  loadType?: 'lecture' | 'laboratory' | 'other';
  excludeScheduleId?: string;
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
      this.loadSubject(input.subjectId),
      input.facultyId
        ? this.loadFaculty(input.facultyId, input.termId)
        : Promise.resolve(null),
      input.roomId ? this.loadRoom(input.roomId) : Promise.resolve(null),
      this.loadExistingSchedule(input.termId, input.dayOfWeek),
      input.facultyId
        ? this.loadFacultyCommitments(
            input.facultyId,
            input.termId,
            input.dayOfWeek,
          )
        : Promise.resolve([]),
      this.loadMinorBlocks(input.termId, input.dayOfWeek),
      this.loadSubjectRestrictions(input.termId),
      this.loadApprovedFacultyRequests(input.facultyId, input.termId),
      this.loadConfig(),
    ]);

    const section = await this.loadSection(input.section ?? undefined);
    const timeSlot: TimeSlotContext = {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    };

    return {
      termId: input.termId,
      subject,
      section,
      faculty,
      room,
      timeSlot,
      loadType: input.loadType ?? null,
      existingSchedule,
      facultyCommitments,
      minorBlocks,
      subjectRestrictions,
      approvedFacultyRequests,
      config,
      excludeScheduleId: input.excludeScheduleId,
    };
  }

  // ─────────────────────────────────────────
  // Loaders — all use the ADMIN client so RLS doesn't
  // silently return empty arrays for internal reads.
  // ─────────────────────────────────────────

  private get db() {
    return this.supabase.getAdminClient();
  }

  private async loadSubject(subjectId: string): Promise<SubjectContext> {
    const { data, error } = await this.db
      .from('subject')
      .select(
        'subject_id, subject_code, title, total_units, lecture_units, lab_units, required_room_type, dept_id',
      )
      .eq('subject_id', subjectId)
      .single();

    if (error || !data) {
      this.logger.error(`loadSubject(${subjectId}) failed: ${error?.message}`);
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
  }

  private async loadFaculty(facultyId: string, termId: string): Promise<FacultyContext> {
    const { data, error } = await this.db
      .from('faculty')
      .select(
        'faculty_id, first_name, last_name, dept_id, classification, designation_id, required_hours',
      )
      .eq('faculty_id', facultyId)
      .single();

    if (error || !data) {
      this.logger.error(`loadFaculty(${facultyId}) failed: ${error?.message}`);
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

    const qualifiedSubjectIds =
      quals && quals.length > 0
        ? quals.map((q) => String(q.subject_id))
        : undefined;

    const requiredHours =
      data.required_hours != null
        ? Number(data.required_hours)
        : Math.max(0, 18 - releaseHours);

    // Compute the faculty's term-wide assigned hours and units.
    // Sums across ALL rows in the term for this faculty.
    const { data: assigned, error: assignedErr } = await this.db
      .from('schedule')
      .select(
        `
        schedule_id,
        subject:subject_id ( lecture_units, lab_units )
        `,
      )
      .eq('term_id', termId)
      .eq('faculty_id', facultyId);

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
    };
  }

  private async loadRoom(roomId: string): Promise<RoomContext> {
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
  }

  private async loadExistingSchedule(
    termId: string,
    dayOfWeek: string,
  ): Promise<ScheduleEntryContext[]> {
    const { data, error } = await this.db
      .from('schedule')
      .select(
        'schedule_id, term_id, subject_id, faculty_id, room_id, section, load_type, day_of_week, start_time, end_time',
      )
      .eq('term_id', termId)
      .eq('day_of_week', dayOfWeek);

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
      section: row.section ?? null,
      loadType: row.load_type ?? null,
      dayOfWeek: row.day_of_week ?? dayOfWeek,
      startTime: row.start_time ?? '00:00',
      endTime: row.end_time ?? '00:00',
    }));
  }

  private async loadFacultyCommitments(
    facultyId: string,
    termId: string,
    dayOfWeek: string,
  ): Promise<FacultyCommitmentContext[]> {
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
  }

  private async loadMinorBlocks(
    termId: string,
    dayOfWeek: string,
  ): Promise<MinorBlockContext[]> {
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
  }

  private async loadConfig(): Promise<SchedulingConfig> {
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

    return {
      operatingHoursStart: str('operating_hours_start', '07:00'),
      operatingHoursEnd: str('operating_hours_end', '19:00'),
      maxConsecutiveHours: num('max_consecutive_hours', 3),
      minBreakMinutes: num('min_break_minutes', 30),
      lunchStart: str('lunch_start', '12:00'),
      lunchEnd: str('lunch_end', '13:00'),
      lunchBreakMinutes: num('lunch_break_minutes', 60),
      lunchBreakOverlapMinutes: num('lunch_break_overlap_minutes', 30),
      visitingLecturerMaxHours: num('visiting_lecturer_max_hours', 24),
      defaultRequiredHours: num('default_required_hours', 18),
      releaseHoursGranularity: num('release_hours_granularity', 3),
      labSplitHours: num('lab_split_hours', 3),
      lectureBlockMinutes: num('lecture_block_minutes', 90),
      daytimePriorityEndHour: str('daytime_priority_end_hour', '17:30'),
    };
  }

  private async loadSubjectRestrictions(
    termId: string,
  ): Promise<import('@coe-nnect/constraint-rules').SubjectRestrictionContext[]> {
    const { data } = await this.db
      .from('subject_restriction')
      .select('subject_id_1, subject_id_2, warning_message, term_id, is_active')
      .eq('is_active', true)
      .or(`term_id.is.null,term_id.eq.${termId}`);

    return (data ?? []).map((row) => ({
      subjectIdA: String(row.subject_id_1),
      subjectIdB: String(row.subject_id_2),
      warningMessage: row.warning_message ?? undefined,
    }));
  }

  private async loadSection(sectionCode?: string): Promise<SectionContext> {
    if (!sectionCode) return { sectionCode: null };

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
  }

    private async loadApprovedFacultyRequests(
    facultyId: string | undefined,
    termId: string,
  ): Promise<
    import('@coe-nnect/constraint-rules').ApprovedFacultyRequestContext[]
  > {
    if (!facultyId) return [];
    const { data } = await this.db
      .from('faculty_request')
      .select('request_id, faculty_id, subject_id, term_id')
      .eq('status', 'approved')
      .eq('faculty_id', facultyId)
      .eq('term_id', termId);

    return (data ?? []).map((row) => ({
      requestId: String(row.request_id),
      facultyId: String(row.faculty_id),
      subjectId: String(row.subject_id),
      termId: String(row.term_id),
    }));
  }
}