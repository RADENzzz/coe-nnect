import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Subject } from '../../subjects/entities/subject.entity';
import { Faculty } from '../../faculty/entities/faculty.entity';
import { Room } from '../../rooms/entities/room.entity';
import { Term } from '../../terms/entities/term.entity';
import { TimeSlot } from './time-slot.entity';

export type ScheduleStatus = 'draft' | 'review' | 'finalized' | 'published';
export type LoadType = 'lecture' | 'laboratory' | 'other';
export type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

@Entity('schedule')
export class Schedule {
  @PrimaryGeneratedColumn('identity', { name: 'schedule_id', type: 'bigint' })
  scheduleId: string;

  @Column({ name: 'term_id', type: 'bigint' })
  termId: string;

  @Column({ name: 'subject_id', type: 'bigint' })
  subjectId: string;

  @Column({ name: 'faculty_id', type: 'bigint', nullable: true })
  facultyId: string | null;

  @Column({ name: 'room_id', type: 'bigint', nullable: true })
  roomId: string | null;

  @Column({ name: 'timeslot_id', type: 'bigint', nullable: true })
  timeslotId: string | null;

  @Column({ nullable: true })
  section: string | null;

  @Column({
    name: 'load_type',
    type: 'enum',
    enum: ['lecture', 'laboratory', 'other'],
    nullable: true,
  })
  loadType: LoadType | null;

  // ── NEW: day/time columns (added in schema v2) ──
  @Column({
    name: 'day_of_week',
    type: 'enum',
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    nullable: true,
  })
  dayOfWeek: DayOfWeek | null;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'review', 'finalized', 'published'],
    default: 'draft',
  })
  status: ScheduleStatus;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @ManyToOne(() => Subject) @JoinColumn({ name: 'subject_id' }) subject: Subject;
  @ManyToOne(() => Faculty) @JoinColumn({ name: 'faculty_id' }) faculty: Faculty;
  @ManyToOne(() => Room) @JoinColumn({ name: 'room_id' }) room: Room;
  @ManyToOne(() => TimeSlot) @JoinColumn({ name: 'timeslot_id' }) timeSlot: TimeSlot;
  @ManyToOne(() => Term) @JoinColumn({ name: 'term_id' }) term: Term;
}