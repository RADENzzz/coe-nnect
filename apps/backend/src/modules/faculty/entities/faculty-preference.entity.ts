import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Faculty } from './faculty.entity';

export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

@Entity('faculty_preference')
export class FacultyPreference {
  @PrimaryGeneratedColumn({ name: 'preference_id', type: 'bigint' })
  preferenceId!: string;

  @Column({ name: 'faculty_id', type: 'bigint' })
  facultyId!: string;

  @Column({ name: 'preferred_day', type: 'enum', enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] })
  preferredDay!: DayOfWeek;

  @Column({ name: 'preferred_start_time', type: 'time' })
  preferredStartTime!: string;

  @Column({ name: 'preferred_end_time', type: 'time' })
  preferredEndTime!: string;

  @ManyToOne(() => Faculty, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'faculty_id' })
  faculty?: Faculty;
}