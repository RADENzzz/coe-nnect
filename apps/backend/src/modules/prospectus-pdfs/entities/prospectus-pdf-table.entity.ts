import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProspectusPdf } from './prospectus-pdf.entity';

export type ColumnRole =
  | 'code'
  | 'title'
  | 'prereq'
  | 'lec'
  | 'lab'
  | 'total';

export interface ColumnSliceSpec {
  role: ColumnRole;
  x_start_pt: number;
  x_end_pt: number;
}

export interface RowSpec {
  row_id: string;
  y_top_pt: number;
  y_bottom_pt: number;
}

@Entity({ name: 'prospectus_pdf_table' })
@Unique('uq_prospectus_pdf_table_ys', ['pdfId', 'yearLevel', 'semester'])
@Index('idx_prospectus_pdf_table_pdf', ['pdfId'])
export class ProspectusPdfTable {
  @PrimaryGeneratedColumn({ name: 'table_id', type: 'bigint' })
  tableId!: string;

  @Column({ name: 'pdf_id', type: 'bigint' })
  pdfId!: string;

  @Column({ name: 'year_level', type: 'smallint' })
  yearLevel!: number;

  @Column({ name: 'semester', type: 'text' })
  semester!: '1st' | '2nd' | 'summer';

  @Column({ name: 'label', type: 'text', nullable: true })
  label!: string | null;

  @Column({ name: 'region_page_index', type: 'int' })
  regionPageIndex!: number;

  @Column({
    name: 'region_x_start_pt',
    type: 'numeric',
    precision: 10,
    scale: 4,
  })
  regionXStartPt!: string;

  @Column({
    name: 'region_x_end_pt',
    type: 'numeric',
    precision: 10,
    scale: 4,
  })
  regionXEndPt!: string;

  @Column({
    name: 'region_y_start_pt',
    type: 'numeric',
    precision: 10,
    scale: 4,
  })
  regionYStartPt!: string;

  @Column({
    name: 'region_y_end_pt',
    type: 'numeric',
    precision: 10,
    scale: 4,
  })
  regionYEndPt!: string;

  @Column({ name: 'columns', type: 'jsonb' })
  columns!: ColumnSliceSpec[];

  @Column({ name: 'rows', type: 'jsonb' })
  rows!: RowSpec[];

  @Column({ name: 'subject_count', type: 'int', default: 0 })
  subjectCount!: number;

  @Column({ name: 'total_lec_units', type: 'int', default: 0 })
  totalLecUnits!: number;

  @Column({ name: 'total_lab_units', type: 'int', default: 0 })
  totalLabUnits!: number;

  @Column({ name: 'total_units', type: 'int', default: 0 })
  totalUnits!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => ProspectusPdf, (p) => p.tables, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pdf_id' })
  pdf!: ProspectusPdf;
}