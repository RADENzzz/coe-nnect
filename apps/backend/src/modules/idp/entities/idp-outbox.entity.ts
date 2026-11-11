import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Durable outbound item for a polling IDP client (contract 6.3).
 *
 * Schedule payloads are frozen when the item is created: replaying the same
 * `coe_nnect_version_id` returns the original payload, so a desktop client
 * that was offline for a while receives exactly what was published.
 *
 * Faculty-request status items are keyed by `coe_nnect_request_id` and are
 * refreshed in place on every status change. A poller therefore always sees
 * the latest status for a request instead of a growing event history.
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
  payload!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
