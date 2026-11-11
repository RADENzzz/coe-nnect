import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { IdpOutboxItem } from './entities/idp-outbox.entity';
import { idpErrors } from './idp.errors';
import { isUniqueViolation } from './idp-persistence.util';
import type {
  IdpOutboxScheduleItem,
  IdpOutboxSchedulePage,
  IdpPublishedSchedulePayload,
} from './idp.types';

export const IDP_OUTBOX_SCHEDULE_KIND = 'schedule.published';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Durable outbox for the offline-capable IDP desktop client (contract 6.3).
 *
 * Items are append-only. The payload is frozen at publish time so a client
 * that was offline cannot receive a different schedule than the one the Dean
 * published. Re-publishing the same `coe_nnect_version_id` returns the
 * original row.
 */
@Injectable()
export class IdpOutboxService {
  private readonly logger = new Logger(IdpOutboxService.name);

  constructor(
    @InjectRepository(IdpOutboxItem)
    private readonly outboxRepo: Repository<IdpOutboxItem>,
  ) {}

  async findSchedule(versionId: string): Promise<IdpOutboxItem | null> {
    return this.outboxRepo.findOne({
      where: {
        kind: IDP_OUTBOX_SCHEDULE_KIND,
        idempotencyKey: versionId,
      },
    });
  }

  async enqueueSchedule(
    payload: IdpPublishedSchedulePayload,
  ): Promise<IdpOutboxItem> {
    const key = String(payload?.coe_nnect_version_id ?? '').trim();
    if (!key) {
      throw idpErrors.validation(
        'coe_nnect_version_id is required to queue a schedule.',
        { field: 'coe_nnect_version_id' },
      );
    }

    const existing = await this.findSchedule(key);
    if (existing) return existing;

    const entity = this.outboxRepo.create({
      kind: IDP_OUTBOX_SCHEDULE_KIND,
      idempotencyKey: key,
      payload,
      // Set explicitly so the service (and its tests) always have a cursor,
      // even before the database default is read back.
      createdAt: new Date(),
    });

    try {
      const saved = await this.outboxRepo.save(entity);
      this.logger.log(
        `Queued IDP schedule v${payload.version_number} ` +
          `(version ${key}, ${payload.entries.length} entries) as outbox ${saved.outboxId}.`,
      );
      return saved;
    } catch (err) {
      // A concurrent publish may have inserted the same version first.
      if (isUniqueViolation(err)) {
        const raced = await this.findSchedule(key);
        if (raced) return raced;
      }
      throw err;
    }
  }

  /**
   * Poll published schedules created at or after `since`.
   *
   * The boundary is inclusive. Clients must dedupe on
   * `payload.coe_nnect_version_id`; repeating the last item is harmless and
   * avoids skipping rows that share the same timestamp.
   */
  async listSchedules(
    options: { since?: string; limit?: number | string } = {},
  ): Promise<IdpOutboxSchedulePage> {
    const since = parseSince(options.since);
    const limit = parseLimit(options.limit);

    const items = await this.outboxRepo.find({
      where: {
        kind: IDP_OUTBOX_SCHEDULE_KIND,
        ...(since ? { createdAt: MoreThanOrEqual(since) } : {}),
      },
      order: { createdAt: 'ASC', outboxId: 'ASC' },
      take: limit,
    });

    const last = items.length > 0 ? items[items.length - 1].createdAt : since;
    return {
      items: items.map(toScheduleItem),
      next_since: last ? new Date(last).toISOString() : null,
      server_time: new Date().toISOString(),
    };
  }

  async countSchedules(): Promise<number> {
    return this.outboxRepo.count({
      where: { kind: IDP_OUTBOX_SCHEDULE_KIND },
    });
  }
}

function toScheduleItem(item: IdpOutboxItem): IdpOutboxScheduleItem {
  return {
    outbox_id: String(item.outboxId),
    kind: item.kind,
    idempotency_key: item.idempotencyKey,
    created_at: new Date(item.createdAt).toISOString(),
    payload: item.payload,
  };
}

function parseSince(value: string | undefined): Date | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const text = String(value).trim();
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw idpErrors.validation(
      'since must be an ISO 8601 timestamp, for example 2026-11-11T00:00:00Z.',
      { field: 'since', value },
    );
  }
  return parsed;
}

function parseLimit(value: number | string | undefined): number {
  if (value === undefined || value === null || String(value).trim() === '') {
    return DEFAULT_LIMIT;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw idpErrors.validation(
      `limit must be an integer between 1 and ${MAX_LIMIT}.`,
      { field: 'limit', value },
    );
  }
  return parsed;
}
