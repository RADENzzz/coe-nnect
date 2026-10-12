import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type SemesterType = '1st' | '2nd' | 'summer';

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

  // ═══ Semester — used by the solver to filter the prospectus ═══
  // NULL means "not yet classified" — but creation is now required
  // to set it, so this should never be null for new terms.
  @Column({
    name: 'semester',
    type: 'text',
    nullable: true,
  })
  semester: SemesterType | null;
}