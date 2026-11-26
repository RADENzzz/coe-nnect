import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SubjectEditRequest,
  SubjectEditRequestStatus,
} from './entities/subject-edit-request.entity';
import { Subject } from './entities/subject.entity';
import { User } from '../users/entities/user.entity';
import { DepartmentsService } from '../departments/departments.service';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { RecipientsService } from '../notifications/recipients.service';
import { CreateSubjectEditRequestDto } from './dto/create-subject-edit-request.dto';
import { RespondSubjectEditRequestDto } from './dto/respond-subject-edit-request.dto';

const COLLEGE_WIDE_ROLES = new Set([
  'administrator',
  'college_dean',
  'college_secretary',
]);

type EditAction = RespondSubjectEditRequestDto['action'];

type TriggerKey =
  | 'subject_edit_request.submitted'
  | 'subject_edit_request.approved'
  | 'subject_edit_request.rejected'
  | 'subject_edit_request.cancelled'
  | 'subject_edit_request.revoked';

/** Auditable service behind the cross-department subject edit-request flow. */
@Injectable()
export class SubjectEditRequestsService {
  private readonly logger = new Logger(SubjectEditRequestsService.name);

  constructor(
    @InjectRepository(SubjectEditRequest)
    private readonly requestRepo: Repository<SubjectEditRequest>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    private readonly departments: DepartmentsService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
  ) {}

  /** True only for an approved grant whose subject still has the same owner. */
  async hasActiveGrant(subjectId: string, deptId: string): Promise<boolean> {
    if (!deptId) return false;

    const subject = await this.subjectRepo.findOne({
      where: { subjectId: String(subjectId) },
    });
    if (!subject || !subject.isActive || !subject.deptId) return false;

    const grant = await this.requestRepo.findOne({
      where: {
        subjectId: String(subjectId),
        requestingDeptId: String(deptId),
        status: 'approved',
      },
      order: { createdAt: 'DESC' },
    });
    return !!grant && this.sameId(grant.owningDeptId, subject.deptId);
  }

  /** Used when ownership changes (including when a MINOR is unlabeled). */
  async revokeGrantsForOwner(
    subjectId: string,
    owningDeptId: string,
  ): Promise<void> {
    const grants = await this.requestRepo.find({
      where: {
        subjectId: String(subjectId),
        owningDeptId: String(owningDeptId),
        status: 'approved',
      },
    });
    for (const grant of grants) {
      grant.status = 'revoked';
      grant.respondedAt = new Date();
      grant.responseRemarks = 'Subject ownership changed.';
      const saved = await this.requestRepo.save(grant);
      await this.notify('subject_edit_request.revoked', saved);
    }
  }

  async findVisible(
    input: { status?: SubjectEditRequestStatus; subjectId?: string },
    profile: User,
  ): Promise<SubjectEditRequest[]> {
    const where: Record<string, unknown> = {};
    if (input.status) where.status = input.status;
    if (input.subjectId) where.subjectId = String(input.subjectId);

    const rows = await this.requestRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    if (this.isCollegeWide(profile)) return rows;
    if (profile.role !== 'department_head' || !profile.deptId) return [];

    const deptId = String(profile.deptId);
    return rows.filter(
      (row) =>
        this.sameId(row.requestingDeptId, deptId) ||
        this.sameId(row.owningDeptId, deptId),
    );
  }

  /** Pending first; otherwise the active approved grant relevant to the drawer. */
  async findCurrentForSubject(
    subjectId: string,
    profile: User,
  ): Promise<SubjectEditRequest | null> {
    const id = String(subjectId);
    // Load current ownership first: a stale pending request still blocks new
    // requests, and its new owner must be able to see it and close it.
    const subject = await this.subjectRepo.findOne({ where: { subjectId: id } });
    const pending = await this.requestRepo.findOne({
      where: { subjectId: id, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    if (pending) {
      const currentOwnerCanClose =
        this.staleReason(pending, subject) !== null &&
        profile.role === 'department_head' &&
        !!profile.deptId &&
        this.sameId(profile.deptId, subject?.deptId);
      if (this.isVisibleTo(pending, profile) || currentOwnerCanClose) {
        return pending;
      }
    }

    if (!subject || !subject.isActive || !subject.deptId) return null;

    const approved = await this.requestRepo.find({
      where: { subjectId: id, status: 'approved' },
      order: { createdAt: 'DESC' },
    });
    return (
      approved.find(
        (row) =>
          this.isVisibleTo(row, profile) &&
          this.sameId(row.owningDeptId, subject.deptId),
      ) ?? null
    );
  }

  async create(
    subjectId: string,
    dto: CreateSubjectEditRequestDto,
    profile: User,
  ): Promise<SubjectEditRequest> {
    if (this.isCollegeWide(profile)) {
      throw new ForbiddenException(
        'College-wide roles do not need to request edit access.',
      );
    }
    if (profile.role !== 'department_head') {
      throw new ForbiddenException(
        'Only department heads can request edit access.',
      );
    }
    if (!profile.deptId) {
      throw new BadRequestException(
        'You must belong to a department to make a request',
      );
    }

    const subject = await this.subjectRepo.findOne({
      where: { subjectId: String(subjectId) },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    if (!subject.isActive) {
      throw new BadRequestException(
        'Only active subjects can be requested for edit access.',
      );
    }
    if (subject.isMinor) {
      throw new BadRequestException(
        'MINOR subjects are shared and do not need edit requests.',
      );
    }
    if (!subject.deptId) {
      throw new BadRequestException('This subject has no owning department.');
    }
    if (this.sameId(profile.deptId, subject.deptId)) {
      throw new BadRequestException(
        'Target department must be different from yours',
      );
    }

    await this.departments.assertDepartmentActive(profile.deptId);
    await this.departments.assertDepartmentActive(subject.deptId);

    const pending = await this.requestRepo.findOne({
      where: { subjectId: String(subjectId), status: 'pending' },
    });
    if (pending) {
      throw new BadRequestException(
        'An edit request for this subject is already pending.',
      );
    }

    // DTO validation rejects blank reasons; keep a defensive guard so a
    // whitespace-only string can never be persisted as an empty reason.
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A reason is required');
    }

    const saved = await this.requestRepo.save(
      this.requestRepo.create({
        subjectId: String(subjectId),
        requestingDeptId: String(profile.deptId),
        owningDeptId: String(subject.deptId),
        reason,
        status: 'pending',
        createdBy: profile.userId ?? null,
      }),
    );
    await this.notify('subject_edit_request.submitted', saved);
    return saved;
  }

  async cancel(requestId: string, profile: User): Promise<SubjectEditRequest> {
    const found = await this.getRequest(requestId);
    if (found.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    if (
      !this.isCollegeWide(profile) &&
      !(
        profile.role === 'department_head' &&
        profile.deptId &&
        this.sameId(profile.deptId, found.requestingDeptId)
      )
    ) {
      throw new ForbiddenException(
        'Only the requesting department head or a college-wide role can cancel this request.',
      );
    }

    await this.departments.assertDepartmentActive(found.requestingDeptId);
    await this.departments.assertDepartmentActive(found.owningDeptId);

    return this.finalize(found, 'cancelled', profile, undefined, 'cancelled');
  }

  async respond(
    requestId: string,
    dto: RespondSubjectEditRequestDto,
    profile: User,
  ): Promise<SubjectEditRequest> {
    const found = await this.getRequest(requestId);
    const subject = await this.subjectRepo.findOne({
      where: { subjectId: String(found.subjectId) },
    });
    const staleReason = this.staleReason(found, subject);
    if (!this.canRespond(found, subject, staleReason, profile)) {
      throw new ForbiddenException(
        'Only the owning department head or a college-wide role can respond to this request.',
      );
    }

    if (!this.isEditAction(dto.action)) {
      throw new BadRequestException(
        'Action must be approve, reject, or revoke.',
      );
    }
    if (dto.action === 'reject' && !dto.remarks?.trim()) {
      throw new BadRequestException(
        'A rejection requires an explanation in remarks',
      );
    }

    if (dto.action === 'revoke') {
      if (found.status !== 'approved') {
        throw new BadRequestException('Only approved grants can be revoked.');
      }
      return this.finalize(found, 'revoked', profile, dto.remarks, 'revoked');
    }

    if (found.status !== 'pending') {
      throw new BadRequestException(
        `Request is already ${found.status} and cannot be re-responded to`,
      );
    }

    if (staleReason) {
      return this.finalize(found, 'cancelled', profile, staleReason, 'cancelled');
    }

    await this.departments.assertDepartmentActive(found.requestingDeptId);
    await this.departments.assertDepartmentActive(found.owningDeptId);

    return this.finalize(
      found,
      dto.action === 'approve' ? 'approved' : 'rejected',
      profile,
      dto.remarks,
      dto.action === 'approve' ? 'approved' : 'rejected',
    );
  }

  private async getRequest(requestId: string): Promise<SubjectEditRequest> {
    const found = await this.requestRepo.findOne({
      where: { requestId: String(requestId) },
    });
    if (!found) throw new NotFoundException('Edit request not found');
    return found;
  }

  private isCollegeWide(profile: User): boolean {
    return COLLEGE_WIDE_ROLES.has(profile?.role);
  }

  private isEditAction(action: string): action is EditAction {
    return action === 'approve' || action === 'reject' || action === 'revoke';
  }

  private sameId(left: unknown, right: unknown): boolean {
    return left != null && right != null && String(left) === String(right);
  }

  private isVisibleTo(request: SubjectEditRequest, profile: User): boolean {
    if (this.isCollegeWide(profile)) return true;
    if (profile.role !== 'department_head' || !profile.deptId) return false;
    const deptId = String(profile.deptId);
    return (
      this.sameId(request.requestingDeptId, deptId) ||
      this.sameId(request.owningDeptId, deptId)
    );
  }

  /**
   * The recorded owner can always respond. When the request is stale, the
   * current owner may also respond so they can close it; staleReason still
   * prevents any grant from being issued.
   */
  private canRespond(
    request: SubjectEditRequest,
    subject: Subject | null,
    staleReason: string | null,
    profile: User,
  ): boolean {
    if (this.isCollegeWide(profile)) return true;
    if (profile.role !== 'department_head' || !profile.deptId) return false;
    if (this.sameId(profile.deptId, request.owningDeptId)) return true;
    return (
      staleReason !== null &&
      this.sameId(profile.deptId, subject?.deptId)
    );
  }

  private staleReason(
    request: SubjectEditRequest,
    subject: Subject | null,
  ): string | null {
    if (!subject) return 'Subject no longer exists.';
    if (!subject.isActive) return 'Subject is no longer active.';
    if (!this.sameId(request.owningDeptId, subject.deptId)) {
      return 'Subject ownership changed before the request was resolved.';
    }
    return null;
  }

  private async finalize(
    request: SubjectEditRequest,
    status: SubjectEditRequestStatus,
    profile: User,
    remarks: string | undefined,
    triggerSuffix: 'approved' | 'rejected' | 'cancelled' | 'revoked',
  ): Promise<SubjectEditRequest> {
    request.status = status;
    request.respondedBy = profile.userId ?? null;
    request.respondedAt = new Date();
    request.responseRemarks = remarks?.trim() ? remarks.trim() : null;

    const saved = await this.requestRepo.save(request);
    await this.notify(`subject_edit_request.${triggerSuffix}` as TriggerKey, saved);
    return saved;
  }

  /** Notifications are best-effort: a delivery failure never undo a write. */
  private async notify(
    triggerKey: TriggerKey,
    request: SubjectEditRequest,
  ): Promise<void> {
    try {
      const subject = await this.subjectRepo.findOne({
        where: { subjectId: String(request.subjectId) },
      });
      const subjectCode =
        subject?.subjectCode?.trim() || `Subject ${request.subjectId}`;
      const ownerHeads = await this.recipients.departmentHeadsOf(
        String(request.owningDeptId),
      );
      const requesterHeads = await this.recipients.departmentHeadsOf(
        String(request.requestingDeptId),
      );
      const collegeWide = [
        ...(await this.recipients.collegeDean()),
        ...(await this.recipients.administrators()),
      ];

      let recipients: string[];
      switch (triggerKey) {
        case 'subject_edit_request.submitted':
          recipients = ownerHeads;
          break;
        case 'subject_edit_request.approved':
        case 'subject_edit_request.rejected':
        case 'subject_edit_request.revoked':
          recipients = requesterHeads;
          break;
        default:
          recipients = [...ownerHeads, ...requesterHeads];
          break;
      }

      await this.dispatcher.dispatch(triggerKey, {
        recipientUserIds: this.recipients.uniq([
          ...recipients,
          ...collegeWide,
        ]),
        title: `${subjectCode} — edit request ${triggerKey.split('.')[1]}`,
        body: `${subjectCode}: edit request is ${request.status}.`,
        entityType: 'subject_edit_request',
        entityId: String(request.requestId),
        payload: {
          requestId: String(request.requestId),
          subjectId: String(request.subjectId),
          subjectCode,
          requestingDeptId: String(request.requestingDeptId),
          owningDeptId: String(request.owningDeptId),
          status: request.status,
          reason: request.reason,
          responseRemarks: request.responseRemarks,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Notification '${triggerKey}' failed: ${(err as Error).message}`,
      );
    }
  }
}
