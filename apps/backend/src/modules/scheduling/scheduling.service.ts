// apps/backend/src/modules/scheduling/scheduling.service.ts
import {
  Injectable,
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
import { DepartmentsService } from '../departments/departments.service';

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
    private readonly departments: DepartmentsService,
  ) {}

  async getActiveTerm(): Promise<Term | null> {
    return this.termRepo.findOne({ where: { isActive: true } });
  }

  /**
   * List schedules for a term.
   *
   * By default, excludes rows whose dept_id points at a deactivated
   * department. The Dean can pass includeInactiveDepts=true to see all
   * rows (needed for the reactivation workflow's visibility, and for
   * archive / cleanup pages).
   */
  async findByTerm(
    termId: string,
    includeInactiveDepts = false,
  ): Promise<Schedule[]> {
    const qb = this.scheduleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.subject', 'subject')
      .leftJoinAndSelect('s.faculty', 'faculty')
      .leftJoinAndSelect('s.room', 'room')
      .leftJoinAndSelect('s.timeSlot', 'timeSlot')
      .where('s.term_id = :termId', { termId })
      .orderBy('s.schedule_id', 'ASC');

    if (!includeInactiveDepts) {
      // Only include rows whose dept is active OR has no dept (shared/
      // legacy rows). A row with no dept should still render.
      qb.andWhere(
        `(s.dept_id IS NULL OR EXISTS (
          SELECT 1 FROM department d
          WHERE d.dept_id = s.dept_id AND d.is_active = true
        ))`,
      );
    }

    return qb.getMany();
  }

  async findAll(includeInactiveDepts = false): Promise<Schedule[]> {
    const qb = this.scheduleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.subject', 'subject')
      .leftJoinAndSelect('s.faculty', 'faculty')
      .leftJoinAndSelect('s.room', 'room')
      .leftJoinAndSelect('s.timeSlot', 'timeSlot')
      .orderBy('s.schedule_id', 'ASC');

    if (!includeInactiveDepts) {
      qb.andWhere(
        `(s.dept_id IS NULL OR EXISTS (
          SELECT 1 FROM department d
          WHERE d.dept_id = s.dept_id AND d.is_active = true
        ))`,
      );
    }

    return qb.getMany();
  }

  async validate(dto: ValidatePlotDto): Promise<{
    valid: boolean;
    hardConflicts: Array<{ ruleId: string; ruleName: string; reason: string }>;
    softWarnings: Array<{ ruleId: string; ruleName: string; reason: string }>;
    alternatives: unknown[];
  }> {
    const guards: Array<{ ruleId: string; ruleName: string; reason: string }> =
      [];

    // ── NEW: reject early if the subject's dept is deactivated ──
    const subjectDept = await this.lookupSubjectDept(dto.subjectId);
    if (subjectDept) {
      const active = await this.departments.isActive(subjectDept);
      if (!active) {
        return {
          valid: false,
          hardConflicts: [
            {
              ruleId: 'DEPT-INACTIVE',
              ruleName: 'Department Active',
              reason:
                'The subject belongs to a deactivated department. ' +
                'Reactivate the department before plotting.',
            },
          ],
          softWarnings: [],
          alternatives: [],
        };
      }
    }

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
    await this.departments.assertDepartmentActive(found.deptId);
    found.remarks = remarks;
    return this.scheduleRepo.save(found);
  }

  async plot(dto: PlotSubjectDto, user?: any): Promise<Schedule> {
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

    const subjectDeptId = await this.lookupSubjectDept(dto.subjectId);

    if (user && user.role === 'department_head') {
      const myDept = user.deptId != null ? String(user.deptId) : null;
      if (!myDept || !subjectDeptId || subjectDeptId !== myDept) {
        throw new ForbiddenException(
          'You can only plot subjects that belong to your own department.',
        );
      }
    }

    // ── NEW: refuse if subject's dept is deactivated ──
    await this.departments.assertDepartmentActive(subjectDeptId);

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

    if (gate) {
      try {
        const targetDHs = await this.recipients.departmentHeadsOf(
          gate.facultyDeptId,
        );
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

    if (dto.facultyId) {
      void this.faculty.checkFacultyOverload(dto.facultyId, dto.termId);
    }

    return saved;
  }

  async plotMulti(dto: PlotMultiDto, user?: any): Promise<Schedule[]> {
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

    const subjectDeptId = await this.lookupSubjectDept(dto.subjectId);

    if (user && user.role === 'department_head') {
      const myDept = user.deptId != null ? String(user.deptId) : null;
      if (!myDept || !subjectDeptId || subjectDeptId !== myDept) {
        throw new ForbiddenException(
          'You can only plot subjects that belong to your own department.',
        );
      }
    }

    // ── NEW: refuse if subject's dept is deactivated ──
    await this.departments.assertDepartmentActive(subjectDeptId);

    const gate = await this.faculty.ensureCrossDeptFacultyRequest({
      facultyId: dto.facultyId,
      subjectDeptId,
      termId: dto.termId,
      subjectId: dto.subjectId,
      user,
    });

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
      externalRoomName: extRoomName ?? null,
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

    // ── NEW: refuse if the row's dept is deactivated ──
    await this.departments.assertDepartmentActive(found.deptId);

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

    const sysFacultyProvided = dto.facultyId !== undefined;
    const extFacultyProvided = dto.externalFacultyName !== undefined;

    const sysFacultySet =
      sysFacultyProvided &&
      dto.facultyId !== null &&
      dto.facultyId !== '';
    const extRaw = (dto.externalFacultyName ?? '').trim();
    const extFacultySet = extFacultyProvided && extRaw !== '';

    if (sysFacultySet && extFacultySet) {
      throw new BadRequestException(
        'Cannot set both facultyId and externalFacultyName. Pick one.',
      );
    }

    const previousRequestId = found.pendingFacultyRequestId;

    if (sysFacultySet) {
      found.facultyId = dto.facultyId as string;
      found.externalFacultyName = null;
    } else if (extFacultySet) {
      found.externalFacultyName = extRaw;
      found.facultyId = null;
    } else if (sysFacultyProvided && dto.facultyId === null) {
      found.facultyId = null;
    } else if (
      extFacultyProvided &&
      (dto.externalFacultyName === null || extRaw === '')
    ) {
      found.externalFacultyName = null;
    }

    let needsGateRefresh = false;
    if (!found.facultyId) {
      needsGateRefresh = true;
    } else if (found.facultyId !== (dto.facultyId ?? null)) {
      needsGateRefresh = true;
    }
    if (needsGateRefresh) {
      found.pendingFacultyRequestId = null;
      found.pendingFacultyDeptId = null;
    }

    if (dto.sectionId !== undefined) {
      if (dto.sectionId === null || dto.sectionId === '') {
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
        found.section = null;
        found.sectionId = null;
      } else {
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

    if (
      previousRequestId &&
      previousRequestId !== saved.pendingFacultyRequestId
    ) {
      await this.faculty.cancelOrphanedFacultyRequest(previousRequestId);
    }

    if (!saved.pendingFacultyRequestId && saved.facultyId) {
      const subjDeptId = await this.lookupSubjectDept(saved.subjectId);

      if (subjDeptId) {
        const gate = await this.faculty.ensureCrossDeptFacultyRequest({
          facultyId: saved.facultyId,
          subjectDeptId: subjDeptId,
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

  async updateStatus(
    id: string,
    status: Schedule['status'],
    user: any,
  ): Promise<Schedule> {
    const found = await this.faculty.assertOwnership(id, user);

    // ── NEW: refuse if the row's dept is deactivated ──
    await this.departments.assertDepartmentActive(found.deptId);

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
      }
    }

    return saved;
  }

  async remove(id: string, user: any): Promise<{ success: boolean }> {
    const found = await this.faculty.assertOwnership(id, user);

    // ── NEW: refuse if the row's dept is deactivated ──
    await this.departments.assertDepartmentActive(found.deptId);

    if (found.status === 'finalized' || found.status === 'published') {
      throw new BadRequestException(
        'This schedule entry is locked. Unfinalize it before deleting.',
      );
    }

    const requestId = found.pendingFacultyRequestId;

    await this.scheduleRepo.delete(id);

    if (requestId) {
      await this.faculty.cancelOrphanedFacultyRequest(requestId);
    }

    return { success: true };
  }

  // ── facades ──

  findVersions(termId: string) {
    return this.scheduleVersions.findVersions(termId);
  }

  findVersion(versionId: string) {
    return this.scheduleVersions.findVersion(versionId);
  }

  compareVersions(versionAId: string, versionBId: string) {
    return this.scheduleVersions.compareVersions(versionAId, versionBId);
  }

  flagSchedule(id: string, reason: string, user: User) {
    return this.scheduleFlags.flagSchedule(id, reason, user);
  }

  unflagSchedule(id: string, user: User) {
    return this.scheduleFlags.unflagSchedule(id, user);
  }

  findFlagged(termId: string, user: any) {
    return this.scheduleFlags.findFlagged(termId, user);
  }

  findUnplottedMinors(termId: string, deptId: string) {
    return this.coverage.findUnplottedMinors(termId, deptId);
  }

  getCoverage(termId: string, deptId: string) {
    return this.coverage.getCoverage(termId, deptId);
  }

  // ── helpers ──

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
   * Look up a subject's owning department. Used by plot/validate paths
   * to feed the dept-active guard + cross-dept gate.
   */
  private async lookupSubjectDept(
    subjectId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('subject')
      .select('dept_id')
      .eq('subject_id', subjectId)
      .maybeSingle();
    if (error) {
      this.logger.warn(
        `lookupSubjectDept(${subjectId}) failed: ${error.message}`,
      );
    }
    return data?.dept_id ? String(data.dept_id) : null;
  }

  autoGenerate(
    termId: string,
    deptId: string,
    userId: string,
    options: { acknowledgeUnplottedMinors?: boolean } = {},
  ) {
    return this.autoGenerateService.autoGenerate(termId, deptId, userId, options);
  }

  getUnscheduled(termId: string, deptId?: string) {
    return this.autoGenerateService.getUnscheduled(termId, deptId);
  }

  clearAutoDrafts(termId: string, deptId: string) {
    return this.autoGenerateService.clearAutoDrafts(termId, deptId);
  }

  getRoomSufficiency(deptId?: string, termId?: string) {
    return this.autoGenerateService.getRoomSufficiency(deptId, termId);
  }

  confirmAutoGenerate(termId: string, deptId: string, userId: string) {
    return this.autoGenerateService.confirmAutoGenerate(termId, deptId, userId);
  }

  discardAutoGenerate(termId: string, deptId: string, userId: string) {
    return this.autoGenerateService.discardAutoGenerate(termId, deptId, userId);
  }

  abandonAutoGenerate(termId: string, deptId: string, userId: string) {
    return this.autoGenerateService.abandonAutoGenerate(termId, deptId, userId);
  }

  getAutoGenerateLock(termId: string, deptId: string, userId: string) {
    return this.autoGenerateService.getAutoGenerateLock(termId, deptId, userId);
  }
}