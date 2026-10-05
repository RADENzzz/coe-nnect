import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('designation')
export class Designation {
  @PrimaryGeneratedColumn('identity', { name: 'designation_id', type: 'bigint' })
  designationId: string;

  @Column({ name: 'designation_name', unique: true })
  designationName: string;

  @Column({ name: 'release_hours', type: 'numeric', default: 0 })
  releaseHours: number;
}