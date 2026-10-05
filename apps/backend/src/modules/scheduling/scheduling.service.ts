import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './entities/schedule.entity';
import { Term } from '../terms/entities/term.entity';
import { Section } from '../sections/entities/section.entity';
import { PlotSubjectDto } from './dto/plot-subject.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ValidatePlotDto } from './dto/validate-plot.dto';
import { ConstraintsService } from '../constraints/constraints.service';
import { RuleContextBuilder } from './services/rule-context.builder';

type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

@Injectable()
export class SchedulingService {
  constructor(
  @InjectRepository(Schedule) private scheduleRepo: Repository<Schedule>,
  @InjectRepository(Term) private termRepo: Repository<Term>,
  @InjectRepository(Section) private sectionRepo: Repository<Section>,
  private readonly ruleContextBuilder: RuleContextBuilder,
  private readonly constraints: ConstraintsService,
  ) {}

  // ────────────────────────────────────────────
  // Queries
  // ────────────────────────────────────────────

  async getActiveTerm(): Promise<Term | null> {
    return this.termRepo.findOne({ where: { isActive: true } });
  }

  async findByTerm(termId: string): Promise<Schedule[]> {
    return this.scheduleRepo.find({
      where: { termId },
      relations: ['subject', 'faculty', 'room', 'timeSlot'],
      order: { scheduleId: 'ASC' },
    });
  }

  async findAll(): Promise<Schedule[]> {
    return this.scheduleRepo.find({
      relations: ['subject', 'faculty', 'room', 'timeSlot'],
      order: { scheduleId: 'ASC' },
    });
  }


async validate(dto: ValidatePlotDto): Promise<{
  valid: boolean;
  hardConflicts: Array<{ ruleId: string; ruleName: string; reason: string }>;
  softWarnings: Array<{ ruleId: string; ruleName: string; reason: string }>;
  alternatives: unknown[];
}> {
  // ── Pre-flight guards (not full rules — just structural validation) ──
  const guards: Array<{ ruleId: string; ruleName: string; reason: string }> = [];

  const startMin = this.timeToMinutes(dto.startTime);
  const endMin = this.timeToMinutes(dto.endTime);

  if (endMin <= startMin) {
    guards.push({
      ruleId: 'H-7',
      ruleName: 'Time Ordering',
      reason: 'End time must be after start time.',
    });
  }

  if (startMin < 7 * 60) {
    guards.push({
      ruleId: 'H-8',
      ruleName: 'Operating Hours',
      reason: 'Class cannot start before 7:00 AM.',
    });
  }
  if (endMin > 19 * 60) {
    guards.push({
      ruleId: 'H-8',
      ruleName: 'Operating Hours',
      reason: 'Class cannot end after 7:00 PM.',
    });
  }

  // If guards fail, return immediately — no point running the engine.
  if (guards.length > 0) {
    return {
      valid: false,
      hardConflicts: guards,
      softWarnings: [],
      alternatives: [],
    };
  }

  // ── Full engine pass ──
  const context = await this.ruleContextBuilder.build({
    termId: dto.termId,
    subjectId: dto.subjectId,
    facultyId: dto.facultyId,
    roomId: dto.roomId,
    section: dto.section,
    dayOfWeek: dto.dayOfWeek,
    startTime: dto.startTime,
    endTime: dto.endTime,
    loadType: dto.loadType,
    excludeScheduleId: dto.excludeId,
  });

  const engineResult = this.constraints.evaluate(context);

  return {
    valid: engineResult.valid,
    hardConflicts: engineResult.hardConflicts,
    softWarnings: engineResult.softWarnings,
    alternatives: [],
  };
}

    async updateRemarks(id: string, remarks: string | null): Promise<Schedule> {
    const found = await this.scheduleRepo.findOne({
        where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');
    found.remarks = remarks;
    return this.scheduleRepo.save(found);
    }

    

  // ────────────────────────────────────────────
  // Mutations
  // ────────────────────────────────────────────

  async plot(dto: PlotSubjectDto): Promise<Schedule> {
    if (!dto.facultyId) {
      throw new BadRequestException('facultyId is required to plot a subject.');
    }

  const sectionId = await this.resolveSectionId(dto.section);

  const entry = this.scheduleRepo.create({
    termId: dto.termId,
    subjectId: dto.subjectId,
    facultyId: dto.facultyId ?? null,
    roomId: dto.roomId ?? null,
    timeslotId: null,
    section: dto.section ?? null,
    sectionId,                              // ← NEW
    loadType: dto.loadType ?? null,
    dayOfWeek: dto.dayOfWeek as any,
    startTime:
      dto.startTime.length === 5 ? `${dto.startTime}:00` : dto.startTime,
    endTime: dto.endTime.length === 5 ? `${dto.endTime}:00` : dto.endTime,
    status: 'draft',
  });
  return this.scheduleRepo.save(entry);
}

  /**
   * Update a schedule entry — used for drag-to-move, room changes, etc.
   */
  /**
   * Update a schedule entry — used for drag-to-move, room changes, etc.
   * LOCKED entries (finalized/published) cannot be edited — unfinalize first.
   */
  async update(id: string, dto: UpdateScheduleDto): Promise<Schedule> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    // ── Lock check (FR 5.1.5 / 5.1.6) ──
    if (found.status === 'finalized' || found.status === 'published') {
      throw new BadRequestException(
        'This schedule entry is locked. Unfinalize it before making changes.',
      );
    }

    // Normalize "08:30" → "08:30:00"
    const normalizeTime = (t?: string) => {
      if (!t) return undefined;
      if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
      return t;
    };

    // Validate start < end (if both are provided or derivable)
    const newStart = normalizeTime(dto.startTime) ?? found.startTime;
    const newEnd = normalizeTime(dto.endTime) ?? found.endTime;

    if (newStart && newEnd) {
      const startMin = this.timeToMinutes(newStart);
      const endMin = this.timeToMinutes(newEnd);
      if (endMin <= startMin) {
        throw new BadRequestException('endTime must be after startTime');
      }
    }

    if (dto.dayOfWeek !== undefined) {
      found.dayOfWeek = dto.dayOfWeek as DayOfWeek;
    }
    if (dto.startTime !== undefined) {
      found.startTime = normalizeTime(dto.startTime) ?? null;
    }
    if (dto.endTime !== undefined) {
      found.endTime = normalizeTime(dto.endTime) ?? null;
    }
    if (dto.roomId !== undefined) {
      found.roomId = dto.roomId;
    }
    if (dto.facultyId !== undefined) {
      found.facultyId = dto.facultyId;
    }
    if (dto.section !== undefined) {
      found.section = dto.section ?? null;
      found.sectionId = await this.resolveSectionId(dto.section);
    }

    return this.scheduleRepo.save(found);
  }

  async updateStatus(
    id: string,
    status: Schedule['status'],
  ): Promise<Schedule> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException();
    found.status = status;
    return this.scheduleRepo.save(found);
  }

  /**
   * Delete a schedule entry.
   * LOCKED entries (finalized/published) cannot be deleted — unfinalize first.
   */
  async remove(id: string): Promise<{ success: boolean }> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    // ── Lock check (FR 5.1.5 / 5.1.6) ──
    if (found.status === 'finalized' || found.status === 'published') {
      throw new BadRequestException(
        'This schedule entry is locked. Unfinalize it before deleting.',
      );
    }

    await this.scheduleRepo.delete(id);
    return { success: true };
  }

  // ────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────

  private timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  /**
   * Resolve a section_code (e.g. "BSCPE-4A") to its section_id.
   * Returns null for empty/unknown codes so legacy rows and minor-subject
   * plots don't break — H-3 will simply skip them, same as today.
   */
  private async resolveSectionId(
    sectionCode?: string | null,
  ): Promise<string | null> {
    if (!sectionCode) return null;
    const section = await this.sectionRepo.findOne({
      where: { sectionCode },
      select: ['sectionId'],
    });
    return section?.sectionId ?? null;
  }
}