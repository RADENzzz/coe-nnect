import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('department')
export class Department {
  @PrimaryGeneratedColumn('identity', { name: 'dept_id', type: 'bigint' })
  deptId: string;

  @Column({ name: 'dept_code', unique: true })
  deptCode: string;

  @Column({ name: 'dept_name' })
  deptName: string;

  @Column({ nullable: true })
  description: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}