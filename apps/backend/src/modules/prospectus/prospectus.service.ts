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
      existing.deactivatedBySubject = false;
      return this.repo.save(existing);
    }

    const entity = this.repo.create({
      programId: dto.programId,
      subjectId: dto.subjectId,
      yearLevel: dto.yearLevel,
      semester: dto.semester,
      isActive: true,
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
    if (dto.isActive !== undefined) {
      // Activating a mapping is only allowed while its subject is active.
      if (dto.isActive && !found.isActive) {
        const subject = await this.subjects.findOne({
          where: { subjectId: found.subjectId },
        });
        if (!subject) {
          throw new BadRequestException('Subject not found.');
        }
        if (!subject.isActive) {
          throw new BadRequestException(
            `Subject "${subject.subjectCode}" is inactive. Reactivate it on the Subjects page first.`,
          );
        }
      }
      found.isActive = dto.isActive;
      // A manual activation takes ownership of the row back from the
      // subject-level cascade.
      if (dto.isActive) found.deactivatedBySubject = false;
    }

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

    // A mapping may only be activated while its subject is active.
    // Otherwise the subject-level deactivation cascade is pointless.
    if (!found.isActive) {
      const subject = await this.subjects.findOne({
        where: { subjectId: found.subjectId },
      });
      if (!subject) {
        throw new BadRequestException('Subject not found.');
      }
      if (!subject.isActive) {
        throw new BadRequestException(
          `Subject "${subject.subjectCode}" is inactive. Reactivate it on the Subjects page first.`,
        );
      }
    }

    found.isActive = !found.isActive;
    if (found.isActive) found.deactivatedBySubject = false;
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

  /**
   * Replaces a placeholder slot subject with a real subject.
   * Preserves the original slot label for history, then deactivates
   * the placeholder subject so it drops out of dropdowns.
   */
  async fillSlot(
    prospectusId: string,
    newSubjectId: string,
    caller: ProspectusCaller,
  ): Promise<Prospectus> {
    const found = await this.repo.findOne({
      where: { prospectusId },
      relations: ['subject', 'program'],
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');

    await this.assertProgramWriteAccess(found.programId, caller);

    if (!found.subject?.isPlaceholder) {
      throw new BadRequestException(
        'This prospectus entry is not a placeholder slot.',
      );
    }

    const newSubject = await this.subjects.findOne({
      where: { subjectId: newSubjectId },
    });
    if (!newSubject) {
      throw new BadRequestException('Target subject not found.');
    }
    if (!newSubject.isActive) {
      throw new BadRequestException(
        `Subject "${newSubject.subjectCode}" is inactive.`,
      );
    }
    if (newSubject.isPlaceholder) {
      throw new BadRequestException(
        'Cannot fill a slot with another placeholder subject.',
      );
    }

    // Snapshot the placeholder label onto the prospectus row before
    // changing the FK. Falls back to the subject title if slot_label
    // was never set (e.g. rows created before this column existed).
    if (!found.slotLabel) {
      found.slotLabel = found.subject.title;
    }

    const oldSubject = found.subject;
    found.subjectId = newSubject.subjectId;
    const saved = await this.repo.save(found);

    // Deactivate the old placeholder — but only if no other prospectus
    // row still points at it. (Shouldn't happen, but defensive.)
    const stillUsed = await this.repo.count({
      where: { subjectId: oldSubject.subjectId },
    });
    if (stillUsed === 0) {
      oldSubject.isActive = false;
      await this.subjects.save(oldSubject);
    }

    return this.findOne(saved.prospectusId);
  }

  // ── Helper ──
  private ordinal(n: number): string {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
  }
}