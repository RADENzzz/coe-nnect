import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faculty } from './entities/faculty.entity';
import { FacultyQualification } from './entities/faculty-qualification.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';
import { CreateQualificationDto } from './dto/create-qualification.dto';
import { UpdateQualificationDto } from './dto/update-qualification.dto';

@Injectable()
export class FacultyService {
  constructor(
    @InjectRepository(Faculty)
    private readonly repo: Repository<Faculty>,
    @InjectRepository(FacultyQualification)
    private readonly quals: Repository<FacultyQualification>,
    @InjectRepository(Subject)
    private readonly subjects: Repository<Subject>,
  ) {}

  findAll(): Promise<Faculty[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  findAllIncludingInactive(): Promise<Faculty[]> {
    return this.repo.find({
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Faculty> {
    const found = await this.repo.findOne({ where: { facultyId: id } });
    if (!found) throw new NotFoundException('Faculty not found');
    return found;
  }

  async create(dto: CreateFacultyDto): Promise<Faculty> {
    const entity = this.repo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email ?? null,
      contact: dto.contact ?? null,
      wmsuId: dto.wmsuId ?? null,
      employeeId: dto.employeeId ?? null,
      deptId: dto.deptId ?? null,
      designationId: dto.designationId ?? null,
      classification: dto.classification,
      requiredHours: dto.requiredHours ?? null,
    });
    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdateFacultyDto): Promise<Faculty> {
    const found = await this.findOne(id);

    if (dto.firstName !== undefined) found.firstName = dto.firstName;
    if (dto.lastName !== undefined) found.lastName = dto.lastName;
    if (dto.email !== undefined) found.email = dto.email ?? null;
    if (dto.contact !== undefined) found.contact = dto.contact ?? null;
    if (dto.wmsuId !== undefined) found.wmsuId = dto.wmsuId ?? null;
    if (dto.employeeId !== undefined) found.employeeId = dto.employeeId ?? null;
    if (dto.deptId !== undefined) found.deptId = dto.deptId ?? null;
    if (dto.designationId !== undefined)
      found.designationId = dto.designationId ?? null;
    if (dto.classification !== undefined)
      found.classification = dto.classification;
    if (dto.requiredHours !== undefined)
      found.requiredHours = dto.requiredHours ?? null;

    return this.repo.save(found);
  }

  async toggleActive(id: string): Promise<Faculty> {
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
  // Faculty Qualification CRUD (FR 3.1.8 – 3.1.10)
  // ────────────────────────────────────────────

  async findQualifications(facultyId: string): Promise<FacultyQualification[]> {
    // Confirm faculty exists (throws 404 if not)
    await this.findOne(facultyId);
    return this.quals.find({
      where: { facultyId },
      relations: ['subject'],
      order: { qualId: 'ASC' },
    });
  }

  async addQualification(
    facultyId: string,
    dto: CreateQualificationDto,
  ): Promise<FacultyQualification> {
    await this.findOne(facultyId);

    const subject = await this.subjects.findOne({
      where: { subjectId: dto.subjectId },
    });
    if (!subject) {
      throw new BadRequestException('Subject not found.');
    }

    // Duplicate check — the DB has no unique constraint so we enforce here
    const existing = await this.quals.findOne({
      where: { facultyId, subjectId: dto.subjectId },
    });
    if (existing) {
      throw new ConflictException(
        `"${subject.subjectCode}" is already in this faculty's qualification list.`,
      );
    }

    const entity = this.quals.create({
      facultyId,
      subjectId: dto.subjectId,
      sourceSystem: dto.sourceSystem ?? null,
    });
    const saved = await this.quals.save(entity);
    return this.quals.findOne({
      where: { qualId: saved.qualId },
      relations: ['subject'],
    }) as Promise<FacultyQualification>;
  }

  async updateQualification(
    facultyId: string,
    qualId: string,
    dto: UpdateQualificationDto,
  ): Promise<FacultyQualification> {
    await this.findOne(facultyId);

    const found = await this.quals.findOne({
      where: { qualId, facultyId },
    });
    if (!found) throw new NotFoundException('Qualification not found');

    if (dto.subjectId !== undefined && dto.subjectId !== found.subjectId) {
      const subject = await this.subjects.findOne({
        where: { subjectId: dto.subjectId },
      });
      if (!subject) {
        throw new BadRequestException('Subject not found.');
      }
      // Duplicate check on the new subject
      const clash = await this.quals.findOne({
        where: { facultyId, subjectId: dto.subjectId },
      });
      if (clash) {
        throw new ConflictException(
          `"${subject.subjectCode}" is already in this faculty's qualification list.`,
        );
      }
      found.subjectId = dto.subjectId;
    }

    if (dto.sourceSystem !== undefined) {
      found.sourceSystem = dto.sourceSystem ?? null;
    }

    await this.quals.save(found);
    return this.quals.findOne({
      where: { qualId },
      relations: ['subject'],
    }) as Promise<FacultyQualification>;
  }

  async removeQualification(
    facultyId: string,
    qualId: string,
  ): Promise<{ success: boolean }> {
    await this.findOne(facultyId);
    const found = await this.quals.findOne({
      where: { qualId, facultyId },
    });
    if (!found) throw new NotFoundException('Qualification not found');
    await this.quals.remove(found);
    return { success: true };
  }
}