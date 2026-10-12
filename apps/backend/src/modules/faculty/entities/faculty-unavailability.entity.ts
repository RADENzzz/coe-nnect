import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A single unavailable window declared for a faculty member.
 *
 * Semantics: during this window, the faculty member cannot teach.
 * The engine (rule H-14) treats overlaps as hard conflicts.
 *
 * Scope:
 *   - term_id NULL → applies to all terms
 *   - term_id set  → applies only to that term
 *
 * Source:
 *   - 'local' → manually entered in CoE-NNECT (DH or Admin on behalf of faculty)
 *   - 'idp'   → synced from IDP; matched by external_id
 */
@Entity({ name: 'faculty_unavailability' })
export class FacultyUnavailability {
  @PrimaryGeneratedColumn({
    name: 'unavailability_id',
    type: 'bigint',
  })
  unavailabilityId!: string;

  @Column({ name: 'faculty_id', type: 'bigint' })
  facultyId!: string;

  @Column({ name: 'term_id', type: 'bigint', nullable: true })
  termId!: string | null;

  /** Full day name — Monday..Sunday (matches the DB enum). */
  @Column({ name: 'day_of_week', type: 'text' })
  dayOfWeek!: string;

  /** 'HH:MM:SS' string (Postgres `time` maps to string in TypeORM). */
  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason!: string | null;

  @Column({
    name: 'source',
    type: 'text',
    default: 'local',
  })
  source!: 'local' | 'idp';

  @Column({ name: 'external_id', type: 'text', nullable: true })
  externalId!: string | null;

  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}