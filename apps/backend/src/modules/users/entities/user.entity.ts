import { Entity, PrimaryColumn, Column } from 'typeorm';

export type UserRole = 'administrator' | 'college_dean' | 'department_head' | 'viewer';

@Entity('users')
export class User {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'employee_id', nullable: true })
  employeeId: string | null;

  @Column({ name: 'wmsu_id', nullable: true })
  wmsuId: string | null;

  @Column({ type: 'enum', enum: ['administrator', 'college_dean', 'department_head', 'viewer'] })
  role: UserRole;

  @Column({ name: 'dept_id', type: 'bigint', nullable: true })
  deptId: string | null;

  @Column({ name: 'faculty_id', type: 'bigint', nullable: true })
  facultyId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}