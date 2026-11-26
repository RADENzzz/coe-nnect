import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';
import {
  ScheduleChangeRequest,
  ScheduleChangeRequestStatus,
} from '../entities/schedule-change-request.entity';
import { CreateScheduleChangeRequestDto } from '../dto/create-schedule-change-request.dto';
import { RespondScheduleChangeRequestDto } from '../dto/respond-schedule-change-request.dto';
import { ScheduleFacultyService } from './schedule-faculty.service';
import { SchedulePublishService } from './schedule-publish.service';
import { DepartmentsService } from '../../departments/departments.service';
import { NotificationDispatcherService } from '../../notifications/notification-dispatcher.service';
import { RecipientsService } from '../../notifications/recipients.service';
import { SupabaseService } from '../../../database/supabase.service';
import { loadDeptLabel } from '../../notifications/notification-context';

const REQUEST_STATUSES: ScheduleChangeRequestStatus[] = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
];

const ELIGIBLE_SCHEDULE_STATUSES = ['review', 'finalized'];

/**
 * Dean-approved change flow for review and finalized schedule entries.
 *
 * Only approval returns an entry to Draft, the sole editable state. Published
 * entries keep using the unfinalize request, and IDP stays a separate manual
 * Dean action.
 */
@Injectable()
export class ScheduleChangeRequestService {
  private readonly logger = new Logger(ScheduleChangeRequestService.name);

  constructor(
    @InjectRepository(ScheduleChangeRequest)
    private readonly requestRepo: Repository<ScheduleChangeRequest>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly scheduleFaculty: ScheduleFacultyService,
    private readonly departments: DepartmentsService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
    private readonly supabase: SupabaseService,
    private readonly schedulePublish: SchedulePublishService,
  ) {}

  async create(
    scheduleId: string,
    dto: CreateScheduleChangeRequestDto,
    user: any,
  ): Promise<ScheduleChangeRequest> {
    if (user?.role !== 'department_head') {
      throw new ForbiddenException(
        'Only department heads can request a change.',
      );
    }

    const schedule = await this.scheduleFaculty.assertOwnership(
      scheduleId,
      user,
    );
    await this.departments.assertDepartmentActive(schedule.deptId);

    if (!ELIGIBLE_SCHEDULE_STATUSES.includes(schedule.status)) {
      throw new BadRequestException(
        'Only review or finalized entries can be submitted for a change.',
      );
    }

    const existing = await this.requestRepo.findOne({
      where: { scheduleId, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException(
        'A change request for this entry is already waiting for the Dean.',
      );
    }

    const saved = await this.requestRepo.save(
      this.requestRepo.create({
        scheduleId: schedule.scheduleId,
        deptId: schedule.deptId,
        requestedBy: user?.userId ?? null,
        reason: dto.reason.trim(),
        status: 'pending',
      }),
    );

    try {
      await this.notifyRequested(saved, schedule, user);
    } catch (err) {
      this.logger.warn(
        `Change request notification failed: ${(err as Error).message}`,
      );
    }

    return saved;
  }

  async findForSchedule(
    scheduleId: string,
    user: any,
  ): Promise<ScheduleChangeRequest | null> {
    await this.scheduleFaculty.assertOwnership(scheduleId, user);

    const pending = await this.requestRepo.findOne({
      where: { scheduleId, status: 'pending' },
      relations: [
        'requestedByUser',
        'requestedByUser.faculty',
        'respondedByUser',
      ],
      order: { createdAt: 'DESC' },
    });
    if (pending) return pending;

    // No open request: show the latest decision so the head can see why the
    // entry is locked or editable.
    return this.requestRepo.findOne({
      where: { scheduleId },
      relations: [
        'requestedByUser',
        'requestedByUser.faculty',
        'respondedByUser',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findRequests(input: {
    status?: string;
    termId?: string;
  }): Promise<ScheduleChangeRequest[]> {
    const status = this.parseStatus(input.status);

    const qb = this.requestRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.schedule', 's')
      .leftJoinAndSelect('s.subject', 'subject')
      .leftJoinAndSelect('s.faculty', 'faculty')
      .leftJoinAndSelect('s.room', 'room')
      .leftJoinAndSelect('s.timeSlot', 'timeSlot')
      .leftJoinAndSelect('s.sectionRef', 'sectionRef')
      .leftJoinAndSelect('s.term', 'term')
      .leftJoinAndSelect('r.requestedByUser', 'requestedByUser')
      .leftJoinAndSelect('requestedByUser.faculty', 'requestedByFaculty')
      .leftJoinAndSelect('r.respondedByUser', 'respondedByUser')
      .orderBy('r.createdAt', 'DESC')
      .take(200);

    if (status) qb.andWhere('r.status = :status', { status });
    if (input.termId) {
      // The request table has no term column: filter through the schedule
      // relation joined above.
      qb.andWhere('s.term_id = :termId', { termId: input.termId });
    }

    return qb.getMany();
  }

  async respond(
    requestId: string,
    dto: RespondScheduleChangeRequestDto,
    user: any,
  ): Promise<ScheduleChangeRequest> {
    const request = await this.requestRepo.findOne({
      where: { requestId },
      relations: [
        'schedule',
        'schedule.subject',
        'schedule.faculty',
        'schedule.room',
        'schedule.timeSlot',
        'schedule.term',
        'schedule.sectionRef',
        'requestedByUser',
        'respondedByUser',
      ],
    });

    if (!request) {
      throw new NotFoundException('Change request not found.');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException(
        'This change request has already been resolved.',
      );
    }

    const schedule = request.schedule;
    if (!schedule) {
      throw new NotFoundException('Schedule entry not found.');
    }
    const previousStatus = schedule.status;

    if (!ELIGIBLE_SCHEDULE_STATUSES.includes(previousStatus)) {
      request.status = 'cancelled';
      request.respondedBy = user?.userId ?? null;
      request.respondedAt = new Date();
      request.responseRemarks =
        'Schedule was no longer review or finalized when the request was reviewed.';
      await this.requestRepo.save(request);
      throw new BadRequestException(
        'This entry is no longer review or finalized; the request was closed.',
      );
    }

    if (dto.action === 'reject' && !dto.remarks?.trim()) {
      throw new BadRequestException('Rejection remarks are required.');
    }

    if (dto.action === 'approve') {
      await this.scheduleRepo.update(schedule.scheduleId, { status: 'draft' });
      schedule.status = 'draft';

      if (previousStatus === 'finalized') {
        // The entry is leaving Finalized through this request, so any open
        // publish request for it can no longer be approved.
        await this.schedulePublish.cancelPendingForSchedule(
          schedule.scheduleId,
          user?.userId ?? null,
        );
      }
    }

    request.status = dto.action === 'approve' ? 'approved' : 'rejected';
    request.respondedBy = user?.userId ?? null;
    request.respondedAt = new Date();
    request.responseRemarks = dto.remarks?.trim() || null;
    const saved = await this.requestRepo.save(request);

    try {
      await this.notifyResponded(
        saved,
        schedule,
        dto.action,
        user,
        previousStatus,
      );
    } catch (err) {
      this.logger.warn(
        `Change response notification failed: ${(err as Error).message}`,
      );
    }

    return saved;
  }

  /**
   * Close an open request when the schedule leaves Review/Finalized through
   * another path, so it cannot be approved against a row that has changed.
   */
  async cancelPendingForSchedule(
    scheduleId: string,
    userId: string | null = null,
  ): Promise<void> {
    const pending = await this.requestRepo.find({
      where: { scheduleId, status: 'pending' },
    });
    if (pending.length === 0) return;

    for (const request of pending) {
      request.status = 'cancelled';
      request.respondedBy = userId;
      request.respondedAt = new Date();
      request.responseRemarks =
        'Schedule status changed outside this change request.';
      await this.requestRepo.save(request);
    }
  }

  private parseStatus(
    value?: string,
  ): ScheduleChangeRequestStatus | undefined {
    if (!value) return undefined;
    if (!REQUEST_STATUSES.includes(value as ScheduleChangeRequestStatus)) {
      throw new BadRequestException('Unknown change request status.');
    }
    return value as ScheduleChangeRequestStatus;
  }

  private async notifyRequested(
    request: ScheduleChangeRequest,
    schedule: Schedule,
    user: any,
  ): Promise<void> {
    const [dean, admins, dept] = await Promise.all([
      this.recipients.collegeDean(),
      this.recipients.administrators(),
      loadDeptLabel(this.supabase.getAdminClient(), schedule.deptId),
    ]);

    const recipients = this.recipients.uniq([...dean, ...admins]);
    const subjectCode = schedule.subject?.subjectCode ?? null;
    const sectionCode =
      schedule.sectionRef?.sectionCode ?? schedule.section ?? null;
    const entryLabel =
      [subjectCode, sectionCode].filter(Boolean).join(' · ') ||
      'A schedule entry';
    const requesterName =
      user?.username ?? user?.email ?? 'A department head';
    const termName = schedule.term?.termName ?? null;

    await this.dispatcher.dispatch('schedule.change_requested', {
      recipientUserIds: recipients,
      title: `Change request: ${entryLabel}`,
      body:
        `${requesterName}` +
        (dept.deptCode ? ` (${dept.deptCode})` : '') +
        ` asked to change ${entryLabel}` +
        (termName ? ` · ${termName}` : '') +
        `. Reason: ${request.reason}`,
      entityType: 'schedule_change_request',
      entityId: request.requestId,
      payload: {
        requestId: request.requestId,
        scheduleId: schedule.scheduleId,
        subjectId: schedule.subjectId,
        subjectCode,
        subjectTitle: schedule.subject?.title ?? null,
        sectionCode,
        termName,
        deptId: schedule.deptId,
        deptCode: dept.deptCode,
        reason: request.reason,
        responseRemarks: null,
        requestedByName: requesterName,
        previousStatus: schedule.status,
        newStatus: schedule.status,
      },
    });
  }

  private async notifyResponded(
    request: ScheduleChangeRequest,
    schedule: Schedule,
    action: 'approve' | 'reject',
    user: any,
    previousStatus: string,
  ): Promise<void> {
    const recipients = this.recipients.uniq([
      ...(await this.recipients.departmentHeadsOfSchedule(
        schedule.scheduleId,
      )),
      request.requestedBy,
    ]);

    const subjectCode = schedule.subject?.subjectCode ?? null;
    const sectionCode =
      schedule.sectionRef?.sectionCode ?? schedule.section ?? null;
    const entryLabel =
      [subjectCode, sectionCode].filter(Boolean).join(' · ') ||
      'The schedule entry';
    const approved = action === 'approve';
    const decidedByName = user?.username ?? user?.email ?? 'The Dean';

    await this.dispatcher.dispatch(
      approved ? 'schedule.change_approved' : 'schedule.change_rejected',
      {
        recipientUserIds: recipients,
        title: `${approved ? 'Change approved' : 'Change rejected'}: ${entryLabel}`,
        body: approved
          ? `${decidedByName} approved the request. ${entryLabel} is back in Draft and editable.`
          :
            `${decidedByName} rejected the request. ${entryLabel} stays ` +
            `${previousStatus === 'finalized' ? 'Finalized' : 'in Review'}.` +
            (request.responseRemarks
              ? ` Note: ${request.responseRemarks}`
              : ''),
        entityType: 'schedule',
        entityId: schedule.scheduleId,
        payload: {
          requestId: request.requestId,
          scheduleId: schedule.scheduleId,
          subjectId: schedule.subjectId,
          subjectCode,
          subjectTitle: schedule.subject?.title ?? null,
          sectionCode,
          termName: schedule.term?.termName ?? null,
          deptId: schedule.deptId,
          reason: request.reason,
          responseRemarks: request.responseRemarks,
          decidedByName,
          previousStatus,
          newStatus: approved ? 'draft' : previousStatus,
        },
      },
    );
  }
}
