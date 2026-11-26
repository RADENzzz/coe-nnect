// apps/backend/src/modules/scheduling/services/version-compare.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { Schedule } from '../entities/schedule.entity';
import {
  compareEntries,
  ScheduleVersionService,
  type ComparedVersionSummary,
  type VersionCompareResult,
} from './schedule-version.service';
import {
  TermPublishedVersionService,
  type PublishedVersionEntry,
} from './term-published-version.service';

export type VersionSourceKind = 'published' | 'history' | 'live';
export type VersionSource = { kind: VersionSourceKind; id: string };

type ComparableEntry = Omit<PublishedVersionEntry, 'session_index'> & {
  session_index?: number | null;
};

type NormalizedSource = {
  entries: PublishedVersionEntry[];
  summary: ComparedVersionSummary;
};

const SOURCE_KINDS: VersionSourceKind[] = ['published', 'history', 'live'];

/** Parse `published:<id>`, `history:<id>`, or `live:<termId>`. */
export function parseSource(value: string): VersionSource {
  const raw = String(value ?? '');
  const separator = raw.indexOf(':');
  if (separator < 0) {
    throw new BadRequestException(`Unknown source ${raw}`);
  }
  const kind = raw.slice(0, separator);
  if (!SOURCE_KINDS.includes(kind as VersionSourceKind)) {
    throw new BadRequestException(`Unknown source ${kind}`);
  }

  const id = raw.slice(separator + 1).trim();
  if (!id) {
    throw new BadRequestException(`Source ${kind} is missing an id`);
  }
  return { kind: kind as VersionSourceKind, id };
}

/**
 * Read-only comparison of any two sources, including across terms. Saved and
 * history versions stay comparable when stale; only editing is restricted.
 * No source is written and no status is changed here.
 */
@Injectable()
export class VersionCompareService {
  constructor(
    private readonly publishedVersions: TermPublishedVersionService,
    private readonly scheduleVersions: ScheduleVersionService,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
  ) {}

  async compareSources(
    sourceA: string,
    sourceB: string,
    actor: any,
  ): Promise<VersionCompareResult> {
    const [a, b] = await Promise.all([
      this.normalize(parseSource(sourceA), actor),
      this.normalize(parseSource(sourceB), actor),
    ]);

    return compareEntries(
      a.entries as Array<Record<string, unknown>>,
      b.entries as Array<Record<string, unknown>>,
      a.summary,
      b.summary,
    );
  }

  private async normalize(source: VersionSource, actor: any): Promise<NormalizedSource> {
    switch (source.kind) {
      case 'published': {
        const entries = await this.publishedVersions.entriesFor(source.id);
        return {
          entries,
          summary: this.summary(source.id, null, null, null, entries.length),
        };
      }
      case 'history': {
        const version = await this.scheduleVersions.findVersion(source.id);
        const raw = (version.snapshot as { entries?: unknown } | null)?.entries;
        const entries = this.withSessionIndexes(
          (Array.isArray(raw) ? raw : []) as ComparableEntry[],
        );
        return {
          entries,
          summary: this.summary(
            version.versionId,
            version.versionNumber,
            version.finalizedByName,
            version.lastModifiedAt.toISOString(),
            entries.length,
          ),
        };
      }
      case 'live': {
        const isHead = actor?.role === 'department_head';
        if (isHead && (actor.deptId == null || String(actor.deptId).trim() === '')) {
          throw new BadRequestException(
            'Department head actor is missing a department id for a live source',
          );
        }
        const where: FindOptionsWhere<Schedule> = { termId: source.id };
        if (isHead) {
          where.deptId = String(actor.deptId);
        }
        const rows = await this.scheduleRepo.find({
          where,
          relations: ['subject', 'faculty', 'room', 'sectionRef'],
          order: { scheduleId: 'ASC' },
        });
        const entries = this.withSessionIndexes(rows.map((row) => this.toEntry(row)));
        return {
          entries,
          summary: this.summary(
            `live:${source.id}`,
            null,
            null,
            null,
            entries.length,
          ),
        };
      }
    }
  }

  private summary(
    versionId: string,
    versionNumber: number | null,
    finalizedByName: string | null,
    lastModifiedAt: string | null,
    entryCount: number,
  ): ComparedVersionSummary {
    return { versionId, versionNumber, finalizedByName, lastModifiedAt, entryCount };
  }

  /** Fill in session indexes for snapshots written before they were captured. */
  private withSessionIndexes(entries: ComparableEntry[]): PublishedVersionEntry[] {
    const counters = new Map<string, number>();
    return entries.map((entry) => {
      const key = [entry.subject_id, entry.section_id, entry.load_type]
        .map((part) => String(part ?? ''))
        .join('::');
      const fallback = counters.get(key) ?? 0;
      counters.set(key, fallback + 1);
      const captured = Number(entry.session_index);
      return {
        ...entry,
        external_room_name: entry.external_room_name ?? null,
        session_index: Number.isInteger(captured) ? captured : fallback,
      } as PublishedVersionEntry;
    });
  }

  private toEntry(row: Schedule): ComparableEntry {
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
    };
  }
}
