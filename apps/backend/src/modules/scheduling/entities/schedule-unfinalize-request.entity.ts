import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Schedule } from './schedule.entity';
import { User } from '../../users/entities/user.entity';

export type ScheduleUnfinalizeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

/**
 * A department head's request to unfinalize a published schedule entry.
 *
 * Published entries are visible on the public planner and the IDP feed, so a
 * DH cannot pull one back to Draft directly. The request records the reason;
 * the Dean either approves it (published -> draft) or rejects it.
 */
@Entity('schedule_unfinalize_request')
export class ScheduleUnfinalizeRequest {
  @PrimaryGeneratedColumn({ name: 'request_id', type: 'bigint' })
  requestId: string;

  @Index()
  @Column({ name: 'schedule_id', type: 'bigint' })
  scheduleId: string;

  @Column({ name: 'dept_id', type: 'bigint', nullable: true })
  deptId: string | null;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
  })
  status: ScheduleUnfinalizeRequestStatus;

  @Column({ name: 'responded_by', type: 'uuid', nullable: true })
  respondedBy: string | null;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'response_remarks', type: 'text', nullable: true })
  responseRemarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Schedule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_id' })
  schedule: Schedule;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requested_by' })
  requestedByUser: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responded_by' })
  respondedByUser: User | null;
}
