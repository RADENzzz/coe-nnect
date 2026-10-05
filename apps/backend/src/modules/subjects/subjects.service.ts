import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from './entities/subject.entity';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectRestriction } from './entities/subject-restriction.entity';
import { CreateSubjectRestrictionDto } from './dto/create-subject-restriction.dto';
import { UpdateSubjectRestrictionDto } from './dto/update-subject-restriction.dto';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(Subject)
    private readonly repo: Repository<Subject>,
    @InjectRepository(SubjectRestriction)
    private readonly restrictions: Repository<SubjectRestriction>,
  ) {}

  findAll(): Promise<Subject[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { subjectCode: 'ASC' },
    });
  }

  findAllIncludingInactive(): Promise<Subject[]> {
    return this.repo.find({ order: { subjectCode: 'ASC' } });
  }

  async findOne(id: string): Promise<Subject> {
    const found = await this.repo.findOne({ where: { subjectId: id } });
    if (!found) throw new NotFoundException('Subject not found');
    return found;
  }

  async create(dto: CreateSubjectDto): Promise<Subject> {
    const existing = await this.repo.findOne({
      where: { subjectCode: dto.subjectCode },
    });
    if (existing) {
      throw new ConflictException(
        `Subject code "${dto.subjectCode}" already exists`,
      );
    }

    if (dto.totalUnits !== dto.lectureUnits + dto.labUnits) {
      throw new BadRequestException(
        'totalUnits must equal lectureUnits + labUnits',
      );
    }

    const entity = this.repo.create({
      subjectCode: dto.subjectCode,
      title: dto.title,
      totalUnits: dto.totalUnits,
      lectureUnits: dto.lectureUnits,
      labUnits: dto.labUnits,
      requiredRoomType: (dto.requiredRoomType as any) ?? null,
      deptId: dto.deptId,
    });
    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdateSubjectDto): Promise<Subject> {
    const found = await this.findOne(id);

    if (dto.subjectCode !== undefined) found.subjectCode = dto.subjectCode;
    if (dto.title !== undefined) found.title = dto.title;
    if (dto.totalUnits !== undefined) found.totalUnits = dto.totalUnits;
    if (dto.lectureUnits !== undefined) found.lectureUnits = dto.lectureUnits;
    if (dto.labUnits !== undefined) found.labUnits = dto.labUnits;
    if (dto.requiredRoomType !== undefined)
      found.requiredRoomType = (dto.requiredRoomType as any) ?? null;
    if (dto.deptId !== undefined) found.deptId = dto.deptId;

    if (found.totalUnits !== found.lectureUnits + found.labUnits) {
      throw new BadRequestException(
        'totalUnits must equal lectureUnits + labUnits',
      );
    }

    return this.repo.save(found);
  }

  async toggleActive(id: string): Promise<Subject> {
    const found = await this.findOne(id);
    found.isActive = !found.isActive;
    return this.repo.save(found);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const found = await this.findOne(id);
    await this.repo.remove(found);
    return { success: true };
  }
// ────────────────────────────────────────────
// S-11 — Subject Restrictions
// ────────────────────────────────────────────

  async findAllRestrictions(termId?: string): Promise<SubjectRestriction[]> {
    const qb = this.restrictions
      .createQueryBuilder('r')
      .orderBy('r.createdAt', 'DESC');

    if (termId) {
      qb.andWhere('(r.termId = :termId OR r.termId IS NULL)', { termId });
    }
    return qb.getMany();
  }

  async createRestriction(
    dto: CreateSubjectRestrictionDto,
    createdBy?: string,
  ): Promise<SubjectRestriction> {
    if (dto.subjectId1 === dto.subjectId2) {
      throw new BadRequestException(
        'A subject cannot be restricted against itself.',
      );
    }

  // Both subjects must exist
  const [a, b] = await Promise.all([
    this.repo.findOne({ where: { subjectId: dto.subjectId1 } }),
    this.repo.findOne({ where: { subjectId: dto.subjectId2 } }),
  ]);
  if (!a || !b) {
    throw new NotFoundException('One or both subjects not found.');
  }

  // Reject duplicates in either direction (A-B and B-A are the same pair)
  const existing = await this.restrictions
    .createQueryBuilder('r')
    .where(
      `(r.subjectId1 = :a AND r.subjectId2 = :b)
       OR (r.subjectId1 = :b AND r.subjectId2 = :a)`,
      { a: dto.subjectId1, b: dto.subjectId2 },
    )
    .andWhere('r.isActive = true')
    .getOne();
  if (existing) {
    throw new ConflictException(
      'A restriction between these two subjects already exists.',
    );
  }

  const entity = this.restrictions.create({
    subjectId1: dto.subjectId1,
    subjectId2: dto.subjectId2,
    termId: dto.termId ?? null,
    warningMessage: dto.warningMessage ?? null,
    createdBy: createdBy ?? null,
    isActive: true,
  });
  return this.restrictions.save(entity);
  }

  async updateRestriction(
    id: string,
    dto: UpdateSubjectRestrictionDto,
  ): Promise<SubjectRestriction> {
    const found = await this.restrictions.findOne({
      where: { restrictionId: id },
    });
    if (!found) throw new NotFoundException('Restriction not found');

    if (dto.warningMessage !== undefined)
      found.warningMessage = dto.warningMessage ?? null;
    if (dto.isActive !== undefined) found.isActive = dto.isActive;

  return this.restrictions.save(found);
  }

  async removeRestriction(id: string): Promise<{ success: boolean }> {
    const found = await this.restrictions.findOne({
      where: { restrictionId: id },
    });
    if (!found) throw new NotFoundException('Restriction not found');
    await this.restrictions.remove(found);
    return { success: true };
  }
}