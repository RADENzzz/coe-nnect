import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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