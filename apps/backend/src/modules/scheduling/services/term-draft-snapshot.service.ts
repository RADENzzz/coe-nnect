import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, DeepPartial, In, Repository } from 'typeorm';
import { ScheduleEntryContext } from '@coe-nnect/constraint-rules';

import { SupabaseService } from '../../../database/supabase.service';
import { ConstraintsService } from '../../constraints/constraints.service';
import { DepartmentsService } from '../../departments/departments.service';
import { Term } from '../../terms/entities/term.entity';
import {
  ApplyDraftSnapshotDto,
  DraftSnapshotTargetDto,
  SaveDraftSnapshotDto,
} from '../dto/draft-snapshot.dto';
import { Schedule } from '../entities/schedule.entity';
import { TermDraftSnapshot } from '../entities/term-draft-snapshot.entity';
import { RuleContextBuilder } from './rule-context.builder';
import { ScheduleCatalogResolver } from './schedule-catalog-resolver.service';
import { ScheduleFacultyService } from './schedule-faculty.service';
import { PublishedVersionEntry } from './term-published-version.service';

const LOAD_TYPES = ['lecture', 'laboratory', 'other'];

export type DraftSnapshotEntry = Omit<PublishedVersionEntry, 'status'> & {
  status: 'draft' | 'review';
};

export type DraftSnapshotSummary = {
  snapshotId: string;
  termId: string;
  termName: string;
  semester: string | null;
  schoolYear: string;
  name: string;
  entryCount: number;
  createdAt: string;
};

export type DraftLoadConflict = {
  entry: DraftSnapshotEntry;
  targetScheduleId: string | null;
  action: 'conflict';
  reason: string;
};

export type DraftLoadResult = {
  matched: number;
  ready: number;
  create: number;
  update: number;
  remove: number;
  keptAsIs: number;
  warnings: number;
  conflicts: DraftLoadConflict[];
  failed: boolean;
  summary: string;
};

type TermLabels = { termName: string; semester: string | null; schoolYear: string };
type RuleFinding = { ruleId: string; ruleName: string; reason: string };
type FacultyGate = {
  requestId: string;
  facultyDeptId: string;
  created: boolean;
};
type PreparedLoad = {
  entry: DraftSnapshotEntry;
  target: Schedule | null;
  write: Record<string, unknown>;
  gate: FacultyGate | null;
  synthetic: ScheduleEntryContext;
  warnings: RuleFinding[];
};
type AssessmentMode = 'preflight' | 'apply';
type Assessment = {
  result: DraftLoadResult;
  ready: PreparedLoad[];
  removeRows: Schedule[];
  createdGates: FacultyGate[];
};

/** Numeric bigint ids sort by value, not lexicographically. */
function compareScheduleIds(a: unknown, b: unknown): number {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const normalizedLeft = left.replace(/^0+/, '') || '0';
    const normalizedRight = right.replace(/^0+/, '') || '0';
    if (normalizedLeft.length !== normalizedRight.length) {
      return normalizedLeft.length < normalizedRight.length ? -1 : 1;
    }
    return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
  }
  return left.localeCompare(right);
}

/**
 * Named drafts of the current draft/review grid. Saving captures only rows the
 * department head can still edit; loading replaces that same editable set.
 * Finalized and published rows are never captured, changed, or removed.
 */
@Injectable()
export class TermDraftSnapshotService {
  private readonly logger = new Logger(TermDraftSnapshotService.name);

  constructor(
    @InjectRepository(TermDraftSnapshot)
    private readonly snapshotRepo: Repository<TermDraftSnapshot>,
    @InjectRepository(Term)
    private readonly termRepo: Repository<Term>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly supabase: SupabaseService,
    private readonly catalog: ScheduleCatalogResolver,
    private readonly ruleContextBuilder: RuleContextBuilder,
    private readonly constraints: ConstraintsService,
    private readonly departments: DepartmentsService,
    private readonly facultyGate: ScheduleFacultyService,
    private readonly dataSource: DataSource,
  ) {}

  async save(dto: SaveDraftSnapshotDto, actor: any): Promise<DraftSnapshotSummary> {
    this.assertActor(actor, dto.deptId);
    const term = await this.assertActiveTerm(dto.termId);
    const name = String(dto.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('A draft name is required.');
    }

    const rows = await this.scheduleRepo.find({
      where: {
        termId: dto.termId,
        deptId: dto.deptId,
        status: In(['draft', 'review']),
      },
      relations: ['subject', 'sectionRef', 'room', 'faculty'],
      order: { scheduleId: 'ASC' },
    });
    if (rows.length === 0) {
      throw new BadRequestException(
        'There are no draft or review rows in this term to save.',
      );
    }

    const sessionCounts = new Map<string, number>();
    const entries: DraftSnapshotEntry[] = rows.map((row) => {
      const key = this.catalog.baseKey(row.subjectId, row.sectionId, row.loadType);
      const sessionIndex = sessionCounts.get(key) ?? 0;
      sessionCounts.set(key, sessionIndex + 1);
      return this.toDraftSnapshotEntry(row, sessionIndex);
    });

    const saved = await this.snapshotRepo.save(
      this.snapshotRepo.create({
        termId: dto.termId,
        deptId: dto.deptId,
        name,
        termName: term.termName,
        semester: term.semester,
        schoolYear: term.schoolYear,
        snapshot: {
          snapshot_version: 1,
          entries,
        },
        createdBy: actor?.userId ?? null,
      }),
    );
    return this.toSummary(saved);
  }

  async list(termId: string, deptId: string, actor: any): Promise<DraftSnapshotSummary[]> {
    this.assertActor(actor, deptId);
    await this.assertActiveTerm(termId);

    const snapshots = await this.snapshotRepo.find({
      where: { termId, deptId },
      order: { createdAt: 'DESC' },
    });
    return snapshots.map((snapshot) => this.toSummary(snapshot));
  }

  async preflight(snapshotId: string, dto: DraftSnapshotTargetDto, actor: any): Promise<DraftLoadResult> {
    return (await this.assess(snapshotId, dto, actor, 'preflight')).result;
  }

  async apply(snapshotId: string, dto: ApplyDraftSnapshotDto, actor: any): Promise<DraftLoadResult> {
    if (dto.confirmed !== true) {
      throw new BadRequestException(
        'Loading a draft must be confirmed with confirmed: true.',
      );
    }

    const assessment = await this.assess(snapshotId, dto, actor, 'apply');
    if (assessment.result.failed) {
      await this.rollbackGates(assessment.createdGates);
      return assessment.result;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        for (const prepared of assessment.ready) {
          if (prepared.target) {
            await manager.save(
              Schedule,
              manager.merge(
                Schedule,
                prepared.target,
                prepared.write as DeepPartial<Schedule>,
              ),
            );
          } else {
            await manager.save(
              Schedule,
              manager.create(Schedule, prepared.write as DeepPartial<Schedule>),
            );
          }
        }
        if (assessment.removeRows.length > 0) {
          await manager.delete(
            Schedule,
            assessment.removeRows.map((row) => row.scheduleId),
          );
        }
      });
    } catch (err) {
      await this.rollbackGates(assessment.createdGates);
      throw new BadRequestException(
        `Draft load failed and no rows were changed: ${(err as Error).message}`,
      );
    }

    // The deletes are committed before the Supabase-backed cleanup query runs.
    for (const row of assessment.removeRows) {
      if (row.pendingFacultyRequestId) {
        await this.facultyGate.cancelOrphanedFacultyRequest(
          row.pendingFacultyRequestId,
        );
      }
    }

    return assessment.result;
  }

  private async assess(
    snapshotId: string,
    dto: DraftSnapshotTargetDto,
    actor: any,
    mode: AssessmentMode,
  ): Promise<Assessment> {
    this.assertActor(actor, dto.deptId);
    await this.assertActiveTerm(dto.termId);

    const snapshot = await this.snapshotRepo.findOne({
      where: {
        termDraftSnapshotId: snapshotId,
        deptId: dto.deptId,
      },
    });
    if (!snapshot) {
      throw new NotFoundException(`Saved draft ${snapshotId} not found.`);
    }
    if (String(snapshot.termId) !== String(dto.termId)) {
      throw new ConflictException(
        `Saved draft ${snapshotId} belongs to term ${snapshot.termId}; it cannot be loaded into term ${dto.termId}.`,
      );
    }

    const rawEntries = Array.isArray(
      (snapshot.snapshot as { entries?: unknown })?.entries,
    )
      ? ((snapshot.snapshot as { entries: unknown[] }).entries as DraftSnapshotEntry[])
      : [];
    const entries = rawEntries.filter(item => item?.status === 'draft' || item?.status === 'review');
    if (entries.length === 0) {
      throw new BadRequestException(
        'The saved draft has no draft or review entries; nothing was loaded.',
      );
    }

    const [prospectus, currentRows] = await Promise.all([
      this.prospectusSubjectIds(dto.termId, dto.deptId),
      this.scheduleRepo.find({
        where: { termId: dto.termId, deptId: dto.deptId },
        relations: ['subject', 'sectionRef', 'room', 'faculty'],
      }),
    ]);
    const editableRows = currentRows.filter(
      (row) => row.status === 'draft' || row.status === 'review',
    );
    const excludeScheduleIds = editableRows.map((row) => String(row.scheduleId));
    const keptAsIs = currentRows.length - editableRows.length;
    const conflicts: DraftLoadConflict[] = [];

    // A pre-existing request belongs to another workflow. It blocks the load
    // whether the row would be overwritten or removed, and is never cancelled
    // by this load.
    for (const row of editableRows) {
      if (!row.pendingFacultyRequestId) continue;
      conflicts.push({
        entry: this.toDraftSnapshotEntry(row, 0),
        targetScheduleId: String(row.scheduleId),
        action: 'conflict',
        reason:
          `The live row ${row.scheduleId} has a pending faculty request ` +
          `(${row.pendingFacultyRequestId}); it was not changed or cancelled.`,
      });
    }

    const byBaseKey = new Map<string, Schedule[]>();
    for (const row of currentRows) {
      const key = this.catalog.baseKey(row.subjectId, row.sectionId, row.loadType);
      const group = byBaseKey.get(key) ?? [];
      group.push(row);
      byBaseKey.set(key, group);
    }
    for (const group of byBaseKey.values()) {
      group.sort((a, b) => compareScheduleIds(a.scheduleId, b.scheduleId));
    }

    const ready: PreparedLoad[] = [];
    const createdGates: FacultyGate[] = [];
    const claimed = new Set<Schedule>();
    let matched = 0;
    let warnings = 0;

    for (const [index, entry] of entries.entries()) {
      let target: Schedule | null = null;
      const conflict = (reason: string) => {
        conflicts.push({
          entry,
          targetScheduleId: target ? String(target.scheduleId) : null,
          action: 'conflict',
          reason,
        });
      };

      const subject = await this.catalog.resolveSubject(entry);
      if (!subject.value) {
        conflict(subject.reason ?? 'The saved subject could not be resolved.');
        continue;
      }
      const section = await this.catalog.resolveSection(entry);
      if (!section.value) {
        conflict(section.reason ?? 'The saved section could not be resolved.');
        continue;
      }
      const room = await this.catalog.resolveRoom(entry);
      if (!room.value) {
        conflict(room.reason ?? 'The saved room could not be resolved.');
        continue;
      }
      const faculty = await this.catalog.resolveFaculty(entry);
      if (!faculty.value) {
        conflict(faculty.reason ?? 'The saved faculty could not be resolved.');
        continue;
      }

      if (!prospectus.has(subject.value.id)) {
        conflict(
          `Subject ${subject.value.code} is not in the active term prospectus for department ${dto.deptId}.`,
        );
        continue;
      }
      if (
        !(await this.departments.isActive(dto.deptId)) ||
        (subject.value.deptId &&
          !(await this.departments.isActive(subject.value.deptId)))
      ) {
        conflict('The receiving or subject-owning department is deactivated.');
        continue;
      }

      const dayOfWeek = this.catalog.dayOfWeek(entry.day_of_week);
      const startTime = this.catalog.clockTime(entry.start_time);
      const endTime = this.catalog.clockTime(entry.end_time);
      if (!dayOfWeek || !startTime || !endTime) {
        conflict('The saved row has an incomplete meeting time.');
        continue;
      }

      const loadType = LOAD_TYPES.includes(entry.load_type ?? '')
        ? (entry.load_type as 'lecture' | 'laboratory' | 'other')
        : null;
      const key = this.catalog.baseKey(
        subject.value.id,
        section.value.sectionId,
        entry.load_type,
      );
      const group = byBaseKey.get(key) ?? [];
      target = group[entry.session_index ?? 0] ?? null;
      if (target) {
        matched += 1;
        claimed.add(target);
      }

      if (target && (target.status === 'finalized' || target.status === 'published')) {
        conflict(
          'The saved row now targets a live row that is finalized or published; it was kept as is.',
        );
        continue;
      }
      let gate: FacultyGate | null = null;
      if (mode === 'apply' && faculty.value.facultyId) {
        try {
          gate = await this.facultyGate.ensureCrossDeptFacultyRequest({
            facultyId: faculty.value.facultyId,
            scheduleDeptId: dto.deptId,
            termId: dto.termId,
            subjectId: subject.value.id,
            user: actor,
          });
          if (gate?.created) createdGates.push(gate);
        } catch (err) {
          conflict(
            `Cross-department faculty request failed: ${(err as Error).message}`,
          );
          continue;
        }
      }

      const synthetic: ScheduleEntryContext = {
        scheduleId: `snapshot:${index}`,
        termId: dto.termId,
        subjectId: subject.value.id,
        facultyId: faculty.value.facultyId ?? null,
        roomId: room.value.roomId ?? null,
        externalRoomName: room.value.externalName ?? null,
        section: section.value.section ?? null,
        loadType,
        dayOfWeek,
        startTime,
        endTime,
      };

      let engine: ReturnType<ConstraintsService['evaluate']>;
      try {
        const context = await this.ruleContextBuilder.build({
          termId: dto.termId,
          scheduleDeptId: dto.deptId,
          subjectId: subject.value.id,
          facultyId: faculty.value.facultyId ?? undefined,
          roomId: room.value.roomId ?? undefined,
          externalRoomName: room.value.externalName ?? undefined,
          section: section.value.section ?? undefined,
          dayOfWeek,
          startTime,
          endTime,
          loadType: loadType ?? undefined,
          excludeScheduleIds: excludeScheduleIds,
        });
        context.existingSchedule.push(...ready.map((item) => item.synthetic));
        engine = this.constraints.evaluate(context);
      } catch (err) {
        conflict(`Draft validation failed: ${(err as Error).message}`);
        continue;
      }
      if (engine.hardConflicts.length > 0) {
        conflict(
          engine.hardConflicts
            .map((item) => `${item.ruleId}: ${item.reason}`)
            .join('; '),
        );
        continue;
      }

      warnings += engine.softWarnings.length;
      ready.push({
        entry,
        target,
        gate,
        synthetic,
        warnings: engine.softWarnings as RuleFinding[],
        write: {
          termId: dto.termId,
          subjectId: subject.value.id,
          facultyId: faculty.value.facultyId ?? null,
          externalFacultyName: faculty.value.externalName ?? null,
          roomId: room.value.roomId ?? null,
          externalRoomName: room.value.externalName ?? null,
          timeslotId: null,
          section: section.value.section ?? null,
          sectionId: section.value.sectionId ?? null,
          deptId: dto.deptId,
          pendingFacultyRequestId: gate?.requestId ?? null,
          pendingFacultyDeptId: gate?.facultyDeptId ?? null,
          loadType,
          dayOfWeek,
          startTime,
          endTime,
          remarks: entry.remarks ?? null,
          status: entry.status,
        },
      });
    }

    const removeRows = editableRows.filter((row) => !claimed.has(row));
    const create = ready.filter((item) => !item.target).length;
    const update = ready.length - create;
    const failed = conflicts.length > 0;
    const result: DraftLoadResult = {
      matched,
      ready: ready.length,
      create,
      update,
      remove: removeRows.length,
      keptAsIs,
      warnings,
      conflicts,
      failed,
      summary: failed
        ? `Draft load blocked: ${conflicts.length} conflict(s); nothing was changed.`
        : `${entries.length} saved rows: ${matched} matched, ${ready.length} ready ` +
          `(${create} create, ${update} update), ${removeRows.length} removed, ` +
          `${keptAsIs} kept as is, ${warnings} warnings.`,
    };

    return { result, ready, removeRows, createdGates };
  }

  private async rollbackGates(gates: FacultyGate[]): Promise<void> {
    for (const gate of gates) {
      if (!gate.created) continue;
      try {
        await this.supabase
          .getAdminClient()
          .from('faculty_request')
          .delete()
          .eq('request_id', gate.requestId);
      } catch (err) {
        this.logger.warn(
          `Draft load rollback of request ${gate.requestId} failed: ` +
            `${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Prospectus subjects for the target semester and receiving department's
   * active programs, matching the published-version reuse gate.
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
        `Draft prospectus lookup failed: ${(err as Error).message}`,
      );
      return new Set();
    }
  }

  private assertActor(actor: any, deptId: string): void {
    if (actor?.role === 'administrator') return;
    if (actor?.role !== 'department_head') {
      throw new ForbiddenException(
        'Only department heads and administrators may save or load drafts.',
      );
    }
    if (actor.deptId == null || String(actor.deptId) === '') {
      throw new ForbiddenException(
        'A department id is required to save or load drafts.',
      );
    }
    if (String(actor.deptId) !== String(deptId)) {
      throw new ForbiddenException(
        'Department heads may use drafts only in their own department.',
      );
    }
  }

  private async assertActiveTerm(termId: string): Promise<TermLabels> {
    let term: any;
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('term')
        .select('term_id, term_name, semester, school_year, is_active')
        .eq('term_id', termId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      term = data;
    } catch (err) {
      this.logger.warn(
        `Draft snapshot term lookup failed: ${(err as Error).message}`,
      );
      throw new BadRequestException(`Unable to verify term ${termId}.`);
    }
    if (!term) throw new NotFoundException(`Term ${termId} not found.`);
    if (term.is_active !== true) {
      throw new BadRequestException(`Term ${termId} is not active.`);
    }
    return {
      termName: String(term.term_name ?? ''),
      semester: term.semester == null ? null : String(term.semester),
      schoolYear: String(term.school_year ?? ''),
    };
  }

  private toDraftSnapshotEntry(
    row: Schedule,
    sessionIndex: number,
  ): DraftSnapshotEntry {
    return {
      schedule_id: row.scheduleId ?? null,
      subject_id: row.subjectId,
      subject_code: row.subject?.subjectCode ?? null,
      subject_title: row.subject?.title ?? null,
      section_id: row.sectionId ?? null,
      section_code: row.sectionRef?.sectionCode ?? row.section ?? null,
      faculty_id: row.facultyId ?? null,
      external_faculty_name: row.externalFacultyName ?? null,
      faculty_name: row.faculty
        ? `${row.faculty.firstName} ${row.faculty.lastName}`
        : (row.externalFacultyName ?? null),
      room_id: row.roomId ?? null,
      room_number: row.room?.roomNumber ?? null,
      building: row.room?.building ?? null,
      external_room_name: row.externalRoomName ?? null,
      day_of_week: row.dayOfWeek ?? null,
      start_time: row.startTime ?? null,
      end_time: row.endTime ?? null,
      load_type: row.loadType ?? null,
      status: row.status === 'review' ? 'review' : 'draft',
      remarks: row.remarks ?? null,
      dept_id: row.deptId ?? null,
      session_index: sessionIndex,
    };
  }

  private toSummary(snapshot: TermDraftSnapshot): DraftSnapshotSummary {
    const entries = Array.isArray(
      (snapshot.snapshot as { entries?: unknown })?.entries,
    )
      ? ((snapshot.snapshot as { entries: unknown[] }).entries.length)
      : 0;
    return {
      snapshotId: String(snapshot.termDraftSnapshotId),
      termId: String(snapshot.termId),
      termName: snapshot.termName,
      semester: snapshot.semester,
      schoolYear: snapshot.schoolYear,
      name: snapshot.name,
      entryCount: entries,
      createdAt:
        snapshot.createdAt instanceof Date
          ? snapshot.createdAt.toISOString()
          : String(snapshot.createdAt),
    };
  }
}
