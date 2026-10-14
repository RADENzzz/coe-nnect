import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('subject')
export class Subject {
  @PrimaryGeneratedColumn('identity', { name: 'subject_id', type: 'bigint' })
  subjectId: string;

  @Column({ name: 'subject_code', unique: true })
  subjectCode: string;

  @Column()
  title: string;

  @Column({ name: 'total_units', type: 'numeric' })
  totalUnits: number;

  @Column({ name: 'lecture_units', type: 'numeric', default: 0 })
  lectureUnits: number;

  @Column({ name: 'lab_units', type: 'numeric', default: 0 })
  labUnits: number;

  @Column({ name: 'dept_id', type: 'bigint', nullable: true })
  deptId: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * True if the subject is taught by another department or college
   * (Math, GenEd, PE, EPIC, NSTP, etc.). Minor subjects are plotted
   * manually first and treated as fixed obstacles by auto-generate.
   */
  @Column({ name: 'is_minor', type: 'boolean', default: false })
  isMinor: boolean;

  /**
   * Room type constraint for the subject.
   *
   * - 'lecture_room' / 'laboratory' / 'computer_lab' / 'drafting_room' / 'other'
   *     → strict: every block must use this room type.
   * - 'any' → mixed lec+lab subjects. The block kind decides.
   * - null → treated the same as 'any' by the engine and solver.
   */
  @Column({
    name: 'required_room_type',
    type: 'enum',
    enum: [
      'lecture_room',
      'laboratory',
      'computer_lab',
      'drafting_room',
      'other',
      'any',
    ],
    enumName: 'room_type',
    nullable: true,
  })
  requiredRoomType: string | null;
}