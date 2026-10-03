import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

@Entity('time_slot')
export class TimeSlot {
  @PrimaryGeneratedColumn('identity', { name: 'timeslot_id', type: 'bigint' })
  timeslotId: string;

  @Column({ name: 'day_of_week', type: 'enum', enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] })
  dayOfWeek: DayOfWeek;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;
}