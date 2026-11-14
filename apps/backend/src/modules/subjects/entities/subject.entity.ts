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

  @Column({ name: 'is_placeholder', type: 'boolean', default: false })
  isPlaceholder!: boolean;

  /**
   * True if the subject is taught by another department or college
   * (Math, GenEd, PE, EPIC, NSTP, etc.). Minor subjects are plotted
   * manually first and treated as fixed obstacles by auto-generate.
   */
  @Column({ name: 'is_minor', type: 'boolean', default: false })
  isMinor: boolean;

  /**
   * True when this catalog entry is an elective subject. Electives may use a
   * total-only units mode and are plotted before regular subjects.
   */
  @Column({ name: 'is_elective', type: 'boolean', default: false })
  isElective!: boolean;

  /**
   * `lec_lab` stores a lecture/lab split. `total_only` stores only the total
   * and keeps both component columns at zero; it is valid for electives only.
   */
  @Column({ name: 'units_mode', type: 'text', default: 'lec_lab' })
  unitsMode!: 'lec_lab' | 'total_only';

  /**
   * Free-text group shown in elective filters and grouped dropdowns
   * (for example "GEC" or "Major"). Null for regular subjects.
   */
  @Column({ name: 'elective_category', type: 'text', nullable: true })
  electiveCategory: string | null;

  /** Preferred year level (1-6), or null when the elective fits any year. */
  @Column({ name: 'elective_year_level', type: 'smallint', nullable: true })
  electiveYearLevel: number | null;

  /** Preferred semester, or null when the elective fits any term. */
  @Column({ name: 'elective_semester', type: 'text', nullable: true })
  electiveSemester: '1st' | '2nd' | 'summer' | null;

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