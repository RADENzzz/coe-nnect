import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ForbiddenException, 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './entities/schedule.entity';
import { Term } from '../terms/entities/term.entity';
import { Section } from '../sections/entities/section.entity';
import { PlotSubjectDto } from './dto/plot-subject.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ValidatePlotDto } from './dto/validate-plot.dto';
import { ConstraintsService } from '../constraints/constraints.service';
import { RuleContextBuilder } from './services/rule-context.builder';
import { SolverClient } from './services/solver.client';
import { SupabaseService } from '../../database/supabase.service';

type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    @InjectRepository(Schedule) private scheduleRepo: Repository<Schedule>,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(Section) private sectionRepo: Repository<Section>,
    private readonly ruleContextBuilder: RuleContextBuilder,
    private readonly constraints: ConstraintsService,
    private readonly solverClient: SolverClient,
    private readonly supabase: SupabaseService,
  ) {}

  // ════════════════════════════════════════════
  // Queries
  // ════════════════════════════════════════════

  async getActiveTerm(): Promise<Term | null> {
    return this.termRepo.findOne({ where: { isActive: true } });
  }

  async findByTerm(termId: string): Promise<Schedule[]> {
    return this.scheduleRepo.find({
      where: { termId },
      relations: ['subject', 'faculty', 'room', 'timeSlot'],
      order: { scheduleId: 'ASC' },
    });
  }

  async findAll(): Promise<Schedule[]> {
    return this.scheduleRepo.find({
      relations: ['subject', 'faculty', 'room', 'timeSlot'],
      order: { scheduleId: 'ASC' },
    });
  }

  async validate(dto: ValidatePlotDto): Promise<{
    valid: boolean;
    hardConflicts: Array<{ ruleId: string; ruleName: string; reason: string }>;
    softWarnings: Array<{ ruleId: string; ruleName: string; reason: string }>;
    alternatives: unknown[];
  }> {
    const guards: Array<{ ruleId: string; ruleName: string; reason: string }> = [];

    const startMin = this.timeToMinutes(dto.startTime);
    const endMin = this.timeToMinutes(dto.endTime);

    if (endMin <= startMin) {
      guards.push({
        ruleId: 'H-7',
        ruleName: 'Time Ordering',
        reason: 'End time must be after start time.',
      });
    }
    if (startMin < 7 * 60) {
      guards.push({
        ruleId: 'H-8',
        ruleName: 'Operating Hours',
        reason: 'Class cannot start before 7:00 AM.',
      });
    }
    if (endMin > 19 * 60) {
      guards.push({
        ruleId: 'H-8',
        ruleName: 'Operating Hours',
        reason: 'Class cannot end after 7:00 PM.',
      });
    }

    if (guards.length > 0) {
      return {
        valid: false,
        hardConflicts: guards,
        softWarnings: [],
        alternatives: [],
      };
    }

    const context = await this.ruleContextBuilder.build({
      termId: dto.termId,
      subjectId: dto.subjectId,
      facultyId: dto.facultyId,
      roomId: dto.roomId,
      section: dto.section,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      loadType: dto.loadType,
      excludeScheduleId: dto.excludeId,
    });

    const engineResult = this.constraints.evaluate(context);

    return {
      valid: engineResult.valid,
      hardConflicts: engineResult.hardConflicts,
      softWarnings: engineResult.softWarnings,
      alternatives: [],
    };
  }

  async updateRemarks(id: string, remarks: string | null): Promise<Schedule> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');
    found.remarks = remarks;
    return this.scheduleRepo.save(found);
  }

  // ════════════════════════════════════════════
  // Mutations
  // ════════════════════════════════════════════

  async plot(dto: PlotSubjectDto): Promise<Schedule> {
    if (!dto.facultyId) {
      throw new BadRequestException('facultyId is required to plot a subject.');
    }

    const startMin = this.timeToMinutes(dto.startTime);
    const endMin = this.timeToMinutes(dto.endTime);

    if (endMin <= startMin) {
      throw new BadRequestException('H-7: End time must be after start time.');
    }
    if (startMin < 7 * 60) {
      throw new BadRequestException('H-8: Class cannot start before 7:00 AM.');
    }
    if (endMin > 19 * 60) {
      throw new BadRequestException('H-8: Class cannot end after 7:00 PM.');
    }

    const context = await this.ruleContextBuilder.build({
      termId: dto.termId,
      subjectId: dto.subjectId,
      facultyId: dto.facultyId,
      roomId: dto.roomId,
      section: dto.section,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      loadType: dto.loadType,
    });

    const engineResult = this.constraints.evaluate(context);

    if (!engineResult.valid) {
      const reasons = engineResult.hardConflicts
        .map((c) => `${c.ruleId}: ${c.reason}`)
        .join('\n');
      throw new BadRequestException(
        `Cannot plot — hard conflicts detected:\n${reasons}`,
      );
    }

    const sectionId = await this.resolveSectionId(dto.section);
    if (dto.section && !sectionId) {
      throw new BadRequestException(
        `Section "${dto.section}" not found. It may have been deleted or renamed.`,
      );
    }

    // Look up the subject's owning department for the ownership check.
    const { data: subjectRow } = await this.supabase
      .getAdminClient()
      .from('subject')
      .select('dept_id')
      .eq('subject_id', dto.subjectId)
      .maybeSingle();

    const deptId = subjectRow?.dept_id ? String(subjectRow.dept_id) : null;

    const entry = this.scheduleRepo.create({
      termId: dto.termId,
      subjectId: dto.subjectId,
      facultyId: dto.facultyId ?? null,
      roomId: dto.roomId ?? null,
      timeslotId: null,
      section: dto.section ?? null,
      sectionId,
      deptId,   // ← NEW
      loadType: dto.loadType ?? null,
      dayOfWeek: dto.dayOfWeek as any,
      startTime:
        dto.startTime.length === 5 ? `${dto.startTime}:00` : dto.startTime,
      endTime: dto.endTime.length === 5 ? `${dto.endTime}:00` : dto.endTime,
      status: 'draft',
    });
    return this.scheduleRepo.save(entry);
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<Schedule> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    if (found.status === 'finalized' || found.status === 'published') {
      throw new BadRequestException(
        'This schedule entry is locked. Unfinalize it before making changes.',
      );
    }

    const normalizeTime = (t?: string) => {
      if (!t) return undefined;
      if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
      return t;
    };

    const newStart = normalizeTime(dto.startTime) ?? found.startTime;
    const newEnd = normalizeTime(dto.endTime) ?? found.endTime;

    if (newStart && newEnd) {
      const startMin = this.timeToMinutes(newStart);
      const endMin = this.timeToMinutes(newEnd);
      if (endMin <= startMin) {
        throw new BadRequestException('endTime must be after startTime');
      }
    }

    if (dto.dayOfWeek !== undefined) {
      found.dayOfWeek = dto.dayOfWeek as DayOfWeek;
    }
    if (dto.startTime !== undefined) {
      found.startTime = normalizeTime(dto.startTime) ?? null;
    }
    if (dto.endTime !== undefined) {
      found.endTime = normalizeTime(dto.endTime) ?? null;
    }
    if (dto.roomId !== undefined) found.roomId = dto.roomId;
    if (dto.facultyId !== undefined) found.facultyId = dto.facultyId;
    if (dto.section !== undefined) {
      found.section = dto.section ?? null;
      found.sectionId = await this.resolveSectionId(dto.section);
    }

    return this.scheduleRepo.save(found);
  }

  async updateStatus(
    id: string,
    status: Schedule['status'],
  ): Promise<Schedule> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException();
    found.status = status;
    return this.scheduleRepo.save(found);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    if (found.status === 'finalized' || found.status === 'published') {
      throw new BadRequestException(
        'This schedule entry is locked. Unfinalize it before deleting.',
      );
    }

    await this.scheduleRepo.delete(id);
    return { success: true };
  }

  // ════════════════════════════════════════════
  // AUTOSOLVER
  // ════════════════════════════════════════════

  async autoGenerate(termId: string, deptId: string, userId: string) {
    this.logger.log(
      `Auto-generate requested: term=${termId} dept=${deptId} by=${userId}`,
    );

    const problem = await this.buildSolverProblem(termId, deptId);

    // ── Pre-flight: room sufficiency check ──
    const sufficiency = this.analyzeRoomSufficiency(problem);
    if (!sufficiency.sufficient) {
      this.logger.warn(`Auto-generate blocked: ${sufficiency.hint}`);
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
      return { success: false, message: 'Solver service unavailable' };
    }

    if (result.status !== 'success') {
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
    await this.persistUnscheduled(termId, result.unscheduled ?? []);

    return {
      success: true,
      scheduleCount: saved.length,
      solveTimeSeconds: result.solveTimeSeconds ?? null,
      warnings: validation.softWarnings,
      unscheduled: result.unscheduled ?? [],
    };
  }

  // ────────────────────────────────────────────
  // buildSolverProblem
  // ────────────────────────────────────────────
  private async buildSolverProblem(termId: string, deptId: string) {
    const db = this.supabase.getAdminClient();

    const { data: programs, error: progErr } = await db
      .from('program')
      .select('program_id, program_code, program_name, dept_id')
      .eq('dept_id', deptId)
      .eq('is_active', true);

    if (progErr) throw new Error(`Failed to load programs: ${progErr.message}`);
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

    if (secErr) throw new Error(`Failed to load sections: ${secErr.message}`);
    if (!sections || sections.length === 0) {
      throw new BadRequestException(
        'No active sections found for this department',
      );
    }

    // ── Determine the term's semester ──
    const { data: termRow, error: termErr } = await db
      .from('term')
      .select('semester')
      .eq('term_id', termId)
      .maybeSingle();

    if (termErr) {
      this.logger.warn(
        `Failed to load term semester for ${termId}: ${termErr.message}`,
      );
    }

    const termSemester = termRow?.semester ?? '1st';
    this.logger.log(
      `Filtering prospectus by semester='${termSemester}' for term ${termId}`,
    );

    const { data: prospectus, error: prosErr } = await db
      .from('prospectus')
      .select('prospectus_id, program_id, subject_id, year_level, semester')
      .in('program_id', programIds)
      .eq('is_active', true)
      .eq('semester', termSemester);

    if (prosErr)
      throw new Error(`Failed to load prospectus: ${prosErr.message}`);

    const subjectIds = Array.from(
      new Set((prospectus ?? []).map((p) => String(p.subject_id))),
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

    if (subErr) throw new Error(`Failed to load subjects: ${subErr.message}`);

    // ── Filter to CPE-owned subjects only ──
    // External subjects (Math, GenEd, PE, EPIC, NSTP) have source_dept set
    // and are scheduled by other colleges, not the CPE solver.
    const cpeSubjects = (subjects ?? []).filter(
      (s: any) => !s.source_dept,
    );
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

    if (facErr) throw new Error(`Failed to load faculty: ${facErr.message}`);
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

    // ── Existing schedule rows for this term ──
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

    // ── settings ──
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
    };
  }

  // ────────────────────────────────────────────
  // generateTimeSlotGrid
  // ────────────────────────────────────────────
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
    const slots: Array<{ day: string; startTime: string; endTime: string }> = [];

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

  // ────────────────────────────────────────────
  // validateGeneratedSchedule
  // ────────────────────────────────────────────
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

  // ────────────────────────────────────────────
  // persistDraftSchedule
  // ────────────────────────────────────────────
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
        `Cleared prior auto-generated drafts for term=${termId}`,
      );
    }

    const sectionIds = Array.from(new Set(schedule.map((b) => b.sectionId)));
    const { data: sectionRows } = await this.supabase
      .getAdminClient()
      .from('section')
      .select('section_id, section_code')
      .in('section_id', sectionIds);

    const codeById = new Map<string, string>(
      (sectionRows ?? []).map((r) => [String(r.section_id), r.section_code]),
    );

    // Preload subject → dept_id map for the ownership assignment
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
        dept_id: deptBySubject.get(b.subjectId) ?? null,   // ← NEW
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
      this.logger.error(`persistDraftSchedule insert failed: ${error.message}`);
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

  // ────────────────────────────────────────────
  // persistUnscheduled
  // ────────────────────────────────────────────
  private async persistUnscheduled(
    termId: string,
    unscheduled: Array<{
      sectionId: string;
      subjectId: string;
      kind: 'lecture' | 'lab';
      sessionIndex: number;
    }>,
  ): Promise<void> {
    const db = this.supabase.getAdminClient();

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
      `Persisted ${rows.length} unscheduled block(s) for term=${termId}`,
    );
  }

  // ────────────────────────────────────────────
  // getUnscheduled
  // ────────────────────────────────────────────
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

  // ────────────────────────────────────────────
  // clearAutoDrafts
  // ────────────────────────────────────────────
  async clearAutoDrafts(termId: string): Promise<{ deleted: number }> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('schedule')
      .delete()
      .eq('term_id', termId)
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
      `Cleared ${deleted} auto-generated draft(s) for term=${termId}`,
    );
    return { deleted };
  }

  // ────────────────────────────────────────────
  // analyzeRoomSufficiency
  // ────────────────────────────────────────────
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

      for (const block of blocks) {
        let roomType: string | null = subj.requiredRoomType;
        if (!roomType) continue;

        const hours = (block.durationMinutes / 60) * sectionsTaking;
        demandByType.set(roomType, (demandByType.get(roomType) ?? 0) + hours);
      }
    }

    const startMin = this.timeToMinutes(problem.config.operatingHoursStart);
    const endMin = this.timeToMinutes(problem.config.operatingHoursEnd);
    const hoursPerDay = (endMin - startMin) / 60;
    const operatingDays = 6;
    const hoursPerWeekPerRoom = hoursPerDay * operatingDays;

    const supplyByType = new Map<string, { rooms: number; hours: number }>();
    for (const room of problem.rooms) {
      const entry = supplyByType.get(room.roomType) ?? { rooms: 0, hours: 0 };
      entry.rooms += 1;
      entry.hours += hoursPerWeekPerRoom;
      supplyByType.set(room.roomType, entry);
    }

    const deficits: Array<{
      roomType: string;
      neededHours: number;
      availableHours: number;
      shortByHours: number;
      suggestedExtraRooms: number;
    }> = [];

    for (const [roomType, demandHours] of demandByType.entries()) {
      const supply = supplyByType.get(roomType);
      const availableHours = supply?.hours ?? 0;

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
          `${d.suggestedExtraRooms} more ${d.roomType} room(s) ` +
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
      const totalLab = subject.labUnits * (config.labMinutesPerUnit ?? 180);
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

  // ════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════

  private timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  private async resolveSectionId(
    sectionCode?: string | null,
  ): Promise<string | null> {
    if (!sectionCode) return null;
    const section = await this.sectionRepo.findOne({
      where: { sectionCode },
      select: ['sectionId'],
    });
    return section?.sectionId ?? null;
  }

    /**
   * Public wrapper for the room sufficiency analysis.
   *
   * If `deptId` is provided, returns the analysis for that department.
   * If omitted, returns one analysis per active department (college-wide view).
   */
  async getRoomSufficiency(deptId?: string, termId?: string): Promise<
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

    // ── Resolve term ──
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

    // ── Resolve departments ──
    let depts: Array<{ dept_id: bigint | number; dept_code: string; dept_name: string }> = [];

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

    // ── Run analysis per department ──
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
                sum + this.computeBlocksForSufficiency(s, problem.config).length,
              0,
            ),
            rooms: problem.rooms.length,
          },
        });
      } catch (err) {
        // If a dept has no programs/sections yet, skip it gracefully
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
  private async assertOwnership(
    scheduleId: string,
    user: any,
  ): Promise<Schedule> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    // Admins bypass
    if (user.role === 'administrator' || user.role === 'college_dean') {
      return found;
    }

    // DH: only own dept
    if (user.role === 'department_head') {
      const userDeptId = user.dept_id ? String(user.dept_id) : null;
      if (!userDeptId || String(found.deptId) !== userDeptId) {
        throw new ForbiddenException(
          'You cannot edit schedules from other departments.',
        );
      }
    }

    return found;
  }
}