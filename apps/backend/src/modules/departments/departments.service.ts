// apps/backend/src/modules/departments/departments.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './entities/department.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private deptRepo: Repository<Department>,
  ) {}

  /**
   * List departments.
   *
   * @param includeInactive — when true, returns ALL departments including
   *   deactivated ones. The Dean uses this to reactivate a dept; DHs and
   *   pickers use the default (active-only).
   */
  async findAll(includeInactive = false): Promise<Department[]> {
    const where = includeInactive ? {} : { isActive: true };
    return this.deptRepo.find({
      where,
      order: { deptName: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Department> {
    const dept = await this.deptRepo.findOne({ where: { deptId: id } });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  /**
   * Guard against mutating data in a deactivated department.
   *
   * Call this at the top of every dept-scoped write in every service
   * (scheduling, faculty, subjects, rooms, sections, prospectus,
   * programs, terms). If the dept is inactive, throw a clear 409 with
   * the dept code + name so the user knows exactly which dept to
   * reactivate and where.
   *
   * @param deptId — the dept_id the mutation would affect
   * @throws NotFoundException if the dept doesn't exist
   * @throws ConflictException if the dept is inactive
   */
  async assertDepartmentActive(deptId: string | number | null | undefined): Promise<void> {
    if (deptId === null || deptId === undefined || deptId === '') {
      // No dept to check — shared room, external entity, etc. Caller decides.
      return;
    }
    const dept = await this.deptRepo.findOne({
      where: { deptId: String(deptId) },
      select: ['deptId', 'deptCode', 'deptName', 'isActive'],
    });
    if (!dept) {
      throw new NotFoundException(`Department ${deptId} not found.`);
    }
    if (!dept.isActive) {
      throw new ConflictException(
        `Department "${dept.deptCode} — ${dept.deptName}" is deactivated. ` +
          `Reactivate it from Dean → Departments before making changes.`,
      );
    }
  }

  /**
   * Convenience boolean version — for reads where we want to skip
   * inactive rows quietly rather than throw.
   */
  async isActive(deptId: string | number | null | undefined): Promise<boolean> {
    if (deptId === null || deptId === undefined || deptId === '') return true;
    const dept = await this.deptRepo.findOne({
      where: { deptId: String(deptId) },
      select: ['isActive'],
    });
    return dept?.isActive === true;
  }

  async create(dto: CreateDepartmentDto): Promise<Department> {
    const code = dto.deptCode.toUpperCase();
    const existing = await this.deptRepo.findOne({ where: { deptCode: code } });
    if (existing) {
      throw new ConflictException(`Department code "${code}" already exists`);
    }

    const dept = this.deptRepo.create({
      deptCode: code,
      deptName: dto.deptName,
      description: dto.description ?? null,
      isActive: true,
    });

    return this.deptRepo.save(dept);
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<Department> {
    const dept = await this.findOne(id);

    if (dto.deptCode) {
      const code = dto.deptCode.toUpperCase();
      const existing = await this.deptRepo.findOne({ where: { deptCode: code } });
      if (existing && existing.deptId !== id) {
        throw new ConflictException(`Department code "${code}" already exists`);
      }
      dept.deptCode = code;
    }

    if (dto.deptName !== undefined) dept.deptName = dto.deptName;
    if (dto.description !== undefined) dept.description = dto.description ?? null;

    return this.deptRepo.save(dept);
  }

  async toggleActive(id: string): Promise<Department> {
    const dept = await this.findOne(id);
    dept.isActive = !dept.isActive;
    return this.deptRepo.save(dept);
  }

  async remove(id: string): Promise<void> {
    const dept = await this.findOne(id);
    await this.deptRepo.remove(dept);
  }
}