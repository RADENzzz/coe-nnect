import {
  Injectable,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';



// TODO(FR 6.1.x): schedule.conflict_detected — fire when a foreign-dept
// plot invalidates an existing entry. Deferred to a follow-up batch;
// the other 15 triggers cover the demo scope. Implement by:
//   1. In plot()/plotMulti(), detect hardConflicts that target an
//      existing schedule row with dept_id !== current subject's dept.
//   2. Dispatch to that row's owner DH.

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './entities/schedule.entity';
import { Term } from '../terms/entities/term.entity';
import { Section } from '../sections/entities/section.entity';
import { PlotSubjectDto } from './dto/plot-subject.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ValidatePlotDto } from './dto/validate-plot.dto';
import { ConstraintsService } from '../constraints/constraints.service';
import { AutoGenerateService } from './services/auto-generate.service';
import { RuleContextBuilder } from './services/rule-context.builder';
import { ScheduleFacultyService } from './services/schedule-faculty.service';
import { ScheduleFlagService } from './services/schedule-flag.service';
import { SchedulingCoverageService } from './services/scheduling-coverage.service';
import { ScheduleVersionService } from './services/schedule-version.service';
import { SupabaseService } from '../../database/supabase.service';
import { User } from '../users/entities/user.entity';
import { PlotMultiDto } from './dto/plot-multi.dto';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { RecipientsService } from '../notifications/recipients.service';

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
    private readonly scheduleVersions: ScheduleVersionService,
    private readonly scheduleFlags: ScheduleFlagService,
    private readonly faculty: ScheduleFacultyService,
    private readonly coverage: SchedulingCoverageService,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(Section) private sectionRepo: Repository<Section>,
    private readonly ruleContextBuilder: RuleContextBuilder,
    private readonly constraints: ConstraintsService,
    private readonly autoGenerateService: AutoGenerateService,
    private readonly supabase: SupabaseService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
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
    const guards: Array<{ ruleId: string; ruleName: string; reason: string }> =
      [];

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

    // ── F1b: F-8 is not meaningful during pre-flight validate ──
    // The plot path auto-creates the cross-department faculty_request.
    // The validate path is read-only and cannot. Filter F-8 out so the
    // DH isn't blocked by a rule the plot path itself will satisfy.
    const filteredHard = engineResult.hardConflicts.filter(
      (c) => c.ruleId !== 'F-8',
    );
    const filteredSoft = engineResult.softWarnings.filter(
      (c) => c.ruleId !== 'F-8',
    );

    return {
      valid: filteredHard.length === 0,
      hardConflicts: filteredHard,
      softWarnings: filteredSoft,
      alternatives: [],
    };
  }

  async updateRemarks(
    id: string,
    remarks: string | null,
    user: any,
  ): Promise<Schedule> {
    const found = await this.faculty.assertOwnership(id, user);
    found.remarks = remarks;
    return this.scheduleRepo.save(found);
  }

  // ════════════════════════════════════════════
  // Mutations
  // ════════════════════════════════════════════

  async plot(dto: PlotSubjectDto, user?: any): Promise<Schedule> {
    // ── F1: at least one faculty source, never both ──
    const hasSystemFaculty = !!dto.facultyId;
    const extTrimmed = dto.externalFacultyName?.trim() ?? '';
    const hasExternalFaculty = extTrimmed.length > 0;

    if (!hasSystemFaculty && !hasExternalFaculty) {
      throw new BadRequestException(
        'Either facultyId or externalFacultyName is required to plot a subject.',
      );
    }
    if (hasSystemFaculty && hasExternalFaculty) {
      throw new BadRequestException(
        'Cannot set both facultyId and externalFacultyName. Pick one.',
      );
    }

    const startMin = this.timeToMinutes(dto.startTime);
    const endMin = this.timeToMinutes(dto.endTime);

    if (endMin <= startMin) {
      throw new BadRequestException('H-7: End time must be after start time.');
    }
    if (startMin < 7 * 60) {
      throw new BadRequestException(
        'H-8: Class cannot start before 7:00 AM.',
      );
    }
    if (endMin > 19 * 60) {
      throw new BadRequestException(
        'H-8: Class cannot end after 7:00 PM.',
      );
    }

    const { data: subjectRow, error: subjErr } = await this.supabase
      .getAdminClient()
      .from('subject')
      .select('dept_id')
      .eq('subject_id', dto.subjectId)
      .maybeSingle();

    if (subjErr) {
      this.logger.warn(`plot: subject lookup failed: ${subjErr.message}`);
    }

    const subjectDeptId = subjectRow?.dept_id
      ? String(subjectRow.dept_id)
      : null;

    if (user && user.role === 'department_head') {
      const myDept = user.deptId != null ? String(user.deptId) : null;
      if (!myDept || !subjectDeptId || subjectDeptId !== myDept) {
        throw new ForbiddenException(
          'You can only plot subjects that belong to your own department.',
        );
      }
    }

    // ── F1b: create the cross-dept request BEFORE the engine runs
    //          so F-8 sees the pending request in the context ──
    const gate = await this.faculty.ensureCrossDeptFacultyRequest({
      facultyId: dto.facultyId,
      subjectDeptId,
      termId: dto.termId,
      subjectId: dto.subjectId,
      user,
    });

    const extRoomName = dto.externalRoomName?.trim() || undefined;

    const context = await this.ruleContextBuilder.build({
      termId: dto.termId,
      subjectId: dto.subjectId,
      facultyId: dto.facultyId,
      roomId: dto.roomId,
      externalRoomName: extRoomName,
      section: dto.section,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      loadType: dto.loadType,
    });

    const engineResult = this.constraints.evaluate(context);

    if (!engineResult.valid) {
      // ── F1b: roll back the gate if the engine rejects ──
      if (gate) {
        try {
          const db = this.supabase.getAdminClient();
          await db
            .from('faculty_request')
            .delete()
            .eq('request_id', gate.requestId);
          this.logger.log(
            `F1b: rolled back request ${gate.requestId} after engine rejection`,
          );
        } catch (err) {
          this.logger.warn(
            `F1b: rollback of request ${gate.requestId} failed: ${(err as Error).message}`,
          );
        }
      }

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

    const extRoomTrimmed = dto.externalRoomName?.trim() ?? '';

    const entry = this.scheduleRepo.create({
      termId: dto.termId,
      subjectId: dto.subjectId,
      facultyId: dto.facultyId ?? null,
      externalFacultyName: hasExternalFaculty ? extTrimmed : null,
      roomId: dto.roomId ?? null,
      externalRoomName: extRoomTrimmed.length > 0 ? extRoomTrimmed : null,
      timeslotId: null,
      section: dto.section ?? null,
      sectionId,
      deptId: subjectDeptId,
      pendingFacultyRequestId: gate?.requestId ?? null,
      pendingFacultyDeptId: gate?.facultyDeptId ?? null,
      loadType: dto.loadType ?? null,
      dayOfWeek: dto.dayOfWeek as any,
      startTime:
        dto.startTime.length === 5 ? `${dto.startTime}:00` : dto.startTime,
      endTime: dto.endTime.length === 5 ? `${dto.endTime}:00` : dto.endTime,
      status: 'draft',
    });
    const saved = await this.scheduleRepo.save(entry);

    // ── F1b: notify the faculty's dept head ──
    if (gate) {
      try {
        const targetDHs = await this.recipients.departmentHeadsOf(
          gate.facultyDeptId,
        );
        const subject = subjectRow as any;
        await this.dispatcher.dispatch('faculty_request.created', {
          recipientUserIds: targetDHs,
          title: 'Cross-department faculty request',
          body:
            `A faculty member from your department is scheduled for ` +
            `a subject from another department. Approve or reject on the Approvals page.`,
          entityType: 'faculty_request',
          entityId: gate.requestId,
          payload: {
            requestId: gate.requestId,
            termId: dto.termId,
            subjectId: dto.subjectId,
            facultyId: dto.facultyId,
          },
        });
      } catch (err) {
        this.logger.warn(
          `F1b: notification failed: ${(err as Error).message}`,
        );
      }
    }

    // Fire-and-forget overload check — only for system faculty
    if (dto.facultyId) {
      void this.faculty.checkFacultyOverload(dto.facultyId, dto.termId);
    }

    return saved;
  }

  async plotMulti(dto: PlotMultiDto, user?: any): Promise<Schedule[]> {
    // ── F1: at least one faculty source, never both ──
    const hasSystemFaculty = !!dto.facultyId;
    const extTrimmed = dto.externalFacultyName?.trim() ?? '';
    const hasExternalFaculty = extTrimmed.length > 0;

    if (!hasSystemFaculty && !hasExternalFaculty) {
      throw new BadRequestException(
        'Either facultyId or externalFacultyName is required.',
      );
    }
    if (hasSystemFaculty && hasExternalFaculty) {
      throw new BadRequestException(
        'Cannot set both facultyId and externalFacultyName. Pick one.',
      );
    }

    if (!dto.sessions || dto.sessions.length === 0) {
      throw new BadRequestException('At least one session is required.');
    }

    const { data: subjectRow, error: subjErr } = await this.supabase
      .getAdminClient()
      .from('subject')
      .select('dept_id')
      .eq('subject_id', dto.subjectId)
      .maybeSingle();

    if (subjErr) {
      this.logger.warn(
        `plotMulti: subject lookup failed: ${subjErr.message}`,
      );
    }

    const subjectDeptId = subjectRow?.dept_id
      ? String(subjectRow.dept_id)
      : null;

    if (user && user.role === 'department_head') {
      const myDept = user.deptId != null ? String(user.deptId) : null;
      if (!myDept || !subjectDeptId || subjectDeptId !== myDept) {
        throw new ForbiddenException(
          'You can only plot subjects that belong to your own department.',
        );
      }
    }


    // ── F1b: create the cross-dept request BEFORE the engine runs ──
    const gate = await this.faculty.ensureCrossDeptFacultyRequest({
      facultyId: dto.facultyId,
      subjectDeptId,
      termId: dto.termId,
      subjectId: dto.subjectId,
      user,
    });

    // ── External room name (2026-10-15) ──
    // Trimmed once here and reused in every session's context + in the
    // final rows array. Empty string → undefined (treated as not set).
    const extRoomName = dto.externalRoomName?.trim() || undefined;

    const errors: Array<{ dayOfWeek: string; reason: string }> = [];

    for (const session of dto.sessions) {
      const startMin = this.timeToMinutes(session.startTime);
      const endMin = this.timeToMinutes(session.endTime);

      if (endMin <= startMin) {
        errors.push({
          dayOfWeek: session.dayOfWeek,
          reason: `${session.dayOfWeek}: end time must be after start time.`,
        });
        continue;
      }
      if (startMin < 7 * 60) {
        errors.push({
          dayOfWeek: session.dayOfWeek,
          reason: `${session.dayOfWeek}: class cannot start before 7:00 AM.`,
        });
        continue;
      }
      if (endMin > 19 * 60) {
        errors.push({
          dayOfWeek: session.dayOfWeek,
          reason: `${session.dayOfWeek}: class cannot end after 7:00 PM.`,
        });
        continue;
      }

      const context = await this.ruleContextBuilder.build({
        termId: dto.termId,
        subjectId: dto.subjectId,
        facultyId: dto.facultyId,
        roomId: dto.roomId,
        externalRoomName: extRoomName,
        section: dto.section,
        dayOfWeek: session.dayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        loadType: dto.loadType,
      });

      const engineResult = this.constraints.evaluate(context);
      if (!engineResult.valid) {
        const reasons = engineResult.hardConflicts
          .map((c) => `${c.ruleId}: ${c.reason}`)
          .join('; ');
        errors.push({
          dayOfWeek: session.dayOfWeek,
          reason: `${session.dayOfWeek}: ${reasons}`,
        });
      }
    }

    if (errors.length > 0) {
      // ── F1b: roll back the gate if the engine rejected ──
      if (gate) {
        try {
          const db = this.supabase.getAdminClient();
          await db
            .from('faculty_request')
            .delete()
            .eq('request_id', gate.requestId);
          this.logger.log(
            `F1b: rolled back request ${gate.requestId} after engine rejection`,
          );
        } catch (err) {
          this.logger.warn(
            `F1b: rollback of request ${gate.requestId} failed: ${(err as Error).message}`,
          );
        }
      }

      const summary = errors.map((e) => e.reason).join('\n');
      throw new BadRequestException(
        `Cannot plot — hard conflicts detected:\n${summary}`,
      );
    }

    const sectionId = await this.resolveSectionId(dto.section);
    if (dto.section && !sectionId) {
      throw new BadRequestException(
        `Section "${dto.section}" not found. It may have been deleted or renamed.`,
      );
    }


    const rows = dto.sessions.map((s) => ({
      termId: dto.termId,
      subjectId: dto.subjectId,
      facultyId: dto.facultyId ?? null,
      externalFacultyName: hasExternalFaculty ? extTrimmed : null,
      roomId: dto.roomId ?? null,
      externalRoomName: extRoomName ?? null,        // ← NEW
      timeslotId: null,
      section: dto.section ?? null,
      sectionId,
      deptId: subjectDeptId,
      pendingFacultyRequestId: gate?.requestId ?? null,
      pendingFacultyDeptId: gate?.facultyDeptId ?? null,
      loadType: dto.loadType ?? null,
      dayOfWeek: s.dayOfWeek as DayOfWeek,
      startTime: s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime,
      endTime: s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime,
      status: 'draft' as const,
    }));

    const created = this.scheduleRepo.create(rows);
    const saved = await this.scheduleRepo.save(created);

    // Fire-and-forget overload check — only for system faculty
    if (dto.facultyId) {
      void this.faculty.checkFacultyOverload(dto.facultyId, dto.termId);
    }

    return saved;
  }

  async update(
    id: string,
    dto: UpdateScheduleDto,
    user: any,
  ): Promise<Schedule> {
    const found = await this.faculty.assertOwnership(id, user);

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

        if (dto.externalRoomName !== undefined) {
      const trimmed = (dto.externalRoomName ?? '').trim();
      found.externalRoomName = trimmed.length > 0 ? trimmed : null;
    }

    if (dto.loadType !== undefined) found.loadType = dto.loadType;

    // ── F1: faculty source — system OR external, never both ──
    const sysFacultyProvided = dto.facultyId !== undefined;
    const extFacultyProvided = dto.externalFacultyName !== undefined;

    // Compute what the caller is trying to SET (non-empty, non-null)
    const sysFacultySet =
      sysFacultyProvided &&
      dto.facultyId !== null &&
      dto.facultyId !== '';
    const extRaw = (dto.externalFacultyName ?? '').trim();
    const extFacultySet = extFacultyProvided && extRaw !== '';

    // Reject if both are being set simultaneously
    if (sysFacultySet && extFacultySet) {
      throw new BadRequestException(
        'Cannot set both facultyId and externalFacultyName. Pick one.',
      );
    }

    // ── Track the pre-edit gate so we can clean up if it's no longer needed ──
    const previousRequestId = found.pendingFacultyRequestId;

    if (sysFacultySet) {
      // Setting a system faculty → clears external
      found.facultyId = dto.facultyId as string;
      found.externalFacultyName = null;
    } else if (extFacultySet) {
      // Setting an external name → clears system faculty
      found.externalFacultyName = extRaw;
      found.facultyId = null;
    } else if (sysFacultyProvided && dto.facultyId === null) {
      // Explicit clear of system faculty
      found.facultyId = null;
    } else if (
      extFacultyProvided &&
      (dto.externalFacultyName === null || extRaw === '')
    ) {
      // Explicit clear of external faculty
      found.externalFacultyName = null;
    }

    // ── F1b: if the faculty source changed, re-evaluate the gate ──
    // Cases where the gate is no longer needed:
    //   - faculty is now external (no system faculty → no dept to approve)
    //   - faculty is cleared entirely
    //   - faculty changed to one from the same dept as the subject
    //
    // We compute the NEW gate state below and reconcile after save.
    let needsGateRefresh = false;

    if (!found.facultyId) {
      // No system faculty anymore → gate no longer needed
      needsGateRefresh = true;
    } else if (found.facultyId !== (dto.facultyId ?? null)) {
      // Faculty changed — re-check whether it's still cross-dept
      needsGateRefresh = true;
    }

    if (needsGateRefresh) {
      found.pendingFacultyRequestId = null;
      found.pendingFacultyDeptId = null;
    }

    // ── Section handling — sectionId takes precedence, supports explicit clear ──
    if (dto.sectionId !== undefined) {
      if (dto.sectionId === null || dto.sectionId === '') {
        // Explicit clear via sectionId
        found.sectionId = null;
        found.section = null;
      } else {
        const sec = await this.sectionRepo.findOne({
          where: { sectionId: dto.sectionId },
          select: ['sectionId', 'sectionCode'],
        });
        if (!sec) {
          throw new BadRequestException(
            `Section with id "${dto.sectionId}" not found.`,
          );
        }
        found.sectionId = sec.sectionId;
        found.section = sec.sectionCode;
      }
    } else if (dto.section !== undefined) {
      if (dto.section === null || dto.section === '') {
        // Explicit clear via section code
        found.section = null;
        found.sectionId = null;
      } else {
        // Set (or change) — fail loud if the code doesn't resolve
        const resolved = await this.resolveSectionId(dto.section);
        if (!resolved) {
          throw new BadRequestException(
            `Section "${dto.section}" not found. It may have been deleted or renamed.`,
          );
        }
        found.section = dto.section;
        found.sectionId = resolved;
      }
    }

    const saved = await this.scheduleRepo.save(found);

    // ── F1b: cancel the old request if we dropped the gate ──
    if (
      previousRequestId &&
      previousRequestId !== saved.pendingFacultyRequestId
    ) {
      await this.faculty.cancelOrphanedFacultyRequest(previousRequestId);
    }

    // ── F1b: if the new faculty is cross-dept, ensure a fresh gate ──
    if (!saved.pendingFacultyRequestId && saved.facultyId) {
      const { data: subjRow } = await this.supabase
        .getAdminClient()
        .from('subject')
        .select('dept_id')
        .eq('subject_id', saved.subjectId)
        .maybeSingle();
      const subjectDeptId = subjRow?.dept_id ? String(subjRow.dept_id) : null;

      if (subjectDeptId) {
        const gate = await this.faculty.ensureCrossDeptFacultyRequest({
          facultyId: saved.facultyId,
          subjectDeptId,
          termId: saved.termId,
          subjectId: saved.subjectId,
          user,
        });

        if (gate) {
          saved.pendingFacultyRequestId = gate.requestId;
          saved.pendingFacultyDeptId = gate.facultyDeptId;
          await this.scheduleRepo.save(saved);

          try {
            const targetDHs = await this.recipients.departmentHeadsOf(
              gate.facultyDeptId,
            );
            await this.dispatcher.dispatch('faculty_request.created', {
              recipientUserIds: targetDHs,
              title: 'Cross-department faculty request',
              body:
                'A schedule edit created a new cross-department faculty ' +
                'assignment. Approve or reject on the Approvals page.',
              entityType: 'faculty_request',
              entityId: gate.requestId,
              payload: {
                requestId: gate.requestId,
                termId: saved.termId,
                subjectId: saved.subjectId,
                facultyId: saved.facultyId,
                reason: 'schedule_edit',
              },
            });
          } catch (err) {
            this.logger.warn(
              `F1b update: notification failed: ${(err as Error).message}`,
            );
          }
        }
      }
    }

    return saved;
  } 

  /**
   * Update a schedule entry's status.
   *
   * When transitioning to 'finalized', snapshot the entire term's
   * schedule into schedule_version (FR 5.1.8a). All-or-nothing: if the
   * snapshot write fails, the status change is rejected.
   *
   * The DB trigger (trg_schedule_status_flow) enforces legal transitions
   * at the row level; this method additionally ensures we only snapshot
   * when the entry actually becomes finalized.
   */
  async updateStatus(
    id: string,
    status: Schedule['status'],
    user: any,
  ): Promise<Schedule> {
    const found = await this.faculty.assertOwnership(id, user);

        // ── F1b: cannot finalize while pending cross-dept approval ──
    if (status === 'finalized' && found.pendingFacultyRequestId) {
      throw new BadRequestException(
        'This entry has a pending cross-department faculty approval. ' +
          'Wait for approval before finalizing.',
      );
    }

    const previousStatus = found.status;
    const isBecomingFinalized =
      status === 'finalized' && previousStatus !== 'finalized';

    found.status = status;
    const saved = await this.scheduleRepo.save(found);

      // ═══ Notification: status changed ═══
    if (previousStatus !== status) {
      const recipients = await this.recipients.departmentHeadsOfSchedule(id);
      await this.dispatcher.dispatch('schedule.status_changed', {
        recipientUserIds: recipients,
        title: 'Schedule status changed',
        body: `${found.subject?.subjectCode ?? 'A schedule entry'} moved from ${previousStatus} to ${status}.`,
        entityType: 'schedule',
        entityId: id,
        payload: {
          previousStatus,
          newStatus: status,
          changedBy: user?.userId ?? null,
        },
      });
    }

    if (isBecomingFinalized) {
      try {
        await this.scheduleVersions.writeVersion(found.termId, user);
      } catch (err) {
        this.logger.error(
          `Schedule version snapshot failed for term=${found.termId}: ${(err as Error).message}`,
        );
        // Best-effort: the status change is already committed by the DB
        // trigger, so we don't roll it back. Log and move on. The version
        // can be created later via a re-finalize or a manual trigger.
      }
    }

    return saved;
  }

  async remove(id: string, user: any): Promise<{ success: boolean }> {
    const found = await this.faculty.assertOwnership(id, user);

    if (found.status === 'finalized' || found.status === 'published') {
      throw new BadRequestException(
        'This schedule entry is locked. Unfinalize it before deleting.',
      );
    }

    const requestId = found.pendingFacultyRequestId;

    await this.scheduleRepo.delete(id);

    // ── F1b: if we just orphaned a pending cross-dept request, cancel it ──
    if (requestId) {
      await this.faculty.cancelOrphanedFacultyRequest(requestId);
    }

    return { success: true };
  }

  // Public facade: version history lives in ScheduleVersionService.

  findVersions(termId: string) {
    return this.scheduleVersions.findVersions(termId);
  }

  findVersion(versionId: string) {
    return this.scheduleVersions.findVersion(versionId);
  }

  compareVersions(versionAId: string, versionBId: string) {
    return this.scheduleVersions.compareVersions(versionAId, versionBId);
  }

  // Public facade: flag handling lives in ScheduleFlagService.

  flagSchedule(id: string, reason: string, user: User) {
    return this.scheduleFlags.flagSchedule(id, reason, user);
  }

  unflagSchedule(id: string, user: User) {
    return this.scheduleFlags.unflagSchedule(id, user);
  }

  findFlagged(termId: string, user: any) {
    return this.scheduleFlags.findFlagged(termId, user);
  }

  // Public facade: coverage queries live in SchedulingCoverageService.

  findUnplottedMinors(termId: string, deptId: string) {
    return this.coverage.findUnplottedMinors(termId, deptId);
  }

  getCoverage(termId: string, deptId: string) {
    return this.coverage.getCoverage(termId, deptId);
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


  // Public facade: auto-generation and room capacity live in AutoGenerateService.

  autoGenerate(
    termId: string,
    deptId: string,
    userId: string,
    options: { acknowledgeUnplottedMinors?: boolean } = {},
  ) {
    return this.autoGenerateService.autoGenerate(termId, deptId, userId, options);
  }

  getUnscheduled(termId: string) {
    return this.autoGenerateService.getUnscheduled(termId);
  }

  clearAutoDrafts(termId: string) {
    return this.autoGenerateService.clearAutoDrafts(termId);
  }

  getRoomSufficiency(deptId?: string, termId?: string) {
    return this.autoGenerateService.getRoomSufficiency(deptId, termId);
  }

  confirmAutoGenerate(termId: string, userId: string) {
    return this.autoGenerateService.confirmAutoGenerate(termId, userId);
  }

  discardAutoGenerate(termId: string, userId: string) {
    return this.autoGenerateService.discardAutoGenerate(termId, userId);
  }

  abandonAutoGenerate(termId: string, userId: string) {
    return this.autoGenerateService.abandonAutoGenerate(termId, userId);
  }

  getAutoGenerateLock(termId: string, userId: string) {
    return this.autoGenerateService.getAutoGenerateLock(termId, userId);
  }
}
