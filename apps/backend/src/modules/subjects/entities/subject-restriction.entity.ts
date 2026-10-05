import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('subject_restriction')
export class SubjectRestriction {
  @PrimaryGeneratedColumn('identity', {
    name: 'restriction_id',
    type: 'bigint',
  })
  restrictionId: string;

  @Column({ name: 'subject_id_1', type: 'bigint' })
  subjectId1: string;

  @Column({ name: 'subject_id_2', type: 'bigint' })
  subjectId2: string;

  @Column({ name: 'term_id', type: 'bigint', nullable: true })
  termId: string | null;

  @Column({ name: 'warning_message', type: 'text', nullable: true })
  warningMessage: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;
}