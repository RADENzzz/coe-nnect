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

@Injectable()
export class ApprovalsService {
  constructor(
    @InjectRepository(FacultyRequest)
    private readonly repo: Repository<FacultyRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAllForCurrentUser(userId: string): Promise<FacultyRequest[]> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new ForbiddenException('User profile not found');

    // Admin / dean see everything; dept heads see requests where they're
    // either the requester or the target.
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
    return this.repo.save(entity);
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

    // Only the requesting dept head (or admin/dean) can cancel.
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
    return this.repo.save(found);
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

    // Only the target dept head (or admin/dean) can approve/reject.
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
    return this.repo.save(found);
  }
}