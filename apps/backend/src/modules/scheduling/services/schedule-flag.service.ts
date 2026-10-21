import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NotificationDispatcherService } from '../../notifications/notification-dispatcher.service';
import { RecipientsService } from '../../notifications/recipients.service';
import { User } from '../../users/entities/user.entity';
import { Schedule } from '../entities/schedule.entity';

/** Flagging and review-queue queries for schedule entries. */
@Injectable()
export class ScheduleFlagService {
  private readonly logger = new Logger(ScheduleFlagService.name);

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
  ) {}

  async flagSchedule(
    id: string,
    reason: string,
    user: User,
  ): Promise<Schedule> {
    if (!user?.userId) {
      throw new ForbiddenException('Not authenticated');
    }

    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    found.flagged = true;
    found.flaggedBy = user.userId;
    found.flaggedAt = new Date();
    found.flagReason = reason;

    this.logger.log(
      `Schedule ${id} flagged by ${user.userId} ` +
        `(role=${user.role}, dept=${user.deptId}): ${reason}`,
    );
    const saved = await this.scheduleRepo.save(found);

    const ownerDHs = await this.recipients.departmentHeadsOfSchedule(id);
    const dean = await this.recipients.collegeDean();
    await this.dispatcher.dispatch('schedule.flagged', {
      recipientUserIds: this.recipients.uniq([...ownerDHs, ...dean]),
      title: 'Schedule entry flagged',
      body: `An entry was flagged for review: ${reason}`,
      entityType: 'schedule',
      entityId: id,
      payload: {
        reason,
        flaggedBy: user.userId,
        flaggedByName: user.email ?? null,
        subjectCode: null,
      },
    });

    return saved;
  }

  async unflagSchedule(id: string, user: User): Promise<Schedule> {
    if (!user?.userId) {
      throw new ForbiddenException('Not authenticated');
    }

    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    // Keep the `administrator` bypass so the hidden dev account can
    // always clear a flag (recovery path). The user-facing role with
    // this power is now `college_dean`.
    const isDevAccount = user.role === 'administrator';
    const isDean = user.role === 'college_dean';

    const isFlagger =
      found.flaggedBy && String(found.flaggedBy) === String(user.userId);
    const isOwnerDH =
      user.role === 'department_head' &&
      user.deptId != null &&
      String(found.deptId) === String(user.deptId);

    if (!isDevAccount && !isDean && !isFlagger && !isOwnerDH) {
      throw new ForbiddenException(
        'Only the person who flagged this entry, the owning department ' +
          'head, a Dean, or an Administrator can clear the flag.',
      );
    }

    found.flagged = false;
    found.flaggedBy = null;
    found.flaggedAt = null;
    found.flagReason = null;

    this.logger.log(`Schedule ${id} unflagged by ${user.userId}`);
    return this.scheduleRepo.save(found);
  }

  async findFlagged(termId: string, user: any): Promise<Schedule[]> {
    const qb = this.scheduleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.subject', 'subject')
      .leftJoinAndSelect('s.faculty', 'faculty')
      .leftJoinAndSelect('s.room', 'room')
      .where('s.term_id = :termId', { termId })
      .andWhere('s.flagged = true')
      .orderBy('s.flagged_at', 'DESC');

    if (user?.role === 'department_head' && user.deptId != null) {
      qb.andWhere('s.dept_id = :deptId', { deptId: String(user.deptId) });
    }

    return qb.getMany();
  }
}
