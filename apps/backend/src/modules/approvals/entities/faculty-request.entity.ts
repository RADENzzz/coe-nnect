import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type FacultyRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

@Entity('faculty_request')
export class FacultyRequest {
  @PrimaryGeneratedColumn({ name: 'request_id', type: 'bigint' })
  requestId: string;

  @Column({ name: 'requesting_dept_id', type: 'bigint' })
  requestingDeptId: string;

  @Column({ name: 'target_dept_id', type: 'bigint' })
  targetDeptId: string;

  @Column({ name: 'faculty_id', type: 'bigint', nullable: true })
  facultyId: string | null;

  @Column({ name: 'subject_id', type: 'bigint' })
  subjectId: string;

  @Column({ name: 'term_id', type: 'bigint' })
  termId: string;

  @Column({ type: 'text' })
  reason: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
  })
  status: FacultyRequestStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'responded_by', type: 'uuid', nullable: true })
  respondedBy: string | null;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'response_remarks', type: 'text', nullable: true })
  responseRemarks: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}