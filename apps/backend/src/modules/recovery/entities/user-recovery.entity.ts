import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Per-user recovery email state.
 *
 * Kept out of `public.users` so the browser-facing profile row never carries
 * token hashes. The table has RLS enabled with no policies; only the backend
 * (service/database role) can read or write it.
 */
@Entity('user_recovery')
export class UserRecovery {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ name: 'recovery_email', type: 'text', nullable: true })
  recoveryEmail: string | null;

  @Column({ name: 'verification_token_hash', type: 'text', nullable: true })
  verificationTokenHash: string | null;

  @Column({
    name: 'verification_token_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  verificationTokenExpiresAt: Date | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'reset_token_hash', type: 'text', nullable: true })
  resetTokenHash: string | null;

  @Column({
    name: 'reset_token_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  resetTokenExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
