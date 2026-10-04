import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('section')
export class Section {
  @PrimaryGeneratedColumn({ name: 'section_id', type: 'bigint' })
  sectionId: string;

  @Index({ unique: true })
  @Column({ name: 'section_code', type: 'text' })
  sectionCode: string;

  @Column({ name: 'program_id', type: 'bigint', nullable: true })
  programId: string | null;

  @Column({ name: 'year_level', type: 'smallint', nullable: true })
  yearLevel: number | null;

  @Column({ name: 'student_count', type: 'int', nullable: true })
  studentCount: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}