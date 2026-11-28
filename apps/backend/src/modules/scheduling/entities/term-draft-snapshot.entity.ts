import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A named, term-scoped draft of the live draft/review timetable rows for one
 * department. The denormalized term labels provide the saved-folder heading;
 * rows are locked to the term in which they were saved.
 */
@Entity('term_draft_snapshot')
export class TermDraftSnapshot {
  @PrimaryGeneratedColumn({
    name: 'term_draft_snapshot_id',
    type: 'bigint',
  })
  termDraftSnapshotId!: string;

  @Index()
  @Column({ name: 'term_id', type: 'bigint' })
  termId!: string;

  @Index()
  @Column({ name: 'dept_id', type: 'bigint' })
  deptId!: string;

  @Column({ name: 'name', type: 'text' })
  name!: string;

  @Column({ name: 'term_name', type: 'text' })
  termName!: string;

  @Column({ name: 'semester', type: 'text', nullable: true })
  semester!: string | null;

  @Column({ name: 'school_year', type: 'text' })
  schoolYear!: string;

  @Column({ name: 'snapshot', type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
