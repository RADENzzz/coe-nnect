import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faculty } from './entities/faculty.entity';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';

@Injectable()
export class FacultyService {
  constructor(
    @InjectRepository(Faculty)
    private readonly repo: Repository<Faculty>,
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
}