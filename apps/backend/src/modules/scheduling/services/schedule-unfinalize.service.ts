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
  ScheduleUnfinalizeRequest,
  ScheduleUnfinalizeRequestStatus,
} from '../entities/schedule-unfinalize-request.entity';
import { CreateScheduleUnfinalizeRequestDto } from '../dto/create-schedule-unfinalize-request.dto';
import { RespondScheduleUnfinalizeRequestDto } from '../dto/respond-schedule-unfinalize-request.dto';
import { ScheduleFacultyService } from './schedule-faculty.service';
import { DepartmentsService } from '../../departments/departments.service';
import { NotificationDispatcherService } from '../../notifications/notification-dispatcher.service';
import { RecipientsService } from '../../notifications/recipients.service';
import { SupabaseService } from '../../../database/supabase.service';
import { loadDeptLabel } from '../../notifications/notification-context';

const REQUEST_STATUSES: ScheduleUnfinalizeRequestStatus[] = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
];

/**
 * Dean-approved unfinalize flow for published schedule entries.
 *
 * A DH can unfinalize a finalized-but-unpublished entry directly through
 * SchedulingService.updateStatus(). A published entry is different: it is on
 * the public planner and the IDP feed, so the DH files a request here and the
 * Dean decides. Approval is the only path that performs published -> draft.
 */
@Injectable()
export class ScheduleUnfinalizeService {
  private readonly logger = new Logger(ScheduleUnfinalizeService.name);

  constructor(
    @InjectRepository(ScheduleUnfinalizeRequest)
    private readonly requestRepo: Repository<ScheduleUnfinalizeRequest>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly scheduleFaculty: ScheduleFacultyService,
    private readonly departments: DepartmentsService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
    private readonly supabase: SupabaseService,
  ) {}

  async create(
    scheduleId: string,
    dto: CreateScheduleUnfinalizeRequestDto,
    user: any,
  ): Promise<ScheduleUnfinalizeRequest> {
    if (user?.role !== 'department_head') {
      throw new ForbiddenException(
        'Only department heads can request an unfinalize.',
      );
    }

    const schedule = await this.scheduleFaculty.assertOwnership(
      scheduleId,
      user,
    );
    await this.departments.assertDepartmentActive(schedule.deptId);

    if (schedule.status !== 'published') {
      throw new BadRequestException(
        'Only published entries need Dean approval. A finalized entry can be unfinalized directly.',
      );
    }

    const existing = await this.requestRepo.findOne({
      where: { scheduleId, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException(
        'An unfinalize request for this entry is already waiting for the Dean.',
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
        `Unfinalize request notification failed: ${(err as Error).message}`,
      );
    }

    return saved;
  }

  async findPendingForSchedule(
    scheduleId: string,
    user: any,
  ): Promise<ScheduleUnfinalizeRequest | null> {
    await this.scheduleFaculty.assertOwnership(scheduleId, user);
    return this.requestRepo.findOne({
      where: { scheduleId, status: 'pending' },
      relations: ['requestedByUser', 'requestedByUser.faculty'],
      order: { createdAt: 'DESC' },
    });
  }

  async findRequests(input: {
    status?: string;
    termId?: string;
  }): Promise<ScheduleUnfinalizeRequest[]> {
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
      .orderBy('r.created_at', 'DESC')
      .take(200);

    const status = this.parseStatus(input.status);
    if (status) qb.andWhere('r.status = :status', { status });
    if (input.termId) {
      qb.andWhere('s.term_id = :termId', { termId: input.termId });
    }

    return qb.getMany();
  }

  async respond(
    requestId: string,
    dto: RespondScheduleUnfinalizeRequestDto,
    user: any,
  ): Promise<ScheduleUnfinalizeRequest> {
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
      ],
    });

    if (!request) {
      throw new NotFoundException('Unfinalize request not found.');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException(
        'This unfinalize request has already been resolved.',
      );
    }

    const schedule = request.schedule;
    if (!schedule) {
      throw new NotFoundException('Schedule entry not found.');
    }

    if (dto.action === 'approve' && schedule.status !== 'published') {
      request.status = 'cancelled';
      request.respondedBy = user?.userId ?? null;
      request.respondedAt = new Date();
      request.responseRemarks =
        'Schedule was no longer published when the request was reviewed.';
      await this.requestRepo.save(request);
      throw new BadRequestException(
        'This entry is no longer published; the request was closed.',
      );
    }

    if (dto.action === 'approve') {
      await this.scheduleRepo.update(schedule.scheduleId, { status: 'draft' });
      schedule.status = 'draft';
    }

    request.status = dto.action === 'approve' ? 'approved' : 'rejected';
    request.respondedBy = user?.userId ?? null;
    request.respondedAt = new Date();
    request.responseRemarks = dto.remarks?.trim() || null;
    const saved = await this.requestRepo.save(request);

    try {
      await this.notifyResponded(saved, schedule, dto.action, user);
    } catch (err) {
      this.logger.warn(
        `Unfinalize response notification failed: ${(err as Error).message}`,
      );
    }

    return saved;
  }

  /**
   * Close any open request when the schedule leaves Published through another
   * path (for example the Dean unfinalizes it directly from the table).
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
        'Schedule status changed outside this unfinalize request.';
    }
    await this.requestRepo.save(pending);
  }

  private parseStatus(
    value?: string,
  ): ScheduleUnfinalizeRequestStatus | undefined {
    if (!value) return undefined;
    if (!REQUEST_STATUSES.includes(value as ScheduleUnfinalizeRequestStatus)) {
      throw new BadRequestException('Unknown unfinalize request status.');
    }
    return value as ScheduleUnfinalizeRequestStatus;
  }

  private async notifyRequested(
    request: ScheduleUnfinalizeRequest,
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
      'A published schedule entry';
    const requesterName =
      user?.username ?? user?.email ?? 'A department head';
    const termName = schedule.term?.termName ?? null;

    await this.dispatcher.dispatch('schedule.unfinalize_requested', {
      recipientUserIds: recipients,
      title: `Unfinalize request: ${entryLabel}`,
      body:
        `${requesterName}` +
        (dept.deptCode ? ` (${dept.deptCode})` : '') +
        ` asked to unfinalize ${entryLabel}` +
        (termName ? ` · ${termName}` : '') +
        `. Reason: ${request.reason}`,
      entityType: 'schedule_unfinalize_request',
      entityId: request.requestId,
      payload: {
        requestId: request.requestId,
        scheduleId: schedule.scheduleId,
        subjectCode,
        subjectTitle: schedule.subject?.title ?? null,
        sectionCode,
        roomCode:
          schedule.room?.roomNumber ?? schedule.externalRoomName ?? null,
        termName,
        deptId: schedule.deptId,
        deptCode: dept.deptCode,
        reason: request.reason,
        requestedByName: requesterName,
        previousStatus: 'published',
        newStatus: 'published',
      },
    });
  }

  private async notifyResponded(
    request: ScheduleUnfinalizeRequest,
    schedule: Schedule,
    action: 'approve' | 'reject',
    user: any,
  ): Promise<void> {
    const recipients = this.recipients.uniq([
      ...(await this.recipients.departmentHeadsOfSchedule(schedule.scheduleId)),
      request.requestedBy,
    ]);

    const subjectCode = schedule.subject?.subjectCode ?? null;
    const sectionCode =
      schedule.sectionRef?.sectionCode ?? schedule.section ?? null;
    const entryLabel =
      [subjectCode, sectionCode].filter(Boolean).join(' · ') ||
      'The published schedule entry';
    const approved = action === 'approve';
    const decidedByName = user?.username ?? user?.email ?? 'The Dean';

    await this.dispatcher.dispatch(
      approved
        ? 'schedule.unfinalize_approved'
        : 'schedule.unfinalize_rejected',
      {
        recipientUserIds: recipients,
        title: `${
          approved ? 'Unfinalize approved' : 'Unfinalize rejected'
        }: ${entryLabel}`,
        body: approved
          ? `${decidedByName} approved the request. ${entryLabel} is back in Draft and has been removed from the public schedule.`
          : `${decidedByName} rejected the request. ${entryLabel} stays Published.` +
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
          roomCode:
            schedule.room?.roomNumber ?? schedule.externalRoomName ?? null,
          termName: schedule.term?.termName ?? null,
          deptId: schedule.deptId,
          reason: request.reason,
          responseRemarks: request.responseRemarks,
          decidedByName,
          previousStatus: 'published',
          newStatus: approved ? 'draft' : 'published',
        },
      },
    );
  }
}
