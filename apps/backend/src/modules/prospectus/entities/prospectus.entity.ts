import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Program } from '../../programs/entities/program.entity';
import { Subject } from '../../subjects/entities/subject.entity';

export type SemesterType = '1st' | '2nd' | 'summer';

@Entity('prospectus')
export class Prospectus {
  @PrimaryGeneratedColumn('identity', {
    name: 'prospectus_id',
    type: 'bigint',
  })
  prospectusId: string;

  @Column({ name: 'program_id', type: 'bigint' })
  programId: string;

  @Column({ name: 'subject_id', type: 'bigint' })
  subjectId: string;

  @Column({ name: 'year_level', type: 'smallint' })
  yearLevel: number;

  @Column({
    type: 'enum',
    enum: ['1st', '2nd', 'summer'],
    enumName: 'semester_type',
  })
  semester: SemesterType;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // ── Multi-session scheduling (Phase 2) ──
  @Column({ name: 'lecture_sessions_per_week', type: 'smallint', default: 1 })
  lectureSessionsPerWeek: number;

  @Column({
    name: 'lecture_minutes_per_session',
    type: 'smallint',
    default: 90,
  })
  lectureMinutesPerSession: number;

  @Column({ name: 'lab_sessions_per_week', type: 'smallint', default: 1 })
  labSessionsPerWeek: number;

  @Column({ name: 'lab_minutes_per_session', type: 'smallint', default: 180 })
  labMinutesPerSession: number;

  @ManyToOne(() => Program) @JoinColumn({ name: 'program_id' })
  program: Program;

  @ManyToOne(() => Subject) @JoinColumn({ name: 'subject_id' })
  subject: Subject;
}