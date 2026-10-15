import {
  Injectable,
  NotFoundException,
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
import { ScheduleVersion } from './entities/schedule-version.entity';
import { Term } from '../terms/entities/term.entity';
import { Section } from '../sections/entities/section.entity';
import { PlotSubjectDto } from './dto/plot-subject.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ValidatePlotDto } from './dto/validate-plot.dto';
import { ConstraintsService } from '../constraints/constraints.service';
import { RuleContextBuilder } from './services/rule-context.builder';
import { SolverClient } from './services/solver.client';
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

  private readonly autoGenerateInFlight = new Set<string>();

  constructor(
    @InjectRepository(Schedule) private scheduleRepo: Repository<Schedule>,
    @InjectRepository(ScheduleVersion)
    private versionRepo: Repository<ScheduleVersion>,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(Section) private sectionRepo: Repository<Section>,
    private readonly ruleContextBuilder: RuleContextBuilder,
    private readonly constraints: ConstraintsService,
    private readonly solverClient: SolverClient,
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
    const found = await this.assertOwnership(id, user);
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
    const gate = await this.ensureCrossDeptFacultyRequest({
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
      void this.checkFacultyOverload(dto.facultyId, dto.termId);
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
    // ── F1b: create the cross-dept request BEFORE the engine runs ──
    const gate = await this.ensureCrossDeptFacultyRequest({
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
      void this.checkFacultyOverload(dto.facultyId, dto.termId);
    }

    return saved;
  }

  async update(
    id: string,
    dto: UpdateScheduleDto,
    user: any,
  ): Promise<Schedule> {
    const found = await this.assertOwnership(id, user);

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
      await this.cancelOrphanedFacultyRequest(previousRequestId);
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
        const gate = await this.ensureCrossDeptFacultyRequest({
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
    const found = await this.assertOwnership(id, user);

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
        await this.writeScheduleVersion(found.termId, user);
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
    const found = await this.assertOwnership(id, user);

    if (found.status === 'finalized' || found.status === 'published') {
      throw new BadRequestException(
        'This schedule entry is locked. Unfinalize it before deleting.',
      );
    }

    const requestId = found.pendingFacultyRequestId;

    await this.scheduleRepo.delete(id);

    // ── F1b: if we just orphaned a pending cross-dept request, cancel it ──
    if (requestId) {
      await this.cancelOrphanedFacultyRequest(requestId);
    }

    return { success: true };
  }

  // ════════════════════════════════════════════
  // SCHEDULE VERSION — FR 5.1.8(a)
  // ════════════════════════════════════════════

  /**
   * Build and persist a full-term snapshot of the current schedule.
   * Scope: faculty_id = NULL (term-wide version).
   *
   * Snapshot is denormalized so it stays readable even after subjects,
   * faculty, or rooms are renamed or deleted.
   */
  private async writeScheduleVersion(
    termId: string,
    user: any,
  ): Promise<ScheduleVersion> {
    const entries = await this.scheduleRepo.find({
      where: { termId },
      relations: ['subject', 'faculty', 'room', 'timeSlot'],
      order: { scheduleId: 'ASC' },
    });

    const capturedAt = new Date();
    const capturedBy = user?.userId ?? user?.id ?? null;

    const snapshot = {
      snapshot_version: 1,
      term_id: termId,
      captured_at: capturedAt.toISOString(),
      captured_by: capturedBy,
      entry_count: entries.length,
      entries: entries.map((e) => ({
        schedule_id: e.scheduleId,
        section_id: e.sectionId ?? null,
        section_code: e.section ?? null,
        subject_id: e.subjectId,
        subject_code: e.subject?.subjectCode ?? null,
        subject_title: e.subject?.title ?? null,
        faculty_id: e.facultyId ?? null,
        external_faculty_name: e.externalFacultyName ?? null,
        faculty_name: e.faculty
          ? `${e.faculty.firstName} ${e.faculty.lastName}`
          : e.externalFacultyName ?? null,
        room_id: e.roomId ?? null,
        room_number: e.room?.roomNumber ?? null,
        building: e.room?.building ?? null,
        day_of_week: e.dayOfWeek ?? null,
        start_time: e.startTime ?? null,
        end_time: e.endTime ?? null,
        load_type: e.loadType ?? null,
        status: e.status,
        remarks: e.remarks ?? null,
        dept_id: e.deptId ?? null,
      })),
    };

    // Compute next version_number atomically per term (term-wide only).
    const nextNumber = await this.nextVersionNumber(termId);

    const version = this.versionRepo.create({
      termId,
      facultyId: null,
      versionNumber: nextNumber,
      snapshot,
      lastModifiedAt: capturedAt,
      finalizedBy: capturedBy,
    });

    const saved = await this.versionRepo.save(version);
    this.logger.log(
      `Schedule version v${saved.versionNumber} written for term=${termId} ` +
        `(${entries.length} entries) by=${capturedBy}`,
    );
    return saved;
  }

  private async nextVersionNumber(termId: string): Promise<number> {
    const row = await this.versionRepo
      .createQueryBuilder('v')
      .select('COALESCE(MAX(v.version_number), 0)', 'max')
      .where('v.term_id = :termId', { termId })
      .andWhere('v.faculty_id IS NULL')
      .getRawOne<{ max: string | number }>();

    const max = row?.max != null ? Number(row.max) : 0;
    return max + 1;
  }

  /**
   * List all versions for a term, newest first.
   * Returns lightweight summaries (no full snapshot).
   */
  async findVersions(termId: string): Promise<
    Array<{
      versionId: string;
      versionNumber: number;
      termId: string;
      facultyId: string | null;
      finalizedBy: string | null;
      finalizedByName: string | null;
      lastModifiedAt: string;
      entryCount: number;
      capturedAt: string | null;
    }>
  > {
    const rows = await this.versionRepo.find({
      where: { termId },
      order: { versionNumber: 'DESC' },
    });

    // Batch-resolve user display names for finalized_by
    const userIds = Array.from(
      new Set(
        rows
          .map((r) => r.finalizedBy)
          .filter((v): v is string => !!v),
      ),
    );

    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data } = await this.supabase
        .getAdminClient()
        .from('users')
        .select('user_id, username, email')
        .in('user_id', userIds);

      for (const u of data ?? []) {
        const display =
          u.username && String(u.username).trim() !== ''
            ? String(u.username)
            : String(u.email ?? '');
        nameById.set(String(u.user_id), display);
      }
    }

    return rows.map((r) => {
      const snap = (r.snapshot ?? {}) as Record<string, unknown>;
      return {
        versionId: r.versionId,
        versionNumber: r.versionNumber,
        termId: r.termId,
        facultyId: r.facultyId,
        finalizedBy: r.finalizedBy,
        finalizedByName: r.finalizedBy
          ? nameById.get(r.finalizedBy) ?? null
          : null,
        lastModifiedAt: r.lastModifiedAt.toISOString(),
        entryCount: Number(snap.entry_count ?? 0),
        capturedAt:
          typeof snap.captured_at === 'string' ? snap.captured_at : null,
      };
    });
  }

  /**
   * Fetch a single version with its full snapshot.
   */
  async findVersion(
    versionId: string,
  ): Promise<ScheduleVersion & { finalizedByName: string | null }> {
    const found = await this.versionRepo.findOne({
      where: { versionId },
    });
    if (!found) {
      throw new NotFoundException(`Schedule version ${versionId} not found`);
    }

    let finalizedByName: string | null = null;
    if (found.finalizedBy) {
      const { data } = await this.supabase
        .getAdminClient()
        .from('users')
        .select('user_id, username, email')
        .eq('user_id', found.finalizedBy)
        .maybeSingle();
      if (data) {
        finalizedByName =
          data.username && String(data.username).trim() !== ''
            ? String(data.username)
            : String(data.email ?? '');
      }
    }

    return Object.assign(found, { finalizedByName });
  }

  /**
   * Compare two versions of the same term.
   *
   * Returns a structured diff:
   *   - added:   entries present in B, not in A
   *   - removed: entries present in A, not in B
   *   - moved:   entries in both, but day/time/room/faculty differ
   *   - unchanged: entries identical in both
   *
   * Matching key = (section_id, subject_id, load_type, session_index).
   * If the schema doesn't expose session_index on schedule rows, we fall
   * back to a positional match within (section_id, subject_id, load_type).
   */
  async compareVersions(
    versionAId: string,
    versionBId: string,
  ): Promise<{
    versionA: {
      versionId: string;
      versionNumber: number;
      finalizedByName: string | null;
      lastModifiedAt: string;
      entryCount: number;
    };
    versionB: {
      versionId: string;
      versionNumber: number;
      finalizedByName: string | null;
      lastModifiedAt: string;
      entryCount: number;
    };
    added: Array<Record<string, unknown>>;
    removed: Array<Record<string, unknown>>;
    moved: Array<{
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      changes: string[];
    }>;
    unchanged: number;
  }> {
    const a = await this.findVersion(versionAId);
    const b = await this.findVersion(versionBId);

    if (a.termId !== b.termId) {
      throw new BadRequestException(
        'Cannot compare versions from different terms',
      );
    }

    const entriesA = this.extractEntries(a.snapshot);
    const entriesB = this.extractEntries(b.snapshot);

    const keyOf = (e: Record<string, unknown>): string => {
      const section = e.section_id ?? e.section_code ?? '';
      const subject = e.subject_id ?? '';
      const load = e.load_type ?? '';
      return `${section}::${subject}::${load}`;
    };

    // Group by key so multi-session subjects are matched positionally
    const groupA = this.groupBy(entriesA, keyOf);
    const groupB = this.groupBy(entriesB, keyOf);

    const added: Array<Record<string, unknown>> = [];
    const removed: Array<Record<string, unknown>> = [];
    const moved: Array<{
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      changes: string[];
    }> = [];
    let unchanged = 0;

    const allKeys = new Set([...groupA.keys(), ...groupB.keys()]);

    for (const key of allKeys) {
      const listA = groupA.get(key) ?? [];
      const listB = groupB.get(key) ?? [];

      const maxLen = Math.max(listA.length, listB.length);
      for (let i = 0; i < maxLen; i++) {
        const eA = listA[i];
        const eB = listB[i];

        if (eA && !eB) {
          removed.push(eA);
          continue;
        }
        if (!eA && eB) {
          added.push(eB);
          continue;
        }
        if (!eA || !eB) continue;

        const changes = this.diffEntry(eA, eB);
        if (changes.length === 0) {
          unchanged++;
        } else {
          moved.push({ before: eA, after: eB, changes });
        }
      }
    }

    return {
      versionA: {
        versionId: a.versionId,
        versionNumber: a.versionNumber,
        finalizedByName: a.finalizedByName,
        lastModifiedAt: a.lastModifiedAt.toISOString(),
        entryCount: entriesA.length,
      },
      versionB: {
        versionId: b.versionId,
        versionNumber: b.versionNumber,
        finalizedByName: b.finalizedByName,
        lastModifiedAt: b.lastModifiedAt.toISOString(),
        entryCount: entriesB.length,
      },
      added,
      removed,
      moved,
      unchanged,
    };
  }

  private extractEntries(
    snapshot: Record<string, unknown> | null,
  ): Array<Record<string, unknown>> {
    if (!snapshot) return [];
    const entries = snapshot.entries;
    return Array.isArray(entries) ? (entries as Array<Record<string, unknown>>) : [];
  }

  private groupBy<T>(
    items: T[],
    keyFn: (item: T) => string,
  ): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const key = keyFn(item);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }

  private diffEntry(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): string[] {
    const fields: Array<[string, string]> = [
      ['day_of_week', 'day'],
      ['start_time', 'start time'],
      ['end_time', 'end time'],
      ['room_id', 'room'],
      ['faculty_id', 'faculty'],
    ];
    const changes: string[] = [];
    for (const [field, label] of fields) {
      if (a[field] !== b[field]) {
        changes.push(label);
      }
    }
    return changes;
  }

  // ════════════════════════════════════════════
  // FLAG SYSTEM
  // ════════════════════════════════════════════

  async flagSchedule(
    id: string,
    reason: string,
    user: User,
  ): Promise<Schedule> {
    if (!user?.userId) {
      throw new ForbiddenException('Not authenticated');
    }

    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    found.flagged = true;
    found.flaggedBy = user.userId;
    found.flaggedAt = new Date();
    found.flagReason = reason;

    this.logger.log(
      `Schedule ${id} flagged by ${user.userId} (role=${user.role}, dept=${user.deptId}): ${reason}`,
    );
    const saved = await this.scheduleRepo.save(found);

    

    // ═══ Notification: flagged ═══
    const ownerDHs = await this.recipients.departmentHeadsOfSchedule(id);
    const dean = await this.recipients.collegeDean();
    await this.dispatcher.dispatch('schedule.flagged', {
      recipientUserIds: this.recipients.uniq([...ownerDHs, ...dean]),
      title: 'Schedule entry flagged',
      body: `An entry was flagged for review: ${reason}`,
      entityType: 'schedule',
      entityId: id,
      payload: {
        reason,
        flaggedBy: user.userId,
        flaggedByName: user.email ?? null,
        subjectCode: null, // enrich if available from a join
      },
    });

    return saved;
  }

  async unflagSchedule(id: string, user: User): Promise<Schedule> {
    if (!user?.userId) {
      throw new ForbiddenException('Not authenticated');
    }

    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    // Keep the `administrator` bypass so the hidden dev account can
    // always clear a flag (recovery path). The user-facing role with
    // this power is now `college_dean`.
    const isDevAccount = user.role === 'administrator';
    const isDean = user.role === 'college_dean';

    const isFlagger =
      found.flaggedBy && String(found.flaggedBy) === String(user.userId);
    const isOwnerDH =
      user.role === 'department_head' &&
      user.deptId != null &&
      String(found.deptId) === String(user.deptId);

    if (!isDevAccount && !isDean && !isFlagger && !isOwnerDH) {
      throw new ForbiddenException(
        'Only the person who flagged this entry, the owning department head, a Dean, or an Administrator can clear the flag.',
      );
    }

    found.flagged = false;
    found.flaggedBy = null;
    found.flaggedAt = null;
    found.flagReason = null;

    this.logger.log(`Schedule ${id} unflagged by ${user.userId}`);
    return this.scheduleRepo.save(found);
  }

  async findFlagged(termId: string, user: any): Promise<Schedule[]> {
    const qb = this.scheduleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.subject', 'subject')
      .leftJoinAndSelect('s.faculty', 'faculty')
      .leftJoinAndSelect('s.room', 'room')
      .where('s.term_id = :termId', { termId })
      .andWhere('s.flagged = true')
      .orderBy('s.flagged_at', 'DESC');

    if (user?.role === 'department_head' && user.deptId != null) {
      qb.andWhere('s.dept_id = :deptId', { deptId: String(user.deptId) });
    }

    return qb.getMany();
  }


  // ════════════════════════════════════════════
  // MINOR SUBJECTS — unplotted detection
  // ════════════════════════════════════════════

  /**
   * Find minor subjects (subject.is_minor = true) that appear in the
   * term's prospectus for the active department but have no schedule
   * rows yet.
   *
   * Used by:
   *   - The Timetable page banner
   *   - The auto-generate pre-flight check (Drop C)
   */
  async findUnplottedMinors(
    termId: string,
    deptId: string,
  ): Promise<
    Array<{
      subjectId: string;
      subjectCode: string;
      title: string;
      deptId: string | null;
      yearLevel: number | null;
      semester: string | null;
      programId: string | null;
      programCode: string | null;
    }>
  > {
    const db = this.supabase.getAdminClient();

    // ── 1. Resolve term semester ──
    const { data: term } = await db
      .from('term')
      .select('semester')
      .eq('term_id', termId)
      .maybeSingle();

    if (!term?.semester) {
      // No semester on the term → cannot determine prospectus scope.
      // Return empty (caller can decide whether to warn).
      return [];
    }
    const semester = term.semester;

    // ── 2. Programs in this department ──
    const { data: programs } = await db
      .from('program')
      .select('program_id, program_code')
      .eq('dept_id', deptId)
      .eq('is_active', true);

    const programIds = (programs ?? []).map((p) => String(p.program_id));
    if (programIds.length === 0) return [];

    // ── 3. Prospectus entries for this semester ──
    const { data: prospectusRows } = await db
      .from('prospectus')
      .select('subject_id, year_level, semester, program_id')
      .in('program_id', programIds)
      .eq('is_active', true)
      .eq('semester', semester);

    const prospectusSubjectIds = Array.from(
      new Set((prospectusRows ?? []).map((p) => String(p.subject_id))),
    );
    if (prospectusSubjectIds.length === 0) return [];

    // ── 4. Minor subjects in those prospectus entries ──
    const { data: minorSubjects } = await db
      .from('subject')
      .select('subject_id, subject_code, title, dept_id, is_minor')
      .in('subject_id', prospectusSubjectIds)
      .eq('is_minor', true)
      .eq('is_active', true);

    if (!minorSubjects || minorSubjects.length === 0) return [];

    // ── 5. Which of those already have schedule rows? ──
    const { data: plotted } = await db
      .from('schedule')
      .select('subject_id')
      .eq('term_id', termId)
      .in(
        'subject_id',
        minorSubjects.map((s) => String(s.subject_id)),
      );

    const plottedIds = new Set(
      (plotted ?? []).map((r) => String(r.subject_id)),
    );

    // ── 6. Assemble output ──
    const programCodeById = new Map(
      (programs ?? []).map((p) => [
        String(p.program_id),
        p.program_code as string,
      ]),
    );

    const result: Array<{
      subjectId: string;
      subjectCode: string;
      title: string;
      deptId: string | null;
      yearLevel: number | null;
      semester: string | null;
      programId: string | null;
      programCode: string | null;
    }> = [];

    for (const subj of minorSubjects) {
      if (plottedIds.has(String(subj.subject_id))) continue;

      const ctx = (prospectusRows ?? []).find(
        (p) => String(p.subject_id) === String(subj.subject_id),
      );
      result.push({
        subjectId: String(subj.subject_id),
        subjectCode: subj.subject_code ?? '?',
        title: subj.title ?? '',
        deptId: subj.dept_id ? String(subj.dept_id) : null,
        yearLevel: ctx?.year_level ?? null,
        semester: ctx?.semester ?? null,
        programId: ctx?.program_id ? String(ctx.program_id) : null,
        programCode: ctx?.program_id
          ? programCodeById.get(String(ctx.program_id)) ?? null
          : null,
      });
    }

    result.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
    return result;
  }

    /**
   * Coverage indicator — compares what the prospectus expects to be
   * taught against what's actually plotted in the live term schedule.
   *
   * Scope:
   *   - Per (subject, section) pair  (Q1 = B)
   *   - Expected = prospectus entry × each matching section  (Q2 = C)
   *   - External subjects (source_dept is set) excluded
   *   - Status ignored — draft counts as plotted  (Q5)
   *   - Dept-wide always, regardless of current UI filter  (Q4)
   *
   * Returns:
   *   - totals (expected / plotted / missing / percent)
   *   - missing[]           one entry per (subject, section) pair
   *   - bySection[]         per-section rollup for the panel
   *   - byProgram[]         per-program rollup for the panel
   */
  async getCoverage(
    termId: string,
    deptId: string,
  ): Promise<{
    termId: string;
    deptId: string;
    termSemester: string | null;
    totals: {
      expected: number;
      plotted: number;
      missing: number;
      percent: number;
    };
    missing: Array<{
      subjectId: string;
      subjectCode: string;
      title: string;
      isMinor: boolean;
      programId: string;
      programCode: string | null;
      yearLevel: number;
      semester: string;
      sectionId: string;
      sectionCode: string;
      loadTypes: Array<'lecture' | 'laboratory'>;
    }>;
    bySection: Array<{
      sectionId: string;
      sectionCode: string;
      expected: number;
      plotted: number;
      missing: number;
    }>;
    byProgram: Array<{
      programId: string;
      programCode: string | null;
      expected: number;
      plotted: number;
      missing: number;
    }>;
  }> {
    const db = this.supabase.getAdminClient();

    // ── 1. Resolve term semester ──
    const { data: term } = await db
      .from('term')
      .select('semester')
      .eq('term_id', termId)
      .maybeSingle();

    const termSemester = term?.semester ?? null;
    if (!termSemester) {
      return {
        termId,
        deptId,
        termSemester: null,
        totals: { expected: 0, plotted: 0, missing: 0, percent: 100 },
        missing: [],
        bySection: [],
        byProgram: [],
      };
    }

    // ── 2. Active programs in this department ──
    const { data: programs } = await db
      .from('program')
      .select('program_id, program_code')
      .eq('dept_id', deptId)
      .eq('is_active', true);

    const programIds = (programs ?? []).map((p) => String(p.program_id));
    if (programIds.length === 0) {
      return {
        termId,
        deptId,
        termSemester,
        totals: { expected: 0, plotted: 0, missing: 0, percent: 100 },
        missing: [],
        bySection: [],
        byProgram: [],
      };
    }

    // ── 3. Active sections for those programs ──
    const { data: sections } = await db
      .from('section')
      .select('section_id, section_code, program_id, year_level')
      .in('program_id', programIds)
      .eq('is_active', true);

    const sectionRows = sections ?? [];

    // ── 4. Prospectus entries for this semester ──
    const { data: prospectusRows } = await db
      .from('prospectus')
      .select('subject_id, program_id, year_level, semester')
      .in('program_id', programIds)
      .eq('is_active', true)
      .eq('semester', termSemester);

    if (!prospectusRows || prospectusRows.length === 0) {
      return {
        termId,
        deptId,
        termSemester,
        totals: { expected: 0, plotted: 0, missing: 0, percent: 100 },
        missing: [],
        bySection: [],
        byProgram: [],
      };
    }

    // ── 5. Subjects referenced by the prospectus ──
    const prospectusSubjectIds = Array.from(
      new Set(prospectusRows.map((p) => String(p.subject_id))),
    );

    const { data: subjectRows } = await db
      .from('subject')
      .select(
        'subject_id, subject_code, title, is_minor, source_dept, lecture_units, lab_units',
      )
      .in('subject_id', prospectusSubjectIds)
      .eq('is_active', true);

    // External subjects (source_dept set) → excluded from coverage (Q5)
    const subjectById = new Map<
      string,
      {
        subjectId: string;
        subjectCode: string;
        title: string;
        isMinor: boolean;
        lectureUnits: number;
        labUnits: number;
      }
    >();
    for (const s of subjectRows ?? []) {
      if (s.source_dept) continue; // skip external
      subjectById.set(String(s.subject_id), {
        subjectId: String(s.subject_id),
        subjectCode: s.subject_code ?? '?',
        title: s.title ?? '',
        isMinor: !!s.is_minor,
        lectureUnits: Number(s.lecture_units ?? 0),
        labUnits: Number(s.lab_units ?? 0),
      });
    }

    // ── 6. Expand prospectus into expected (subject, section) pairs ──
    // Q2 = C: for each prospectus entry, find all sections whose
    // (program_id, year_level) match. Each matching section is one
    // expected slot.
    const expected: Array<{
      subjectId: string;
      programId: string;
      yearLevel: number;
      sectionId: string;
      sectionCode: string;
    }> = [];

    for (const p of prospectusRows) {
      const pid = String(p.program_id);
      const yr = Number(p.year_level);
      const sid = String(p.subject_id);
      if (!subjectById.has(sid)) continue; // external or inactive

      for (const sec of sectionRows) {
        if (String(sec.program_id) !== pid) continue;
        if (Number(sec.year_level ?? -1) !== yr) continue;
        expected.push({
          subjectId: sid,
          programId: pid,
          yearLevel: yr,
          sectionId: String(sec.section_id),
          sectionCode: sec.section_code ?? '?',
        });
      }
    }

    // ── 7. Load live schedule rows for the term ──
    const { data: scheduleRows } = await db
      .from('schedule')
      .select('subject_id, section_id, load_type')
      .eq('term_id', termId)
      .in(
        'subject_id',
        expected.map((e) => e.subjectId),
      );

    // Key = (subjectId, sectionId, loadType)
    const plottedKeys = new Set<string>();
    for (const r of scheduleRows ?? []) {
      if (!r.section_id || !r.subject_id) continue;
      const lt = (r.load_type ?? 'lecture') as 'lecture' | 'laboratory';
      plottedKeys.add(`${r.subject_id}::${r.section_id}::${lt}`);
    }

    // ── 8. Compute coverage (Q1 = B: subject+section pair) ──
    // A pair counts as "plotted" if ANY load type has a schedule row.
    // We also collect which load types are present so the panel can
    // hint at partial coverage.
    const programCodeById = new Map<string, string | null>(
      (programs ?? []).map((p) => [
        String(p.program_id),
        p.program_code as string | null,
      ]),
    );

    const pairKey = (subjectId: string, sectionId: string) =>
      `${subjectId}::${sectionId}`;

    const plottedPairs = new Set<string>();
    const loadTypesByPair = new Map<string, Set<'lecture' | 'laboratory'>>();
    for (const e of expected) {
      const hasLecture = plottedKeys.has(
        `${e.subjectId}::${e.sectionId}::lecture`,
      );
      const hasLab = plottedKeys.has(
        `${e.subjectId}::${e.sectionId}::laboratory`,
      );
      const s = subjectById.get(e.subjectId);
      if (!s) continue;

      const present = new Set<'lecture' | 'laboratory'>();
      if (hasLecture) present.add('lecture');
      if (hasLab) present.add('laboratory');

      // What SHOULD be present?
      const shouldLecture = s.lectureUnits > 0;
      const shouldLab = s.labUnits > 0;

      // Fully plotted only if every required load type is present.
      const fullyPlotted =
        (!shouldLecture || hasLecture) && (!shouldLab || hasLab);

      if (fullyPlotted) {
        plottedPairs.add(pairKey(e.subjectId, e.sectionId));
      }
      loadTypesByPair.set(pairKey(e.subjectId, e.sectionId), present);
    }

    // ── 9. Assemble missing list ──
    const missing: Array<{
      subjectId: string;
      subjectCode: string;
      title: string;
      isMinor: boolean;
      programId: string;
      programCode: string | null;
      yearLevel: number;
      semester: string;
      sectionId: string;
      sectionCode: string;
      loadTypes: Array<'lecture' | 'laboratory'>;
    }> = [];

    const sectionIdSet = new Set<string>();
    const programIdSet = new Set<string>();

    for (const e of expected) {
      if (plottedPairs.has(pairKey(e.subjectId, e.sectionId))) continue;
      const s = subjectById.get(e.subjectId);
      if (!s) continue;

      // Only include if subject is missing some (or all) required load types.
      // We surface all missing pairs.
      const present = loadTypesByPair.get(pairKey(e.subjectId, e.sectionId))!;
      const missingLoadTypes: Array<'lecture' | 'laboratory'> = [];
      if (s.lectureUnits > 0 && !present.has('lecture')) {
        missingLoadTypes.push('lecture');
      }
      if (s.labUnits > 0 && !present.has('laboratory')) {
        missingLoadTypes.push('laboratory');
      }
      if (missingLoadTypes.length === 0) continue;

      missing.push({
        subjectId: e.subjectId,
        subjectCode: s.subjectCode,
        title: s.title,
        isMinor: s.isMinor,
        programId: e.programId,
        programCode: programCodeById.get(e.programId) ?? null,
        yearLevel: e.yearLevel,
        semester: termSemester,
        sectionId: e.sectionId,
        sectionCode: e.sectionCode,
        loadTypes: missingLoadTypes,
      });
      sectionIdSet.add(e.sectionId);
      programIdSet.add(e.programId);
    }

    missing.sort((a, b) => {
      if (a.sectionCode !== b.sectionCode) {
        return a.sectionCode.localeCompare(b.sectionCode);
      }
      return a.subjectCode.localeCompare(b.subjectCode);
    });

    // ── 10. Per-section rollup ──
    const sectionExpected = new Map<string, number>();
    const sectionPlotted = new Map<string, number>();
    for (const e of expected) {
      sectionExpected.set(
        e.sectionId,
        (sectionExpected.get(e.sectionId) ?? 0) + 1,
      );
      if (plottedPairs.has(pairKey(e.subjectId, e.sectionId))) {
        sectionPlotted.set(
          e.sectionId,
          (sectionPlotted.get(e.sectionId) ?? 0) + 1,
        );
      }
    }

    const bySection = sectionRows
      .filter((s) => sectionExpected.has(String(s.section_id)))
      .map((s) => {
        const sid = String(s.section_id);
        const exp = sectionExpected.get(sid) ?? 0;
        const plt = sectionPlotted.get(sid) ?? 0;
        return {
          sectionId: sid,
          sectionCode: s.section_code ?? '?',
          expected: exp,
          plotted: plt,
          missing: Math.max(0, exp - plt),
        };
      })
      .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));

    // ── 11. Per-program rollup ──
    const programExpected = new Map<string, number>();
    const programPlotted = new Map<string, number>();
    for (const e of expected) {
      programExpected.set(
        e.programId,
        (programExpected.get(e.programId) ?? 0) + 1,
      );
      if (plottedPairs.has(pairKey(e.subjectId, e.sectionId))) {
        programPlotted.set(
          e.programId,
          (programPlotted.get(e.programId) ?? 0) + 1,
        );
      }
    }

    const byProgram = Array.from(programExpected.entries())
      .map(([pid, exp]) => {
        const plt = programPlotted.get(pid) ?? 0;
        return {
          programId: pid,
          programCode: programCodeById.get(pid) ?? null,
          expected: exp,
          plotted: plt,
          missing: Math.max(0, exp - plt),
        };
      })
      .sort((a, b) =>
        (a.programCode ?? '').localeCompare(b.programCode ?? ''),
      );

    // ── 12. Totals ──
    const totalExpected = expected.length;
    const totalPlotted = plottedPairs.size;
    const totalMissing = missing.length;
    const percent =
      totalExpected === 0
        ? 100
        : Math.round((totalPlotted / totalExpected) * 1000) / 10;

    return {
      termId,
      deptId,
      termSemester,
      totals: {
        expected: totalExpected,
        plotted: totalPlotted,
        missing: totalMissing,
        percent,
      },
      missing,
      bySection,
      byProgram,
    };
  }

  // ════════════════════════════════════════════
  // AUTOSOLVER
  // ════════════════════════════════════════════

  async autoGenerate(
    termId: string,
    deptId: string,
    userId: string,
    options: { acknowledgeUnplottedMinors?: boolean } = {},
  ) {
    this.logger.log(
      `Auto-generate requested: term=${termId} dept=${deptId} by=${userId}`,
    );

    if (this.autoGenerateInFlight.has(termId)) {
      this.logger.warn(
        `Auto-generate rejected (in-memory): already running for term=${termId}`,
      );
      return {
        success: false,
        message:
          'An auto-generate is already running for this term. ' +
          'Please wait for it to finish, then try again.',
      };
    }

    const locked = await this.tryAcquireAutoGenerateLock(termId, userId);
    if (!locked) {
      this.logger.warn(
        `Auto-generate rejected (db lock): another run in progress for term=${termId}`,
      );
      return {
        success: false,
        message:
          'An auto-generate is already running for this term. ' +
          'Please wait for it to finish, then try again.',
      };
    }

    // ── Pre-flight: unplotted minors check ──
    // Minor subjects are fixed obstacles. Generating without them
    // produces a schedule that would break when they're plotted later.
    // Refuse unless the caller explicitly acknowledges the risk.
    if (!options.acknowledgeUnplottedMinors) {
      try {
        const unplottedMinors = await this.findUnplottedMinors(
          termId,
          deptId,
        );
        if (unplottedMinors.length > 0) {
          this.logger.warn(
            `Auto-generate blocked: ${unplottedMinors.length} unplotted minor(s) for term=${termId} dept=${deptId}`,
          );

          // Release the lock immediately — we're not running the solver.
          await this.releaseAutoGenerateLock(termId, userId);

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
        // Fail open — don't block generation because the check itself
        // errored. Log and continue.
        this.logger.warn(
          `Unplotted-minors pre-flight check failed (continuing): ${(err as Error).message}`,
        );
      }
    }

    this.autoGenerateInFlight.add(termId);

    // ═══ Notification: auto-generate started ═══
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

        // ═══ Notification: room sufficiency below threshold ═══
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

        // ═══ Notification: auto-generate failed (to the requester) ═══
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

        this.autoGenerateInFlight.delete(termId);
        await this.releaseAutoGenerateLock(termId, userId);
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
        this.autoGenerateInFlight.delete(termId);
        await this.releaseAutoGenerateLock(termId, userId);

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
        this.autoGenerateInFlight.delete(termId);
        await this.releaseAutoGenerateLock(termId, userId);

        await this.dispatcher.dispatch('auto_generate.failed', {
          recipientUserIds: starterDHs,
          title: 'Auto-generate failed',
          body: result.message ?? 'Solver returned no solution.',
          entityType: 'term',
          entityId: termId,
          payload: {
            deptId,
            reason: 'no_solution',
          },
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
        this.autoGenerateInFlight.delete(termId);
        await this.releaseAutoGenerateLock(termId, userId);

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
      await this.persistUnscheduled(termId, result.unscheduled ?? []);

      await this.markAutoGeneratePending(termId, userId);
      this.autoGenerateInFlight.delete(termId);

      // ═══ Notification: auto-generate finished ═══
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
      this.autoGenerateInFlight.delete(termId);
      await this.releaseAutoGenerateLock(termId, userId);
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
    // Loaded once; term-scoped rows AND term-agnostic rows.
    // The solver forbids any candidate that overlaps a blocked window.
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
      // Non-fatal: log and continue without preferences
      this.logger.warn(
        `Failed to load room preferences for dept ${deptId}: ${prefErr.message}`,
      );
    }

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
      roomPreferences: (roomPreferences ?? []).map((p) => ({    // ← NEW
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
    // ═══════════════════════════════════════════════════════════════
    // Sufficiency analysis — per (roomType, kind) demand vs supply.
    //
    // 'any' subjects contribute demand to two pools:
    //   - their lecture blocks  → 'lecture_room' pool
    //   - their lab blocks      → 'laboratory' pool
    //
    // Pure subjects contribute to their exact room type.
    // ═══════════════════════════════════════════════════════════════

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

        // Mixed / unset → kind decides
        if (required === '' || required === 'any') {
          if (block.kind === 'lab') {
            addDemand('laboratory', hours);
          } else {
            addDemand('lecture_room', hours);
          }
          continue;
        }

        // Pure subject → exact room type
        addDemand(subj.requiredRoomType as string, hours);
      }
    }

    const startMin = this.timeToMinutes(problem.config.operatingHoursStart);
    const endMin = this.timeToMinutes(problem.config.operatingHoursEnd);
    const hoursPerDay = (endMin - startMin) / 60;
    const operatingDays = 6;
    const hoursPerWeekPerRoom = hoursPerDay * operatingDays;

    // ═══════════════════════════════════════════════════════════════
    // Supply — count rooms that can serve each pool.
    //
    // Lecture pool: lecture_room + drafting_room + computer_lab + laboratory
    // Lab pool:     laboratory + computer_lab
    //
    // (This mirrors the solver's room_accepts_block permissive behavior.)
    // ═══════════════════════════════════════════════════════════════

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

    // Supply in weekly room-hours per pool
    const supplyByType = new Map<string, number>();

    const pools: Array<{ key: string; capable: Set<string> }> = [
      { key: 'lecture_room', capable: lectureCapable },
      { key: 'laboratory', capable: labCapable },
      // Pure-subject exact types still get their own pool
      { key: 'computer_lab', capable: new Set(['computer_lab']) },
      { key: 'drafting_room', capable: new Set(['drafting_room']) },
      { key: 'other', capable: new Set(['other']) },
    ];

    for (const { key, capable } of pools) {
      const rooms = countRooms(capable);
      supplyByType.set(key, rooms * hoursPerWeekPerRoom);
    }

    // ═══════════════════════════════════════════════════════════════
    // Compare demand against supply, but only for pools that have demand.
    // ═══════════════════════════════════════════════════════════════

    const deficits: Array<{
      roomType: string;
      neededHours: number;
      availableHours: number;
      shortByHours: number;
      suggestedExtraRooms: number;
    }> = [];

    for (const [roomType, demandHours] of demandByType.entries()) {
      // If we don't have an explicit pool for this type (custom / 'other'),
      // treat the raw room type as its own supply pool.
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
  // ════════════════════════════════════════════

  private async tryAcquireAutoGenerateLock(
    termId: string,
    userId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .rpc('try_acquire_auto_generate_lock', {
        p_term_id: Number(termId),
        p_user_id: userId,
        p_ttl_seconds: 120,
      });

    if (error) {
      this.logger.error(
        `Failed to acquire auto-generate lock for term=${termId}: ${error.message}`,
      );
      return false;
    }

    return data === true;
  }

  private async releaseAutoGenerateLock(
    termId: string,
    userId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .getAdminClient()
      .rpc('release_auto_generate_lock', {
        p_term_id: Number(termId),
        p_user_id: userId,
      });

    if (error) {
      this.logger.warn(
        `Failed to release auto-generate lock for term=${termId}: ${error.message}`,
      );
    }
  }

  private async markAutoGeneratePending(
    termId: string,
    userId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .getAdminClient()
      .rpc('mark_auto_generate_pending', {
        p_term_id: Number(termId),
        p_user_id: userId,
        p_ttl_seconds: 600,
      });
    if (error) {
      this.logger.warn(
        `Failed to mark pending lock for term=${termId}: ${error.message}`,
      );
    }
  }

  async confirmAutoGenerate(termId: string, userId: string): Promise<void> {
    await this.releaseAutoGenerateLock(termId, userId);
    this.logger.log(`Auto-generate confirmed for term=${termId}`);
  }

  async discardAutoGenerate(
    termId: string,
    userId: string,
  ): Promise<{ deleted: number }> {
    const result = await this.clearAutoDrafts(termId);
    await this.releaseAutoGenerateLock(termId, userId);
    this.logger.log(
      `Auto-generate discarded for term=${termId} (${result.deleted} rows deleted)`,
    );
    return result;
  }

  async abandonAutoGenerate(
    termId: string,
    userId: string,
  ): Promise<void> {
    await this.releaseAutoGenerateLock(termId, userId);
    this.logger.log(
      `Auto-generate abandoned for term=${termId} by=${userId}`,
    );
  }

  async getAutoGenerateLock(
    termId: string,
    userId: string,
  ): Promise<{
    heldByUser: boolean;
    state: 'running' | 'pending_confirm';
    expiresAt: string;
  } | null> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .rpc('get_auto_generate_lock', { p_term_id: Number(termId) });

    if (error) {
      this.logger.warn(
        `Failed to get auto-generate lock for term=${termId}: ${error.message}`,
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

  private async assertOwnership(
    scheduleId: string,
    user: any,
  ): Promise<Schedule> {
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const found = await this.scheduleRepo.findOne({
      where: { scheduleId },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    // `administrator` retained for the hidden dev account (recovery).
    // `college_dean` is the top user-facing role after consolidation.
    if (user.role === 'administrator' || user.role === 'college_dean') {
      return found;
    }

    if (user.role === 'department_head') {
      const userDeptId = user.deptId != null ? String(user.deptId) : null;
      if (!userDeptId || String(found.deptId) !== userDeptId) {
        throw new ForbiddenException(
          'You cannot edit schedules from other departments.',
        );
      }
      return found;
    }

    throw new ForbiddenException(
      'You do not have permission to modify schedules.',
    );
  }
    private async computeFacultyWeeklyHours(
    facultyId: string,
    termId: string,
  ): Promise<number> {
    const { data } = await this.supabase
      .getAdminClient()
      .from('schedule')
      .select('start_time, end_time')
      .eq('faculty_id', facultyId)
      .eq('term_id', termId);

    let totalMinutes = 0;
    for (const row of data ?? []) {
      if (!row.start_time || !row.end_time) continue;
      const start = this.timeToMinutes(row.start_time);
      const end = this.timeToMinutes(row.end_time);
      if (end > start) totalMinutes += end - start;
    }
    return Math.round((totalMinutes / 60) * 10) / 10;
  }

  private async checkFacultyOverload(
    facultyId: string,
    termId: string,
  ): Promise<void> {
    try {
      const totalHours = await this.computeFacultyWeeklyHours(
        facultyId,
        termId,
      );

      const { data: fac } = await this.supabase
        .getAdminClient()
        .from('faculty')
        .select('first_name, last_name, dept_id, required_hours')
        .eq('faculty_id', facultyId)
        .maybeSingle();

      if (!fac) return;

      const requiredHours = Number(fac.required_hours ?? 18);
      if (totalHours <= requiredHours) return;

      const ownerDHs = await this.recipients.departmentHeadsOf(
        String(fac.dept_id),
      );
      const dean = await this.recipients.collegeDean();

      await this.dispatcher.dispatch('faculty.overloaded', {
        recipientUserIds: this.recipients.uniq([...ownerDHs, ...dean]),
        title: 'Faculty workload exceeds cap',
        body: `${fac.first_name} ${fac.last_name} is assigned ${totalHours}h (cap: ${requiredHours}h).`,
        entityType: 'faculty',
        entityId: facultyId,
        payload: {
          facultyName: `${fac.first_name} ${fac.last_name}`,
          totalHours,
          requiredHours,
        },
      });
    } catch (err) {
      this.logger.warn(
        `checkFacultyOverload(${facultyId}) failed: ${(err as Error).message}`,
      );
    }
  }
    /**
   * F1b: detect cross-department faculty and, if the actor is a DH
   * plotting a subject owned by their own dept with a faculty from
   * another dept, create (or reuse) a faculty_request in 'pending'
   * status.
   *
   * Returns:
   *   - null → no gate needed (same dept, dean/admin, or external faculty)
   *   - { requestId, facultyDeptId } → schedule rows should be marked
   *     as pending approval from that dept
   */
  private async ensureCrossDeptFacultyRequest(params: {
    facultyId: string | null | undefined;
    subjectDeptId: string | null;
    termId: string;
    subjectId: string;
    user: any;
  }): Promise<{ requestId: string; facultyDeptId: string } | null> {
    const { facultyId, subjectDeptId, termId, subjectId, user } = params;

    // No system faculty → no gate
    if (!facultyId) return null;

    // Dean / admin bypass
    if (
      user?.role === 'college_dean' ||
      user?.role === 'administrator'
    ) {
      return null;
    }

    // Need a subject dept to compare against
    if (!subjectDeptId) return null;

    const db = this.supabase.getAdminClient();

    // Look up the faculty's dept
    const { data: fac } = await db
      .from('faculty')
      .select('faculty_id, dept_id')
      .eq('faculty_id', facultyId)
      .maybeSingle();

    if (!fac?.dept_id) return null;
    const facultyDeptId = String(fac.dept_id);

    // Same dept → no gate
    if (facultyDeptId === String(subjectDeptId)) return null;

    // Cross-dept → look for an existing approved or pending request
// F1b (2B): one-shot approval semantics. We reuse a *pending* request
// (the DH is still mid-workflow), but never an *approved* one — that
// approval was already consumed by whatever row it was linked to.
const { data: existing } = await db
  .from('faculty_request')
  .select('request_id, status')
  .eq('faculty_id', facultyId)
  .eq('subject_id', subjectId)
  .eq('term_id', termId)
  .eq('status', 'pending')
  .maybeSingle();

if (existing) {
  return {
    requestId: String(existing.request_id),
    facultyDeptId,
  };
}

// No pending request → check for any live schedule rows that are
// already approved. If we find one, the request is "consumed" and we
// create a fresh one. If none, the row was orphaned and the approved
// request will already have been cancelled by cancelOrphanedFacultyRequest.

    // Create a new pending request on behalf of the DH.
    //
    // NOTE: faculty_request has three NOT NULL columns we must fill:
    //   - requesting_dept_id → the DH's dept
    //   - target_dept_id     → the faculty's dept
    //   - reason             → a human-readable label
    //
    // `target_dept_id` is the crux — without it, the insert fails and
    // F-8 never sees a matching request.
    const requestingDeptId = user?.deptId
      ? String(user.deptId)
      : subjectDeptId; // fallback: the subject's own dept

    const { data: created, error } = await db
      .from('faculty_request')
      .insert({
        faculty_id: facultyId,
        subject_id: subjectId,
        term_id: termId,
        requesting_dept_id: requestingDeptId,
        target_dept_id: facultyDeptId,
        reason:
          'Auto-created by cross-department faculty gate: ' +
          'a subject owned by another department was plotted with ' +
          'a faculty member from your department.',
        status: 'pending',
        created_by: user?.userId ?? null,
      })
      .select('request_id')
      .single();

    if (error || !created) {
      this.logger.warn(
        `F1b: failed to create faculty_request: ${error?.message}`,
      );
      return null;
    }

    this.logger.log(
      `F1b: created request ${created.request_id} ` +
        `(requesting=${requestingDeptId}, target=${facultyDeptId}, ` +
        `faculty=${facultyId}, subject=${subjectId}, term=${termId})`,
    );

    return {
      requestId: String(created.request_id),
      facultyDeptId,
    };
  }
    /**
   * F1b: when a schedule row is deleted, its linked faculty_request may
   * become orphaned. If no other schedule rows still reference it AND
   * it's still pending, cancel it so it disappears from the Approvals
   * queue.
   *
   * Approved / rejected requests are left alone — they're already
   * resolved and serve as historical record.
   */
  private async cancelOrphanedFacultyRequest(
    requestId: string,
  ): Promise<void> {
    try {
      const db = this.supabase.getAdminClient();

      // Any remaining schedule rows linked to this request?
      const { data: remaining, error: countErr } = await db
        .from('schedule')
        .select('schedule_id')
        .eq('pending_faculty_request_id', requestId)
        .limit(1);

      if (countErr) {
        this.logger.warn(
          `F1b cleanup: failed to count remaining rows for request ${requestId}: ${countErr.message}`,
        );
        return;
      }

      if (remaining && remaining.length > 0) {
        // Still has dependents — leave the request alone
        return;
      }

      // Orphaned. Check its current status before cancelling.
      const { data: req, error: reqErr } = await db
        .from('faculty_request')
        .select('request_id, status')
        .eq('request_id', requestId)
        .maybeSingle();

      if (reqErr || !req) {
        this.logger.warn(
          `F1b cleanup: request ${requestId} not found or lookup failed: ${reqErr?.message}`,
        );
        return;
      }

      // F1b (2B + 3B): cancel pending OR approved requests when orphaned.
      // Rejected/cancelled are already terminal — leave them alone.
      if (req.status !== 'pending' && req.status !== 'approved') {
        return;
      }

      // Cancel it
      const { error: updateErr } = await db
        .from('faculty_request')
        .update({
          status: 'cancelled',
          responded_at: new Date().toISOString(),
          response_remarks:
            'Auto-cancelled: the linked schedule entry was deleted.',
        })
        .eq('request_id', requestId);

      if (updateErr) {
        this.logger.warn(
          `F1b cleanup: failed to cancel request ${requestId}: ${updateErr.message}`,
        );
        return;
      }

      this.logger.log(
        `F1b cleanup: cancelled orphaned request ${requestId} (schedule row deleted)`,
      );

      // Notify the target DH that the request is cancelled
      try {
        // Look up the target dept from the request
        const { data: fullReq } = await db
          .from('faculty_request')
          .select('target_dept_id')
          .eq('request_id', requestId)
          .maybeSingle();

        if (fullReq?.target_dept_id) {
          const targetDHs = await this.recipients.departmentHeadsOf(
            String(fullReq.target_dept_id),
          );
          await this.dispatcher.dispatch('request.cancelled', {
            recipientUserIds: targetDHs,
            title: 'Cross-dept request cancelled',
            body:
              'A cross-department faculty request was auto-cancelled ' +
              'because the linked class was deleted.',
            entityType: 'faculty_request',
            entityId: requestId,
            payload: {
              reason: 'schedule_deleted',
              requestId,
            },
          });
        }
      } catch (err) {
        this.logger.warn(
          `F1b cleanup: cancellation notification failed: ${(err as Error).message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `F1b cleanup: unexpected error for request ${requestId}: ${(err as Error).message}`,
      );
    }
  }
}