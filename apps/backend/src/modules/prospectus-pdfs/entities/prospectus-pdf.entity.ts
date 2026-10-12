import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProspectusPdfTable } from './prospectus-pdf-table.entity';

@Entity({ name: 'prospectus_pdf' })
@Index('idx_prospectus_pdf_dept', ['departmentId'], {
  where: '"deleted_at" IS NULL',
})
export class ProspectusPdf {
  @PrimaryGeneratedColumn({ name: 'pdf_id', type: 'bigint' })
  pdfId!: string;

  @Column({ name: 'department_id', type: 'bigint' })
  departmentId!: string;

  @Column({ name: 'original_filename', type: 'text' })
  originalFilename!: string;

  @Column({ name: 'storage_path', type: 'text' })
  storagePath!: string;

  @Column({
    name: 'storage_bucket',
    type: 'text',
    default: 'prospectus-pdfs',
  })
  storageBucket!: string;

  @Column({ name: 'file_size_bytes', type: 'bigint' })
  fileSizeBytes!: string;

  @Column({ name: 'page_count', type: 'int' })
  pageCount!: number;

  @Column({ name: 'page_width_pt', type: 'numeric', precision: 10, scale: 4 })
  pageWidthPt!: string;

  @Column({ name: 'page_height_pt', type: 'numeric', precision: 10, scale: 4 })
  pageHeightPt!: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy!: string | null;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => ProspectusPdfTable, (t) => t.pdf)
  tables!: ProspectusPdfTable[];
}