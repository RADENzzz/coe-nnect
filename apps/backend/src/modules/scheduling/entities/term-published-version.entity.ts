import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A saved snapshot of a term's published schedule, rewritten in place when
 * publication is saved or deactivated. A deleted term detaches the row rather
 * than removing it, so the archive remains addressable by id.
 */
@Entity('term_published_version')
export class TermPublishedVersion {
  @PrimaryGeneratedColumn({
    name: 'term_published_version_id',
    type: 'bigint',
  })
  termPublishedVersionId!: string;

  @Index()
  @Column({ name: 'term_id', type: 'bigint', nullable: true })
  termId!: string | null;

  @Column({ name: 'version_number', type: 'integer', default: 1 })
  versionNumber!: number;

  @Column({ name: 'term_name', type: 'text' })
  termName!: string;

  @Column({ name: 'semester', type: 'text', nullable: true })
  semester!: string | null;

  @Column({ name: 'school_year', type: 'text' })
  schoolYear!: string;

  @Column({ name: 'snapshot', type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'last_modified_by', type: 'uuid', nullable: true })
  lastModifiedBy!: string | null;
}
