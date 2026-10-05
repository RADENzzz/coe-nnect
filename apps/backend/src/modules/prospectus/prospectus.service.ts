import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospectus } from './entities/prospectus.entity';
import { Program } from '../programs/entities/program.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { CreateProspectusDto } from './dto/create-prospectus.dto';
import { UpdateProspectusDto } from './dto/update-prospectus.dto';

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

  // ── Read-only helper for the frontend dropdown ──
  listActivePrograms(): Promise<Program[]> {
    return this.programs.find({
      where: { isActive: true },
      order: { programCode: 'ASC' },
    });
  }

  async create(dto: CreateProspectusDto): Promise<Prospectus> {
    // FK checks
    const program = await this.programs.findOne({
      where: { programId: dto.programId },
    });
    if (!program) {
      throw new BadRequestException('Program not found.');
    }
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

    // Duplicate check: same program + subject + year + semester
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
      // If it existed but was deactivated, reactivate it instead of inserting a duplicate
      existing.isActive = true;
      return this.repo.save(existing);
    }

    const entity = this.repo.create({
      programId: dto.programId,
      subjectId: dto.subjectId,
      yearLevel: dto.yearLevel,
      semester: dto.semester,
      isActive: true,
    });

    const saved = await this.repo.save(entity);
    return this.findOne(saved.prospectusId);
  }

  async update(id: string, dto: UpdateProspectusDto): Promise<Prospectus> {
    const found = await this.repo.findOne({
      where: { prospectusId: id },
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');

    // If programId is changing, verify it
    if (dto.programId !== undefined && dto.programId !== found.programId) {
      const program = await this.programs.findOne({
        where: { programId: dto.programId },
      });
      if (!program) throw new BadRequestException('Program not found.');
      found.programId = dto.programId;
    }

    // If subjectId is changing, verify it
    if (dto.subjectId !== undefined && dto.subjectId !== found.subjectId) {
      const subject = await this.subjects.findOne({
        where: { subjectId: dto.subjectId },
      });
      if (!subject) throw new BadRequestException('Subject not found.');
      found.subjectId = dto.subjectId;
    }

    if (dto.yearLevel !== undefined) found.yearLevel = dto.yearLevel;
    if (dto.semester !== undefined) found.semester = dto.semester;
    if (dto.isActive !== undefined) found.isActive = dto.isActive;

    await this.repo.save(found);
    return this.findOne(id);
  }

  async toggleActive(id: string): Promise<Prospectus> {
    const found = await this.repo.findOne({
      where: { prospectusId: id },
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');
    found.isActive = !found.isActive;
    await this.repo.save(found);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const found = await this.repo.findOne({
      where: { prospectusId: id },
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');
    await this.repo.remove(found);
    return { success: true };
  }

  // ── Tiny helper for friendly duplicate error messages ──
  private ordinal(n: number): string {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
  }
}