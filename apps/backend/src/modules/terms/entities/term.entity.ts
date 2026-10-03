import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('term')
export class Term {
  @PrimaryGeneratedColumn('identity', { name: 'term_id', type: 'bigint' })
  termId: string;

  @Column({ name: 'term_name' })
  termName: string;

  @Column({ name: 'school_year' })
  schoolYear: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'is_active', default: false })
  isActive: boolean;
}