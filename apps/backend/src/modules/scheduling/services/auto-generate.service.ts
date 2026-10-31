import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { SupabaseService } from '../../../database/supabase.service';
import { ConstraintsService } from '../../constraints/constraints.service';
import { NotificationDispatcherService } from '../../notifications/notification-dispatcher.service';
import { RecipientsService } from '../../notifications/recipients.service';
import { Schedule } from '../entities/schedule.entity';
import { RuleContextBuilder } from './rule-context.builder';
import { SchedulingCoverageService } from './scheduling-coverage.service';
import { SolverClient } from './solver.client';
import { DepartmentsService } from '../../departments/departments.service';

@Injectable()
export class AutoGenerateService {
  private readonly logger = new Logger(AutoGenerateService.name);

  /**
   * Fast-path in-memory guard. Keyed by `term:dept` so two departments
   * generating in parallel for the same term never collide here.
   * Cleared on success/failure in the finally-adjacent paths.
   */
  private readonly autoGenerateInFlight = new Set<string>();

  private flightKey(termId: string, deptId: string): string {
    return `${termId}:${deptId}`;
  }

  constructor(
    private readonly supabase: SupabaseService,
    private readonly solverClient: SolverClient,
    private readonly constraints: ConstraintsService,
    private readonly ruleContextBuilder: RuleContextBuilder,
    private readonly coverage: SchedulingCoverageService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
    private readonly departments: DepartmentsService,
  ) {}

  async autoGenerate(
    termId: string,
    deptId: string,
    userId: string,
    options: { acknowledgeUnplottedMinors?: boolean } = {},
  ) {
    this.logger.log(
      `Auto-generate requested: term=${termId} dept=${deptId} by=${userId}`,
    );

    // ── Refuse auto-generate for a deactivated department ──
    await this.departments.assertDepartmentActive(deptId);

    const key = this.flightKey(termId, deptId);

    if (this.autoGenerateInFlight.has(key)) {
      this.logger.warn(
        `Auto-generate rejected (in-memory): already running for term=${termId} dept=${deptId}`,
      );
      return {
        success: false,
        message:
          'An auto-generate is already running for this department in this term. ' +
          'Please wait for it to finish, then try again.',
      };
    }

    const locked = await this.tryAcquireAutoGenerateLock(
      termId,
      deptId,
      userId,
    );
    if (!locked) {
      this.logger.warn(
        `Auto-generate rejected (db lock): another run in progress for term=${termId} dept=${deptId}`,
      );
      return {
        success: false,
        message:
          'An auto-generate is already running for this department in this term. ' +
          'Please wait for it to finish, then try again.',
      };
    }

    if (!options.acknowledgeUnplottedMinors) {
      try {
        const unplottedMinors = await this.coverage.findUnplottedMinors(
          termId,
          deptId,
        );
        if (unplottedMinors.length > 0) {
          this.logger.warn(
            `Auto-generate blocked: ${unplottedMinors.length} unplotted minor(s) for term=${termId} dept=${deptId}`,
          );

          await this.releaseAutoGenerateLock(termId, deptId, userId);

          return {
            success: false,
            blockedByUnplottedMinors: true,
            message:
              `${unplottedMinors.length} minor subject${
                unplottedMinors.length === 1 ? '' : 's'
              } in the prospectus have not been plotted yet. ` +
              `Plot them first, or confirm to generate without them.`,
            unplottedMinors: unplottedMinors.map((m) => ({
              subjectId: m.subjectId,
              subjectCode: m.subjectCode,
              title: m.title,
              yearLevel: m.yearLevel,
              semester: m.semester,
              programCode: m.programCode,
            })),
          };
        }
      } catch (err) {
        this.logger.warn(
          `Unplotted-minors pre-flight check failed (continuing): ${(err as Error).message}`,
        );
      }
    }

    this.autoGenerateInFlight.add(key);

    const starterDHs = await this.recipients.departmentHeadsOf(deptId);
    await this.dispatcher.dispatch('auto_generate.started', {
      recipientUserIds: starterDHs,
      title: 'Auto-generate started',
      body: `Schedule generation started for term ${termId}.`,
      entityType: 'term',
      entityId: termId,
      payload: { deptId, triggeredBy: userId },
    });

    try {
      const problem = await this.buildSolverProblem(termId, deptId);

      const sufficiency = this.analyzeRoomSufficiency(problem);
      if (!sufficiency.sufficient) {
        this.logger.warn(`Auto-generate blocked: ${sufficiency.hint}`);

        const admins = await this.recipients.administrators();
        const dean = await this.recipients.collegeDean();
        await this.dispatcher.dispatch('room_sufficiency.below_threshold', {
          recipientUserIds: this.recipients.uniq([...admins, ...dean]),
          title: 'Room capacity below threshold',
          body: sufficiency.hint,
          entityType: 'term',
          entityId: termId,
          payload: { deptId, deficits: sufficiency.deficits },
        });

        await this.dispatcher.dispatch('auto_generate.failed', {
          recipientUserIds: starterDHs,
          title: 'Auto-generate failed',
          body: sufficiency.hint,
          entityType: 'term',
          entityId: termId,
          payload: {
            deptId,
            reason: 'insufficient_rooms',
            deficits: sufficiency.deficits,
          },
        });

        this.autoGenerateInFlight.delete(key);
        await this.releaseAutoGenerateLock(termId, deptId, userId);
        return {
          success: false,
          message: sufficiency.hint,
          roomDeficits: sufficiency.deficits,
        };
      }

      let result: any;
      try {
        result = await this.solverClient.solve(problem);
      } catch (err) {
        this.logger.error('Solver service call failed', err as Error);
        this.autoGenerateInFlight.delete(key);
        await this.releaseAutoGenerateLock(termId, deptId, userId);

        await this.dispatcher.dispatch('auto_generate.failed', {
          recipientUserIds: starterDHs,
          title: 'Auto-generate failed',
          body: 'Solver service is unavailable. Please try again later.',
          entityType: 'term',
          entityId: termId,
          payload: {
            deptId,
            reason: 'solver_unavailable',
            error: (err as Error).message,
          },
        });

        return { success: false, message: 'Solver service unavailable' };
      }

      if (result.status !== 'success') {
        this.autoGenerateInFlight.delete(key);
        await this.releaseAutoGenerateLock(termId, deptId, userId);

        await this.dispatcher.dispatch('auto_generate.failed', {
          recipientUserIds: starterDHs,
          title: 'Auto-generate failed',
          body: result.message ?? 'Solver returned no solution.',
          entityType: 'term',
          entityId: termId,
          payload: { deptId, reason: 'no_solution' },
        });

        return {
          success: false,
          message: result.message ?? 'Solver returned no solution',
        };
      }

      const validation = await this.validateGeneratedSchedule(
        termId,
        result.schedule,
      );

      if (validation.hardFailures.length > 0) {
        this.logger.error(
          `Solver produced ${validation.hardFailures.length} hard failures`,
          validation.hardFailures,
        );
        this.autoGenerateInFlight.delete(key);
        await this.releaseAutoGenerateLock(termId, deptId, userId);

        await this.dispatcher.dispatch('auto_generate.failed', {
          recipientUserIds: starterDHs,
          title: 'Auto-generate failed',
          body: `Generated schedule has ${validation.hardFailures.length} constraint failure(s).`,
          entityType: 'term',
          entityId: termId,
          payload: {
            deptId,
            reason: 'constraint_validation',
            failures: validation.hardFailures.slice(0, 10),
          },
        });

        return {
          success: false,
          message: 'Generated schedule failed constraint validation',
          failures: validation.hardFailures,
        };
      }

      const saved = await this.persistDraftSchedule(
        termId,
        deptId,
        result.schedule,
        userId,
      );
      await this.persistUnscheduled(termId, deptId, result.unscheduled ?? []);

      await this.markAutoGeneratePending(termId, deptId, userId);
      this.autoGenerateInFlight.delete(key);

      await this.dispatcher.dispatch('auto_generate.finished', {
        recipientUserIds: starterDHs,
        title: 'Auto-generate finished',
        body: `Generated ${saved.length} schedule entries. Review the preview to accept or discard.`,
        entityType: 'term',
        entityId: termId,
        payload: { deptId, scheduleCount: saved.length },
      });

      return {
        success: true,
        scheduleCount: saved.length,
        solveTimeSeconds: result.solveTimeSeconds ?? null,
        warnings: validation.softWarnings,
        unscheduled: result.unscheduled ?? [],
      };
    } catch (err) {
      this.autoGenerateInFlight.delete(key);
      await this.releaseAutoGenerateLock(termId, deptId, userId);
      throw err;
    }
  }

  private async buildSolverProblem(termId: string, deptId: string) {
    const db = this.supabase.getAdminClient();

    const { data: programs, error: progErr } = await db
      .from('program')
      .select('program_id, program_code, program_name, dept_id')
      .eq('dept_id', deptId)
      .eq('is_active', true);

    if (progErr)
      throw new Error(`Failed to load programs: ${progErr.message}`);
    const programIds = (programs ?? []).map((p) => String(p.program_id));
    if (programIds.length === 0) {
      throw new BadRequestException(
        `Department ${deptId} has no active programs`,
      );
    }

    const { data: sections, error: secErr } = await db
      .from('section')
      .select('section_id, section_code, program_id, year_level')
      .in('program_id', programIds)
      .eq('is_active', true);

    if (secErr)
      throw new Error(`Failed to load sections: ${secErr.message}`);
    if (!sections || sections.length === 0) {
      throw new BadRequestException(
        'No active sections found for this department',
      );
    }

    const { data: termRow, error: termErr } = await db
      .from('term')
      .select('semester, term_name')
      .eq('term_id', termId)
      .maybeSingle();

    if (termErr || !termRow) {
      throw new BadRequestException(
        `Term ${termId} not found. Cannot determine semester.`,
      );
    }

    if (!termRow.semester) {
      throw new BadRequestException(
        `Term "${termRow.term_name}" (id ${termId}) has no semester set. ` +
          `Set it in System Settings → Terms before generating a schedule.`,
      );
    }

    const termSemester = termRow.semester;
    this.logger.log(
      `Filtering prospectus by semester='${termSemester}' for term ${termId}`,
    );

    const { data: prospectus, error: prosErr } = await db
      .from('prospectus')
      .select(
        'prospectus_id, program_id, subject_id, year_level, semester, ' +
          'lecture_sessions_per_week, lecture_minutes_per_session, ' +
          'lab_sessions_per_week, lab_minutes_per_session',
      )
      .in('program_id', programIds)
      .eq('is_active', true)
      .eq('semester', termSemester);

    if (prosErr)
      throw new Error(`Failed to load prospectus: ${prosErr.message}`);

    const subjectIds = Array.from(
      new Set((prospectus ?? []).map((p: any) => String(p.subject_id))),
    );
    if (subjectIds.length === 0) {
      throw new BadRequestException('Prospectus has no subjects');
    }

    const { data: subjects, error: subErr } = await db
      .from('subject')
      .select(
        'subject_id, subject_code, title, total_units, lecture_units, lab_units, required_room_type, dept_id, source_dept',
      )
      .in('subject_id', subjectIds)
      .eq('is_active', true);

    if (subErr)
      throw new Error(`Failed to load subjects: ${subErr.message}`);

    const cpeSubjects = (subjects ?? []).filter((s: any) => !s.source_dept);
    const cpeSubjectIds = new Set(
      cpeSubjects.map((s: any) => String(s.subject_id)),
    );
    const cpeProspectus = (prospectus ?? []).filter((p: any) =>
      cpeSubjectIds.has(String(p.subject_id)),
    );

    const cpeSubjectIdList = Array.from(cpeSubjectIds);

    const { data: faculty, error: facErr } = await db
      .from('faculty')
      .select(
        'faculty_id, first_name, last_name, dept_id, classification, required_hours, designation_id',
      )
      .eq('dept_id', deptId)
      .eq('is_active', true);

    if (facErr)
      throw new Error(`Failed to load faculty: ${facErr.message}`);
    if (!faculty || faculty.length === 0) {
      throw new BadRequestException(
        'No active faculty found for this department',
      );
    }

    const facultyIds = faculty.map((f) => String(f.faculty_id));

    const { data: qualifications } = await db
      .from('faculty_qualification')
      .select('faculty_id, subject_id')
      .in('faculty_id', facultyIds)
      .in('subject_id', cpeSubjectIdList);

    // ── H-14: unavailability for the dept's faculty ──
    const { data: unavailabilityRows, error: unavailErr } = await db
      .from('faculty_unavailability')
      .select('faculty_id, day_of_week, start_time, end_time, reason, term_id')
      .in('faculty_id', facultyIds)
      .or(`term_id.eq.${termId},term_id.is.null`);

    if (unavailErr) {
      this.logger.warn(
        `Failed to load unavailability for solver: ${unavailErr.message}`,
      );
    }

    const { data: preferences } = await db
      .from('faculty_preference')
      .select(
        'faculty_id, preferred_day, preferred_start_time, preferred_end_time',
      )
      .in('faculty_id', facultyIds);

    const { data: rooms, error: roomErr } = await db
      .from('room')
      .select('room_id, room_number, building, room_type, capacity, dept_id')
      .eq('is_active', true)
      .or(`dept_id.eq.${deptId},dept_id.is.null`);

    if (roomErr) throw new Error(`Failed to load rooms: ${roomErr.message}`);
    if (!rooms || rooms.length === 0) {
      throw new BadRequestException('No active rooms available');
    }

    // ── F3: room preferences ──
    const { data: roomPreferences, error: prefErr } = await db
      .from('room_preference')
      .select('room_id, dept_id, priority')
      .eq('dept_id', deptId);

    if (prefErr) {
      this.logger.warn(
        `Failed to load room preferences for dept ${deptId}: ${prefErr.message}`,
      );
    }

    // ── Existing schedule (ALL departments in the term) ──
    // This is intentionally NOT dept-scoped. The solver must see other
    // departments' plotted rows so it avoids their rooms, faculty, and
    // sections. As of Phase 2 the lock is dept-scoped, so those rows
    // persist across concurrent generations.
    const { data: existingScheduleRows, error: existErr } = await db
      .from('schedule')
      .select(
        'schedule_id, faculty_id, room_id, section_id, day_of_week, start_time, end_time',
      )
      .eq('term_id', termId);

    if (existErr) {
      this.logger.warn(
        `Failed to load existing schedule: ${existErr.message}`,
      );
    }

    const { data: settings } = await db
      .from('scheduling_setting')
      .select('setting_key, value');

    const configMap = new Map<string, unknown>(
      (settings ?? []).map((r) => [r.setting_key, r.value]),
    );
    const num = (k: string, fb: number) => {
      const v = configMap.get(k);
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim() !== '') return Number(v);
      return fb;
    };
    const str = (k: string, fb: string) => {
      const v = configMap.get(k);
      return typeof v === 'string' && v.trim() !== '' ? v : fb;
    };

    const timeSlots = this.generateTimeSlotGrid(
      str('operating_hours_start', '07:00'),
      str('operating_hours_end', '19:00'),
    );

    return {
      termId,
      deptId,
      sections: (sections ?? []).map((s) => ({
        sectionId: String(s.section_id),
        sectionCode: s.section_code,
        programId: s.program_id ? String(s.program_id) : null,
        yearLevel: s.year_level ?? null,
      })),
      subjects: cpeSubjects.map((s: any) => ({
        subjectId: String(s.subject_id),
        subjectCode: s.subject_code,
        title: s.title,
        totalUnits: Number(s.total_units ?? 0),
        lectureUnits: Number(s.lecture_units ?? 0),
        labUnits: Number(s.lab_units ?? 0),
        requiredRoomType: s.required_room_type ?? null,
        deptId: String(s.dept_id),
      })),
      prospectus: cpeProspectus.map((p: any) => ({
        prospectusId: String(p.prospectus_id),
        programId: String(p.program_id),
        subjectId: String(p.subject_id),
        yearLevel: p.year_level,
        semester: p.semester,
        lecture_sessions_per_week: Number(p.lecture_sessions_per_week ?? 1),
        lecture_minutes_per_session: Number(
          p.lecture_minutes_per_session ?? 90,
        ),
        lab_sessions_per_week: Number(p.lab_sessions_per_week ?? 1),
        lab_minutes_per_session: Number(p.lab_minutes_per_session ?? 180),
      })),
      faculty: (faculty ?? []).map((f) => ({
        facultyId: String(f.faculty_id),
        firstName: f.first_name,
        lastName: f.last_name,
        deptId: f.dept_id ? String(f.dept_id) : null,
        classification: f.classification ?? 'regular',
        requiredHours: Number(f.required_hours ?? 18),
        designationId: f.designation_id ? String(f.designation_id) : null,
      })),
      qualifications: (qualifications ?? []).map((q) => ({
        facultyId: String(q.faculty_id),
        subjectId: String(q.subject_id),
      })),
      preferences: (preferences ?? []).map((p) => ({
        facultyId: String(p.faculty_id),
        preferredDay: p.preferred_day,
        preferredStartTime: p.preferred_start_time,
        preferredEndTime: p.preferred_end_time,
      })),
      rooms: (rooms ?? []).map((r) => ({
        roomId: String(r.room_id),
        roomNumber: r.room_number,
        building: r.building,
        roomType: r.room_type,
        capacity: r.capacity ?? null,
        deptId: r.dept_id ? String(r.dept_id) : null,
      })),
      roomPreferences: (roomPreferences ?? []).map((p) => ({
        deptId: String(p.dept_id),
        roomId: String(p.room_id),
        priority: Number(p.priority ?? 1),
      })),
      timeSlots,
      config: {
        operatingHoursStart: str('operating_hours_start', '07:00'),
        operatingHoursEnd: str('operating_hours_end', '19:00'),
        maxConsecutiveHours: num('max_consecutive_hours', 3),
        lunchStart: str('lunch_start', '12:00'),
        lunchEnd: str('lunch_end', '13:00'),
        lectureBlockMinutes: num('lecture_block_minutes', 90),
        labSplitHours: num('lab_split_hours', 3),
        visitingLecturerMaxHours: num('visiting_lecturer_max_hours', 24),
        defaultRequiredHours: num('default_required_hours', 18),
        lectureMinutesPerUnit: num('lecture_minutes_per_unit', 30),
        lectureMinimumMinutes: num('lecture_minimum_minutes', 60),
        labMinutesPerUnit: num('lab_minutes_per_unit', 180),
        labMaxConsecutiveMinutes: num('lab_max_consecutive_minutes', 180),
        specialCategoryMinutesPerUnit: num(
          'special_category_minutes_per_unit',
          60,
        ),
        specialCategoryPrefixes: str(
          'special_category_prefixes',
          'PATHFit,NSTP,ROTC,CWTS,EPIC',
        ),
      },
      existingSchedule: (existingScheduleRows ?? []).map((row) => ({
        scheduleId: String(row.schedule_id),
        facultyId: row.faculty_id ? String(row.faculty_id) : null,
        roomId: row.room_id ? String(row.room_id) : null,
        sectionId: row.section_id ? String(row.section_id) : null,
        day: row.day_of_week ?? 'Monday',
        startTime: row.start_time ?? '00:00',
        endTime: row.end_time ?? '00:00',
      })),

      // ── H-14: faculty unavailability (solver hard constraint) ──
      unavailability: (unavailabilityRows ?? []).map((u) => ({
        facultyId: String(u.faculty_id),
        dayOfWeek: u.day_of_week,
        startTime: u.start_time,
        endTime: u.end_time,
        reason: u.reason ?? undefined,
      })),
    };
  }

  private generateTimeSlotGrid(
    startHHMM: string,
    endHHMM: string,
  ): Array<{ day: string; startTime: string; endTime: string }> {
    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const slots: Array<{ day: string; startTime: string; endTime: string }> =
      [];

    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const toHHMM = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    const startMin = toMin(startHHMM);
    const endMin = toMin(endHHMM);

    for (const day of days) {
      for (let t = startMin; t + 30 <= endMin; t += 30) {
        slots.push({
          day,
          startTime: toHHMM(t),
          endTime: toHHMM(t + 30),
        });
      }
    }
    return slots;
  }

  private async validateGeneratedSchedule(
    termId: string,
    schedule: Array<{
      sectionId: string;
      sectionCode: string;
      subjectId: string;
      facultyId: string;
      roomId: string;
      day: string;
      startTime: string;
      endTime: string;
      loadType?: string;
    }>,
  ): Promise<{
    hardFailures: Array<{ ruleId: string; ruleName: string; reason: string }>;
    softWarnings: Array<{ ruleId: string; ruleName: string; reason: string }>;
  }> {
    const hardFailures: Array<{
      ruleId: string;
      ruleName: string;
      reason: string;
    }> = [];
    const softWarnings: Array<{
      ruleId: string;
      ruleName: string;
      reason: string;
    }> = [];

    const softForAuto = await this.getAutoGenerateSoftRules();
    this.logger.log(
      `Auto-generate soft rules: [${Array.from(softForAuto).join(', ')}]`,
    );

    for (const block of schedule) {
      try {
        const context = await this.ruleContextBuilder.build({
          termId,
          subjectId: block.subjectId,
          facultyId: block.facultyId,
          roomId: block.roomId,
          section: block.sectionCode,
          dayOfWeek: block.day,
          startTime: block.startTime,
          endTime: block.endTime,
          loadType: (block.loadType as any) ?? undefined,
        });
        const result = this.constraints.evaluate(context);

        if (!result.valid) {
          for (const c of result.hardConflicts) {
            const reason = `[${block.subjectId} ${block.sectionCode} ${block.day} ${block.startTime}] ${c.reason}`;
            if (softForAuto.has(c.ruleId)) {
              softWarnings.push({
                ruleId: c.ruleId,
                ruleName: c.ruleName,
                reason,
              });
            } else {
              hardFailures.push({
                ruleId: c.ruleId,
                ruleName: c.ruleName,
                reason,
              });
            }
          }
        }

        for (const w of result.softWarnings) {
          softWarnings.push({
            ruleId: w.ruleId,
            ruleName: w.ruleName,
            reason: `[${block.subjectId} ${block.sectionCode} ${block.day} ${block.startTime}] ${w.reason}`,
          });
        }
      } catch (err) {
        hardFailures.push({
          ruleId: 'CTX-BUILD',
          ruleName: 'Context Build',
          reason: `Failed to build context for block: ${(err as Error).message}`,
        });
      }
    }

    return { hardFailures, softWarnings };
  }

  private async persistDraftSchedule(
    termId: string,
    deptId: string,
    schedule: Array<{
      sectionId: string;
      sectionCode: string;
      subjectId: string;
      facultyId: string;
      roomId: string;
      day: string;
      startTime: string;
      endTime: string;
      loadType: 'lecture' | 'laboratory';
    }>,
    userId: string,
  ): Promise<Schedule[]> {
    const db = this.supabase.getAdminClient();

    // ⚠️ PHASE 3 will add `.eq('dept_id', deptId)` here.
    // For now the delete is still term-scoped; Phase 3 fixes it.
    // (Kept identical to pre-Phase-2 behavior so this phase stays
    // focused on the lock plumbing and produces no surprising diffs.)
    const { error: clearErr } = await db
      .from('schedule')
      .delete()
      .eq('term_id', termId)
      .eq('status', 'draft')
      .like('remarks', 'Auto-generated by solver%');

    if (clearErr) {
      this.logger.warn(
        `Failed to clear prior auto-generated drafts: ${clearErr.message}`,
      );
    } else {
      this.logger.log(
        `Cleared prior auto-generated drafts for term=${termId} dept=${deptId}`,
      );
    }

    const sectionIds = Array.from(new Set(schedule.map((b) => b.sectionId)));
    const { data: sectionRows } = await this.supabase
      .getAdminClient()
      .from('section')
      .select('section_id, section_code')
      .in('section_id', sectionIds);

    const codeById = new Map<string, string>(
      (sectionRows ?? []).map((r) => [
        String(r.section_id),
        r.section_code,
      ]),
    );

    const subjectIds = Array.from(new Set(schedule.map((b) => b.subjectId)));
    const { data: subjectRows } = await this.supabase
      .getAdminClient()
      .from('subject')
      .select('subject_id, dept_id')
      .in('subject_id', subjectIds);

    const deptBySubject = new Map<string, string | null>(
      (subjectRows ?? []).map((r) => [
        String(r.subject_id),
        r.dept_id ? String(r.dept_id) : null,
      ]),
    );

    const toInsert = schedule
      .filter((b) => codeById.has(b.sectionId))
      .map((b) => ({
        term_id: termId,
        subject_id: b.subjectId,
        faculty_id: b.facultyId,
        room_id: b.roomId,
        timeslot_id: null,
        section: codeById.get(b.sectionId) ?? null,
        section_id: b.sectionId,
        dept_id: deptBySubject.get(b.subjectId) ?? null,
        load_type: b.loadType,
        day_of_week: b.day,
        start_time:
          b.startTime.length === 5 ? `${b.startTime}:00` : b.startTime,
        end_time: b.endTime.length === 5 ? `${b.endTime}:00` : b.endTime,
        status: 'draft',
        remarks: `Auto-generated by solver (user ${userId})`,
      }));

    if (toInsert.length === 0) {
      this.logger.warn('persistDraftSchedule: nothing to insert');
      return [];
    }

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('schedule')
      .insert(toInsert)
      .select('*');

    if (error) {
      this.logger.error(
        `persistDraftSchedule insert failed: ${error.message}`,
      );
      throw new Error(`Failed to persist schedule: ${error.message}`);
    }

    this.logger.log(
      `persistDraftSchedule: wrote ${data?.length ?? 0} draft rows for term=${termId} dept=${deptId}`,
    );

    return (data ?? []).map((row) => {
      const s = new Schedule();
      s.scheduleId = String(row.schedule_id);
      s.termId = String(row.term_id);
      s.subjectId = String(row.subject_id);
      s.facultyId = row.faculty_id ? String(row.faculty_id) : null;
      s.roomId = row.room_id ? String(row.room_id) : null;
      s.timeslotId = null;
      s.section = row.section ?? null;
      s.sectionId = row.section_id ? String(row.section_id) : null;
      s.loadType = row.load_type ?? null;
      s.dayOfWeek = row.day_of_week ?? null;
      s.startTime = row.start_time ?? null;
      s.endTime = row.end_time ?? null;
      s.status = row.status ?? 'draft';
      s.remarks = row.remarks ?? null;
      return s;
    });
  }

  private async persistUnscheduled(
    termId: string,
    deptId: string,
    unscheduled: Array<{
      sectionId: string;
      subjectId: string;
      kind: 'lecture' | 'lab';
      sessionIndex: number;
    }>,
  ): Promise<void> {
    const db = this.supabase.getAdminClient();

    // ⚠️ PHASE 3 will scope this delete to the department as well.
    // Kept term-only for now so Phase 2 stays focused on lock plumbing.
    const { error: clearErr } = await db
      .from('schedule_unscheduled')
      .delete()
      .eq('term_id', termId);

    if (clearErr) {
      this.logger.warn(
        `Failed to clear old unscheduled rows: ${clearErr.message}`,
      );
    }

    if (unscheduled.length === 0) return;

    const rows = unscheduled.map((u) => ({
      term_id: termId,
      section_id: u.sectionId,
      subject_id: u.subjectId,
      kind: u.kind,
      session_index: u.sessionIndex ?? 0,
      reason: 'Could not find a non-conflicting time slot',
    }));

    const { error } = await db.from('schedule_unscheduled').insert(rows);

    if (error) {
      this.logger.error(
        `Failed to persist unscheduled rows: ${error.message}`,
      );
      return;
    }

    this.logger.log(
      `Persisted ${rows.length} unscheduled block(s) for term=${termId} dept=${deptId}`,
    );
  }

  async getUnscheduled(termId: string): Promise<
    Array<{
      unscheduledId: string;
      sectionId: string | null;
      sectionCode: string;
      subjectId: string;
      subjectCode: string;
      subjectTitle: string;
      kind: 'lecture' | 'lab';
      sessionIndex: number;
      reason: string | null;
    }>
  > {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('schedule_unscheduled')
      .select(
        `
        unscheduled_id,
        section_id,
        subject_id,
        kind,
        session_index,
        reason,
        section:section_id ( section_code ),
        subject:subject_id ( subject_code, title )
        `,
      )
      .eq('term_id', termId);

    if (error) {
      this.logger.error(`getUnscheduled failed: ${error.message}`);
      return [];
    }

    return (data ?? []).map((r) => ({
      unscheduledId: String(r.unscheduled_id),
      sectionId: r.section_id ? String(r.section_id) : null,
      sectionCode: (r as any).section?.section_code ?? '?',
      subjectId: String(r.subject_id),
      subjectCode: (r as any).subject?.subject_code ?? '?',
      subjectTitle: (r as any).subject?.title ?? '',
      kind: r.kind as 'lecture' | 'lab',
      sessionIndex: r.session_index ?? 0,
      reason: r.reason ?? null,
    }));
  }

  /**
   * Phase 2: department-scoped. Deletes only drafts generated by solver
   * that belong to the given department. Cross-dept rows (CPE running
   * while EE discards, etc.) are left alone.
   *
   * The delete predicate combines term_id + status + remarks marker +
   * dept_id. `dept_id` is what makes this safe; the others keep us
   * within the "auto-generated draft" namespace.
   */
  async clearAutoDrafts(
    termId: string,
    deptId: string,
  ): Promise<{ deleted: number }> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('schedule')
      .delete()
      .eq('term_id', termId)
      .eq('dept_id', deptId)
      .eq('status', 'draft')
      .like('remarks', 'Auto-generated by solver%')
      .select('schedule_id');

    if (error) {
      this.logger.error(`clearAutoDrafts failed: ${error.message}`);
      throw new BadRequestException(
        `Failed to clear auto-generated drafts: ${error.message}`,
      );
    }

    const deleted = data?.length ?? 0;
    this.logger.log(
      `Cleared ${deleted} auto-generated draft(s) for term=${termId} dept=${deptId}`,
    );
    return { deleted };
  }

  private analyzeRoomSufficiency(problem: any): {
    sufficient: boolean;
    deficits: Array<{
      roomType: string;
      neededHours: number;
      availableHours: number;
      shortByHours: number;
      suggestedExtraRooms: number;
    }>;
    hint: string;
  } {
    const demandByType = new Map<string, number>();

    const addDemand = (roomType: string, hours: number) => {
      demandByType.set(roomType, (demandByType.get(roomType) ?? 0) + hours);
    };

    for (const subj of problem.subjects) {
      const blocks = this.computeBlocksForSufficiency(subj, problem.config);

      const sectionsTaking = problem.sections.filter((sec: any) =>
        problem.prospectus.some(
          (p: any) =>
            p.subjectId === subj.subjectId &&
            p.programId === sec.programId &&
            p.yearLevel === sec.yearLevel,
        ),
      ).length;

      if (sectionsTaking === 0) continue;

      const required = (subj.requiredRoomType ?? '').trim().toLowerCase();

      for (const block of blocks) {
        const hours = (block.durationMinutes / 60) * sectionsTaking;

        if (required === '' || required === 'any') {
          if (block.kind === 'lab') {
            addDemand('laboratory', hours);
          } else {
            addDemand('lecture_room', hours);
          }
          continue;
        }

        addDemand(subj.requiredRoomType as string, hours);
      }
    }

    const startMin = this.timeToMinutes(problem.config.operatingHoursStart);
    const endMin = this.timeToMinutes(problem.config.operatingHoursEnd);
    const hoursPerDay = (endMin - startMin) / 60;
    const operatingDays = 6;
    const hoursPerWeekPerRoom = hoursPerDay * operatingDays;

    const lectureCapable = new Set([
      'lecture_room',
      'drafting_room',
      'computer_lab',
      'laboratory',
    ]);
    const labCapable = new Set(['laboratory', 'computer_lab']);

    const countRooms = (capable: Set<string>) =>
      problem.rooms.filter((r: any) =>
        capable.has(String(r.roomType)),
      ).length;

    const supplyByType = new Map<string, number>();

    const pools: Array<{ key: string; capable: Set<string> }> = [
      { key: 'lecture_room', capable: lectureCapable },
      { key: 'laboratory', capable: labCapable },
      { key: 'computer_lab', capable: new Set(['computer_lab']) },
      { key: 'drafting_room', capable: new Set(['drafting_room']) },
      { key: 'other', capable: new Set(['other']) },
    ];

    for (const { key, capable } of pools) {
      const rooms = countRooms(capable);
      supplyByType.set(key, rooms * hoursPerWeekPerRoom);
    }

    const deficits: Array<{
      roomType: string;
      neededHours: number;
      availableHours: number;
      shortByHours: number;
      suggestedExtraRooms: number;
    }> = [];

    for (const [roomType, demandHours] of demandByType.entries()) {
      let availableHours = supplyByType.get(roomType);
      if (availableHours === undefined) {
        const rooms = problem.rooms.filter(
          (r: any) => String(r.roomType) === roomType,
        ).length;
        availableHours = rooms * hoursPerWeekPerRoom;
      }

      if (demandHours > availableHours) {
        const shortByHours = demandHours - availableHours;
        const suggestedExtraRooms = Math.ceil(
          shortByHours / hoursPerWeekPerRoom,
        );
        deficits.push({
          roomType,
          neededHours: Math.round(demandHours * 10) / 10,
          availableHours: Math.round(availableHours * 10) / 10,
          shortByHours: Math.round(shortByHours * 10) / 10,
          suggestedExtraRooms,
        });
      }
    }

    const sufficient = deficits.length === 0;

    let hint = '';
    if (!sufficient) {
      const parts = deficits.map(
        (d) =>
          `${d.suggestedExtraRooms} more ${d.roomType.replace('_', ' ')} room(s) ` +
          `(need ${d.neededHours}h, have ${d.availableHours}h)`,
      );
      hint = `Not enough rooms: ${parts.join('; ')}.`;
    }

    return { sufficient, deficits, hint };
  }

  private computeBlocksForSufficiency(
    subject: any,
    config: any,
  ): Array<{ kind: 'lecture' | 'lab'; durationMinutes: number }> {
    const blocks: Array<{
      kind: 'lecture' | 'lab';
      durationMinutes: number;
    }> = [];

    if (subject.lectureUnits > 0) {
      blocks.push({
        kind: 'lecture',
        durationMinutes: config.lectureBlockMinutes ?? 90,
      });
    }

    if (subject.labUnits > 0) {
      const totalLab =
        subject.labUnits * (config.labMinutesPerUnit ?? 180);
      const maxSession = config.labMaxConsecutiveMinutes ?? 180;
      let remaining = totalLab;
      while (remaining > 0) {
        const sess = Math.min(remaining, maxSession);
        blocks.push({ kind: 'lab', durationMinutes: sess });
        remaining -= sess;
      }
    }

    return blocks;
  }

  async getRoomSufficiency(
    deptId?: string,
    termId?: string,
  ): Promise<
    Array<{
      deptId: string;
      deptCode: string;
      deptName: string;
      termId: string;
      termLabel: string | null;
      sufficient: boolean;
      hint: string;
      deficits: Array<{
        roomType: string;
        neededHours: number;
        availableHours: number;
        shortByHours: number;
        suggestedExtraRooms: number;
      }>;
      totals: {
        subjects: number;
        sections: number;
        blocks: number;
        rooms: number;
      };
    }>
  > {
    const db = this.supabase.getAdminClient();

    let resolvedTermId = termId;
    let resolvedTermLabel: string | null = null;

    if (resolvedTermId) {
      const { data } = await db
        .from('term')
        .select('term_id, term_name, school_year')
        .eq('term_id', resolvedTermId)
        .maybeSingle();
      if (data) {
        resolvedTermLabel = `${data.term_name} AY ${data.school_year}`;
      }
    } else {
      const { data } = await db
        .from('term')
        .select('term_id, term_name, school_year')
        .eq('is_active', true)
        .maybeSingle();
      if (data) {
        resolvedTermId = String(data.term_id);
        resolvedTermLabel = `${data.term_name} AY ${data.school_year}`;
      }
    }

    if (!resolvedTermId) {
      throw new BadRequestException('No active term available');
    }

    let depts: Array<{
      dept_id: bigint | number;
      dept_code: string;
      dept_name: string;
    }> = [];

    if (deptId) {
      const { data, error } = await db
        .from('department')
        .select('dept_id, dept_code, dept_name')
        .eq('dept_id', deptId)
        .eq('is_active', true)
        .maybeSingle();
      if (error || !data) {
        throw new BadRequestException(`Department ${deptId} not found`);
      }
      depts = [data];
    } else {
      const { data, error } = await db
        .from('department')
        .select('dept_id, dept_code, dept_name')
        .eq('is_active', true)
        .order('dept_code');
      if (error) {
        throw new BadRequestException(
          `Failed to load departments: ${error.message}`,
        );
      }
      depts = data ?? [];
    }

    const results = [];
    for (const d of depts) {
      try {
        const problem = await this.buildSolverProblem(
          resolvedTermId,
          String(d.dept_id),
        );
        const analysis = this.analyzeRoomSufficiency(problem);

        results.push({
          deptId: String(d.dept_id),
          deptCode: d.dept_code,
          deptName: d.dept_name,
          termId: resolvedTermId,
          termLabel: resolvedTermLabel,
          sufficient: analysis.sufficient,
          hint: analysis.hint,
          deficits: analysis.deficits,
          totals: {
            subjects: problem.subjects.length,
            sections: problem.sections.length,
            blocks: problem.subjects.reduce(
              (sum: number, s: any) =>
                sum +
                this.computeBlocksForSufficiency(s, problem.config).length,
              0,
            ),
            rooms: problem.rooms.length,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Room sufficiency for dept ${d.dept_id} failed: ${(err as Error).message}`,
        );
        results.push({
          deptId: String(d.dept_id),
          deptCode: d.dept_code,
          deptName: d.dept_name,
          termId: resolvedTermId,
          termLabel: resolvedTermLabel,
          sufficient: true,
          hint: '',
          deficits: [],
          totals: { subjects: 0, sections: 0, blocks: 0, rooms: 0 },
        });
      }
    }

    return results;
  }

  private async getAutoGenerateSoftRules(): Promise<Set<string>> {
    const { data } = await this.supabase
      .getAdminClient()
      .from('scheduling_setting')
      .select('value')
      .eq('setting_key', 'auto_generate_soft_rules')
      .maybeSingle();

    const raw = data?.value;

    if (Array.isArray(raw)) return new Set(raw.map(String));
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed.map(String));
      } catch {
        // Fall through
      }
    }

    return new Set(['H-4', 'H-6', 'S-7', 'S-2']);
  }

  // ════════════════════════════════════════════
  // AUTO-GENERATE LOCK (row-based, PostgREST-safe)
  // Phase 2: dept-scoped. Each (term, dept) is independent.
  // ════════════════════════════════════════════

  private async tryAcquireAutoGenerateLock(
    termId: string,
    deptId: string,
    userId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .rpc('try_acquire_auto_generate_lock', {
        p_term_id: Number(termId),
        p_dept_id: Number(deptId),
        p_user_id: userId,
        p_ttl_seconds: 120,
      });

    if (error) {
      this.logger.error(
        `Failed to acquire auto-generate lock for term=${termId} dept=${deptId}: ${error.message}`,
      );
      return false;
    }

    return data === true;
  }

  private async releaseAutoGenerateLock(
    termId: string,
    deptId: string,
    userId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .getAdminClient()
      .rpc('release_auto_generate_lock', {
        p_term_id: Number(termId),
        p_dept_id: Number(deptId),
        p_user_id: userId,
      });

    if (error) {
      this.logger.warn(
        `Failed to release auto-generate lock for term=${termId} dept=${deptId}: ${error.message}`,
      );
    }
  }

  private async markAutoGeneratePending(
    termId: string,
    deptId: string,
    userId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .getAdminClient()
      .rpc('mark_auto_generate_pending', {
        p_term_id: Number(termId),
        p_dept_id: Number(deptId),
        p_user_id: userId,
        p_ttl_seconds: 600,
      });
    if (error) {
      this.logger.warn(
        `Failed to mark pending lock for term=${termId} dept=${deptId}: ${error.message}`,
      );
    }
  }

  async confirmAutoGenerate(
    termId: string,
    deptId: string,
    userId: string,
  ): Promise<void> {
    await this.releaseAutoGenerateLock(termId, deptId, userId);
    this.logger.log(
      `Auto-generate confirmed for term=${termId} dept=${deptId}`,
    );
  }

  async discardAutoGenerate(
    termId: string,
    deptId: string,
    userId: string,
  ): Promise<{ deleted: number }> {
    const result = await this.clearAutoDrafts(termId, deptId);
    await this.releaseAutoGenerateLock(termId, deptId, userId);
    this.logger.log(
      `Auto-generate discarded for term=${termId} dept=${deptId} (${result.deleted} rows deleted)`,
    );
    return result;
  }

  async abandonAutoGenerate(
    termId: string,
    deptId: string,
    userId: string,
  ): Promise<void> {
    await this.releaseAutoGenerateLock(termId, deptId, userId);
    this.logger.log(
      `Auto-generate abandoned for term=${termId} dept=${deptId} by=${userId}`,
    );
  }

  async getAutoGenerateLock(
    termId: string,
    deptId: string,
    userId: string,
  ): Promise<{
    heldByUser: boolean;
    state: 'running' | 'pending_confirm';
    expiresAt: string;
  } | null> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .rpc('get_auto_generate_lock', {
        p_term_id: Number(termId),
        p_dept_id: Number(deptId),
      });

    if (error) {
      this.logger.warn(
        `Failed to get auto-generate lock for term=${termId} dept=${deptId}: ${error.message}`,
      );
      return null;
    }

    if (!data || data.length === 0) return null;

    const row = data[0];
    return {
      heldByUser: String(row.held_by) === String(userId),
      state: row.state as 'running' | 'pending_confirm',
      expiresAt: row.expires_at,
    };
  }

  private timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
}