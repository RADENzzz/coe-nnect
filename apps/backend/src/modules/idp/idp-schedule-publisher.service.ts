import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Department } from '../departments/entities/department.entity';
import { Term } from '../terms/entities/term.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { ScheduleVersion } from '../scheduling/entities/schedule-version.entity';
import { IdpOutboxItem } from './entities/idp-outbox.entity';
import { IdpClientService, IdpUpstreamError } from './idp-client.service';
import { IdpOutboxService } from './idp-outbox.service';
import type {
  IdpPublishedScheduleEntry,
  IdpPublishedSchedulePayload,
  IdpSchedulePushResult,
} from './idp.types';

/**
 * Milestone 2 — published-schedule publisher (contract 4.4 / 5.4).
 *
 * Builds the term-wide payload from LIVE `schedule` rows at send time. The
 * `schedule_version.snapshot` supplies version identity only: it captures every
 * finalized/published row and does not carry `pending_faculty_request_id` or
 * `flagged`, so it cannot drive the exclusion rules.
 *
 * The push is intentionally not transactional with the local publish. A
 * rejected or unreachable IDP must not roll back a schedule the college has
 * already committed to. The version row survives, so the push can be replayed
 * with the same `coe_nnect_version_id` and IDP can deduplicate it.
 */
@Injectable()
export class IdpSchedulePublisherService {
  private readonly logger = new Logger(IdpSchedulePublisherService.name);

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(ScheduleVersion)
    private readonly versionRepo: Repository<ScheduleVersion>,
    @InjectRepository(Term)
    private readonly termRepo: Repository<Term>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly outbox: IdpOutboxService,
    private readonly client: IdpClientService,
  ) {}

  /**
   * Build the payload from live rows without sending or queueing it. Used by
   * the review screen so the preview and the wire never disagree.
   */
  async buildPayload(termCode: string): Promise<IdpPublishedSchedulePayload> {
    const term = await this.resolveTerm(termCode);
    const version = await this.resolveVersion(String(term.termId), term);
    return this.buildPayloadFor(term, version);
  }

  private async buildPayloadFor(
    term: Term,
    version: ScheduleVersion,
  ): Promise<IdpPublishedSchedulePayload> {
    const termId = String(term.termId);

    const [rows, departments] = await Promise.all([
      this.scheduleRepo.find({
        where: {
          termId,
          status: In(['finalized', 'published']),
          flagged: false,
        },
        relations: ['subject', 'faculty', 'room', 'sectionRef'],
        order: { scheduleId: 'ASC' },
      }),
      this.departmentRepo.find({ select: ['deptId', 'deptCode'] }),
    ]);

    const deptCodeById = new Map(
      departments.map((row) => [String(row.deptId), row.deptCode]),
    );

    const entries: IdpPublishedScheduleEntry[] = [];
    let excluded = 0;

    for (const row of rows) {
      // Contract 4.4 — an open cross-department faculty request keeps the row
      // out of the publish, as does a flag. The query already dropped flagged
      // rows; the request check stays here because it reads a joined column.
      if (row.pendingFacultyRequestId) {
        excluded += 1;
        continue;
      }

      const departmentCode = row.deptId
        ? deptCodeById.get(String(row.deptId))
        : undefined;
      const subjectCode = row.subject?.subjectCode;
      const dayOfWeek = row.dayOfWeek;
      const startTime = toHHMM(row.startTime);
      const endTime = toHHMM(row.endTime);

      if (
        !departmentCode ||
        !subjectCode ||
        !dayOfWeek ||
        !startTime ||
        !endTime
      ) {
        excluded += 1;
        continue;
      }

      const sectionCode = row.sectionRef?.sectionCode ?? row.section ?? null;
      const facultyWmsuId = row.faculty?.wmsuId ?? null;
      // `chk_schedule_faculty_or_external` accepts a remarks-only row, so both
      // of these can be null on a row that still passes every other filter.
      // IDP reads that pair as an unassigned slot.
      const externalFacultyName =
        facultyWmsuId === null
          ? (row.externalFacultyName ?? row.faculty?.employeeId ?? null)
          : null;

      entries.push({
        coe_nnect_schedule_id: String(row.scheduleId),
        department_code: departmentCode,
        section_code: sectionCode,
        subject_code: subjectCode,
        faculty_wmsu_id: facultyWmsuId,
        external_faculty_name: externalFacultyName,
        room_number: row.room?.roomNumber ?? null,
        external_room_name: row.externalRoomName ?? null,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        load_type: row.loadType ?? null,
      });
    }

    if (entries.length === 0) {
      throw new BadRequestException(
        `Nothing to publish for ${this.termCode(term)}: no finalized schedule ` +
          'rows survive the IDP exclusion rules.',
      );
    }

    if (excluded > 0) {
      this.logger.warn(
        `IDP publish ${this.termCode(term)} v${version.versionNumber}: ` +
          `${excluded} row(s) excluded from ${rows.length}.`,
      );
    }

    return {
      coe_nnect_version_id: String(version.versionId),
      version_number: version.versionNumber,
      term_code: this.termCode(term),
      published_at: new Date().toISOString(),
      entries,
    };
  }

  /**
   * Queue the term-wide payload for the IDP desktop poller and, when a
   * Pattern A endpoint is configured, also push it immediately.
   *
   * Queueing is the durable part. A push failure is reported in the result,
   * not thrown: the local publish already happened and the outbox item
   * survives for the next poll or replay.
   */
  async publishTerm(termCode: string): Promise<IdpSchedulePushResult> {
    const term = await this.resolveTerm(termCode);
    const version = await this.resolveVersion(String(term.termId), term);

    // Reuse the frozen payload for this version. This keeps
    // `coe_nnect_version_id` idempotent even if live schedule rows changed
    // after the first publish.
    const existing = await this.outbox.findSchedule(String(version.versionId));
    const queued =
      existing ??
      (await this.outbox.enqueueSchedule(
        await this.buildPayloadFor(term, version),
      ));

    return this.deliverQueued(queued);
  }

  private async deliverQueued(
    item: IdpOutboxItem,
  ): Promise<IdpSchedulePushResult> {
    const payload = item.payload;
    const base = {
      termCode: payload.term_code,
      versionId: payload.coe_nnect_version_id,
      versionNumber: payload.version_number,
      entryCount: payload.entries.length,
      queued: true,
      outboxId: item.outboxId != null ? String(item.outboxId) : null,
      queuedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    };

    if (!this.client.enabled || !this.client.baseUrl) {
      return {
        ...base,
        attempted: false,
        delivered: false,
        status: null,
        attempts: 0,
        skipped: !this.client.enabled ? 'disabled' : 'not_configured',
      };
    }

    try {
      const { status, attempts } =
        await this.client.pushPublishedSchedule(payload);
      this.logger.log(
        `IDP publish ${payload.term_code} v${payload.version_number} ` +
          `-> ${status} (${payload.entries.length} entries, ${attempts} attempt(s))`,
      );
      return {
        ...base,
        attempted: true,
        delivered: true,
        status,
        attempts,
      };
    } catch (err) {
      const status = err instanceof IdpUpstreamError ? err.status : null;
      const attempts = err instanceof IdpUpstreamError ? err.attempts : 1;
      const message = err instanceof Error ? err.message : 'IDP push failed.';
      this.logger.error(
        `IDP publish ${payload.term_code} v${payload.version_number} failed ` +
          `after ${attempts} attempt(s); item remains queued: ${message}`,
      );
      return {
        ...base,
        attempted: true,
        delivered: false,
        status,
        attempts,
        error: message,
      };
    }
  }

  private async resolveVersion(
    termId: string,
    term: Term,
  ): Promise<ScheduleVersion> {
    const version = await this.versionRepo.findOne({
      where: { termId, facultyId: IsNull() },
      order: { versionNumber: 'DESC' },
    });
    if (!version) {
      throw new NotFoundException(
        `No published schedule version exists for ${this.termCode(term)}. ` +
          'Finalize the term schedule first.',
      );
    }
    return version;
  }

  private async resolveTerm(termCode: string): Promise<Term> {
    const value = String(termCode ?? '').trim();
    const match = /^(\d{4}-\d{4})-(1st|2nd|summer)$/.exec(value);
    if (!match) {
      throw new BadRequestException(
        `term_code '${value}' is not YYYY-YYYY-1st|2nd|summer.`,
      );
    }

    const term = await this.termRepo.findOne({
      where: {
        schoolYear: match[1],
        semester: match[2] as Term['semester'],
      },
    });
    if (!term) {
      throw new NotFoundException(`Term '${value}' is not configured.`);
    }
    if (!term.semester) {
      throw new BadRequestException(
        `Term '${value}' has no semester and cannot be published.`,
      );
    }
    return term;
  }

  private termCode(term: Term): string {
    return `${term.schoolYear}-${term.semester}`;
  }
}

/** 'HH:MM:SS' -> 'HH:MM'. Leaves malformed values untouched. */
function toHHMM(value: string | null): string | null {
  if (!value) return null;
  const text = String(value);
  return /^\d{2}:\d{2}:\d{2}$/.test(text) ? text.slice(0, 5) : text;
}
