import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FacultyRequest } from '../approvals/entities/faculty-request.entity';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Term } from '../terms/entities/term.entity';
import { IdpOutboxItem } from './entities/idp-outbox.entity';
import { IdpClientService, IdpUpstreamError } from './idp-client.service';
import { IdpOutboxService } from './idp-outbox.service';
import type {
  IdpFacultyRequestPayload,
  IdpFacultyRequestPushResult,
} from './idp.types';

/**
 * Milestone 3 — faculty-request status publisher (contract 4.5 / 5.5).
 *
 * Every create/approve/reject/cancel transition is written to the durable
 * outbox under `coe_nnect_request_id`. The row is refreshed in place so an
 * offline IDP client converges on the current status. When Pattern A is
 * configured, the same payload is also pushed to
 * `POST {IDP_BASE}/faculty-requests`.
 */
@Injectable()
export class IdpFacultyRequestPublisherService {
  private readonly logger = new Logger(IdpFacultyRequestPublisherService.name);

  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Faculty)
    private readonly facultyRepo: Repository<Faculty>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Term)
    private readonly termRepo: Repository<Term>,
    private readonly outbox: IdpOutboxService,
    private readonly client: IdpClientService,
  ) {}

  async buildPayload(
    request: FacultyRequest,
  ): Promise<IdpFacultyRequestPayload> {
    const [requestingDept, targetDept, faculty, subject, term] =
      await Promise.all([
        this.departmentRepo.findOne({
          where: { deptId: String(request.requestingDeptId) },
          select: ['deptId', 'deptCode'],
        }),
        this.departmentRepo.findOne({
          where: { deptId: String(request.targetDeptId) },
          select: ['deptId', 'deptCode'],
        }),
        request.facultyId
          ? this.facultyRepo.findOne({
              where: { facultyId: String(request.facultyId) },
              select: ['facultyId', 'wmsuId'],
            })
          : Promise.resolve(null),
        this.subjectRepo.findOne({
          where: { subjectId: String(request.subjectId) },
          select: ['subjectId', 'subjectCode'],
        }),
        this.termRepo.findOne({
          where: { termId: String(request.termId) },
          select: ['termId', 'schoolYear', 'semester'],
        }),
      ]);

    if (!requestingDept || !targetDept) {
      throw new Error(
        `Faculty request ${request.requestId} references a department that does not exist.`,
      );
    }
    if (!subject) {
      throw new Error(
        `Faculty request ${request.requestId} references a subject that does not exist.`,
      );
    }
    if (!term || !term.semester) {
      throw new Error(
        `Faculty request ${request.requestId} references a term without a semester.`,
      );
    }

    return {
      coe_nnect_request_id: String(request.requestId),
      requesting_dept: requestingDept.deptCode,
      target_dept: targetDept.deptCode,
      faculty_wmsu_id: faculty?.wmsuId ?? null,
      subject_code: subject.subjectCode,
      term_code: `${term.schoolYear}-${term.semester}`,
      status: request.status,
      reason: request.reason,
      created_at: new Date(request.createdAt).toISOString(),
    };
  }

  /** Write the latest status to the durable outbox (fast, local DB write). */
  async queue(
    request: FacultyRequest,
  ): Promise<{ item: IdpOutboxItem; payload: IdpFacultyRequestPayload }> {
    const payload = await this.buildPayload(request);
    const item = await this.outbox.enqueueFacultyRequest(payload);
    return { item, payload };
  }

  /** Queue and, when Pattern A is configured, push immediately. */
  async publish(request: FacultyRequest): Promise<IdpFacultyRequestPushResult> {
    const { item, payload } = await this.queue(request);
    return this.deliverQueued(item, payload);
  }

  /**
   * Deliver an already-queued item. A push failure is reported, not thrown:
   * the local request transition already happened and the outbox row survives
   * for the next poll or replay.
   */
  async deliverQueued(
    item: IdpOutboxItem,
    payload: IdpFacultyRequestPayload,
  ): Promise<IdpFacultyRequestPushResult> {
    const base = {
      requestId: payload.coe_nnect_request_id,
      status: payload.status,
      queued: true,
      outboxId: item.outboxId != null ? String(item.outboxId) : null,
      queuedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    };

    if (!this.client.enabled || !this.client.baseUrl) {
      return {
        ...base,
        attempted: false,
        delivered: false,
        statusCode: null,
        attempts: 0,
        skipped: !this.client.enabled ? 'disabled' : 'not_configured',
      };
    }

    try {
      const { status, attempts } = await this.client.pushFacultyRequest(payload);
      this.logger.log(
        `Pushed IDP faculty request ${payload.coe_nnect_request_id} ` +
          `(${payload.status}) -> ${status} (${attempts} attempt(s))`,
      );
      return {
        ...base,
        attempted: true,
        delivered: true,
        statusCode: status,
        attempts,
      };
    } catch (err) {
      const statusCode = err instanceof IdpUpstreamError ? err.status : null;
      const attempts = err instanceof IdpUpstreamError ? err.attempts : 1;
      const message = err instanceof Error ? err.message : 'IDP push failed.';
      this.logger.error(
        `IDP faculty request ${payload.coe_nnect_request_id} push failed ` +
          `after ${attempts} attempt(s); item remains queued: ${message}`,
      );
      return {
        ...base,
        attempted: true,
        delivered: false,
        statusCode,
        attempts,
        error: message,
      };
    }
  }
}
