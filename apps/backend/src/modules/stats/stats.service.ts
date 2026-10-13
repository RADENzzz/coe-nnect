import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Room } from '../rooms/entities/room.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { Section } from '../sections/entities/section.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Term } from '../terms/entities/term.entity';
import { User } from '../users/entities/user.entity';

export interface StatsOverview {
  activeDepartments: number;
  activeFaculty: number;
  activeSubjects: number;
  activeRooms: number;
  activeSections: number;
  scheduleEntries: number;
  academicTerms: number;
  activeAccounts: number;
}

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    @InjectRepository(Faculty)
    private readonly faculty: Repository<Faculty>,
    @InjectRepository(Subject)
    private readonly subjects: Repository<Subject>,
    @InjectRepository(Room)
    private readonly rooms: Repository<Room>,
    @InjectRepository(Section)
    private readonly sections: Repository<Section>,
    @InjectRepository(Schedule)
    private readonly schedules: Repository<Schedule>,
    @InjectRepository(Term)
    private readonly terms: Repository<Term>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async getOverview(): Promise<StatsOverview> {
    const [
      activeDepartments,
      activeFaculty,
      activeSubjects,
      activeRooms,
      activeSections,
      scheduleEntries,
      academicTerms,
      activeAccounts,
    ] = await Promise.all([
      this.departments.count({ where: { isActive: true } }),
      this.faculty.count({ where: { isActive: true } }),
      this.subjects.count({ where: { isActive: true } }),
      this.rooms.count({ where: { isActive: true } }),
      this.sections.count({ where: { isActive: true } }),
      this.schedules.count(),
      this.terms.count(),
      this.users.count({ where: { isActive: true } }),
    ]);

    return {
      activeDepartments,
      activeFaculty,
      activeSubjects,
      activeRooms,
      activeSections,
      scheduleEntries,
      academicTerms,
      activeAccounts,
    };
  }
}
