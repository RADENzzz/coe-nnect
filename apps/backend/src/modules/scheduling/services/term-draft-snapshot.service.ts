import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { SupabaseService } from '../../../database/supabase.service';
import { Term } from '../../terms/entities/term.entity';
import { SaveDraftSnapshotDto } from '../dto/draft-snapshot.dto';
import { Schedule } from '../entities/schedule.entity';
import { TermDraftSnapshot } from '../entities/term-draft-snapshot.entity';
import { ScheduleCatalogResolver } from './schedule-catalog-resolver.service';
import { PublishedVersionEntry } from './term-published-version.service';

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

type TermLabels = { termName: string; semester: string | null; schoolYear: string };

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
