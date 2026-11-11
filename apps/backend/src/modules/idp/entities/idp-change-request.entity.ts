import { Column, Entity, PrimaryColumn } from 'typeorm';
import type {
  IdpChangeRequestAckAction,
  IdpChangeRequestPayload,
  IdpChangeRequestStatus,
} from '../idp.types';

/**
 * Durable inbound change request from IDP (contract 4.7 / 5.7).
 *
 * `idp_request_id` is the contract idempotency key. The body hash lets a
 * retried delivery with the same key and body answer `duplicate`, while a
 * different body is rejected with `409 duplicate_key`.
 *
 * The row also stores the one-and-only acknowledgement. The ack itself is
 * queued in `idp_outbox` under the same key, so an offline IDP desktop can
 * collect it later and a replay cannot create a second ack.
 */
@Entity('idp_change_request')
export class IdpChangeRequest {
  @PrimaryColumn({ name: 'idp_request_id', type: 'text' })
  idpRequestId!: string;

  @Column({ name: 'body_hash', type: 'text' })
  bodyHash!: string;

  @Column({ name: 'type', type: 'text' })
  type!: string;

  @Column({ name: 'faculty_id', type: 'bigint', nullable: true })
  facultyId!: string | null;

  @Column({ name: 'faculty_wmsu_id', type: 'text', nullable: true })
  facultyWmsuId!: string | null;

  @Column({ name: 'faculty_employee_id', type: 'text', nullable: true })
  facultyEmployeeId!: string | null;

  @Column({ name: 'severity', type: 'text' })
  severity!: string;

  @Column({ name: 'requires_ack', type: 'boolean', default: true })
  requiresAck!: boolean;

  @Column({ name: 'status', type: 'text', default: 'pending' })
  status!: IdpChangeRequestStatus;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: IdpChangeRequestPayload;

  @Column({ name: 'affected_dates', type: 'jsonb', nullable: true })
  affectedDates!: string[] | null;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt!: Date;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'ack_action', type: 'text', nullable: true })
  ackAction!: IdpChangeRequestAckAction | null;

  @Column({ name: 'ack_notes', type: 'text', nullable: true })
  ackNotes!: string | null;

  @Column({ name: 'acknowledged_by', type: 'uuid', nullable: true })
  acknowledgedBy!: string | null;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;
}
