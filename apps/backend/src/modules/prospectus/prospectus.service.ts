import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Prospectus } from './entities/prospectus.entity';
import { Program } from '../programs/entities/program.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { CreateProspectusDto } from './dto/create-prospectus.dto';
import { UpdateProspectusDto } from './dto/update-prospectus.dto';

export interface ProspectusCaller {
  role: string;
  deptId: string | null;
}

export interface FillSlotInput {
  subjectId?: string;
  newSubjectCode?: string;
  newSubjectTitle?: string;
}

const PG_FK_VIOLATION = '23503';

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

    if (
      caller.role === 'administrator' ||
      caller.role === 'college_dean' ||
      caller.role === 'college_secretary'
    ) {
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
      relations: ['subject'],
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');

    await this.assertProgramWriteAccess(found.programId, caller);

    const placeholder = found.subject?.isPlaceholder
      ? found.subject
      : undefined;

    await this.repo.remove(found);

    // A placeholder only exists to back its prospectus field(s). Once the
    // last field is deleted there is nothing left to fill, so remove the
    // hidden catalog row instead of leaving an unused temp subject behind.
    if (placeholder) {
      await this.deleteUnusedPlaceholder(placeholder);
    }

    return { success: true };
  }

  /**
   * Replaces a placeholder slot subject with a real elective subject.
   * Preserves the original slot label for history, then deactivates
   * the placeholder subject so it drops out of dropdowns.
   *
   * Accepts either an existing elective (`subjectId`) or a typed code
   * (`newSubjectCode`), which creates and saves a real elective subject
   * using the slot's title and units.
   */
  async fillSlot(
    prospectusId: string,
    input: string | FillSlotInput,
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

    const subjectId = (
      typeof input === 'string' ? input : input.subjectId
    )?.trim();
    const newSubjectCode = (
      typeof input === 'string' ? '' : input.newSubjectCode
    )?.trim();

    if (subjectId && newSubjectCode) {
      throw new BadRequestException(
        'Choose an existing elective or type a new code — not both.',
      );
    }
    if (!subjectId && !newSubjectCode) {
      throw new BadRequestException(
        'Choose an existing elective or type a new course code.',
      );
    }
    if (newSubjectCode && /^(ELEC|SLOT)-/i.test(newSubjectCode)) {
      throw new BadRequestException(
        'Enter a real course code, not a temporary placeholder code.',
      );
    }

    const newSubject = newSubjectCode
      ? await this.resolveOrCreateElectiveFromSlot(
          found.subject,
          newSubjectCode,
          typeof input === 'string' ? undefined : input.newSubjectTitle,
        )
      : await this.findFillTarget(subjectId!);

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

  /**
   * Adds another identical empty elective field to the same program/year/term.
   * Each copy gets a distinct placeholder subject because the prospectus
   * uniqueness key includes `subject_id`.
   */
  async duplicateSlot(
    prospectusId: string,
    caller: ProspectusCaller,
  ): Promise<Prospectus> {
    const found = await this.repo.findOne({
      where: { prospectusId },
      relations: ['subject'],
    });
    if (!found) throw new NotFoundException('Prospectus entry not found');

    await this.assertProgramWriteAccess(found.programId, caller);

    const source = found.subject;
    if (!source?.isPlaceholder) {
      throw new BadRequestException(
        'Only an empty elective field can be duplicated.',
      );
    }

    const code = await this.nextPlaceholderCopyCode(source.subjectCode);
    const copy = this.subjects.create({
      subjectCode: code,
      title: source.title,
      totalUnits: source.totalUnits,
      lectureUnits: source.lectureUnits,
      labUnits: source.labUnits,
      deptId: source.deptId,
      isActive: true,
      isPlaceholder: true,
      isMinor: false,
      isElective: true,
      unitsMode: source.unitsMode ?? 'lec_lab',
      electiveCategory: source.electiveCategory ?? null,
      electiveYearLevel: source.electiveYearLevel ?? null,
      electiveSemester: source.electiveSemester ?? null,
      requiredRoomType: source.requiredRoomType ?? null,
    });
    const savedSubject = await this.subjects.save(copy);

    const copyRow = this.repo.create({
      programId: found.programId,
      subjectId: savedSubject.subjectId,
      yearLevel: found.yearLevel,
      semester: found.semester,
      isActive: true,
      deactivatedBySubject: false,
      lectureSessionsPerWeek: found.lectureSessionsPerWeek,
      lectureMinutesPerSession: found.lectureMinutesPerSession,
      labSessionsPerWeek: found.labSessionsPerWeek,
      labMinutesPerSession: found.labMinutesPerSession,
      slotLabel: found.slotLabel ?? source.title,
    });
    const saved = await this.repo.save(copyRow);
    return this.findOne(saved.prospectusId);
  }

  // ── Slot helpers ──

  private async findFillTarget(subjectId: string): Promise<Subject> {
    const subject = await this.subjects.findOne({
      where: { subjectId },
    });
    if (!subject) {
      throw new BadRequestException('Target subject not found.');
    }
    if (!subject.isActive) {
      throw new BadRequestException(
        `Subject "${subject.subjectCode}" is inactive.`,
      );
    }
    if (subject.isPlaceholder) {
      throw new BadRequestException(
        'Cannot fill a slot with another placeholder subject.',
      );
    }
    if (!subject.isElective) {
      throw new BadRequestException(
        'Slots can only be filled with elective subjects.',
      );
    }
    return subject;
  }

  /**
   * Typed-code fill: reuse an existing elective when the code is known,
   * otherwise create a real elective subject from the slot's units.
   */
  private async resolveOrCreateElectiveFromSlot(
    slot: Subject,
    code: string,
    title?: string,
  ): Promise<Subject> {
    const existing = await this.subjects.findOne({
      where: { subjectCode: code },
    });
    if (existing) return this.findFillTarget(existing.subjectId);

    const resolvedTitle = (title ?? '').trim() || slot.title?.trim();
    if (!resolvedTitle) {
      throw new BadRequestException(
        'A title is required when creating a new elective subject.',
      );
    }

    const lec = Number(slot.lectureUnits ?? 0);
    const lab = Number(slot.labUnits ?? 0);
    let unitsMode = slot.unitsMode ?? 'lec_lab';
    if (unitsMode !== 'total_only' && lec + lab !== Number(slot.totalUnits)) {
      // Placeholders always carry a valid split, but keep the created
      // subject valid if older data stored something unusual.
      unitsMode = 'total_only';
    }

    const subject = this.subjects.create({
      subjectCode: code,
      title: resolvedTitle,
      totalUnits: slot.totalUnits,
      lectureUnits: unitsMode === 'total_only' ? 0 : lec,
      labUnits: unitsMode === 'total_only' ? 0 : lab,
      deptId: slot.deptId,
      isActive: true,
      isPlaceholder: false,
      isMinor: false,
      isElective: true,
      unitsMode,
      electiveCategory: slot.electiveCategory ?? null,
      electiveYearLevel: slot.electiveYearLevel ?? null,
      electiveSemester: slot.electiveSemester ?? null,
      requiredRoomType: slot.requiredRoomType ?? null,
    });
    return this.subjects.save(subject);
  }

  /** First free `…-C2`, `…-C3`, … code for a duplicated empty field. */
  private async nextPlaceholderCopyCode(sourceCode: string): Promise<string> {
    const base = String(sourceCode ?? '').replace(/-C\d+$/i, '') || 'ELEC';
    for (let copy = 2; copy < 1000; copy += 1) {
      const code = `${base}-C${copy}`;
      const exists = await this.subjects.findOne({
        where: { subjectCode: code },
      });
      if (!exists) return code;
    }
    throw new BadRequestException('Could not allocate a copy code.');
  }

  /**
   * Remove a placeholder subject that is no longer referenced by any
   * prospectus row. If historical data still points at it, deactivate
   * instead so the delete can never fail on a foreign key.
   */
  private async deleteUnusedPlaceholder(placeholder: Subject): Promise<void> {
    const stillUsed = await this.repo.count({
      where: { subjectId: placeholder.subjectId },
    });
    if (stillUsed > 0) return;

    try {
      await this.subjects.delete({ subjectId: placeholder.subjectId });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as any).driverError?.code === PG_FK_VIOLATION
      ) {
        placeholder.isActive = false;
        await this.subjects.save(placeholder);
        return;
      }
      throw err;
    }
  }

  // ── Helper ──
  private ordinal(n: number): string {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
  }
}