import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type SubjectEditRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'revoked';

@Entity('subject_edit_request')
export class SubjectEditRequest {
  @PrimaryGeneratedColumn('identity', { name: 'request_id', type: 'bigint' })
  requestId: string;

  @Column({ name: 'subject_id', type: 'bigint' })
  subjectId: string;

  @Column({ name: 'requesting_dept_id', type: 'bigint' })
  requestingDeptId: string;

  @Column({ name: 'owning_dept_id', type: 'bigint' })
  owningDeptId: string;

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'revoked'],
    enumName: 'subject_edit_request_status',
    default: 'pending',
  })
  status: SubjectEditRequestStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'responded_by', type: 'uuid', nullable: true })
  respondedBy: string | null;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'response_remarks', type: 'text', nullable: true })
  responseRemarks: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
