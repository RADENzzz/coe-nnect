import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospectus } from './entities/prospectus.entity';
import { Program } from '../programs/entities/program.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { CreateProspectusDto } from './dto/create-prospectus.dto';
import { UpdateProspectusDto } from './dto/update-prospectus.dto';

export interface ProspectusCaller {
  role: string;
  deptId: string | null;
}

@Injectable()
export class ProspectusService {
  constructor(
    @InjectRepository(Prospectus)
    private readonly repo: Repository<Prospectus>,
    @InjectRepository(Program)
    private readonly programs: Repository<Program>,
    @InjectRepository(Subject)
    private readonly subjects: Repository<Subject>,
  ) {}

  // ────────────────────────────────────────────
  // Reads
  // ────────────────────────────────────────────

  findAll(): Promise<Prospectus[]> {
    return this.repo.find({
      relations: ['program', 'subject'],
      order: {
        programId: 'ASC',
        yearLevel: 'ASC',
        semester: 'ASC',
      },
    });
  }

  findByProgram(programId: string): Promise<Prospectus[]> {
    return this.repo.find({
      where: { programId },
      relations: ['program', 'subject'],
      order: { yearLevel: 'ASC', semester: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Prospectus> {
    const found = await this.repo.findOne({
      where: { prospectusId: id },
      relations: ['program', 'subject'],
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');
    return found;
  }

  // ────────────────────────────────────────────
  // Authorization helper
  // ────────────────────────────────────────────

  /**
   * Ensures the caller is allowed to write prospectus entries for the
   * given program.
   *
   *   college_dean     → allowed for any program
   *   department_head  → only own department's programs
   *   everyone else    → rejected
   *
   * NOTE: the `administrator` role is still accepted so the hidden
   * dev account retains full access. It is NOT used for user-facing
   * authorization — the Dean is the top role.
   */
  private async assertProgramWriteAccess(
    programId: string,
    caller: ProspectusCaller,
  ): Promise<Program> {
    const program = await this.programs.findOne({
      where: { programId },
    });
    if (!program) {
      throw new BadRequestException('Program not found.');
    }

    if (caller.role === 'administrator' || caller.role === 'college_dean') {
      return program;
    }

    if (caller.role !== 'department_head') {
      throw new ForbiddenException(
        'You do not have permission to modify prospectus entries.',
      );
    }

    if (
      !caller.deptId ||
      String(program.deptId) !== String(caller.deptId)
    ) {
      throw new ForbiddenException(
        `Program "${program.programCode}" belongs to another department. You can only manage prospectus entries for your own department's programs.`,
      );
    }

    return program;
  }

  // ────────────────────────────────────────────
  // Writes
  // ────────────────────────────────────────────

  async create(
    dto: CreateProspectusDto,
    caller: ProspectusCaller,
  ): Promise<Prospectus> {
    const program = await this.assertProgramWriteAccess(dto.programId, caller);

    if (!program.isActive) {
      throw new BadRequestException(
        `Program "${program.programCode}" is inactive.`,
      );
    }

    const subject = await this.subjects.findOne({
      where: { subjectId: dto.subjectId },
    });
    if (!subject) {
      throw new BadRequestException('Subject not found.');
    }
    if (!subject.isActive) {
      throw new BadRequestException(
        `Subject "${subject.subjectCode}" is inactive.`,
      );
    }

    const existing = await this.repo.findOne({
      where: {
        programId: dto.programId,
        subjectId: dto.subjectId,
        yearLevel: dto.yearLevel,
        semester: dto.semester,
      },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException(
          `"${subject.subjectCode}" is already in the ${program.programCode} ` +
            `${dto.yearLevel}${this.ordinal(dto.yearLevel)} Year, ${dto.semester} semester prospectus.`,
        );
      }
      existing.isActive = true;
      return this.repo.save(existing);
    }

    const entity = this.repo.create({
      programId: dto.programId,
      subjectId: dto.subjectId,
      yearLevel: dto.yearLevel,
      semester: dto.semester,
      isActive: true,
      // ── Multi-session scheduling (Phase 2) ──
      lectureSessionsPerWeek: dto.lectureSessionsPerWeek ?? 1,
      lectureMinutesPerSession: dto.lectureMinutesPerSession ?? 90,
      labSessionsPerWeek: dto.labSessionsPerWeek ?? 1,
      labMinutesPerSession: dto.labMinutesPerSession ?? 180,
    });

    const saved = await this.repo.save(entity);
    return this.findOne(saved.prospectusId);
  }

  async update(
    id: string,
    dto: UpdateProspectusDto,
    caller: ProspectusCaller,
  ): Promise<Prospectus> {
    const found = await this.repo.findOne({
      where: { prospectusId: id },
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');

    await this.assertProgramWriteAccess(found.programId, caller);

    if (dto.programId !== undefined && dto.programId !== found.programId) {
      const targetProgram = await this.assertProgramWriteAccess(
        dto.programId,
        caller,
      );
      if (!targetProgram.isActive) {
        throw new BadRequestException(
          `Program "${targetProgram.programCode}" is inactive.`,
        );
      }
      found.programId = dto.programId;
    }

    if (dto.subjectId !== undefined && dto.subjectId !== found.subjectId) {
      const subject = await this.subjects.findOne({
        where: { subjectId: dto.subjectId },
      });
      if (!subject) throw new BadRequestException('Subject not found.');
      if (!subject.isActive) {
        throw new BadRequestException(
          `Subject "${subject.subjectCode}" is inactive.`,
        );
      }
      found.subjectId = dto.subjectId;
    }

    if (dto.yearLevel !== undefined) found.yearLevel = dto.yearLevel;
    if (dto.semester !== undefined) found.semester = dto.semester;
    if (dto.isActive !== undefined) found.isActive = dto.isActive;

    // ── Multi-session scheduling (Phase 2) ──
    if (dto.lectureSessionsPerWeek !== undefined)
      found.lectureSessionsPerWeek = dto.lectureSessionsPerWeek;
    if (dto.lectureMinutesPerSession !== undefined)
      found.lectureMinutesPerSession = dto.lectureMinutesPerSession;
    if (dto.labSessionsPerWeek !== undefined)
      found.labSessionsPerWeek = dto.labSessionsPerWeek;
    if (dto.labMinutesPerSession !== undefined)
      found.labMinutesPerSession = dto.labMinutesPerSession;

    await this.repo.save(found);
    return this.findOne(id);
  }

  async toggleActive(
    id: string,
    caller: ProspectusCaller,
  ): Promise<Prospectus> {
    const found = await this.repo.findOne({
      where: { prospectusId: id },
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');

    await this.assertProgramWriteAccess(found.programId, caller);

    found.isActive = !found.isActive;
    await this.repo.save(found);
    return this.findOne(id);
  }

  async remove(
    id: string,
    caller: ProspectusCaller,
  ): Promise<{ success: boolean }> {
    const found = await this.repo.findOne({
      where: { prospectusId: id },
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');

    await this.assertProgramWriteAccess(found.programId, caller);

    await this.repo.remove(found);
    return { success: true };
  }

  // ── Helper ──
  private ordinal(n: number): string {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
  }
}