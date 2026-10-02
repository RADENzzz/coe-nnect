import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './entities/schedule.entity';
import { Term } from '../terms/entities/term.entity';
import { PlotSubjectDto } from './dto/plot-subject.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

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

  // ────────────────────────────────────────────
  // Mutations
  // ────────────────────────────────────────────

  async plot(dto: PlotSubjectDto): Promise<Schedule> {
    const entry = this.scheduleRepo.create({
      termId: dto.termId,
      subjectId: dto.subjectId,
      facultyId: dto.facultyId ?? null,
      roomId: dto.roomId ?? null,
      timeslotId: dto.timeslotId ?? null,
      section: dto.section ?? null,
      loadType: dto.loadType ?? null,
      status: 'draft',
    });
    return this.scheduleRepo.save(entry);
  }

  /**
   * Update a schedule entry — used for drag-to-move, room changes, etc.
   */
  async update(id: string, dto: UpdateScheduleDto): Promise<Schedule> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

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

  async remove(id: string): Promise<{ success: boolean }> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');
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
}