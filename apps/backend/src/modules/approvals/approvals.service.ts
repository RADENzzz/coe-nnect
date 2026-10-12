import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FacultyRequest } from './entities/faculty-request.entity';
import { CreateFacultyRequestDto } from './dto/create-faculty-request.dto';
import { RespondFacultyRequestDto } from './dto/respond-faculty-request.dto';
import { User } from '../users/entities/user.entity';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { RecipientsService } from '../notifications/recipients.service';

@Injectable()
export class ApprovalsService {
  constructor(
    @InjectRepository(FacultyRequest)
    private readonly repo: Repository<FacultyRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
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

    await this.dispatcher.dispatch('request.submitted', {
      recipientUserIds: this.recipients.uniq([...targetDHs, ...dean]),
      title: 'Cross-dept faculty request submitted',
      body: `${requesterName} requested faculty from your department.`,
      entityType: 'faculty_request',
      entityId: String(saved.requestId),
      payload: {
        requestingDeptId: String(saved.requestingDeptId),
        targetDeptId: String(saved.targetDeptId),
        subjectId: String(saved.subjectId),
        termId: String(saved.termId),
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

    await this.dispatcher.dispatch('request.cancelled', {
      recipientUserIds: this.recipients.uniq([...targetDHs, ...dean]),
      title: 'Cross-dept request cancelled',
      body: `A request from ${cancellerName}'s department was cancelled.`,
      entityType: 'faculty_request',
      entityId: String(saved.requestId),
      payload: {
        requestingDeptId: String(saved.requestingDeptId),
        targetDeptId: String(saved.targetDeptId),
        cancelledBy: userId,
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

    // ═══ Notification: approved OR rejected ═══
    const requestingDHs = await this.recipients.departmentHeadsOf(
      String(saved.requestingDeptId),
    );
    const triggerKey =
      status === 'approved' ? 'request.approved' : 'request.rejected';
    const verb = status === 'approved' ? 'approved' : 'rejected';

    await this.dispatcher.dispatch(triggerKey, {
      recipientUserIds: requestingDHs,
      title: `Cross-dept request ${verb}`,
      body:
        status === 'approved'
          ? `Your request was approved${remarks ? `: ${remarks}` : '.'}`
          : `Your request was rejected${remarks ? `: ${remarks}` : '.'}`,
      entityType: 'faculty_request',
      entityId: String(saved.requestId),
      payload: {
        requestingDeptId: String(saved.requestingDeptId),
        targetDeptId: String(saved.targetDeptId),
        respondedBy: userId,
        remarks: remarks ?? null,
      },
    });

    return saved;
  }
}