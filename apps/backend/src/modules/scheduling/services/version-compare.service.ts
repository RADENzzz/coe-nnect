// apps/backend/src/modules/scheduling/services/version-compare.service.ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { Schedule } from '../entities/schedule.entity';
import {
  filterVersionEntries,
  resolveVersionDeptId,
} from '../version-scope';
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
import { TermDraftSnapshotService } from './term-draft-snapshot.service';

export type VersionSourceKind = 'published' | 'history' | 'live' | 'draft';
export type VersionSource = { kind: VersionSourceKind; id: string };

type ComparableEntry = Omit<PublishedVersionEntry, 'session_index'> & {
  session_index?: number | null;
};

type NormalizedSource = {
  entries: PublishedVersionEntry[];
  summary: ComparedVersionSummary;
};

const SOURCE_KINDS: VersionSourceKind[] = ['published', 'history', 'live', 'draft'];

/** Parse `published:<id>`, `history:<id>`, `live:<termId>`, or `draft:<snapshotId>`. */
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
    private readonly drafts: TermDraftSnapshotService,
  ) {}

  async compareSources(
    sourceA: string,
    sourceB: string,
    actor: any,
    requestedDeptId?: string | null,
    requestedTermId?: string | null,
  ): Promise<VersionCompareResult> {
    const a = parseSource(sourceA);
    const b = parseSource(sourceB);
    const hasDraft = a.kind === 'draft' || b.kind === 'draft';

    if (!hasDraft) {
      const deptId = resolveVersionDeptId(actor, requestedDeptId);
      const [normalA, normalB] = await Promise.all([
        this.normalize(a, actor, deptId),
        this.normalize(b, actor, deptId),
      ]);
      return compareEntries(
        normalA.entries as Array<Record<string, unknown>>,
        normalB.entries as Array<Record<string, unknown>>,
        normalA.summary,
        normalB.summary,
      );
    }

    if (actor?.role !== 'department_head' && actor?.role !== 'administrator') {
      throw new ForbiddenException(
        'Only department_head or administrator roles may compare saved drafts.',
      );
    }
    const deptId = resolveVersionDeptId(actor, requestedDeptId);
    if (deptId === null) {
      throw new BadRequestException(
        'A department id is required to compare saved drafts.',
      );
    }
    const termId = String(requestedTermId ?? '').trim();
    if (!termId) {
      throw new BadRequestException(
        'termId is required when comparing saved drafts.',
      );
    }
    for (const source of [a, b]) {
      if (
        source.kind !== 'draft' &&
        source.kind !== 'live'
      ) {
        throw new BadRequestException(
          'A saved draft can only be compared between draft and live or draft sources.',
        );
      }
      if (source.kind === 'live' && source.id !== termId) {
        throw new BadRequestException(
          'A live source must be in the same term as the saved draft.',
        );
      }
    }

    const [normalA, normalB] = await Promise.all([
      this.normalize(a, actor, deptId, termId, true),
      this.normalize(b, actor, deptId, termId, true),
    ]);
    return compareEntries(
      normalA.entries as Array<Record<string, unknown>>,
      normalB.entries as Array<Record<string, unknown>>,
      normalA.summary,
      normalB.summary,
    );
  }

  private async normalize(
    source: VersionSource,
    actor: any,
    deptId: string | null,
    draftTermId?: string,
    draftComparison = false,
  ): Promise<NormalizedSource> {
    switch (source.kind) {
      case 'draft': {
        const detail = await this.drafts.detail(
          source.id,
          String(draftTermId ?? ''),
          deptId as string,
          actor,
        );
        const entries = this.withSessionIndexes(
          detail.entries as ComparableEntry[],
        );
        const summary = this.summary(
          detail.snapshotId,
          null,
          null,
          null,
          detail.entryCount,
        );
        summary.label = detail.name;
        summary.termId = detail.termId;
        return { entries, summary };
      }
      case 'published': {
        const entries = this.withSessionIndexes(
          filterVersionEntries(
            await this.publishedVersions.entriesFor(source.id),
            deptId,
          ),
        );
        return {
          entries,
          summary: this.summary(source.id, null, null, null, entries.length),
        };
      }
      case 'history': {
        const version = await this.scheduleVersions.findVersion(source.id);
        const raw = (version.snapshot as { entries?: unknown } | null)?.entries;
        const entries = this.withSessionIndexes(
          filterVersionEntries(
            (Array.isArray(raw) ? raw : []) as ComparableEntry[],
            deptId,
          ),
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
        const where: FindOptionsWhere<Schedule> = { termId: source.id };
        if (deptId !== null) {
          where.deptId = deptId;
        }
        const rows = await this.scheduleRepo.find({
          where,
          relations: ['subject', 'faculty', 'room', 'sectionRef'],
          order: { scheduleId: 'ASC' },
        });
        const mapped = rows.map((row) => this.toEntry(row));
        const candidates = draftComparison
          ? mapped.filter(
              (item) => item.status === 'draft' || item.status === 'review',
            )
          : mapped;
        const entries = this.withSessionIndexes(
          filterVersionEntries(candidates, deptId),
        );
        const summary = this.summary(
          `live:${source.id}`,
          null,
          null,
          null,
          entries.length,
        );
        if (draftComparison) {
          summary.label = 'Live timetable';
          summary.termId = source.id;
        }
        return { entries, summary };
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
