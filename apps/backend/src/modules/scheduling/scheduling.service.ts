import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './entities/schedule.entity';
import { Term } from '../terms/entities/term.entity';
import { PlotSubjectDto } from './dto/plot-subject.dto';

@Injectable()
export class SchedulingService {
  constructor(
    @InjectRepository(Schedule) private scheduleRepo: Repository<Schedule>,
    @InjectRepository(Term) private termRepo: Repository<Term>,
  ) {}

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

  async remove(id: string): Promise<{ success: boolean }> {
    const found = await this.scheduleRepo.findOne({
      where: { scheduleId: id },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');
    await this.scheduleRepo.delete(id);
    return { success: true };
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
}