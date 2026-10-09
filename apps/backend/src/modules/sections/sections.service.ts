import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Section } from './entities/section.entity';
import { Program } from '../programs/entities/program.entity';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class SectionsService {
  constructor(
    @InjectRepository(Section)
    private readonly repo: Repository<Section>,
    @InjectRepository(Program)
    private readonly programs: Repository<Program>,
  ) {}

  /**
   * Resolve the section's owning department through program → dept_id.
   * Returns null if the section has no program or the program is missing.
   */
  private async resolveSectionDeptId(
    section: Section,
  ): Promise<string | null> {
    if (!section.programId) return null;
    const program = await this.programs.findOne({
      where: { programId: section.programId },
    });
    return program?.deptId ? String(program.deptId) : null;
  }

  private async assertOwnership(
    sectionId: string,
    profile: User | undefined,
  ): Promise<Section> {
    if (!profile) throw new ForbiddenException('Not authenticated');

    const section = await this.findOne(sectionId);

    if (profile.role === 'administrator' || profile.role === 'college_dean') {
      return section;
    }

    if (profile.role !== 'department_head') {
      throw new ForbiddenException(
        'Only administrators, deans, and department heads can modify sections.',
      );
    }

    const ownerDeptId = await this.resolveSectionDeptId(section);
    if (!ownerDeptId || ownerDeptId !== String(profile.deptId)) {
      throw new ForbiddenException(
        'You can only modify sections belonging to your own department.',
      );
    }

    return section;
  }

  /**
   * A DH may only assign a section to one of their own department's programs.
   */
  private async assertProgramBelongsToCaller(
    programId: string | null | undefined,
    profile: User,
  ): Promise<void> {
    if (profile.role === 'administrator' || profile.role === 'college_dean') {
      return;
    }
    if (profile.role !== 'department_head') {
      throw new ForbiddenException(
        'You do not have permission to modify sections.',
      );
    }
    if (!programId) {
      throw new ForbiddenException(
        'Sections must be assigned to a program in your department.',
      );
    }

    const program = await this.programs.findOne({
      where: { programId },
    });
    if (!program) {
      throw new NotFoundException('Program not found');
    }
    if (String(program.deptId) !== String(profile.deptId)) {
      throw new ForbiddenException(
        'You can only assign sections to programs in your own department.',
      );
    }
  }

  findAll(): Promise<Section[]> {
    return this.repo.find({
      order: { sectionCode: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Section> {
    const found = await this.repo.findOne({ where: { sectionId: id } });
    if (!found) throw new NotFoundException('Section not found');
    return found;
  }

  async create(dto: CreateSectionDto, profile: User): Promise<Section> {
    await this.assertProgramBelongsToCaller(dto.programId, profile);

    const existing = await this.repo.findOne({
      where: { sectionCode: dto.sectionCode },
    });
    if (existing) {
      throw new ConflictException(
        `Section code "${dto.sectionCode}" already exists`,
      );
    }
    const entity = this.repo.create({
      sectionCode: dto.sectionCode,
      programId: dto.programId ?? null,
      yearLevel: dto.yearLevel ?? null,
      studentCount: dto.studentCount ?? null,
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateSectionDto,
    profile: User,
  ): Promise<Section> {
    const found = await this.assertOwnership(id, profile);

    // If the DH is moving the section to a different program, that program
    // must also belong to them.
    if (dto.programId !== undefined && dto.programId !== found.programId) {
      await this.assertProgramBelongsToCaller(dto.programId, profile);
    }

    if (dto.sectionCode !== undefined) found.sectionCode = dto.sectionCode;
    if (dto.programId !== undefined) found.programId = dto.programId;
    if (dto.yearLevel !== undefined) found.yearLevel = dto.yearLevel;
    if (dto.studentCount !== undefined)
      found.studentCount = dto.studentCount ?? null;
    return this.repo.save(found);
  }

  async toggleActive(id: string, profile: User): Promise<Section> {
    const found = await this.assertOwnership(id, profile);
    found.isActive = !found.isActive;
    return this.repo.save(found);
  }

  async remove(id: string, profile: User): Promise<{ success: boolean }> {
    const found = await this.assertOwnership(id, profile);
    await this.repo.remove(found);
    return { success: true };
  }
}