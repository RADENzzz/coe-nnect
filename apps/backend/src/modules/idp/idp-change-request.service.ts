import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Section } from '../sections/entities/section.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Designation } from '../system-config/entities/designation.entity';
import { Term } from '../terms/entities/term.entity';
import { IdpChangeRequest } from './entities/idp-change-request.entity';
import { AckChangeRequestDto } from './dto/ack-change-request.dto';
import { ListChangeRequestsDto } from './dto/list-change-requests.dto';
import { IdpClientService, IdpUpstreamError } from './idp-client.service';
import { IdpOutboxService } from './idp-outbox.service';
import { idpErrors } from './idp.errors';
import { isUniqueViolation } from './idp-persistence.util';
import type {
  IdpChangeRequestAckAction,
  IdpChangeRequestAckPayload,
  IdpChangeRequestAckResult,
  IdpChangeRequestAckView,
  IdpChangeRequestPayload,
  IdpChangeRequestReceipt,
  IdpChangeRequestStatus,
  IdpChangeRequestView,
} from './idp.types';

const CHANGE_REQUEST_TYPES = new Set([
  'faculty_create',
  'faculty_update',
  'faculty_deactivate',
  'faculty_transfer',
  'qualification_add',
  'qualification_remove',
  'unavailability_change',
  'schedule_override',
]);

const SEVERITIES = new Set(['info', 'warning', 'critical']);
const ACK_ACTIONS = new Set(['accepted', 'rejected', 'modified']);
const DAYS = new Set([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]);
const CLASSIFICATIONS = new Set([
  'regular',
  'part_time',
  'visiting_lecturer',
  'other',
]);
const LOAD_TYPES = new Set(['lecture', 'laboratory', 'other']);

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

type NormalizedChangeRequest = {
  type: string;
  wmsuId: string | null;
  employeeId: string | null;
  facultyId: string | null;
};

/**
 * Milestone 3 — inbound change requests and their acknowledgements.
 *
 * Contract 4.7 / 5.7: IDP raises a change request when it needs CoE-NNECT to
 * review a schedule- or faculty-affecting change. The request is persisted
 * with `idp_request_id` as its idempotency key. A reviewer (Dean, college
 * secretary, or administrator) records exactly one acknowledgement, which is
 * queued in the durable outbox and, when Pattern A is configured, pushed to
 * `POST {IDP_BASE}/change-requests/{id}/ack`.
 *
 * Acknowledging is a decision, not an automatic write to the live schedule or
 * faculty tables. The reviewer applies the underlying change through the
 * existing screens and records the decision here. This keeps the IDP proposal
 * separate from CoE-NNECT's authoritative scheduling data.
 */
@Injectable()
export class IdpChangeRequestService {
  private readonly logger = new Logger(IdpChangeRequestService.name);

  constructor(
    @InjectRepository(IdpChangeRequest)
    private readonly changeRequestRepo: Repository<IdpChangeRequest>,
    @InjectRepository(Faculty)
    private readonly facultyRepo: Repository<Faculty>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Term)
    private readonly termRepo: Repository<Term>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(Designation)
    private readonly designationRepo: Repository<Designation>,
    private readonly outbox: IdpOutboxService,
    private readonly client: IdpClientService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // Inbound webhook (contract 4.7 / 5.7)
  // ────────────────────────────────────────────────────────────

  async receive(
    body: unknown,
    requestId?: string,
  ): Promise<IdpChangeRequestReceipt> {
    const payload = assertObject(body) as IdpChangeRequestPayload;
    const idpRequestId = requireString(payload.idp_request_id, 'idp_request_id');
    const type = requireString(payload.type, 'type');
    if (!CHANGE_REQUEST_TYPES.has(type)) {
      throw idpErrors.validation(
        `type '${type}' is not one of the contract's eight change-request types.`,
        { field: 'type', value: type },
      );
    }

    const severity = requireString(payload.severity, 'severity');
    if (!SEVERITIES.has(severity)) {
      throw idpErrors.validation(
        `severity '${severity}' must be info, warning, or critical.`,
        { field: 'severity', value: severity },
      );
    }
    if (typeof payload.requires_ack !== 'boolean') {
      throw idpErrors.validation('requires_ack must be a boolean.', {
        field: 'requires_ack',
      });
    }
    const requestedAt = parseDate(payload.created_at, 'created_at');
    if (!payload.details || typeof payload.details !== 'object' || Array.isArray(payload.details)) {
      throw idpErrors.validation('details must be a JSON object.', {
        field: 'details',
      });
    }
    if (
      payload.affected_dates !== undefined &&
      payload.affected_dates !== null &&
      (!Array.isArray(payload.affected_dates) ||
        payload.affected_dates.some((value) => typeof value !== 'string'))
    ) {
      throw idpErrors.validation(
        'affected_dates must be an array of ISO date strings.',
        { field: 'affected_dates' },
      );
    }

    const normalized = await this.normalizeChangeRequest(payload, type);
    const hash = createHash('sha256')
      .update(stableStringify(payload))
      .digest('hex');

    const previous = await this.findRaw(idpRequestId);
    if (previous) {
      if (previous.bodyHash !== hash) {
        throw idpErrors.duplicateKey(idpRequestId);
      }
      return this.receipt(previous, 'duplicate');
    }

    const now = new Date();
    const entity = this.changeRequestRepo.create({
      idpRequestId,
      bodyHash: hash,
      type,
      facultyId: normalized.facultyId,
      facultyWmsuId: normalized.wmsuId,
      facultyEmployeeId: normalized.employeeId,
      severity,
      requiresAck: payload.requires_ack,
      status: 'pending',
      payload,
      affectedDates: payload.affected_dates ?? null,
      requestedAt,
      receivedAt: now,
      updatedAt: now,
      ackAction: null,
      ackNotes: null,
      acknowledgedBy: null,
      acknowledgedAt: null,
    });

    try {
      const saved = await this.changeRequestRepo.save(entity);
      this.logger.log(
        `Received IDP change request ${idpRequestId} (${type})` +
          (requestId ? ` [request ${requestId}]` : ''),
      );
      return this.receipt(saved, 'pending');
    } catch (err) {
      // A concurrent delivery won the insert race. Same body is a duplicate;
      // a different body is a contract conflict.
      if (isUniqueViolation(err)) {
        const raced = await this.findRaw(idpRequestId);
        if (raced) {
          if (raced.bodyHash !== hash) throw idpErrors.duplicateKey(idpRequestId);
          return this.receipt(raced, 'duplicate');
        }
      }
      throw err;
    }
  }

  // ────────────────────────────────────────────────────────────
  // Review queue
  // ────────────────────────────────────────────────────────────

  async list(
    query: ListChangeRequestsDto = {},
  ): Promise<{ items: IdpChangeRequestView[] }> {
    const where: Record<string, string> = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    const rows = await this.changeRequestRepo.find({
      where,
      order: { requestedAt: 'DESC' },
      take: normalizeListLimit(query.limit),
    });

    return { items: rows.map((row) => this.toView(row)) };
  }

  async findOne(idpRequestId: string): Promise<IdpChangeRequestView> {
    const row = await this.findRaw(idpRequestId);
    if (!row) {
      throw new NotFoundException(
        `Change request '${idpRequestId}' was not found.`,
      );
    }
    return this.toView(row);
  }

  // ────────────────────────────────────────────────────────────
  // Acknowledgement (contract 4.8 / 5.7)
  // ────────────────────────────────────────────────────────────

  async acknowledge(
    idpRequestId: string,
    dto: AckChangeRequestDto,
    userId: string,
  ): Promise<IdpChangeRequestAckResult> {
    const id = requireString(idpRequestId, 'idp_request_id');
    const action = String(dto?.action ?? '').trim() as IdpChangeRequestAckAction;
    if (!ACK_ACTIONS.has(action)) {
      throw idpErrors.validation(
        `action '${action}' must be accepted, rejected, or modified.`,
        { field: 'action', value: action },
      );
    }
    const notes = normalizeKey(dto?.notes);

    const row = await this.findRaw(id);
    if (!row) {
      throw new NotFoundException(`Change request '${id}' was not found.`);
    }

    if (row.acknowledgedAt) {
      // Exactly one ack per idp_request_id. Repeating the same decision is
      // idempotent; changing it is a conflict.
      if (row.ackAction === action && (row.ackNotes ?? null) === notes) {
        return this.duplicateAck(row);
      }
      throw idpErrors.duplicateKey(id);
    }

    const acknowledgedAt = new Date();
    const nextStatus: IdpChangeRequestStatus =
      action === 'rejected' ? 'rejected' : 'acknowledged';

    // Conditional update: only the first decision can win. A concurrent
    // reviewer then reads the stored decision and gets the idempotent answer
    // or a conflict, never a second outbox payload with a different action.
    const update = await this.changeRequestRepo.update(
      { idpRequestId: id, acknowledgedAt: IsNull() },
      {
        ackAction: action,
        ackNotes: notes,
        acknowledgedBy: userId,
        acknowledgedAt,
        status: nextStatus,
        updatedAt: acknowledgedAt,
      },
    );

    if (!update.affected) {
      const current = await this.findRaw(id);
      if (!current) {
        throw new NotFoundException(`Change request '${id}' was not found.`);
      }
      if (
        current.ackAction === action &&
        (current.ackNotes ?? null) === notes
      ) {
        return this.duplicateAck(current);
      }
      throw idpErrors.duplicateKey(id);
    }

    const saved = await this.findRaw(id);
    if (!saved) {
      throw new NotFoundException(`Change request '${id}' was not found.`);
    }

    const payload = this.buildAckPayload(saved);
    const item = await this.outbox.enqueueChangeRequestAck(payload);
    return this.deliverAck(item, payload, saved, false);
  }

  private async duplicateAck(
    row: IdpChangeRequest,
  ): Promise<IdpChangeRequestAckResult> {
    // Make sure a previous partial failure (row saved, outbox write failed)
    // is repaired on retry.
    const payload = this.buildAckPayload(row);
    const item = await this.outbox.enqueueChangeRequestAck(payload);
    return this.deliverAck(item, payload, row, true);
  }

  private async deliverAck(
    item: { outboxId: string; createdAt: Date },
    payload: IdpChangeRequestAckPayload,
    row: IdpChangeRequest,
    duplicate: boolean,
  ): Promise<IdpChangeRequestAckResult> {
    const base = {
      idp_request_id: row.idpRequestId,
      action: row.ackAction as IdpChangeRequestAckAction,
      acknowledged_at: new Date(row.acknowledgedAt as Date).toISOString(),
      duplicate,
      queued: true,
      outbox_id: item.outboxId != null ? String(item.outboxId) : null,
      queued_at: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    };

    // A duplicate request returns the stored decision and does not push again.
    if (duplicate) {
      return {
        ...base,
        attempted: false,
        delivered: false,
        status: null,
        attempts: 0,
        skipped: !this.client.enabled
          ? 'disabled'
          : !this.client.baseUrl
            ? 'not_configured'
            : undefined,
      };
    }

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
      const { status, attempts } = await this.client.pushChangeRequestAck(
        payload.idp_request_id,
        payload,
      );
      this.logger.log(
        `Pushed IDP change-request ack ${payload.idp_request_id} -> ${status} ` +
          `(${attempts} attempt(s))`,
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
        `IDP change-request ack ${payload.idp_request_id} failed after ` +
          `${attempts} attempt(s); item remains queued: ${message}`,
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

  private buildAckPayload(row: IdpChangeRequest): IdpChangeRequestAckPayload {
    return {
      idp_request_id: row.idpRequestId,
      acknowledged_by_coe_nnect_user_id: row.acknowledgedBy as string,
      action: row.ackAction as IdpChangeRequestAckAction,
      notes: row.ackNotes ?? null,
      acknowledged_at: new Date(row.acknowledgedAt as Date).toISOString(),
    };
  }

  // ────────────────────────────────────────────────────────────
  // Validation and lookup
  // ────────────────────────────────────────────────────────────

  private async normalizeChangeRequest(
    payload: IdpChangeRequestPayload,
    type: string,
  ): Promise<NormalizedChangeRequest> {
    const details = payload.details as Record<string, unknown>;
    let wmsuId = normalizeKey(payload.faculty_wmsu_id);
    let employeeId = normalizeKey(payload.faculty_employee_id);

    // faculty_create may carry the new hire's keys inside details.
    if (type === 'faculty_create' && !wmsuId && !employeeId) {
      wmsuId = normalizeKey(details.wmsu_id);
      employeeId = normalizeKey(details.employee_id);
    }

    if (!wmsuId && !employeeId) {
      throw idpErrors.validation(
        'At least one of faculty_wmsu_id or faculty_employee_id is required.',
        { field: 'faculty_wmsu_id' },
      );
    }

    const faculty = await this.resolveFaculty(wmsuId, employeeId);
    if (!faculty && type !== 'faculty_create') {
      throw idpErrors.unknownFaculty({
        wmsu_id: wmsuId,
        employee_id: employeeId,
      });
    }

    await this.validateDetails(type, details);

    return {
      type,
      wmsuId,
      employeeId,
      facultyId: faculty?.facultyId ?? null,
    };
  }

  private async validateDetails(
    type: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    switch (type) {
      case 'faculty_create': {
        requireString(details.first_name, 'details.first_name');
        requireString(details.last_name, 'details.last_name');
        const departmentCode = requireString(
          details.department_code,
          'details.department_code',
        );
        await this.resolveDepartment(departmentCode);
        optionalBoolean(details.is_active, 'details.is_active');
        return;
      }
      case 'faculty_update': {
        if (details.department_code !== undefined && details.department_code !== null) {
          await this.resolveDepartment(
            requireString(details.department_code, 'details.department_code'),
          );
        }
        if (details.classification !== undefined && details.classification !== null) {
          const classification = requireString(
            details.classification,
            'details.classification',
          );
          if (!CLASSIFICATIONS.has(classification)) {
            throw idpErrors.validation(
              `details.classification '${classification}' is not a valid faculty classification.`,
              { field: 'details.classification', value: classification },
            );
          }
        }
        optionalNumber(details.required_hours, 'details.required_hours');
        const designationId = optionalString(
          details.designation_id,
          'details.designation_id',
        );
        if (designationId) {
          const designation = await this.designationRepo.findOne({
            where: { designationId },
            select: ['designationId'],
          });
          if (!designation) throw idpErrors.unknownDesignation(designationId);
        }
        return;
      }
      case 'faculty_deactivate': {
        optionalString(details.reason, 'details.reason');
        return;
      }
      case 'faculty_transfer': {
        const from = requireString(
          details.from_department_code,
          'details.from_department_code',
        );
        const to = requireString(
          details.to_department_code,
          'details.to_department_code',
        );
        if (from === to) {
          throw idpErrors.validation(
            'details.from_department_code and details.to_department_code must differ.',
            { field: 'details.to_department_code', value: to },
          );
        }
        await Promise.all([
          this.resolveDepartment(from),
          this.resolveDepartment(to),
        ]);
        if (details.effective_date !== undefined && details.effective_date !== null) {
          parseDate(details.effective_date, 'details.effective_date');
        }
        return;
      }
      case 'qualification_add':
      case 'qualification_remove': {
        const subjectCode = requireString(
          details.subject_code,
          'details.subject_code',
        );
        await this.resolveSubject(subjectCode);
        return;
      }
      case 'unavailability_change': {
        const termCode = requireString(details.term_code, 'details.term_code');
        await this.resolveTerm(termCode);
        validateDay(details.day_of_week);
        validateWindow(details.start_time, details.end_time);
        optionalString(details.reason, 'details.reason');
        optionalString(details.external_id, 'details.external_id');
        return;
      }
      case 'schedule_override': {
        const termCode = requireString(details.term_code, 'details.term_code');
        await this.resolveTerm(termCode);
        const subjectCode = requireString(
          details.subject_code,
          'details.subject_code',
        );
        await this.resolveSubject(subjectCode);
        if (details.section_code !== undefined && details.section_code !== null) {
          const sectionCode = requireString(
            details.section_code,
            'details.section_code',
          );
          const section = await this.sectionRepo.findOne({
            where: { sectionCode },
            select: ['sectionId', 'sectionCode'],
          });
          if (!section) throw idpErrors.unknownSection(sectionCode);
        }
        validateDay(details.day_of_week);
        validateWindow(details.start_time, details.end_time);
        if (details.load_type !== undefined && details.load_type !== null) {
          const loadType = requireString(details.load_type, 'details.load_type');
          if (!LOAD_TYPES.has(loadType)) {
            throw idpErrors.validation(
              `details.load_type '${loadType}' must be lecture, laboratory, or other.`,
              { field: 'details.load_type', value: loadType },
            );
          }
        }
        optionalString(
          details.coe_nnect_schedule_id,
          'details.coe_nnect_schedule_id',
        );
        return;
      }
      default:
        throw idpErrors.validation(`Unsupported change-request type '${type}'.`, {
          field: 'type',
          value: type,
        });
    }
  }

  private async resolveFaculty(
    wmsuId: string | null,
    employeeId: string | null,
  ): Promise<Faculty | null> {
    const [byWmsu, byEmployee] = await Promise.all([
      wmsuId
        ? this.facultyRepo.findOne({ where: { wmsuId } })
        : Promise.resolve(null),
      employeeId
        ? this.facultyRepo.findOne({ where: { employeeId } })
        : Promise.resolve(null),
    ]);

    if (byWmsu && byEmployee && byWmsu.facultyId !== byEmployee.facultyId) {
      throw idpErrors.facultyKeyConflict(wmsuId, employeeId);
    }
    return byWmsu ?? byEmployee ?? null;
  }

  private async resolveDepartment(code: string): Promise<string> {
    const department = await this.departmentRepo.findOne({
      where: { deptCode: code },
      select: ['deptId', 'deptCode'],
    });
    if (!department) throw idpErrors.unknownDepartment(code);
    return String(department.deptId);
  }

  private async resolveSubject(code: string): Promise<string> {
    const subject = await this.subjectRepo.findOne({
      where: { subjectCode: code },
      select: ['subjectId', 'subjectCode'],
    });
    if (!subject) throw idpErrors.unknownSubject(code);
    return String(subject.subjectId);
  }

  private async resolveTerm(termCode: string): Promise<string> {
    const value = normalizeKey(termCode);
    if (!value) throw idpErrors.unknownTerm(termCode);

    const match = /^(\d{4}-\d{4})-(1st|2nd|summer)$/.exec(value);
    if (!match) throw idpErrors.unknownTerm(value);

    const term = await this.termRepo.findOne({
      where: { schoolYear: match[1], semester: match[2] as any },
    });
    if (!term) throw idpErrors.unknownTerm(value);
    return String(term.termId);
  }

  // ────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────

  private async findRaw(
    idpRequestId: string,
  ): Promise<IdpChangeRequest | null> {
    return this.changeRequestRepo.findOne({
      where: { idpRequestId },
    });
  }

  private receipt(
    row: IdpChangeRequest,
    status: 'pending' | 'duplicate',
  ): IdpChangeRequestReceipt {
    return {
      idp_request_id: row.idpRequestId,
      status,
      requires_ack: row.requiresAck,
      faculty_id: row.facultyId,
    };
  }

  private toView(row: IdpChangeRequest): IdpChangeRequestView {
    const ack: IdpChangeRequestAckView | null = row.acknowledgedAt
      ? {
          action: row.ackAction as IdpChangeRequestAckAction,
          notes: row.ackNotes ?? null,
          acknowledged_by: row.acknowledgedBy ?? null,
          acknowledged_at: new Date(row.acknowledgedAt).toISOString(),
        }
      : null;

    return {
      idp_request_id: row.idpRequestId,
      type: row.type,
      status: row.status as IdpChangeRequestStatus,
      severity: row.severity,
      requires_ack: row.requiresAck,
      faculty_id: row.facultyId,
      faculty_wmsu_id: row.facultyWmsuId,
      faculty_employee_id: row.facultyEmployeeId,
      affected_dates: Array.isArray(row.affectedDates)
        ? row.affectedDates
        : [],
      details: (row.payload?.details ?? {}) as Record<string, unknown>,
      created_at: new Date(row.requestedAt).toISOString(),
      received_at: new Date(row.receivedAt).toISOString(),
      ack,
    };
  }
}

function assertObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw idpErrors.validation('Request body must be a JSON object.');
  }
  return value as Record<string, any>;
}

function requireString(value: unknown, field: string): string {
  const text = normalizeKey(value);
  if (!text) {
    throw idpErrors.validation(`${field} is required.`, { field });
  }
  return text;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw idpErrors.validation(`${field} must be a string.`, { field });
  }
  return normalizeKey(value);
}

function optionalBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') {
    throw idpErrors.validation(`${field} must be a boolean.`, { field });
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw idpErrors.validation(`${field} must be a number.`, { field });
  }
  return parsed;
}

function parseDate(value: unknown, field: string): Date {
  const text = requireString(value, field);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw idpErrors.validation(`${field} must be an ISO 8601 timestamp.`, {
      field,
      value: text,
    });
  }
  return parsed;
}

function validateDay(value: unknown): void {
  const day = requireString(value, 'details.day_of_week');
  if (!DAYS.has(day)) {
    throw idpErrors.validation(
      `details.day_of_week '${day}' is not a valid day.`,
      { field: 'details.day_of_week', value: day },
    );
  }
}

function validateWindow(startValue: unknown, endValue: unknown): void {
  const start = requireString(startValue, 'details.start_time');
  const end = requireString(endValue, 'details.end_time');
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(start) || !/^\d{2}:\d{2}(:\d{2})?$/.test(end)) {
    throw idpErrors.validation(
      'details.start_time and details.end_time must be HH:MM.',
      { field: 'details.start_time', value: start },
    );
  }
  if (start >= end) {
    throw idpErrors.validation(
      'details.end_time must be later than details.start_time.',
      { field: 'details.end_time', value: end },
    );
  }
}

function normalizeListLimit(value: number | undefined): number {
  if (value === undefined || value === null) return DEFAULT_LIST_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIST_LIMIT) {
    throw idpErrors.validation(
      `limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`,
      { field: 'limit', value },
    );
  }
  return parsed;
}

/** Trim strings; treat empty strings as null. */
function normalizeKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Deterministic JSON for idempotency hashing. Two retries that only differ in
 * key order must be treated as the same body.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
