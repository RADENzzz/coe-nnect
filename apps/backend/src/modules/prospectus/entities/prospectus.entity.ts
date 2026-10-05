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

  @ManyToOne(() => Program) @JoinColumn({ name: 'program_id' })
  program: Program;

  @ManyToOne(() => Subject) @JoinColumn({ name: 'subject_id' })
  subject: Subject;
}