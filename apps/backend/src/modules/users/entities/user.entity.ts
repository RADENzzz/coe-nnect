import { Entity, PrimaryColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { Faculty } from '../../faculty/entities/faculty.entity';
import { Department } from '../../departments/entities/department.entity';

/**
 * Kept in sync with the Postgres `user_role` enum.
 * See common/decorators/roles.decorator.ts for the full explanation.
 *
 * The `administrator` value is retained for the hidden dev account.
 * The `viewer` value is retained for enum sync but has zero active users.
 * User-facing role assignment is restricted in UsersService/DTOs.
 */
export type UserRole =
  | 'administrator'
  | 'college_dean'
  | 'department_head'
  | 'viewer';

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

  @Column({
    type: 'enum',
    enum: ['administrator', 'college_dean', 'department_head', 'viewer'],
  })
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

  // ── Relations (used by AuthService to resolve dept + first name) ──
  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'dept_id' })
  department: Department | null;

  @ManyToOne(() => Faculty, { nullable: true })
  @JoinColumn({ name: 'faculty_id' })
  faculty: Faculty | null;
}