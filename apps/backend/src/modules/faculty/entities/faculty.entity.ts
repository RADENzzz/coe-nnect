import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('faculty')
export class Faculty {
  @PrimaryGeneratedColumn('identity', { name: 'faculty_id', type: 'bigint' })
  facultyId: string;

  @Column({ name: 'wmsu_id', unique: true, nullable: true })
  wmsuId: string | null;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ nullable: true })
  email: string | null;

  @Column({ name: 'dept_id', type: 'bigint', nullable: true })
  deptId: string | null;

  @Column({ name: 'designation_id', type: 'bigint', nullable: true })
  designationId: string | null;

  @Column({ default: 'regular' })
  classification: string;

  @Column({ name: 'required_hours', type: 'numeric', nullable: true })
  requiredHours: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}