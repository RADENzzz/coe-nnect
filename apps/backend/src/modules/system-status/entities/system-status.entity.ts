import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SystemStatusSeverity =
  | 'info'
  | 'warning'
  | 'critical'
  | 'maintenance';

@Entity('system_status')
export class SystemStatus {
  @PrimaryColumn({ name: 'status_id', type: 'smallint' })
  statusId: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'text', default: 'info' })
  severity: SystemStatusSeverity;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  /**
   * App-wide access gate. When true, only the hidden developer
   * (`administrator`) account may sign in or call the API.
   */
  @Column({ name: 'maintenance_mode', type: 'boolean', default: false })
  maintenanceMode: boolean;

  @Column({ name: 'suppress_until', type: 'timestamptz', nullable: true })
  suppressUntil: Date | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}