import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A single notification for a single recipient.
 *
 * Targeted model: no broadcasts. If N users should see the same event,
 * N rows are created. This keeps read-state simple (one boolean) and
 * makes per-user filtering trivial.
 *
 * Rows are auto-deleted by a retention cron; see NotificationsService.
 */
@Entity({ name: 'notification' })
@Index('idx_notification_recipient_unread', ['recipientId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn({
    name: 'notification_id',
    type: 'bigint',
  })
  notificationId!: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @Column({ name: 'trigger_key', type: 'text' })
  triggerKey!: string;

  @Column({ name: 'category', type: 'text' })
  category!: string;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'body', type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'entity_type', type: 'text', nullable: true })
  entityType!: string | null;

  @Column({ name: 'entity_id', type: 'text', nullable: true })
  entityId!: string | null;

  @Column({ name: 'payload', type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt!: Date;
}