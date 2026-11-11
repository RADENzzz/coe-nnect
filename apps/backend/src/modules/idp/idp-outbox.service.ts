import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { IdpOutboxItem } from './entities/idp-outbox.entity';
import { idpErrors } from './idp.errors';
import { isUniqueViolation } from './idp-persistence.util';
import type {
  IdpChangeRequestAckPayload,
  IdpFacultyRequestPayload,
  IdpOutboxItem as IdpOutboxItemView,
  IdpOutboxPage,
  IdpOutboxSchedulePage,
  IdpPublishedSchedulePayload,
} from './idp.types';

export const IDP_OUTBOX_SCHEDULE_KIND = 'schedule.published';
export const IDP_OUTBOX_FACULTY_REQUEST_KIND = 'faculty_request.status';
export const IDP_OUTBOX_CHANGE_REQUEST_ACK_KIND = 'change_request.ack';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Durable outbox for the offline-capable IDP desktop client (contract 6.3).
 *
 * Schedule items are append-only and frozen at publish time. Faculty-request
 * status items are keyed by `coe_nnect_request_id` and refreshed in place, so
 * a poller sees the current status rather than every historical transition.
 * Change-request acks are keyed by `idp_request_id` and written once.
 */
@Injectable()
export class IdpOutboxService {
  private readonly logger = new Logger(IdpOutboxService.name);

  constructor(
    @InjectRepository(IdpOutboxItem)
    private readonly outboxRepo: Repository<IdpOutboxItem>,
  ) {}

  async find(
    kind: string,
    idempotencyKey: string,
  ): Promise<IdpOutboxItem | null> {
    return this.outboxRepo.findOne({
      where: { kind, idempotencyKey },
    });
  }

  async findSchedule(versionId: string): Promise<IdpOutboxItem | null> {
    return this.find(IDP_OUTBOX_SCHEDULE_KIND, versionId);
  }

  async enqueue(
    kind: string,
    idempotencyKey: string,
    payload: Record<string, any>,
  ): Promise<IdpOutboxItem> {
    const key = String(idempotencyKey ?? '').trim();
    if (!key) {
      throw idpErrors.validation(
        'An idempotency key is required to queue an outbox item.',
        { field: 'idempotency_key' },
      );
    }

    const existing = await this.find(kind, key);
    if (existing) return existing;

    const entity = this.outboxRepo.create({
      kind,
      idempotencyKey: key,
      payload,
      // Set explicitly so the service (and its tests) always have a cursor,
      // even before the database default is read back.
      createdAt: new Date(),
    });

    try {
      const saved = await this.outboxRepo.save(entity);
      this.logger.log(
        `Queued IDP outbox item ${kind} (${key}) as ${saved.outboxId}.`,
      );
      return saved;
    } catch (err) {
      // A concurrent producer may have inserted the same key first.
      if (isUniqueViolation(err)) {
        const raced = await this.find(kind, key);
        if (raced) return raced;
      }
      throw err;
    }
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
    return this.enqueue(
      IDP_OUTBOX_SCHEDULE_KIND,
      key,
      payload as unknown as Record<string, any>,
    );
  }

  /**
   * Queue (or refresh) the latest status for a faculty request.
   *
   * The contract keys faculty-request status on `coe_nnect_request_id`.
   * Updating the existing row in place keeps one item per request and makes
   * the poller converge on the current status after an offline period.
   */
  async enqueueFacultyRequest(
    payload: IdpFacultyRequestPayload,
  ): Promise<IdpOutboxItem> {
    const key = String(payload?.coe_nnect_request_id ?? '').trim();
    if (!key) {
      throw idpErrors.validation(
        'coe_nnect_request_id is required to queue a faculty request.',
        { field: 'coe_nnect_request_id' },
      );
    }

    const existing = await this.find(IDP_OUTBOX_FACULTY_REQUEST_KIND, key);
    if (existing) {
      const refreshedAt = new Date();
      const storedPayload = payload as unknown as Record<string, any>;
      // `save()` strips `@CreateDateColumn` on update, so use an explicit
      // update to move the poll cursor as well as replace the payload.
      await this.outboxRepo.update(
        { kind: IDP_OUTBOX_FACULTY_REQUEST_KIND, idempotencyKey: key },
        { payload: storedPayload, createdAt: refreshedAt },
      );
      existing.payload = storedPayload;
      existing.createdAt = refreshedAt;
      return existing;
    }

    return this.enqueue(
      IDP_OUTBOX_FACULTY_REQUEST_KIND,
      key,
      payload as unknown as Record<string, any>,
    );
  }

  /**
   * Queue a change-request ack exactly once per `idp_request_id`.
   *
   * The ack is written once by `IdpChangeRequestService`; this method is
   * idempotent so a retried request cannot create a second outbox row.
   */
  async enqueueChangeRequestAck(
    payload: IdpChangeRequestAckPayload,
  ): Promise<IdpOutboxItem> {
    const key = String(payload?.idp_request_id ?? '').trim();
    if (!key) {
      throw idpErrors.validation(
        'idp_request_id is required to queue a change-request ack.',
        { field: 'idp_request_id' },
      );
    }
    return this.enqueue(
      IDP_OUTBOX_CHANGE_REQUEST_ACK_KIND,
      key,
      payload as unknown as Record<string, any>,
    );
  }

  /**
   * Poll one outbox kind created at or after `since`.
   *
   * The boundary is inclusive. Clients must dedupe on `idempotency_key`;
   * repeating the last item is harmless and avoids skipping rows that share
   * the same timestamp.
   */
  async list<T = unknown>(
    kind: string,
    options: { since?: string; limit?: number | string } = {},
  ): Promise<IdpOutboxPage<T>> {
    const since = parseSince(options.since);
    const limit = parseLimit(options.limit);

    const items = await this.outboxRepo.find({
      where: {
        kind,
        ...(since ? { createdAt: MoreThanOrEqual(since) } : {}),
      },
      order: { createdAt: 'ASC', outboxId: 'ASC' },
      take: limit,
    });

    const last = items.length > 0 ? items[items.length - 1].createdAt : since;
    return {
      items: items.map((item) => toOutboxItem<T>(item)),
      next_since: last ? new Date(last).toISOString() : null,
      server_time: new Date().toISOString(),
    };
  }

  async listSchedules(
    options: { since?: string; limit?: number | string } = {},
  ): Promise<IdpOutboxSchedulePage> {
    return this.list<IdpPublishedSchedulePayload>(
      IDP_OUTBOX_SCHEDULE_KIND,
      options,
    );
  }

  async listFacultyRequests(
    options: { since?: string; limit?: number | string } = {},
  ): Promise<IdpOutboxPage<IdpFacultyRequestPayload>> {
    return this.list<IdpFacultyRequestPayload>(
      IDP_OUTBOX_FACULTY_REQUEST_KIND,
      options,
    );
  }

  async listChangeRequestAcks(
    options: { since?: string; limit?: number | string } = {},
  ): Promise<IdpOutboxPage<IdpChangeRequestAckPayload>> {
    return this.list<IdpChangeRequestAckPayload>(
      IDP_OUTBOX_CHANGE_REQUEST_ACK_KIND,
      options,
    );
  }

  async countSchedules(): Promise<number> {
    return this.outboxRepo.count({
      where: { kind: IDP_OUTBOX_SCHEDULE_KIND },
    });
  }
}

function toOutboxItem<T>(item: IdpOutboxItem): IdpOutboxItemView<T> {
  return {
    outbox_id: String(item.outboxId),
    kind: item.kind,
    idempotency_key: item.idempotencyKey,
    created_at: new Date(item.createdAt).toISOString(),
    payload: item.payload as T,
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
