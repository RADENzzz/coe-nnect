import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type FacultyClass =
  | 'regular'
  | 'part_time'
  | 'visiting_lecturer'
  | 'other';

export type SyncStatus = 'pending' | 'synced' | 'failed';

@Entity('faculty')
export class Faculty {
  @PrimaryGeneratedColumn('identity', { name: 'faculty_id', type: 'bigint' })
  facultyId: string;

  @Column({ name: 'wmsu_id', unique: true, nullable: true })
  wmsuId: string | null;

  @Column({ name: 'employee_id', unique: true, nullable: true })
  employeeId: string | null;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ nullable: true })
  email: string | null;

  @Column({ nullable: true })
  contact: string | null;

  @Column({ name: 'dept_id', type: 'bigint', nullable: true })
  deptId: string | null;

  @Column({ name: 'designation_id', type: 'bigint', nullable: true })
  designationId: string | null;

  @Column({
    type: 'enum',
    enum: ['regular', 'part_time', 'visiting_lecturer', 'other'],
    enumName: 'faculty_class',
    default: 'regular',
  })
  classification: FacultyClass;

  @Column({ name: 'required_hours', type: 'numeric', nullable: true })
  requiredHours: number | null;

  @Column({
    name: 'sync_status',
    type: 'enum',
    enum: ['pending', 'synced', 'failed'],
    enumName: 'sync_status',
    default: 'pending',
  })
  syncStatus: SyncStatus;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}