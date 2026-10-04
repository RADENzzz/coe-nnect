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

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(Subject)
    private readonly repo: Repository<Subject>,
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
}