import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('program')
export class Program {
  @PrimaryGeneratedColumn('identity', { name: 'program_id', type: 'bigint' })
  programId: string;

  @Column({ name: 'program_code', unique: true })
  programCode: string;

  @Column({ name: 'program_name' })
  programName: string;

  @Column({ name: 'dept_id', type: 'bigint' })
  deptId: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}