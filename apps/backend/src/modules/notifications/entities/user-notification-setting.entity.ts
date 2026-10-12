import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

/**
 * Per-user, per-trigger opt-out.
 *
 * Absence of a row = default (enabled). A row here explicitly overrides.
 * The dispatcher reads this before creating notifications so disabled
 * triggers never generate rows or WebSocket pushes.
 */
@Entity({ name: 'user_notification_setting' })
export class UserNotificationSetting {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'trigger_key', type: 'text' })
  triggerKey!: string;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled!: boolean;

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt!: Date;
}