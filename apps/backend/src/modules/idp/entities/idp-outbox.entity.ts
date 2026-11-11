import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { IdpPublishedSchedulePayload } from '../idp.types';

/**
 * Durable outbound item for a polling IDP client (contract 6.3).
 *
 * The payload is frozen when the item is created. Replaying the same
 * idempotency key returns the original payload, so a desktop client that was
 * offline for a while receives exactly what was published.
 */
@Entity('idp_outbox')
export class IdpOutboxItem {
  @PrimaryGeneratedColumn({ name: 'outbox_id', type: 'bigint' })
  outboxId!: string;

  @Column({ name: 'kind', type: 'text' })
  kind!: string;

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: IdpPublishedSchedulePayload;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
