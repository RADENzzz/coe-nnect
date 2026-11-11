import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { FacultyQualification } from '../faculty/entities/faculty-qualification.entity';
import { FacultyUnavailability } from '../faculty/entities/faculty-unavailability.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Term } from '../terms/entities/term.entity';
import { IdpProcessedEvent } from './entities/idp-processed-event.entity';
import { IdpClientService, IdpUpstreamError } from './idp-client.service';
import { IdpError, idpErrors } from './idp.errors';
import { isUniqueViolation } from './idp-persistence.util';
import type {
  IdpFacultyChangeEvent,
  IdpFacultyInboxBody,
  IdpFacultyInboxSummary,
  IdpFacultyQualification,
  IdpFacultyRecord,
  IdpFacultySyncSummary,
  IdpFacultyUnavailability,
  IdpHealthStatus,
  IdpSyncError,
} from './idp.types';

const DAYS = new Set([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]);

const EVENT_KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // contract 7.4: 30 days

type RosterCounters = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  errors: IdpSyncError[];
};

/**
 * Milestone 1 — faculty roster, qualifications, and unavailability sync.
 *
 * All writes bypass FacultyService on purpose: the sync must set
 * `sync_status`/`last_synced_at` directly and must not be treated as a local
 * edit. Local edits are marked pending in FacultyService and block incoming
 * IDP updates that target an already-synced row.
 */
@Injectable()
export class IdpSyncService {
  private readonly logger = new Logger(IdpSyncService.name);

  constructor(
    @InjectRepository(Faculty)
    private readonly facultyRepo: Repository<Faculty>,
    @InjectRepository(FacultyQualification)
    private readonly qualRepo: Repository<FacultyQualification>,
    @InjectRepository(FacultyUnavailability)
    private readonly unavailabilityRepo: Repository<FacultyUnavailability>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Term)
    private readonly termRepo: Repository<Term>,
    @InjectRepository(IdpProcessedEvent)
    private readonly processedEventRepo: Repository<IdpProcessedEvent>,
    private readonly client: IdpClientService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // Health
  // ────────────────────────────────────────────────────────────

  async health(): Promise<IdpHealthStatus> {
    const latest = await this.facultyRepo
      .createQueryBuilder('f')
      .select('MAX(f.last_synced_at)', 'lastSyncedAt')
      .getRawOne<{ lastSyncedAt: Date | string | null }>();

    const lastSyncAt = latest?.lastSyncedAt
      ? new Date(latest.lastSyncedAt).toISOString()
      : null;

    const enabled = this.client.enabled;
    const configured = {
      baseUrl: this.client.baseUrl.length > 0,
      apiKey: this.client.hasApiKey,
      webhookSecret: this.client.hasWebhookSecret,
      deviceApiKey: this.client.hasDeviceApiKey,
    };
    const inboundReady = configured.deviceApiKey && configured.webhookSecret;
    const outboundReady = enabled && configured.baseUrl;
    const anyConfigured =
      enabled ||
      configured.baseUrl ||
      configured.apiKey ||
      configured.webhookSecret ||
      configured.deviceApiKey;

    return {
      status:
        inboundReady || outboundReady
          ? 'ok'
          : anyConfigured
            ? 'degraded'
            : 'disabled',
      service: 'coe-nnect-idp-integration',
      enabled,
      configured,
      inboundReady,
      outboundReady,
      lastSyncAt,
      timestamp: new Date().toISOString(),
    };
  }

  // ────────────────────────────────────────────────────────────
  // Faculty roster sync (contract 5.1)
  // ────────────────────────────────────────────────────────────

  /**
   * Enforce department scoping for the "Refresh from IDP" action.
   *
   * Deans and the college secretary may refresh the whole college or one
   * department. A department head is always pinned to their own department.
   */
  async resolveDepartmentScope(
    profile: { role?: string; deptId?: string | number | null } | undefined,
    requestedCode?: string,
  ): Promise<string | undefined> {
    const requested = requestedCode?.trim() || undefined;
    if (profile?.role !== 'department_head') return requested;

    if (!profile.deptId) {
      throw new ForbiddenException(
        'Your account is not assigned to a department.',
      );
    }
    const dept = await this.departmentRepo.findOne({
      where: { deptId: String(profile.deptId) },
      select: ['deptId', 'deptCode'],
    });
    if (!dept) {
      throw new ForbiddenException(
        'Your department could not be resolved. Contact the college dean.',
      );
    }
    if (requested && requested !== dept.deptCode) {
      throw new ForbiddenException(
        'Department heads can only refresh faculty in their own department.',
      );
    }
    return dept.deptCode;
  }

  async syncFaculty(options: {
    departmentCode?: string;
    termCode?: string;
    includeQualifications?: boolean;
    includeUnavailability?: boolean;
    updatedSince?: string;
  }): Promise<IdpFacultySyncSummary> {
    this.assertEnabled();

    const startedAt = new Date();
    const summary: IdpFacultySyncSummary = {
      fetched: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
      qualificationsAdded: 0,
      unavailabilitySynced: 0,
      errors: [],
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
    };

    const departmentMap = await this.loadDepartmentMap();
    const requestedCode = options.departmentCode?.trim() || undefined;
    if (requestedCode && !departmentMap.has(requestedCode)) {
      throw idpErrors.unknownDepartment(requestedCode);
    }

    // Resolve the term once so an invalid term fails fast (422) instead of
    // mid-way through the loop.
    const termId = options.termCode
      ? await this.resolveTermId(options.termCode)
      : null;

    const updatedSince =
      options.updatedSince ?? (await this.latestSyncedAtIso());

    let records: IdpFacultyRecord[];
    try {
      records = await this.client.listFaculty({
        departmentCode: requestedCode,
        updatedSince,
      });
    } catch (err) {
      throw this.toUpstreamException(err);
    }

    summary.fetched = records.length;

    const eligible = await this.applyRoster(records, departmentMap, summary);

    // Qualifications (contract 5.2) and unavailability (5.3) are per-faculty
    // IDP calls. Sync them for every eligible faculty; a failure in one
    // faculty must not abort the roster.
    const withQualifications = options.includeQualifications !== false;
    if (withQualifications) {
      const subjectMap = await this.loadSubjectMap();
      for (const faculty of eligible) {
        summary.qualificationsAdded += await this.syncQualifications(
          faculty,
          subjectMap,
          summary,
        );
      }
    }

    if (options.includeUnavailability && termId !== null) {
      for (const faculty of eligible) {
        summary.unavailabilitySynced += await this.syncUnavailability(
          faculty,
          options.termCode as string,
          termId,
          summary,
        );
      }
    }

    summary.finishedAt = new Date().toISOString();
    this.logger.log(
      `IDP faculty sync: fetched=${summary.fetched} created=${summary.created} ` +
        `updated=${summary.updated} unchanged=${summary.unchanged} ` +
        `skipped=${summary.skipped} failed=${summary.failed}`,
    );

    return summary;
  }

  /**
   * Pattern C — the IDP desktop app pushes its faculty snapshot when online.
   *
   * The body is either a bare array of Faculty Record (contract 4.1) or an
   * envelope `{ "faculty": [...] }`. Each record is applied with the same
   * matching, ownership, and `local_edit_pending` rules as the Pattern A pull.
   * A bad record is reported in `errors[]` without aborting the snapshot.
   */
  async applyFacultySnapshot(
    body: unknown,
    requestId?: string,
  ): Promise<IdpFacultyInboxSummary> {
    const records = normalizeInboxRecords(body);
    const startedAt = new Date();
    const summary: IdpFacultyInboxSummary = {
      received: records.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
    };

    const departmentMap = await this.loadDepartmentMap();
    await this.applyRoster(records, departmentMap, summary);

    summary.finishedAt = new Date().toISOString();
    this.logger.log(
      `IDP faculty inbox: received=${summary.received} created=${summary.created} ` +
        `updated=${summary.updated} unchanged=${summary.unchanged} ` +
        `skipped=${summary.skipped} failed=${summary.failed}` +
        (requestId ? ` [request ${requestId}]` : ''),
    );

    return summary;
  }

  private async applyRoster(
    records: IdpFacultyRecord[],
    departmentMap: Map<string, string>,
    summary: RosterCounters,
  ): Promise<Faculty[]> {
    const eligible: Faculty[] = [];

    for (const record of records) {
      const keys = {
        wmsu_id: normalizeKey(record?.wmsu_id),
        employee_id: normalizeKey(record?.employee_id),
      };

      try {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          throw idpErrors.validation(
            'Each faculty record must be a JSON object.',
          );
        }

        const result = await this.applyFacultyRecord(record, departmentMap);
        summary[result.outcome] += 1;
        eligible.push(result.faculty);
      } catch (err) {
        const error = this.toSyncError(err, keys);
        if (err instanceof IdpError && err.getStatus() === 409) {
          summary.skipped += 1;
        } else {
          summary.failed += 1;
        }
        summary.errors.push(error);
        this.logger.warn(
          `IDP apply skipped ${keys.wmsu_id ?? keys.employee_id ?? '<unknown>'}: ${error.code} ${error.message}`,
        );
      }
    }

    return eligible;
  }

  private async applyFacultyRecord(
    record: IdpFacultyRecord,
    departmentMap: Map<string, string>,
  ): Promise<{
    outcome: 'created' | 'updated' | 'unchanged';
    faculty: Faculty;
  }> {
    const wmsuId = normalizeKey(record.wmsu_id);
    const employeeId = normalizeKey(record.employee_id);

    if (!wmsuId && !employeeId) {
      throw idpErrors.validation(
        'At least one of wmsu_id or employee_id is required.',
        { field: 'wmsu_id' },
      );
    }
    if (!record.first_name?.trim() || !record.last_name?.trim()) {
      throw idpErrors.validation('first_name and last_name are required.');
    }
    const departmentCode = normalizeKey(record.department_code);
    if (!departmentCode) {
      throw idpErrors.validation('department_code is required.', {
        field: 'department_code',
      });
    }
    if (typeof record.is_active !== 'boolean') {
      throw idpErrors.validation('is_active must be a boolean.', {
        field: 'is_active',
      });
    }

    const deptId = departmentMap.get(departmentCode);
    if (!deptId) throw idpErrors.unknownDepartment(departmentCode);

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

    const existing = byWmsu ?? byEmployee;

    if (!existing) {
      const entity = this.facultyRepo.create({
        wmsuId,
        employeeId,
        firstName: record.first_name.trim(),
        lastName: record.last_name.trim(),
        email: normalizeKey(record.email),
        contact: normalizeKey(record.contact),
        deptId,
        // CoE-NNECT-owned fields keep their local defaults on creation.
        classification: 'regular',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        isActive: record.is_active,
      });
      return {
        outcome: 'created',
        faculty: await this.facultyRepo.save(entity),
      };
    }

    this.assertNotLocallyPending(existing);

    const patch: Partial<Faculty> = {};
    if (record.first_name.trim() !== existing.firstName) {
      patch.firstName = record.first_name.trim();
    }
    if (record.last_name.trim() !== existing.lastName) {
      patch.lastName = record.last_name.trim();
    }
    const email = normalizeKey(record.email);
    if (email !== existing.email) patch.email = email;
    const contact = normalizeKey(record.contact);
    if (contact !== existing.contact) patch.contact = contact;
    if (wmsuId && wmsuId !== existing.wmsuId) patch.wmsuId = wmsuId;
    if (employeeId && employeeId !== existing.employeeId) {
      patch.employeeId = employeeId;
    }
    if (String(existing.deptId ?? '') !== String(deptId)) {
      patch.deptId = deptId;
    }
    if (record.is_active !== existing.isActive) {
      patch.isActive = record.is_active;
    }

    if (Object.keys(patch).length === 0 && existing.syncStatus === 'synced') {
      return { outcome: 'unchanged', faculty: existing };
    }

    Object.assign(existing, patch, {
      syncStatus: 'synced',
      lastSyncedAt: new Date(),
    });
    return {
      outcome: 'updated',
      faculty: await this.facultyRepo.save(existing),
    };
  }

  // ────────────────────────────────────────────────────────────
  // Qualifications (contract 5.2)
  // ────────────────────────────────────────────────────────────

  private async syncQualifications(
    faculty: Faculty,
    subjectMap: Map<string, string>,
    summary: IdpFacultySyncSummary,
  ): Promise<number> {
    const key = faculty.wmsuId ?? faculty.employeeId;
    if (!key) return 0;

    let rows: IdpFacultyQualification[];
    try {
      rows = await this.client.listQualifications(key);
    } catch (err) {
      // A 404 means IDP does not track qualifications for this faculty.
      if (err instanceof IdpUpstreamError && err.status === 404) return 0;
      summary.errors.push({
        code: err instanceof IdpUpstreamError ? err.code : 'internal_error',
        message:
          err instanceof Error ? err.message : 'Qualification pull failed.',
        wmsu_id: faculty.wmsuId,
        employee_id: faculty.employeeId,
      });
      return 0;
    }

    let added = 0;
    for (const row of rows) {
      const subjectCode = normalizeKey(row.subject_code);
      if (!subjectCode) continue;
      const subjectId = subjectMap.get(subjectCode);
      if (!subjectId) {
        summary.errors.push({
          code: 'unknown_subject',
          message: `Subject code '${subjectCode}' is not configured in CoE-NNECT.`,
          wmsu_id: faculty.wmsuId,
          employee_id: faculty.employeeId,
          subject_code: subjectCode,
        });
        continue;
      }

      const existing = await this.qualRepo.findOne({
        where: { facultyId: faculty.facultyId, subjectId },
      });
      if (existing) {
        // The pair already exists. Keep it as-is: if it was a local row
        // (source_system NULL), IDP must not take ownership of it.
        continue;
      }

      await this.qualRepo.save(
        this.qualRepo.create({
          facultyId: faculty.facultyId,
          subjectId,
          sourceSystem: 'IDP',
        }),
      );
      added += 1;
    }

    return added;
  }

  // ────────────────────────────────────────────────────────────
  // Unavailability (contract 5.3)
  // ────────────────────────────────────────────────────────────

  private async syncUnavailability(
    faculty: Faculty,
    termCode: string,
    termId: string,
    summary: IdpFacultySyncSummary,
  ): Promise<number> {
    const key = faculty.wmsuId ?? faculty.employeeId;
    if (!key) return 0;

    let rows: IdpFacultyUnavailability[];
    try {
      rows = await this.client.listUnavailability(key, termCode);
    } catch (err) {
      if (err instanceof IdpUpstreamError && err.status === 404) return 0;
      summary.errors.push({
        code: err instanceof IdpUpstreamError ? err.code : 'internal_error',
        message:
          err instanceof Error ? err.message : 'Unavailability pull failed.',
        wmsu_id: faculty.wmsuId,
        employee_id: faculty.employeeId,
      });
      return 0;
    }

    // Full replace of IDP-owned rows for this faculty/term. Local rows stay.
    await this.unavailabilityRepo.delete({
      facultyId: faculty.facultyId,
      termId,
      source: 'idp',
    });

    const syncedAt = new Date();
    let saved = 0;
    for (const row of rows) {
      try {
        const day = normalizeKey(row.day_of_week);
        if (!day || !DAYS.has(day)) {
          throw idpErrors.validation(
            `day_of_week '${String(row.day_of_week)}' is not a valid day.`,
            { field: 'day_of_week', value: row.day_of_week },
          );
        }
        const start = normalizeTime(row.start_time);
        const end = normalizeTime(row.end_time);
        if (!start || !end || start >= end) {
          throw idpErrors.validation(
            'start_time and end_time must be HH:MM with end_time later than start_time.',
            { field: 'end_time', value: row.end_time },
          );
        }

        const term = row.term_code
          ? await this.resolveTermId(row.term_code)
          : termId;

        await this.unavailabilityRepo.save(
          this.unavailabilityRepo.create({
            facultyId: faculty.facultyId,
            termId: term,
            dayOfWeek: day,
            startTime: start,
            endTime: end,
            reason: normalizeKey(row.reason),
            source: 'idp',
            externalId: normalizeKey(row.external_id),
            syncedAt,
          }),
        );
        saved += 1;
      } catch (err) {
        summary.errors.push({
          code:
            err instanceof IdpError
              ? ((err.getResponse() as any)?.error?.code ?? 'validation_error')
              : 'validation_error',
          message:
            err instanceof Error ? err.message : 'Invalid unavailability row.',
          wmsu_id: faculty.wmsuId,
          employee_id: faculty.employeeId,
          external_id: row.external_id ?? null,
        });
      }
    }

    return saved;
  }

  // ────────────────────────────────────────────────────────────
  // Webhook: faculty change event (contract 4.6 / 5.6)
  // ────────────────────────────────────────────────────────────

  async handleFacultyChange(
    event: IdpFacultyChangeEvent,
    requestId?: string,
  ): Promise<{ event_id: string; status: string; faculty_id: string | null }> {
    this.validateChangeEvent(event);

    const eventId = normalizeKey(event.event_id) as string;
    const hash = createHash('sha256')
      .update(JSON.stringify(event))
      .digest('hex');
    const previous = await this.findProcessedEvent(eventId);
    if (previous) {
      if (previous.bodyHash !== hash) throw idpErrors.duplicateKey(eventId);
      return {
        event_id: eventId,
        status: 'duplicate',
        faculty_id: previous.facultyId,
      };
    }

    const faculty = await this.applyChangeEvent(event);

    try {
      await this.processedEventRepo.save(
        this.processedEventRepo.create({
          eventId,
          bodyHash: hash,
          eventType: event.event,
          facultyId: faculty.facultyId,
          processedAt: new Date(),
        }),
      );
    } catch (err) {
      // A concurrent delivery of the same event won the insert race. If it
      // carried a different body, this request is a conflict; otherwise the
      // event is already applied and the caller can retry safely.
      if (isUniqueViolation(err)) {
        const raced = await this.findProcessedEvent(eventId);
        if (raced && raced.bodyHash !== hash) {
          throw idpErrors.duplicateKey(eventId);
        }
        return {
          event_id: eventId,
          status: 'duplicate',
          faculty_id: raced?.facultyId ?? faculty.facultyId,
        };
      }
      throw err;
    }

    this.logger.log(
      `Applied IDP webhook ${eventId} (${event.event}) to faculty ${faculty.facultyId}` +
        (requestId ? ` [request ${requestId}]` : ''),
    );

    return {
      event_id: eventId,
      status: 'applied',
      faculty_id: faculty.facultyId,
    };
  }

  private async applyChangeEvent(
    event: IdpFacultyChangeEvent,
  ): Promise<Faculty> {
    const wmsuId = normalizeKey(event.faculty_wmsu_id);
    const employeeId = normalizeKey(event.faculty_employee_id);
    const summary = event.change_summary ?? {};

    const deptCode = normalizeKey(summary.department_code);
    const departmentMap = deptCode ? await this.loadDepartmentMap() : null;
    const deptId =
      deptCode && departmentMap ? departmentMap.get(deptCode) : undefined;
    if (deptCode && !deptId) throw idpErrors.unknownDepartment(deptCode);

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

    const existing = byWmsu ?? byEmployee;

    if (!existing) {
      if (event.event !== 'faculty.created') {
        throw idpErrors.unknownFaculty({
          wmsu_id: wmsuId,
          employee_id: employeeId,
        });
      }
      if (!summary.first_name?.trim() || !summary.last_name?.trim()) {
        throw idpErrors.validation(
          'faculty.created requires first_name and last_name.',
        );
      }
      if (!deptId) {
        throw idpErrors.validation(
          'faculty.created requires a valid department_code.',
          { field: 'department_code' },
        );
      }

      const created = this.facultyRepo.create({
        wmsuId,
        employeeId,
        firstName: summary.first_name.trim(),
        lastName: summary.last_name.trim(),
        email: normalizeKey(summary.email),
        contact: normalizeKey(summary.contact),
        deptId,
        classification: 'regular',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        isActive: summary.is_active ?? true,
      });
      return this.facultyRepo.save(created);
    }

    this.assertNotLocallyPending(existing);

    if (summary.first_name !== undefined && summary.first_name !== null) {
      existing.firstName = summary.first_name.trim();
    }
    if (summary.last_name !== undefined && summary.last_name !== null) {
      existing.lastName = summary.last_name.trim();
    }
    if (summary.email !== undefined) {
      existing.email = normalizeKey(summary.email);
    }
    if (summary.contact !== undefined) {
      existing.contact = normalizeKey(summary.contact);
    }
    if (deptId) existing.deptId = deptId;
    if (summary.is_active !== undefined && summary.is_active !== null) {
      existing.isActive = summary.is_active;
    }
    if (event.event === 'faculty.deactivated') {
      existing.isActive = false;
    }
    if (wmsuId) existing.wmsuId = wmsuId;
    if (employeeId) existing.employeeId = employeeId;

    existing.syncStatus = 'synced';
    existing.lastSyncedAt = new Date();
    return this.facultyRepo.save(existing);
  }

  private validateChangeEvent(event: IdpFacultyChangeEvent): void {
    if (!event || typeof event !== 'object') {
      throw idpErrors.validation('Request body must be a JSON object.');
    }
    if (!normalizeKey(event.event_id)) {
      throw idpErrors.validation('event_id is required.', {
        field: 'event_id',
      });
    }
    if (!normalizeKey(event.event)) {
      throw idpErrors.validation('event is required.', { field: 'event' });
    }
    if (
      !normalizeKey(event.faculty_wmsu_id) &&
      !normalizeKey(event.faculty_employee_id)
    ) {
      throw idpErrors.validation(
        'At least one of faculty_wmsu_id or faculty_employee_id is required.',
      );
    }
    if (!event.change_summary || typeof event.change_summary !== 'object') {
      throw idpErrors.validation('change_summary is required.', {
        field: 'change_summary',
      });
    }
    if (!normalizeKey(event.changed_at)) {
      throw idpErrors.validation('changed_at is required.', {
        field: 'changed_at',
      });
    }
  }

  // ────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────

  private assertEnabled(): void {
    if (!this.client.enabled) {
      throw new ServiceUnavailableException(
        'IDP integration is disabled. Set IDP_ENABLED=true to enable it.',
      );
    }
    if (!this.client.baseUrl) {
      throw new ServiceUnavailableException(
        'IDP integration is not configured. Set IDP_BASE_URL first.',
      );
    }
  }

  /**
   * Contract 3.3 — a local edit to an IDP-owned field blocks incoming IDP
   * updates with 409. Rows that have never been synced (`last_synced_at`
   * null) are allowed through so the first roster pull can adopt them.
   */
  private assertNotLocallyPending(faculty: Faculty): void {
    if (faculty.syncStatus === 'pending' && faculty.lastSyncedAt !== null) {
      throw idpErrors.localEditPending(faculty.facultyId);
    }
  }

  private async loadDepartmentMap(): Promise<Map<string, string>> {
    const rows = await this.departmentRepo.find({
      select: ['deptId', 'deptCode'],
    });
    return new Map(rows.map((row) => [row.deptCode, String(row.deptId)]));
  }

  private async loadSubjectMap(): Promise<Map<string, string>> {
    const rows = await this.subjectRepo.find({
      select: ['subjectId', 'subjectCode'],
    });
    return new Map(rows.map((row) => [row.subjectCode, String(row.subjectId)]));
  }

  private async resolveTermId(termCode: string): Promise<string> {
    const value = normalizeKey(termCode);
    if (!value) throw idpErrors.unknownTerm(termCode);

    // term_code = school_year + "-" + semester
    const match = /^(\d{4}-\d{4})-(1st|2nd|summer)$/.exec(value);
    if (!match) throw idpErrors.unknownTerm(value);

    const term = await this.termRepo.findOne({
      where: { schoolYear: match[1], semester: match[2] as any },
    });
    if (!term) throw idpErrors.unknownTerm(value);
    return String(term.termId);
  }

  private async latestSyncedAtIso(): Promise<string | undefined> {
    const row = await this.facultyRepo
      .createQueryBuilder('f')
      .select('MAX(f.last_synced_at)', 'lastSyncedAt')
      .getRawOne<{ lastSyncedAt: Date | string | null }>();
    if (!row?.lastSyncedAt) return undefined;
    return new Date(row.lastSyncedAt).toISOString();
  }

  private async findProcessedEvent(
    eventId: string,
  ): Promise<IdpProcessedEvent | null> {
    return this.processedEventRepo.findOne({ where: { eventId } });
  }

  /**
   * Contract 7.4: idempotency keys are kept for at least 30 days. The
   * processed-event table is append-only until this nightly sweep.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupProcessedEvents(
    now: Date = new Date(),
  ): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - EVENT_KEY_TTL_MS);
    try {
      const result = await this.processedEventRepo.delete({
        processedAt: LessThan(cutoff),
      });
      const deleted = result.affected ?? 0;
      if (deleted > 0) {
        this.logger.log(
          `IDP idempotency sweep: deleted ${deleted} processed event(s) older than 30 days.`,
        );
      }
      return { deleted };
    } catch (err) {
      this.logger.error(
        `IDP idempotency sweep failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      return { deleted: 0 };
    }
  }

  private toSyncError(
    err: unknown,
    keys: { wmsu_id: string | null; employee_id: string | null },
  ): IdpSyncError {
    if (err instanceof IdpError) {
      const body = err.getResponse() as any;
      return {
        code: body?.error?.code ?? 'internal_error',
        message: body?.error?.message ?? err.message,
        ...keys,
      };
    }
    if (err instanceof IdpUpstreamError) {
      return { code: err.code, message: err.message, ...keys };
    }
    return {
      code: 'internal_error',
      message: err instanceof Error ? err.message : 'Unexpected sync error.',
      ...keys,
    };
  }

  private toUpstreamException(err: unknown): Error {
    if (err instanceof IdpUpstreamError) {
      return new ServiceUnavailableException(
        `IDP faculty pull failed (${err.status}): ${err.message}`,
      );
    }
    return err instanceof Error
      ? err
      : new ServiceUnavailableException('IDP faculty pull failed.');
  }
}

/** Accept the contract's bare array plus a `{ "faculty": [...] }` envelope. */
function normalizeInboxRecords(body: unknown): IdpFacultyRecord[] {
  if (Array.isArray(body)) return body as IdpFacultyRecord[];
  if (body && typeof body === 'object') {
    const faculty = (body as { faculty?: unknown }).faculty;
    if (Array.isArray(faculty)) return faculty as IdpFacultyRecord[];
  }
  throw idpErrors.validation(
    'Request body must be an array of faculty records or { "faculty": [...] }.',
  );
}

/** Trim strings; treat empty strings as null. */
function normalizeKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/** 'HH:MM' -> 'HH:MM:00'; leaves already-normalized values intact. */
function normalizeTime(value: unknown): string | null {
  const text = normalizeKey(value);
  if (!text) return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(text)) return null;
  return text.length === 5 ? `${text}:00` : text;
}
