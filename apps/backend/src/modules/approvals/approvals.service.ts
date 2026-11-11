import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FacultyRequest } from './entities/faculty-request.entity';
import { CreateFacultyRequestDto } from './dto/create-faculty-request.dto';
import { RespondFacultyRequestDto } from './dto/respond-faculty-request.dto';
import { User } from '../users/entities/user.entity';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { RecipientsService } from '../notifications/recipients.service';
import { loadRequestContext } from '../notifications/notification-context';
import { SupabaseService } from '../../database/supabase.service';
import { IdpFacultyRequestPublisherService } from '../idp/idp-faculty-request-publisher.service';

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    @InjectRepository(FacultyRequest)
    private readonly repo: Repository<FacultyRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
    private readonly supabase: SupabaseService,
    @Optional()
    private readonly idpFacultyRequests?: IdpFacultyRequestPublisherService,
  ) {}

  async findAllForCurrentUser(userId: string): Promise<FacultyRequest[]> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new ForbiddenException('User profile not found');

    if (user.role === 'administrator' || user.role === 'college_dean') {
      return this.repo.find({ order: { createdAt: 'DESC' } });
    }
    if (user.role === 'department_head' && user.deptId) {
      return this.repo
        .createQueryBuilder('r')
        .where(
          'r.requesting_dept_id = :dept OR r.target_dept_id = :dept',
          { dept: user.deptId },
        )
        .orderBy('r.created_at', 'DESC')
        .getMany();
    }
    return [];
  }

  async findOne(id: string): Promise<FacultyRequest> {
    const found = await this.repo.findOne({ where: { requestId: id } });
    if (!found) throw new NotFoundException('Request not found');
    return found;
  }

  async create(
    dto: CreateFacultyRequestDto,
    userId: string,
  ): Promise<FacultyRequest> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new ForbiddenException('User profile not found');
    if (!user.deptId) {
      throw new BadRequestException(
        'You must belong to a department to make a request',
      );
    }
    if (user.deptId === dto.targetDeptId) {
      throw new BadRequestException(
        'Target department must be different from yours',
      );
    }

    const entity = this.repo.create({
      requestingDeptId: user.deptId,
      targetDeptId: dto.targetDeptId,
      facultyId: dto.facultyId ?? null,
      subjectId: dto.subjectId,
      termId: dto.termId,
      reason: dto.reason,
      status: 'pending',
      createdBy: userId,
    });
    const saved = await this.repo.save(entity);
    await this.publishIdpStatus(saved);

    // ═══ Notification: request submitted ═══
    const targetDHs = await this.recipients.departmentHeadsOf(
      String(saved.targetDeptId),
    );
    const dean = await this.recipients.collegeDean();
    const requesterName =
      (user as any).firstName ??
      (user as any).username ??
      (user as any).email ??
      'A department head';

    const ctx = await loadRequestContext(this.supabase.getAdminClient(), {
      requestingDeptId: saved.requestingDeptId,
      targetDeptId: saved.targetDeptId,
      subjectId: saved.subjectId,
      termId: saved.termId,
    });
    const subjectLabel = ctx.subjectCode ?? 'a subject';

    await this.dispatcher.dispatch('request.submitted', {
      recipientUserIds: this.recipients.uniq([...targetDHs, ...dean]),
      title: `Cross-dept request: ${ctx.subjectCode ?? 'faculty'}`,
      body:
        `${requesterName} (${ctx.requestingDeptCode ?? 'requesting dept'}) ` +
        `requested faculty from ${ctx.targetDeptCode ?? 'your department'} ` +
        `for ${subjectLabel}` +
        (ctx.termName ? ` (${ctx.termName})` : '') +
        '.',
      entityType: 'faculty_request',
      entityId: String(saved.requestId),
      payload: {
        requestingDeptId: String(saved.requestingDeptId),
        targetDeptId: String(saved.targetDeptId),
        requestingDeptCode: ctx.requestingDeptCode,
        targetDeptCode: ctx.targetDeptCode,
        requestingDeptName: ctx.requestingDeptName,
        targetDeptName: ctx.targetDeptName,
        subjectId: String(saved.subjectId),
        subjectCode: ctx.subjectCode,
        subjectTitle: ctx.subjectTitle,
        termId: String(saved.termId),
        termName: ctx.termName,
        facultyId: saved.facultyId ?? null,
        reason: saved.reason,
        requestedByName: requesterName,
      },
    });

    return saved;
  }

  async approve(
    id: string,
    dto: RespondFacultyRequestDto,
    userId: string,
  ): Promise<FacultyRequest> {
    return this.respond(id, userId, 'approved', dto.remarks);
  }

  async reject(
    id: string,
    dto: RespondFacultyRequestDto,
    userId: string,
  ): Promise<FacultyRequest> {
    return this.respond(id, userId, 'rejected', dto.remarks);
  }

  async cancel(id: string, userId: string): Promise<FacultyRequest> {
    const found = await this.findOne(id);
    if (found.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new ForbiddenException();

    if (
      user.role !== 'administrator' &&
      user.role !== 'college_dean' &&
      user.deptId !== found.requestingDeptId
    ) {
      throw new ForbiddenException('You cannot cancel this request');
    }

    found.status = 'cancelled';
    found.respondedBy = userId;
    found.respondedAt = new Date();
    const saved = await this.repo.save(found);
    await this.publishIdpStatus(saved);

    // ── F1b: also unblock any gated schedule rows ──
    await this.resolvePendingScheduleRows(String(saved.requestId));

    // ═══ Notification: request cancelled ═══
    const targetDHs = await this.recipients.departmentHeadsOf(
      String(saved.targetDeptId),
    );
    const dean = await this.recipients.collegeDean();
    const cancellerName =
      (user as any).firstName ??
      (user as any).username ??
      (user as any).email ??
      'A department head';

    const ctx = await loadRequestContext(this.supabase.getAdminClient(), {
      requestingDeptId: saved.requestingDeptId,
      targetDeptId: saved.targetDeptId,
      subjectId: saved.subjectId,
      termId: saved.termId,
    });
    const subjectLabel = ctx.subjectCode ?? 'a subject';

    await this.dispatcher.dispatch('request.cancelled', {
      recipientUserIds: this.recipients.uniq([...targetDHs, ...dean]),
      title: `Cross-dept request cancelled: ${ctx.subjectCode ?? 'request'}`,
      body:
        `${cancellerName} cancelled the request for ${subjectLabel}` +
        (ctx.termName ? ` (${ctx.termName})` : '') +
        ` · ${ctx.requestingDeptCode ?? 'requesting dept'} → ` +
        `${ctx.targetDeptCode ?? 'target dept'}.`,
      entityType: 'faculty_request',
      entityId: String(saved.requestId),
      payload: {
        requestingDeptId: String(saved.requestingDeptId),
        targetDeptId: String(saved.targetDeptId),
        requestingDeptCode: ctx.requestingDeptCode,
        targetDeptCode: ctx.targetDeptCode,
        requestingDeptName: ctx.requestingDeptName,
        targetDeptName: ctx.targetDeptName,
        subjectId: String(saved.subjectId),
        subjectCode: ctx.subjectCode,
        subjectTitle: ctx.subjectTitle,
        termId: String(saved.termId),
        termName: ctx.termName,
        facultyId: saved.facultyId ?? null,
        cancelledBy: userId,
        cancelledByName: cancellerName,
      },
    });

    return saved;
  }

  private async respond(
    id: string,
    userId: string,
    status: 'approved' | 'rejected',
    remarks?: string,
  ): Promise<FacultyRequest> {
    const found = await this.findOne(id);
    if (found.status !== 'pending') {
      throw new BadRequestException(
        `Request is already ${found.status} and cannot be re-responded to`,
      );
    }
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new ForbiddenException();

    if (
      user.role !== 'administrator' &&
      user.role !== 'college_dean' &&
      user.deptId !== found.targetDeptId
    ) {
      throw new ForbiddenException(
        'Only the target department head can respond to this request',
      );
    }

    if (status === 'rejected' && (!remarks || !remarks.trim())) {
      throw new BadRequestException(
        'A rejection requires an explanation in remarks',
      );
    }

    found.status = status;
    found.respondedBy = userId;
    found.respondedAt = new Date();
    found.responseRemarks = remarks ?? null;
    const saved = await this.repo.save(found);
    await this.publishIdpStatus(saved);

    // ── F1b: unblock any schedule rows gated by this request ──
    await this.resolvePendingScheduleRows(String(saved.requestId));

    // ═══ Notification: approved OR rejected ═══
    const requestingDHs = await this.recipients.departmentHeadsOf(
      String(saved.requestingDeptId),
    );
    const triggerKey =
      status === 'approved' ? 'request.approved' : 'request.rejected';
    const verb = status === 'approved' ? 'approved' : 'rejected';

    const responderName =
      (user as any).firstName ??
      (user as any).username ??
      (user as any).email ??
      'The target department head';

    const ctx = await loadRequestContext(this.supabase.getAdminClient(), {
      requestingDeptId: saved.requestingDeptId,
      targetDeptId: saved.targetDeptId,
      subjectId: saved.subjectId,
      termId: saved.termId,
    });
    const subjectLabel = ctx.subjectCode ?? 'a subject';
    const deptSuffix =
      ctx.targetDeptCode && ctx.requestingDeptCode
        ? ` · ${ctx.requestingDeptCode} → ${ctx.targetDeptCode}`
        : '';

    await this.dispatcher.dispatch(triggerKey, {
      recipientUserIds: requestingDHs,
      title: `Cross-dept request ${verb}: ${ctx.subjectCode ?? 'faculty'}`,
      body:
        `${responderName} ${verb} the request for ${subjectLabel}` +
        (ctx.termName ? ` (${ctx.termName})` : '') +
        deptSuffix +
        (remarks ? ` — ${remarks}` : '.'),
      entityType: 'faculty_request',
      entityId: String(saved.requestId),
      payload: {
        requestingDeptId: String(saved.requestingDeptId),
        targetDeptId: String(saved.targetDeptId),
        requestingDeptCode: ctx.requestingDeptCode,
        targetDeptCode: ctx.targetDeptCode,
        requestingDeptName: ctx.requestingDeptName,
        targetDeptName: ctx.targetDeptName,
        subjectId: String(saved.subjectId),
        subjectCode: ctx.subjectCode,
        subjectTitle: ctx.subjectTitle,
        termId: String(saved.termId),
        termName: ctx.termName,
        facultyId: saved.facultyId ?? null,
        previousStatus: 'pending',
        newStatus: status,
        respondedBy: userId,
        respondedByName: responderName,
        remarks: remarks ?? null,
      },
    });

    return saved;
  }

  /**
   * Milestone 3 — queue the new status for the IDP desktop and, when Pattern A
   * is configured, deliver it without blocking the local approval response.
   *
   * A queue failure is logged, never thrown: the request transition already
   * succeeded and must not be rolled back because IDP is unreachable.
   */
  private async publishIdpStatus(request: FacultyRequest): Promise<void> {
    if (!this.idpFacultyRequests) return;
    try {
      const { item, payload } = await this.idpFacultyRequests.queue(request);
      void this.idpFacultyRequests
        .deliverQueued(item, payload)
        .catch((err: unknown) => {
          this.logger.warn(
            `IDP faculty-request push failed for ${request.requestId}: ` +
              `${(err as Error)?.message ?? 'unknown error'}`,
          );
        });
    } catch (err) {
      this.logger.warn(
        `IDP faculty-request queue failed for ${request.requestId}: ` +
          `${(err as Error)?.message ?? 'unknown error'}`,
      );
    }
  }

  /**
   * F1b: when a faculty_request is approved or rejected, clear the
   * pending gate on any schedule rows linked to it.
   */
  private async resolvePendingScheduleRows(
    requestId: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .getAdminClient()
        .from('schedule')
        .update({
          pending_faculty_request_id: null,
          pending_faculty_dept_id: null,
        })
        .eq('pending_faculty_request_id', requestId);

      if (error) {
        // Non-fatal — the gate stays until the DH retries the status
        // change. Log and move on.
        this.logger.warn(
          `F1b: failed to clear pending gate for request ${requestId}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `F1b: unexpected error clearing gate for ${requestId}: ${(err as Error).message}`,
      );
    }
  }
}