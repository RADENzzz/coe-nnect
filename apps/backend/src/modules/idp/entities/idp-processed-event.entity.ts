import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Durable idempotency record for inbound IDP events (contract 7.4).
 *
 * `body_hash` is the SHA-256 of the canonical JSON body. A repeat with the
 * same key and hash is a duplicate; the same key with a different hash is a
 * `409 duplicate_key`.
 */
@Entity('idp_processed_event')
export class IdpProcessedEvent {
  @PrimaryColumn({ name: 'event_id', type: 'text' })
  eventId!: string;

  @Column({ name: 'body_hash', type: 'text' })
  bodyHash!: string;

  @Column({ name: 'event_type', type: 'text', nullable: true })
  eventType!: string | null;

  @Column({ name: 'faculty_id', type: 'bigint', nullable: true })
  facultyId!: string | null;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt!: Date;
}
