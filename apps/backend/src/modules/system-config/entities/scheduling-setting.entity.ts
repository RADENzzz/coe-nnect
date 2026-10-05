import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('scheduling_setting')
export class SchedulingSetting {
  @PrimaryColumn({ name: 'setting_key', type: 'text' })
  settingKey: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}