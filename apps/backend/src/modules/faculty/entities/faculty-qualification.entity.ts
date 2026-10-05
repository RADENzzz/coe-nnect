import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Faculty } from './faculty.entity';
import { Subject } from '../../subjects/entities/subject.entity';

@Entity('faculty_qualification')
export class FacultyQualification {
  @PrimaryGeneratedColumn('identity', { name: 'qual_id', type: 'bigint' })
  qualId: string;

  @Column({ name: 'faculty_id', type: 'bigint' })
  facultyId: string;

  @Column({ name: 'subject_id', type: 'bigint' })
  subjectId: string;

  @Column({ name: 'source_system', type: 'text', nullable: true })
  sourceSystem: string | null;

  @ManyToOne(() => Faculty) @JoinColumn({ name: 'faculty_id' })
  faculty: Faculty;

  @ManyToOne(() => Subject) @JoinColumn({ name: 'subject_id' })
  subject: Subject;
}