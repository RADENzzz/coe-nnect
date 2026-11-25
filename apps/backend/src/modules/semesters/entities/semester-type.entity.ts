import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('semester_type')
export class SemesterType {
  @PrimaryColumn({ type: 'text' })
  code: string;

  @Column({ type: 'text' })
  label: string;

  @Column({ name: 'short_label', type: 'text' })
  shortLabel: string;

  @Column({ name: 'sort_order', type: 'smallint' })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
