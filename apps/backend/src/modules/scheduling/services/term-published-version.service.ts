// apps/backend/src/modules/scheduling/services/term-published-version.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { Term } from '../../terms/entities/term.entity';
import { Schedule, ScheduleStatus } from '../entities/schedule.entity';
import { TermPublishedVersion } from '../entities/term-published-version.entity';

export type SaveReason = 'published' | 'deactivated';

export type PublishedVersionEntry = {
  schedule_id: string | null;
  subject_id: string;
  subject_code: string | null;
  subject_title: string | null;
  section_id: string | null;
  section_code: string | null;
  faculty_id: string | null;
  external_faculty_name: string | null;
  faculty_name: string | null;
  room_id: string | null;
  room_number: string | null;
  building: string | null;
  external_room_name: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  load_type: string | null;
  status: ScheduleStatus;
  remarks: string | null;
  dept_id: string | null;
  session_index: number;
};

export type PublishedVersionSummary = {
  versionId: string;
  termId: string | null;
  termName: string;
  semester: string | null;
  schoolYear: string;
  entryCount: number;
  stale: boolean;
  locked: boolean;
  publishedAt: Date | null;
  deactivatedAt: Date | null;
  updatedAt: Date;
};

export type PublishedVersionDetail = PublishedVersionSummary & {
  entries: PublishedVersionEntry[];
};

/**
 * Term-wide snapshots written on publish approval and deactivation, then
 * restored when a term is reactivated. Snapshots are rewritten in place, so
 * their id and version number stay stable; staleness and locked state are
 * always derived from the live term at read time.
 */
@Injectable()
export class TermPublishedVersionService {
  constructor(
    @InjectRepository(TermPublishedVersion)
    private readonly versionRepo: Repository<TermPublishedVersion>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(Term)
    private readonly termRepo: Repository<Term>,
  ) {}

  async writeTerm(
    termId: string,
    actor: any,
    reason: SaveReason,
    manager?: EntityManager,
  ): Promise<TermPublishedVersion> {
    const versions = this.versions(manager);
    const schedules = this.schedules(manager);
    const terms = this.terms(manager);

    const [rows, term, existing] = await Promise.all([
      schedules.find({
        where: { termId },
        relations: ['subject', 'faculty', 'room', 'sectionRef'],
        order: { scheduleId: 'ASC' },
      }),
      terms.findOne({ where: { termId } }),
      versions.findOne({ where: { termId } }),
    ]);

    const capturedAt = new Date();
    const capturedBy = actor?.userId ?? actor?.id ?? null;
    const sessionCounts = new Map<string, number>();
    const entries: PublishedVersionEntry[] = rows.map((row) => {
      const key = [row.subjectId, row.sectionId, row.loadType]
        .map((part) => String(part ?? ''))
        .join('::');
      const sessionIndex = sessionCounts.get(key) ?? 0;
      sessionCounts.set(key, sessionIndex + 1);

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
        status: row.status,
        remarks: row.remarks ?? null,
        dept_id: row.deptId ?? null,
        session_index: sessionIndex,
      };
    });

    const snapshot = {
      snapshot_version: 1,
      term_id: termId,
      captured_at: capturedAt.toISOString(),
      captured_by: capturedBy,
      term_name: term?.termName ?? null,
      semester: term?.semester ?? null,
      school_year: term?.schoolYear ?? null,
      entry_count: entries.length,
      entries,
    };

    return versions.save(
      versions.create({
        ...(existing ?? {}),
        termId,
        versionNumber: existing?.versionNumber ?? 1,
        termName: term?.termName ?? '',
        semester: term?.semester ?? null,
        schoolYear: term?.schoolYear ?? '',
        snapshot,
        publishedAt: reason === 'published' ? capturedAt : (existing?.publishedAt ?? null),
        deactivatedAt: reason === 'deactivated' ? capturedAt : null,
        updatedAt: capturedAt,
        lastModifiedBy: capturedBy,
      }),
    );
  }

  async restoreTerm(
    termId: string,
    manager?: EntityManager,
  ): Promise<{ restored: number; skipped: number; reassignedIds: string[] }> {
    const versions = this.versions(manager);
    const schedules = this.schedules(manager);
    const version = await versions.findOne({ where: { termId } });
    if (!version) return { restored: 0, skipped: 0, reassignedIds: [] };

    const entries = this.extractEntries(version.snapshot);
    const originalIds = entries
      .map((entry) => entry.schedule_id)
      .filter((id): id is string => id != null)
      .map(String);
    const occupied = new Set<string>(
      originalIds.length === 0
        ? []
        : (await schedules.find({ where: { scheduleId: In(originalIds) } }))
            .filter((row) => row.scheduleId != null)
            .map((row) => String(row.scheduleId)),
    );

    let restored = 0;
    let skipped = 0;
    const reassignedIds: string[] = [];

    for (const entry of entries) {
      if (!entry.subject_id) {
        skipped += 1;
        continue;
      }

      const originalId = entry.schedule_id == null ? null : String(entry.schedule_id);
      const reuseOriginal = originalId !== null && !occupied.has(originalId);
      const data: Record<string, unknown> = {
        termId,
        subjectId: String(entry.subject_id),
        sectionId: this.optionalId(entry.section_id),
        section: entry.section_code ?? null,
        facultyId: this.optionalId(entry.faculty_id),
        externalFacultyName: entry.external_faculty_name ?? null,
        roomId: this.optionalId(entry.room_id),
        externalRoomName: entry.external_room_name ?? null,
        dayOfWeek: entry.day_of_week ?? null,
        startTime: entry.start_time ?? null,
        endTime: entry.end_time ?? null,
        loadType: entry.load_type ?? null,
        status: entry.status ?? 'draft',
        remarks: entry.remarks ?? null,
        deptId: this.optionalId(entry.dept_id),
      };
      if (reuseOriginal && originalId !== null) data.scheduleId = originalId;

      const created = await schedules.save(
        schedules.create(data as unknown as Schedule),
      );
      occupied.add(String((created as any).scheduleId));
      if (!reuseOriginal && originalId !== null) reassignedIds.push(originalId);
      restored += 1;
    }

    return { restored, skipped, reassignedIds };
  }

  async clearTerm(termId: string, manager?: EntityManager): Promise<number> {
    const result = await this.schedules(manager).delete({ termId });
    return result.affected ?? 0;
  }

  async findBySemester(semester?: string): Promise<PublishedVersionSummary[]> {
    const rows = await this.versionRepo.find({
      ...(semester !== undefined ? { where: { semester } } : {}),
      order: { updatedAt: 'DESC' },
    });
    const termIds = rows
      .map((row) => row.termId)
      .filter((id): id is string => id != null);
    const terms = termIds.length === 0
      ? []
      : await this.termRepo.find({ where: { termId: In(termIds) } });
    const byId = new Map(terms.map((term) => [String(term.termId), term]));

    return rows.map((row) =>
      this.toSummary(row, row.termId == null ? undefined : byId.get(String(row.termId))),
    );
  }

  async findById(id: string): Promise<PublishedVersionDetail> {
    const row = await this.versionRepo.findOne({
      where: { termPublishedVersionId: id },
    });
    if (!row) throw new NotFoundException(`Published version ${id} not found`);

    const term = row.termId == null
      ? undefined
      : (await this.termRepo.findOne({ where: { termId: row.termId } })) ?? undefined;
    return {
      ...this.toSummary(row, term),
      entries: this.extractEntries(row.snapshot),
    };
  }

  async entriesFor(id: string, statuses?: ScheduleStatus[]): Promise<PublishedVersionEntry[]> {
    const row = await this.versionRepo.findOne({
      where: { termPublishedVersionId: id },
    });
    if (!row) throw new NotFoundException(`Published version ${id} not found`);

    const entries = this.extractEntries(row.snapshot);
    return statuses === undefined
      ? entries
      : entries.filter((entry) => statuses.includes(entry.status));
  }

  private toSummary(row: TermPublishedVersion, term?: Term): PublishedVersionSummary {
    const stale =
      term == null ||
      row.termName !== term.termName ||
      row.semester !== term.semester ||
      row.schoolYear !== term.schoolYear;
    const snapshot = row.snapshot ?? {};
    return {
      versionId: row.termPublishedVersionId,
      termId: row.termId,
      termName: row.termName,
      semester: row.semester,
      schoolYear: row.schoolYear,
      entryCount: Number(snapshot.entry_count ?? this.extractEntries(row.snapshot).length),
      stale,
      locked: stale || !term?.isActive,
      publishedAt: row.publishedAt,
      deactivatedAt: row.deactivatedAt,
      updatedAt: row.updatedAt,
    };
  }

  private extractEntries(snapshot: Record<string, unknown> | null): PublishedVersionEntry[] {
    const entries = snapshot?.entries;
    return Array.isArray(entries) ? (entries as PublishedVersionEntry[]) : [];
  }

  private optionalId(value: unknown): string | null {
    return value == null || value === '' ? null : String(value);
  }

  private versions(manager?: EntityManager): Repository<TermPublishedVersion> {
    return manager
      ? manager.getRepository(TermPublishedVersion)
      : this.versionRepo;
  }

  private schedules(manager?: EntityManager): Repository<Schedule> {
    return manager ? manager.getRepository(Schedule) : this.scheduleRepo;
  }

  private terms(manager?: EntityManager): Repository<Term> {
    return manager ? manager.getRepository(Term) : this.termRepo;
  }
}
