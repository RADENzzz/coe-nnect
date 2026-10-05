import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('audit_trail')
export class AuditTrail {
  @PrimaryGeneratedColumn('identity', { name: 'audit_id', type: 'bigint' })
  auditId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  timestamp: Date;

  @Column({ type: 'text' })
  action: string;

  @Column({ name: 'affected_data', type: 'jsonb', nullable: true })
  affectedData: Record<string, unknown> | null;

  @Column({ name: 'source_system', type: 'text', nullable: true })
  sourceSystem: string | null;

  // ── Relations ──
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}