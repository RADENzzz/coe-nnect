import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';
import {
  SchedulePublishRequest,
  SchedulePublishRequestStatus,
} from '../entities/schedule-publish-request.entity';
import { CreateSchedulePublishRequestDto } from '../dto/create-schedule-publish-request.dto';
import { RespondSchedulePublishRequestDto } from '../dto/respond-schedule-publish-request.dto';
import { ScheduleFacultyService } from './schedule-faculty.service';
import { DepartmentsService } from '../../departments/departments.service';
import { NotificationDispatcherService } from '../../notifications/notification-dispatcher.service';
import { RecipientsService } from '../../notifications/recipients.service';
import { SupabaseService } from '../../../database/supabase.service';
import { loadDeptLabel } from '../../notifications/notification-context';

const REQUEST_STATUSES: SchedulePublishRequestStatus[] = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
];

/**
 * Dean-approved publication flow for finalized schedule entries.
 *
 * A finalized entry is not public until the Dean approves a request filed
 * here. Only the approval path may move the entry to Published; IDP remains a
 * separate manual Dean action.
 */
@Injectable()
export class SchedulePublishService {
  private readonly logger = new Logger(SchedulePublishService.name);

  constructor(
    @InjectRepository(SchedulePublishRequest)
    private readonly requestRepo: Repository<SchedulePublishRequest>,
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
    dto: CreateSchedulePublishRequestDto,
    user: any,
  ): Promise<SchedulePublishRequest> {
    if (user?.role !== 'department_head') {
      throw new ForbiddenException(
        'Only department heads can request publication.',
      );
    }

    const schedule = await this.scheduleFaculty.assertOwnership(
      scheduleId,
      user,
    );
    await this.departments.assertDepartmentActive(schedule.deptId);

    if (schedule.status !== 'finalized') {
      throw new BadRequestException(
        'Only finalized entries can be submitted for publication.',
      );
    }

    const existing = await this.requestRepo.findOne({
      where: { scheduleId, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException(
        'A publish request for this entry is already waiting for the Dean.',
      );
    }

    const saved = await this.requestRepo.save(
      this.requestRepo.create({
        scheduleId: schedule.scheduleId,
        deptId: schedule.deptId,
        requestedBy: user?.userId ?? null,
        note: dto.note?.trim() || null,
        status: 'pending',
      }),
    );

    try {
      await this.notifyRequested(saved, schedule, user);
    } catch (err) {
      this.logger.warn(
        `Publish request notification failed: ${(err as Error).message}`,
      );
    }

    return saved;
  }

  async findForSchedule(
    scheduleId: string,
    user: any,
  ): Promise<SchedulePublishRequest | null> {
    await this.scheduleFaculty.assertOwnership(scheduleId, user);

    const pending = await this.requestRepo.findOne({
      where: { scheduleId, status: 'pending' },
      relations: ['requestedByUser', 'requestedByUser.faculty'],
      order: { createdAt: 'DESC' },
    });
    if (pending) return pending;

    // No open request: show the latest decision so the DH can see why the
    // entry is or is not publishable.
    return this.requestRepo.findOne({
      where: { scheduleId },
      relations: ['requestedByUser', 'requestedByUser.faculty'],
      order: { createdAt: 'DESC' },
    });
  }

  async findRequests(input: {
    status?: string;
    termId?: string;
  }): Promise<SchedulePublishRequest[]> {
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
      .orderBy('r.created_at', 'DESC')
      .take(200);

    if (status) qb.andWhere('r.status = :status', { status });
    if (input.termId) {
      qb.andWhere('s.term_id = :termId', { termId: input.termId });
    }

    return qb.getMany();
  }

  private parseStatus(
    value?: string,
  ): SchedulePublishRequestStatus | undefined {
    if (!value) return undefined;
    if (!REQUEST_STATUSES.includes(value as SchedulePublishRequestStatus)) {
      throw new BadRequestException('Unknown publish request status.');
    }
    return value as SchedulePublishRequestStatus;
  }

  private async notifyRequested(
    request: SchedulePublishRequest,
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
      'A finalized schedule entry';
    const requesterName =
      user?.username ?? user?.email ?? 'A department head';
    const termName = schedule.term?.termName ?? null;

    await this.dispatcher.dispatch('schedule.publish_requested', {
      recipientUserIds: recipients,
      title: `Publish request: ${entryLabel}`,
      body:
        `${requesterName}` +
        (dept.deptCode ? ` (${dept.deptCode})` : '') +
        ` requested publication of ${entryLabel}` +
        (termName ? ` · ${termName}` : '') +
        '.' +
        (request.note ? ` Note: ${request.note}` : ''),
      entityType: 'schedule_publish_request',
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
        note: request.note,
        previousStatus: 'finalized',
        newStatus: 'finalized',
        requestedByName: requesterName,
      },
    });
  }
}
