import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A frozen snapshot of an entire term's schedule, written when a
 * schedule transitions to 'finalized'.
 *
 * Scope: term-wide versions use faculty_id = NULL. Per-faculty versions
 * (faculty_id set) are reserved for a future feature and not written
 * by the current code path.
 *
 * FR 5.1.8(a) — Assign Schedule Version.
 */
@Entity({ name: 'schedule_version' })
export class ScheduleVersion {
  @PrimaryGeneratedColumn({ name: 'version_id', type: 'bigint' })
  versionId!: string;

  @Column({ name: 'term_id', type: 'bigint' })
  termId!: string;

  @Column({ name: 'faculty_id', type: 'bigint', nullable: true })
  facultyId!: string | null;

  @Column({ name: 'version_number', type: 'integer' })
  versionNumber!: number;

  @Column({ name: 'snapshot', type: 'jsonb', nullable: true })
  snapshot!: Record<string, unknown> | null;

  @Column({
    name: 'last_modified_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastModifiedAt!: Date;

  @Column({ name: 'finalized_by', type: 'uuid', nullable: true })
  finalizedBy!: string | null;
}