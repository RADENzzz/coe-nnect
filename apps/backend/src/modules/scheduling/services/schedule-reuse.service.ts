import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SupabaseService } from '../../../database/supabase.service';
import { ConstraintsService } from '../../constraints/constraints.service';
import { DepartmentsService } from '../../departments/departments.service';
import { Faculty } from '../../faculty/entities/faculty.entity';
import { NotificationDispatcherService } from '../../notifications/notification-dispatcher.service';
import { loadRequestContext } from '../../notifications/notification-context';
import { RecipientsService } from '../../notifications/recipients.service';
import { Room } from '../../rooms/entities/room.entity';
import { Section } from '../../sections/entities/section.entity';
import { Subject } from '../../subjects/entities/subject.entity';

import {
  ApplyReuseDto,
  PreflightReuseDto,
} from '../dto/reuse-published-version.dto';
import { Schedule } from '../entities/schedule.entity';
import { RuleContextBuilder } from './rule-context.builder';
import { ScheduleFacultyService } from './schedule-faculty.service';
import {
  PublishedVersionEntry,
  TermPublishedVersionService,
} from './term-published-version.service';

type RuleFinding = { ruleId: string; ruleName: string; reason: string };

export type ReuseCandidate = {
  entry: PublishedVersionEntry;
  targetScheduleId: string | null;
  action: 'update' | 'create' | 'keptAsIs' | 'conflict';
  reason?: string;
  warnings?: RuleFinding[];
  facultyRequestId?: string;
};

export type ReusePreflightResult = {
  matched: number;
  ready: number;
  skipped: number;
  keptAsIs: number;
  warnings: number;
  conflicts: ReuseCandidate[];
  failed: boolean;
  summary: string;
};

export type ReuseApplyResult = {
  created: Schedule[];
  updated: Schedule[];
  conflicts: ReuseCandidate[];
  failed: boolean;
};

type FacultyGate = {
  requestId: string;
  facultyDeptId: string;
  created: boolean;
};
type ResolvedSubject = { id: string; code: string; deptId: string | null };

type PreparedCandidate = ReuseCandidate & {
  target: Schedule | null;
  write: Record<string, unknown>;
  gate: FacultyGate | null;
  requestingDeptId: string;
  termId: string;
};

type Assessment = {
  result: ReusePreflightResult;
  ready: PreparedCandidate[];
};

type AssessmentMode = 'preflight' | 'apply';

type CatalogResult<T> = { value?: T; reason?: string; missing?: boolean };

const LOAD_TYPES = ['lecture', 'laboratory', 'other'];
const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Snapshot sessions are numbered in the same bigint identity order as SQL. */
function normalizedNumericId(value: unknown): string | null {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text)) return null;
  return text.replace(/^0+/, '') || '0';
}

function compareScheduleIds(a: unknown, b: unknown): number {
  const left = normalizedNumericId(a);
  const right = normalizedNumericId(b);
  if (left !== null && right !== null) {
    if (left.length !== right.length) return left.length < right.length ? -1 : 1;
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (left !== null) return -1;
  if (right !== null) return 1;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

/**
 * Reuses the published rows of a saved term version as a draft starting point
 * for another term. The source is a snapshot, never the live schedule: only
 * entries whose snapshot status is `published` are considered, and the only
 * rows ever written are `draft` rows. Published/review/finalized rows and
 * drafts with a pending cross-department request are fixed obstacles.
 */
@Injectable()
export class ScheduleReuseService {
  private readonly logger = new Logger(ScheduleReuseService.name);

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
    @InjectRepository(Faculty)
    private readonly facultyRepo: Repository<Faculty>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    private readonly publishedVersions: TermPublishedVersionService,
    private readonly ruleContextBuilder: RuleContextBuilder,
    private readonly constraints: ConstraintsService,
    private readonly facultyGate: ScheduleFacultyService,
    private readonly supabase: SupabaseService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
    private readonly departments: DepartmentsService,
  ) {}

  async preflight(
    versionId: string,
    dto: PreflightReuseDto,
    actor: any,
  ): Promise<ReusePreflightResult> {
    this.assertActor(actor, dto);
    await this.assertActiveTerm(dto.termId);
    return (await this.assess(versionId, dto, null, 'preflight')).result;
  }

  async apply(
    versionId: string,
    dto: ApplyReuseDto,
    actor: any,
  ): Promise<ReuseApplyResult> {
    this.assertActor(actor, dto);
    if (dto.confirmed !== true) {
      throw new BadRequestException(
        'Reuse must be confirmed with confirmed: true.',
      );
    }
    await this.assertActiveTerm(dto.termId);

    const { result, ready } = await this.assess(versionId, dto, actor, 'apply');
    if (result.failed) {
      return { created: [], updated: [], conflicts: [], failed: true };
    }

    const created: Schedule[] = [];
    const updated: Schedule[] = [];
    const conflicts = [...result.conflicts];
    for (const candidate of ready) {
      // The gate was created during apply-mode assessment, before validation.
      const gate = candidate.gate;
      candidate.facultyRequestId = gate?.requestId;
      candidate.write.pendingFacultyRequestId = gate?.requestId ?? null;
      candidate.write.pendingFacultyDeptId = gate?.facultyDeptId ?? null;

      const entity = candidate.target
        ? Object.assign(candidate.target, candidate.write)
        : this.scheduleRepo.create(candidate.write as unknown as Schedule);
      const saved = await this.scheduleRepo.save(entity as Schedule);
      if (candidate.target) updated.push(saved);
      else created.push(saved);
      await this.notifyFacultyRequest(candidate);
    }

    return { created, updated, conflicts, failed: false };
  }

  private async assess(
    versionId: string,
    dto: PreflightReuseDto,
    actor: any,
    mode: AssessmentMode,
  ): Promise<Assessment> {
    // entriesFor already filters on snapshot status; the extra guard keeps a
    // malformed snapshot from smuggling draft/review/finalized rows into reuse.
    const raw = await this.publishedVersions.entriesFor(versionId, [
      'published',
    ]);
    const entries = raw.filter((item) => item?.status === 'published');
    const [prospectus, currentRows] = await Promise.all([
      this.prospectusSubjectIds(dto.termId, dto.deptId),
      this.scheduleRepo.find({
        where: { termId: dto.termId },
        relations: ['subject', 'sectionRef', 'room', 'faculty'],
      }),
    ]);

    // Live schedule rows carry no session_index column. The snapshot writer
    // numbers repeated (subject, section, load type) rows in bigint
    // schedule_id ASC order, so reuse must pair sessions in that same order.
    const byBaseKey = new Map<string, Schedule[]>();
    for (const row of currentRows) {
      const key = this.baseKey(row.subjectId, row.sectionId, row.loadType);
      const group = byBaseKey.get(key) ?? [];
      group.push(row);
      byBaseKey.set(key, group);
    }
    for (const group of byBaseKey.values()) {
      group.sort((a, b) => compareScheduleIds(a.scheduleId, b.scheduleId));
    }
    const claimed = new Set<Schedule>();
    const ready: PreparedCandidate[] = [];
    const conflicts: ReuseCandidate[] = [];
    let matched = 0;
    let keptAsIs = 0;
    let skipped = 0;
    let warnings = 0;

    for (const source of entries) {
      // Resolve by id and then by code before the prospectus gate, so a stale
      // snapshot id can still be remapped to the current catalog subject.
      const subject = await this.resolveSubject(source);
      if (!subject.value) {
        if (subject.missing) {
          skipped += 1;
        } else {
          conflicts.push({
            entry: source,
            targetScheduleId: null,
            action: 'conflict',
            reason: subject.reason,
          });
        }
        continue;
      }
      if (!prospectus.has(subject.value.id)) {
        skipped += 1;
        continue;
      }
      matched += 1;
      const group = byBaseKey.get(
        this.baseKey(subject.value.id, source.section_id, source.load_type),
      );
      const target = group?.[source.session_index ?? 0] ?? null;
      if (target) claimed.add(target);

      if (
        target?.status === 'draft' &&
        target.pendingFacultyRequestId != null
      ) {
        conflicts.push({
          entry: source,
          targetScheduleId: this.optionalId(target.scheduleId),
          action: 'conflict',
          reason:
            'Existing draft has a pending faculty request ' +
            `(${target.pendingFacultyRequestId}); it was not overwritten.`,
        });
        continue;
      }

      // Protected rows are obstacles, not overwrite targets.
      if (target && target.status !== 'draft') {
        keptAsIs += 1;
        continue;
      }

      const prepared = await this.prepareCandidate(
        source,
        dto,
        actor,
        mode,
        target,
        subject.value,
      );
      if (prepared.action === 'conflict') {
        conflicts.push(prepared);
      } else {
        ready.push(prepared);
        warnings += prepared.warnings?.length ?? 0;
      }
    }

    // Rows with no source candidate are untouched too: protected statuses are
    // reported as kept as is, other drafts as skipped.
    for (const row of currentRows) {
      if (claimed.has(row)) continue;
      if (row.status === 'draft') skipped += 1;
      else keptAsIs += 1;
    }

    const failed = matched === 0;
    const summary = failed
      ? `No published entries matched the active term prospectus for department ${dto.deptId}; nothing was reused.`
      : `${matched} matched, ${ready.length} ready, ${skipped} skipped, ` +
        `${keptAsIs} kept as is, ${warnings} warnings, ` +
        `${conflicts.length} conflicts.`;

    return {
      result: {
        matched,
        ready: ready.length,
        skipped,
        keptAsIs,
        warnings,
        conflicts,
        failed,
        summary,
      },
      ready,
    };
  }

  private async prepareCandidate(
    source: PublishedVersionEntry,
    dto: PreflightReuseDto,
    actor: any,
    mode: AssessmentMode,
    target: Schedule | null,
    subject: ResolvedSubject,
  ): Promise<PreparedCandidate> {
    const targetScheduleId = this.optionalId(target?.scheduleId);
    const conflict = (reason: string): PreparedCandidate => ({
      entry: source,
      targetScheduleId,
      action: 'conflict',
      reason,
      target,
      write: {},
      gate: null,
      requestingDeptId: String(dto.deptId),
      termId: dto.termId,
    });

    const section = await this.resolveSection(source);
    if (section.reason) return conflict(section.reason);
    const room = await this.resolveRoom(source);
    if (room.reason) return conflict(room.reason);
    const faculty = await this.resolveFaculty(source);
    if (faculty.reason) return conflict(faculty.reason);

    if (
      !(await this.departments.isActive(dto.deptId)) ||
      !(await this.departments.isActive(subject.deptId))
    ) {
      return conflict(
        'The receiving or subject-owning department is deactivated.',
      );
    }

    const dayOfWeek = this.dayOfWeek(source.day_of_week);
    const startTime = this.clockTime(source.start_time);
    const endTime = this.clockTime(source.end_time);
    if (!dayOfWeek || !startTime || !endTime) {
      return conflict('The published row has an incomplete meeting time.');
    }

    const externalRoomName = room.value.externalName ?? null;
    const contextInput = {
      termId: dto.termId,
      subjectId: subject.id,
      facultyId: faculty.value.facultyId,
      roomId: room.value.roomId,
      externalRoomName: externalRoomName || undefined,
      section: section.value.section,
      dayOfWeek,
      startTime,
      endTime,
      loadType: LOAD_TYPES.includes(source.load_type ?? '')
        ? (source.load_type as 'lecture' | 'laboratory' | 'other')
        : undefined,
      // The row being overwritten is not itself an obstacle to reuse.
      excludeScheduleId: targetScheduleId ?? undefined,
    };

    // Mirror SchedulingService.plot(): in apply mode the gate must exist
    // before the rule context is built so F-8 can see the pending request.
    // Preflight stays read-only and never files a request.
    let gate: FacultyGate | null = null;
    if (mode === 'apply') {
      try {
        gate = await this.facultyGate.ensureCrossDeptFacultyRequest({
          facultyId: faculty.value.facultyId,
          scheduleDeptId: String(dto.deptId),
          termId: dto.termId,
          subjectId: subject.id,
          user: actor,
        });
      } catch (err) {
        return conflict(
          `Cross-department faculty request failed: ${(err as Error).message}`,
        );
      }
    }

    let engine: ReturnType<ConstraintsService['evaluate']>;
    try {
      const context = await this.ruleContextBuilder.build(contextInput);
      engine = this.constraints.evaluate(context);
    } catch (err) {
      await this.rollbackFacultyRequest(gate);
      return conflict(`Reuse validation failed: ${(err as Error).message}`);
    }
    if (engine.hardConflicts.length > 0) {
      await this.rollbackFacultyRequest(gate);
      return conflict(
        engine.hardConflicts
          .map((item) => `${item.ruleId}: ${item.reason}`)
          .join('; '),
      );
    }

    return {
      entry: source,
      targetScheduleId,
      action: target ? 'update' : 'create',
      warnings: engine.softWarnings,
      facultyRequestId: gate?.requestId,
      target,
      gate,
      requestingDeptId: String(dto.deptId),
      termId: dto.termId,
      write: {
        termId: dto.termId,
        subjectId: subject.id,
        facultyId: faculty.value.facultyId ?? null,
        externalFacultyName: faculty.value.externalName ?? null,
        roomId: room.value.roomId ?? null,
        externalRoomName,
        timeslotId: null,
        section: section.value.section ?? null,
        sectionId: section.value.sectionId ?? null,
        deptId: String(dto.deptId),
        pendingFacultyRequestId: gate?.requestId ?? null,
        pendingFacultyDeptId: gate?.facultyDeptId ?? null,
        loadType: contextInput.loadType ?? null,
        dayOfWeek,
        startTime,
        endTime,
        remarks: source.remarks ?? null,
        status: 'draft',
      },
    };
  }

  /** Matches the rollback convention used by SchedulingService.plot(). */
  private async rollbackFacultyRequest(gate: FacultyGate | null): Promise<void> {
    // A reused pending request belongs to the broader workflow (other reuse
    // candidates or plot sessions) and must never be deleted by reuse rollback.
    if (!gate?.created) return;
    try {
      await this.supabase
        .getAdminClient()
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

  /** Same notification as a normal cross-department plot, with a reuse reason. */
  private async notifyFacultyRequest(candidate: PreparedCandidate): Promise<void> {
    const gate = candidate.gate;
    if (!gate) return;
    try {
      const targetDHs = await this.recipients.departmentHeadsOf(
        gate.facultyDeptId,
      );
      const ctx = await loadRequestContext(this.supabase.getAdminClient(), {
        requestingDeptId: candidate.requestingDeptId,
        targetDeptId: gate.facultyDeptId,
        subjectId: candidate.write.subjectId,
        termId: candidate.termId,
      });
      const subjectLabel = ctx.subjectCode ?? 'a subject';
      await this.dispatcher.dispatch('request.submitted', {
        recipientUserIds: targetDHs,
        title: `Cross-dept request: ${ctx.subjectCode ?? 'faculty'}`,
        body:
          `${ctx.requestingDeptCode ?? 'Another department'} requested ` +
          `faculty from ${ctx.targetDeptCode ?? 'your department'} for ` +
          `${subjectLabel}` +
          (ctx.termName ? ` (${ctx.termName})` : '') +
          '. Approve or reject on the Approvals page.',
        entityType: 'faculty_request',
        entityId: gate.requestId,
        payload: {
          requestId: gate.requestId,
          requestingDeptId: candidate.requestingDeptId,
          targetDeptId: gate.facultyDeptId,
          requestingDeptCode: ctx.requestingDeptCode,
          targetDeptCode: ctx.targetDeptCode,
          subjectId: candidate.write.subjectId ?? null,
          subjectCode: ctx.subjectCode,
          subjectTitle: ctx.subjectTitle,
          facultyId: candidate.write.facultyId ?? null,
          termId: candidate.termId,
          termName: ctx.termName,
          sectionCode: candidate.write.section ?? null,
          reason: 'schedule_reuse',
        },
      });
    } catch (err) {
      this.logger.warn(
        `Reuse cross-dept notification failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Prospectus subjects for the target term's semester and the receiving
   * department's active programs. Foreign-owned minors are deliberately not
   * filtered by subject.dept_id: their presence in one of these programs is
   * what routes them to this department.
   */
  private async prospectusSubjectIds(
    termId: string,
    deptId: string,
  ): Promise<Set<string>> {
    try {
      const db = this.supabase.getAdminClient();
      const { data: term } = await db
        .from('term')
        .select('semester')
        .eq('term_id', termId)
        .maybeSingle();
      if (!term?.semester) return new Set();

      const { data: programs } = await db
        .from('program')
        .select('program_id')
        .eq('dept_id', deptId)
        .eq('is_active', true);
      const programIds = (programs ?? []).map((p: any) => String(p.program_id));
      if (programIds.length === 0) return new Set();

      const { data: rows } = await db
        .from('prospectus')
        .select('subject_id')
        .in('program_id', programIds)
        .eq('is_active', true)
        .eq('semester', term.semester);
      return new Set((rows ?? []).map((p: any) => String(p.subject_id)));
    } catch (err) {
      this.logger.warn(
        `Reuse prospectus lookup failed: ${(err as Error).message}`,
      );
      return new Set();
    }
  }

  private async resolveSubject(
    source: PublishedVersionEntry,
  ): Promise<CatalogResult<ResolvedSubject>> {
    const id = this.optionalId(source.subject_id);
    let subject = id
      ? await this.subjectRepo.findOne({ where: { subjectId: id } })
      : null;
    if (!subject?.isActive && source.subject_code) {
      subject = await this.subjectRepo.findOne({
        where: { subjectCode: source.subject_code },
      });
    }
    if (!subject) {
      return {
        missing: true,
        reason: `Subject ${source.subject_code ?? id ?? 'unknown'} is no longer in the catalog.`,
      };
    }
    if (!subject.isActive) {
      return { reason: `Subject ${subject.subjectCode ?? id} is deactivated.` };
    }
    return {
      value: {
        id: String(subject.subjectId),
        code: subject.subjectCode ?? String(id),
        deptId: subject.deptId == null ? null : String(subject.deptId),
      },
    };
  }

  private async resolveSection(
    source: PublishedVersionEntry,
  ): Promise<CatalogResult<{ section: string | null; sectionId: string | null }>> {
    const code = String(source.section_code ?? '').trim() || null;
    const id = this.optionalId(source.section_id);
    if (!code && !id) return { value: { section: null, sectionId: null } };

    let section = code
      ? await this.sectionRepo.findOne({ where: { sectionCode: code } })
      : null;
    if (!section?.isActive && id) {
      section = await this.sectionRepo.findOne({ where: { sectionId: id } });
    }
    if (!section?.isActive) {
      return {
        reason: `Section ${code ?? id} is no longer active in the catalog.`,
      };
    }
    return {
      value: {
        section: section.sectionCode ?? code,
        sectionId: String(section.sectionId),
      },
    };
  }

  private async resolveRoom(
    source: PublishedVersionEntry,
  ): Promise<CatalogResult<{ roomId: string | null; externalName: string | null }>> {
    const externalName = String(source.external_room_name ?? '').trim() || null;
    const id = this.optionalId(source.room_id);
    let room = id
      ? await this.roomRepo.findOne({ where: { roomId: id } })
      : null;
    if (!room?.isActive && source.room_number) {
      room = await this.roomRepo.findOne({
        where: { roomNumber: source.room_number },
      });
    }
    if (!room?.isActive) {
      return externalName
        ? { value: { roomId: null, externalName } }
        : {
            reason:
              `Room ${source.room_number ?? id ?? 'unknown'} is no longer ` +
              'available in the catalog.',
          };
    }
    return {
      value: { roomId: String(room.roomId), externalName },
    };
  }

  private async resolveFaculty(
    source: PublishedVersionEntry,
  ): Promise<CatalogResult<{ facultyId: string | null; externalName: string | null }>> {
    const externalName =
      String(source.external_faculty_name ?? '').trim() || null;
    const id = this.optionalId(source.faculty_id);
    if (!id) {
      return externalName
        ? { value: { facultyId: null, externalName } }
        : {
            reason:
              'The published row has no active faculty or external faculty name.',
          };
    }

    let faculty = await this.facultyRepo.findOne({ where: { facultyId: id } });
    if (!faculty?.isActive) {
      const extra = source as PublishedVersionEntry & {
        faculty_code?: string;
        employee_id?: string;
        wmsu_id?: string;
      };
      const code = extra.faculty_code ?? extra.employee_id ?? extra.wmsu_id;
      if (code) {
        faculty =
          (await this.facultyRepo.findOne({
            where: { employeeId: code },
          })) ??
          (await this.facultyRepo.findOne({ where: { wmsuId: code } })) ??
          null;
      }
      if (!faculty?.isActive && source.faculty_name) {
        const parts = source.faculty_name.trim().split(/\s+/);
        const firstName = parts.shift();
        const lastName = parts.join(' ');
        if (firstName && lastName) {
          const matches = await this.facultyRepo.find({
            where: { firstName, lastName },
          });
          faculty = matches.find((item) => item.isActive) ?? null;
        }
      }
    }
    if (!faculty) {
      return {
        reason: `Faculty ${source.faculty_name ?? id} is no longer in the catalog.`,
      };
    }
    if (!faculty.isActive) {
      return { reason: `Faculty ${source.faculty_name ?? id} is deactivated.` };
    }
    return { value: { facultyId: String(faculty.facultyId), externalName: null } };
  }

  private async assertActiveTerm(termId: string): Promise<void> {
    let term: any;
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('term')
        .select('term_id, semester, is_active')
        .eq('term_id', termId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      term = data;
    } catch (err) {
      this.logger.warn(
        `Reuse target term lookup failed: ${(err as Error).message}`,
      );
      throw new BadRequestException(`Unable to verify target term ${termId}.`);
    }
    if (!term) throw new NotFoundException(`Term ${termId} not found.`);
    if (term.is_active !== true) {
      throw new BadRequestException(`Term ${termId} is not active.`);
    }
  }

  private assertActor(actor: any, dto: PreflightReuseDto): void {
    if (actor?.role === 'administrator') return;
    if (actor?.role !== 'department_head') {
      throw new ForbiddenException(
        'Only department heads and administrators may reuse published versions.',
      );
    }
    if (actor.deptId == null || String(actor.deptId) === '') {
      throw new ForbiddenException(
        'A department id is required to reuse a published version.',
      );
    }
    if (String(actor.deptId) !== String(dto.deptId)) {
      throw new ForbiddenException(
        'Department heads may reuse only into their own department.',
      );
    }
  }

  private baseKey(
    subjectId: unknown,
    sectionId: unknown,
    loadType: unknown,
  ): string {
    return [subjectId, sectionId, loadType]
      .map((part) => String(part ?? ''))
      .join('::');
  }

  private optionalId(value: unknown): string | null {
    return value == null || value === '' ? null : String(value);
  }

  private dayOfWeek(value: unknown): string | null {
    return typeof value === 'string' && DAYS.includes(value) ? value : null;
  }

  private clockTime(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
    return /^\d{2}:\d{2}:\d{2}$/.test(value) ? value : null;
  }
}
