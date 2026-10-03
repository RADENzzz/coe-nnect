import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('room')
export class Room {
  @PrimaryGeneratedColumn('identity', { name: 'room_id', type: 'bigint' })
  roomId: string;

  @Column({ name: 'room_number' })
  roomNumber: string;

  @Column()
  building: string;

  @Column({ name: 'room_type', default: 'lecture_room' })
  roomType: string;

  @Column({ type: 'integer', nullable: true })
  capacity: number | null;

  @Column({ name: 'dept_id', type: 'bigint', nullable: true })
  deptId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}