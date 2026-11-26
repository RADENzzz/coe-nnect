import { Injectable, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleChangeRequest } from '../entities/schedule-change-request.entity';
import { CreateScheduleChangeRequestDto } from '../dto/create-schedule-change-request.dto';
import { RespondScheduleChangeRequestDto } from '../dto/respond-schedule-change-request.dto';
import { ScheduleFacultyService } from './schedule-faculty.service';
import { DepartmentsService } from '../../departments/departments.service';
import { NotificationDispatcherService } from '../../notifications/notification-dispatcher.service';
import { RecipientsService } from '../../notifications/recipients.service';
import { SupabaseService } from '../../../database/supabase.service';

/**
 * Dean-approved change flow for draft schedule entries.
 *
 * Signature-only skeleton: the dependency shape mirrors SchedulePublishService
 * so the workflow bodies can reuse ownership checks, department status checks,
 * and notifications.
 */
@Injectable()
export class ScheduleChangeRequestService {
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
  ) {}

  async create(
    scheduleId: string,
    dto: CreateScheduleChangeRequestDto,
    user: any,
  ): Promise<ScheduleChangeRequest> {
    throw new NotImplementedException();
  }

  async findForSchedule(
    scheduleId: string,
    user: any,
  ): Promise<ScheduleChangeRequest | null> {
    throw new NotImplementedException();
  }

  async findRequests(input: {
    status?: string;
    termId?: string;
  }): Promise<ScheduleChangeRequest[]> {
    throw new NotImplementedException();
  }

  async respond(
    requestId: string,
    dto: RespondScheduleChangeRequestDto,
    user: any,
  ): Promise<ScheduleChangeRequest> {
    throw new NotImplementedException();
  }

  async cancelPendingForSchedule(
    scheduleId: string,
    userId: string | null = null,
  ): Promise<void> {
    throw new NotImplementedException();
  }
}
