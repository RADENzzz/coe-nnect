import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Room } from './room.entity';
import { Department } from '../../departments/entities/department.entity';

/**
 * A soft preference: departments flag shared rooms they'd like their
 * auto-generated schedules to favor. Owned rooms can't be preferred —
 * enforced by a DB trigger.
 *
 * Priority:
 *   1 = preferred (default)
 *   2 = strongly preferred
 *   3 = reserved-if-possible
 */
@Entity('room_preference')
@Unique('uq_room_preference_room_dept', ['roomId', 'deptId'])
@Index('idx_room_preference_dept', ['deptId'])
@Index('idx_room_preference_room', ['roomId'])
export class RoomPreference {
  @PrimaryGeneratedColumn('identity', {
    name: 'preference_id',
    type: 'bigint',
  })
  preferenceId: string;

  @Column({ name: 'room_id', type: 'bigint' })
  roomId: string;

  @Column({ name: 'dept_id', type: 'bigint' })
  deptId: string;

  @Column({ name: 'priority', type: 'smallint', default: 1 })
  priority: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @ManyToOne(() => Department, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dept_id' })
  department: Department;
}