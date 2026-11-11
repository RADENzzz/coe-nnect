import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Last time the user's browser checked in with the API.
 *
 * Kept separate from `users` so the heartbeat does not bump `updated_at`.
 * Supabase Realtime presence remains the source of truth for the live
 * Online/Offline dot; this row only answers "when did they leave?".
 */
@Entity('user_presence')
export class UserPresence {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;
}
