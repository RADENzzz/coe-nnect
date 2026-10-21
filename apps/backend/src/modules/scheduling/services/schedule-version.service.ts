import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SupabaseService } from '../../../database/supabase.service';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleVersion } from '../entities/schedule-version.entity';

/**
 * Schedule snapshots and version comparisons (FR 5.1.8(a)).
 *
 * Versions are term-wide and denormalized so a snapshot stays readable after
 * subjects, faculty, or rooms are renamed or removed.
 */
@Injectable()
export class ScheduleVersionService {
  private readonly logger = new Logger(ScheduleVersionService.name);

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(ScheduleVersion)
    private readonly versionRepo: Repository<ScheduleVersion>,
    private readonly supabase: SupabaseService,
  ) {}

  /** Build and persist a full-term snapshot of the current schedule. */
  async writeVersion(termId: string, user: any): Promise<ScheduleVersion> {
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
          : (e.externalFacultyName ?? null),
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

  /** List all versions for a term, newest first (summary only). */
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

    const userIds = Array.from(
      new Set(
        rows.map((r) => r.finalizedBy).filter((v): v is string => !!v),
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
          ? (nameById.get(r.finalizedBy) ?? null)
          : null,
        lastModifiedAt: r.lastModifiedAt.toISOString(),
        entryCount: Number(snap.entry_count ?? 0),
        capturedAt:
          typeof snap.captured_at === 'string' ? snap.captured_at : null,
      };
    });
  }

  /** Fetch a single version with its full snapshot. */
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

  /** Compare two snapshots of the same term. */
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

  private extractEntries(
    snapshot: Record<string, unknown> | null,
  ): Array<Record<string, unknown>> {
    if (!snapshot) return [];
    const entries = snapshot.entries;
    return Array.isArray(entries)
      ? (entries as Array<Record<string, unknown>>)
      : [];
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
}
