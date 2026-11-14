import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Not, Raw, Repository } from 'typeorm';
import { SupabaseService } from '../../database/supabase.service';
import { MailService, type MailMessage } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { UserRecovery } from './entities/user-recovery.entity';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

const SET_WINDOW_MS = 60 * 60 * 1000;
const SET_LIMIT = 5;

const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const REQUEST_LIMIT = 3;

export interface RecoverySettings {
  recoveryEmail: string | null;
  verified: boolean;
  mailConfigured: boolean;
}

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  /** In-memory, per-process throttles. The HTTP limiter adds IP-level cover. */
  private readonly setAttempts = new Map<string, number[]>();
  private readonly requestAttempts = new Map<string, number[]>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly mail: MailService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRecovery)
    private readonly recoveryRepo: Repository<UserRecovery>,
  ) {}

  async getSettings(userId: string): Promise<RecoverySettings> {
    const row = await this.recoveryRepo.findOne({ where: { userId } });
    return {
      recoveryEmail: row?.recoveryEmail ?? null,
      verified: Boolean(row?.verifiedAt),
      mailConfigured: this.mail.isConfigured(),
    };
  }

  /**
   * Add, change, or remove the optional recovery address. A new address is
   * stored as pending and must be verified before it can receive reset links.
   */
  async setRecoveryEmail(
    userId: string,
    recoveryEmail?: string | null,
  ): Promise<{
    recoveryEmail: string | null;
    verified: boolean;
    verificationSent: boolean;
  }> {
    const normalized = recoveryEmail?.trim().toLowerCase() || null;

    // Removal must keep working even when SMTP is down or not configured.
    if (!normalized) {
      const existing = await this.recoveryRepo.findOne({ where: { userId } });
      if (!existing) {
        return {
          recoveryEmail: null,
          verified: false,
          verificationSent: false,
        };
      }

      existing.recoveryEmail = null;
      existing.verificationTokenHash = null;
      existing.verificationTokenExpiresAt = null;
      existing.verifiedAt = null;
      existing.resetTokenHash = null;
      existing.resetTokenExpiresAt = null;
      await this.recoveryRepo.save(existing);
      return {
        recoveryEmail: null,
        verified: false,
        verificationSent: false,
      };
    }

    if (!this.mail.isConfigured()) {
      throw this.mailUnavailable();
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    const row = await this.getOrCreateRow(userId);

    if (normalized === user.email.trim().toLowerCase()) {
      throw new BadRequestException(
        'Choose a recovery address that is different from your login email.',
      );
    }

    // Re-submitting the already-verified address is a no-op, not a new send.
    if (row.recoveryEmail === normalized && row.verifiedAt) {
      return {
        recoveryEmail: normalized,
        verified: true,
        verificationSent: false,
      };
    }

    this.assertWithinLimit(
      this.setAttempts,
      userId,
      SET_LIMIT,
      SET_WINDOW_MS,
      'Too many recovery-email changes. Try again later.',
    );

    const token = this.createToken();
    row.recoveryEmail = normalized;
    row.verificationTokenHash = this.hashToken(token);
    row.verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
    row.verifiedAt = null;
    row.resetTokenHash = null;
    row.resetTokenExpiresAt = null;
    await this.recoveryRepo.save(row);

    try {
      await this.mail.send(this.verificationMessage(user, normalized, token));
    } catch (err) {
      this.logger.error(
        `Failed to send recovery verification email for user=${userId}: ${this.errorMessage(err)}`,
      );
      throw new ServiceUnavailableException({
        code: 'RECOVERY_EMAIL_SEND_FAILED',
        message:
          'Could not send the verification email. Please try again in a moment.',
      });
    }

    return {
      recoveryEmail: normalized,
      verified: false,
      verificationSent: true,
    };
  }

  async verifyRecoveryEmail(token: string): Promise<{ verified: true }> {
    const hash = this.hashToken(token);
    const row = await this.recoveryRepo.findOne({
      where: { verificationTokenHash: hash },
    });

    if (
      !row ||
      !row.verificationTokenExpiresAt ||
      row.verificationTokenExpiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'This verification link is invalid or has expired.',
      );
    }

    // Consume the token atomically so two clicks cannot both succeed.
    let result: { affected?: number | null };
    try {
      result = await this.recoveryRepo.update(
        { userId: row.userId, verificationTokenHash: hash },
        {
          verifiedAt: new Date(),
          verificationTokenHash: null,
          verificationTokenExpiresAt: null,
        },
      );
    } catch (err: any) {
      // The partial unique index allows only one verified owner per address.
      if ((err?.code ?? err?.driverError?.code) === '23505') {
        throw new BadRequestException(
          'This address is already verified for another account.',
        );
      }
      throw err;
    }

    if (!result.affected) {
      throw new BadRequestException(
        'This verification link is invalid or has expired.',
      );
    }

    this.logger.log(`Recovery email verified for user=${row.userId}`);
    return { verified: true };
  }

  /**
   * Send a reset link to either the login email or a verified recovery email.
   *
   * The response is intentionally identical whether or not an account exists,
   * so the endpoint cannot be used to enumerate addresses. A per-address
   * throttle silently drops excess requests.
   */
  async requestPasswordReset(email: string): Promise<{ success: true }> {
    if (!this.mail.isConfigured()) {
      throw this.mailUnavailable();
    }

    const normalized = email.trim().toLowerCase();
    if (!this.consumeRequestBudget(normalized)) {
      return { success: true };
    }

    // Email addresses are case-insensitive in practice. Compare lowercased
    // values so a user typing "Alice@..." still reaches the same account.
    let user = await this.userRepo.findOne({
      where: {
        email: Raw((alias) => `lower(${alias}) = :email`, { email: normalized }),
      },
    });
    let destination: string | null = user?.email ?? null;

    if (!user) {
      // Only verified rows are eligible. Otherwise anyone could block another
      // person's recovery address by claiming it on their own account without
      // ever verifying it.
      const recovery = await this.recoveryRepo.findOne({
        where: {
          recoveryEmail: normalized,
          verifiedAt: Not(IsNull()),
        },
      });
      if (recovery?.recoveryEmail) {
        user = await this.userRepo.findOne({
          where: { userId: recovery.userId },
        });
        destination = recovery.recoveryEmail;
      }
    }

    // Unknown, inactive, or malformed accounts get the same generic response.
    if (!user || !destination || !user.isActive) {
      return { success: true };
    }

    const row = await this.getOrCreateRow(user.userId);
    const token = this.createToken();
    row.resetTokenHash = this.hashToken(token);
    row.resetTokenExpiresAt = new Date(Date.now() + RESET_TTL_MS);
    await this.recoveryRepo.save(row);

    try {
      await this.mail.send(this.resetMessage(user, destination, token));
    } catch (err) {
      // Keep the response generic; the token simply expires unused.
      this.logger.error(
        `Failed to send password reset email for user=${user.userId}: ${this.errorMessage(err)}`,
      );
    }

    return { success: true };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const hash = this.hashToken(token);
    const row = await this.recoveryRepo.findOne({
      where: { resetTokenHash: hash },
    });

    if (
      !row ||
      !row.resetTokenExpiresAt ||
      row.resetTokenExpiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Request a new one.',
      );
    }

    const user = await this.userRepo.findOne({ where: { userId: row.userId } });
    if (!user || !user.isActive) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Request a new one.',
      );
    }

    const consumed = await this.recoveryRepo.update(
      { userId: row.userId, resetTokenHash: hash },
      { resetTokenHash: null, resetTokenExpiresAt: null },
    );

    if (!consumed.affected) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Request a new one.',
      );
    }

    const { error } = await this.supabase
      .getAdminClient()
      .auth.admin.updateUserById(row.userId, { password: newPassword });

    if (error) {
      this.logger.error(
        `Password reset failed for user=${row.userId}: ${error.message}`,
      );
      throw new ServiceUnavailableException({
        code: 'PASSWORD_RESET_UNAVAILABLE',
        message:
          'Could not update the password right now. Please request a new reset link.',
      });
    }

    this.logger.log(`Password reset completed for user=${row.userId}`);
    return { success: true };
  }

  private async getOrCreateRow(userId: string): Promise<UserRecovery> {
    const existing = await this.recoveryRepo.findOne({ where: { userId } });
    if (existing) return existing;

    return this.recoveryRepo.create({
      userId,
      recoveryEmail: null,
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      verifiedAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    });
  }

  private assertWithinLimit(
    store: Map<string, number[]>,
    key: string,
    limit: number,
    windowMs: number,
    message: string,
  ): void {
    this.pruneAttempts(store, windowMs);
    const now = Date.now();
    const bucket = (store.get(key) ?? []).filter((t) => now - t < windowMs);
    if (bucket.length >= limit) {
      store.set(key, bucket);
      throw new HttpException(
        { statusCode: 429, message },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.push(now);
    store.set(key, bucket);
  }

  private consumeRequestBudget(key: string): boolean {
    this.pruneAttempts(this.requestAttempts, REQUEST_WINDOW_MS);
    const now = Date.now();
    const bucket = (this.requestAttempts.get(key) ?? []).filter(
      (t) => now - t < REQUEST_WINDOW_MS,
    );
    if (bucket.length >= REQUEST_LIMIT) {
      this.requestAttempts.set(key, bucket);
      return false;
    }
    bucket.push(now);
    this.requestAttempts.set(key, bucket);
    return true;
  }

  /**
   * Keep the in-memory throttle maps bounded. Entries are only added for
   * authenticated users or addresses that reach the request endpoint, but a
   * long-running process can still accumulate expired keys over time.
   */
  private pruneAttempts(
    store: Map<string, number[]>,
    windowMs: number,
  ): void {
    if (store.size < 10_000) return;
    const now = Date.now();
    for (const [key, times] of store) {
      if (!times.some((t) => now - t < windowMs)) store.delete(key);
    }
  }

  private createToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private mailUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'RECOVERY_EMAIL_UNAVAILABLE',
      message:
        'Email recovery is not configured on this server. Contact an administrator.',
    });
  }

  private verificationMessage(
    user: User,
    email: string,
    token: string,
  ): MailMessage {
    const link = `${this.mail.getAppUrl()}/recovery/verify?token=${encodeURIComponent(token)}`;
    const name = this.escapeHtml(user.username);
    return {
      to: email,
      subject: 'Verify your CoE-NNECT recovery email',
      text: [
        `Hi ${user.username},`,
        '',
        'Use this link to verify the recovery email for your CoE-NNECT account:',
        link,
        '',
        'The link expires in 24 hours. If you did not request this, you can ignore this email.',
      ].join('\n'),
      html: [
        `<p>Hi ${name},</p>`,
        '<p>Use the link below to verify the recovery email for your CoE-NNECT account.</p>',
        `<p><a href="${this.escapeHtml(link)}">Verify recovery email</a></p>`,
        '<p>This link expires in 24 hours. If you did not request this, you can ignore this email.</p>',
      ].join(''),
    };
  }

  private resetMessage(
    user: User,
    email: string,
    token: string,
  ): MailMessage {
    const link = `${this.mail.getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const name = this.escapeHtml(user.username);
    return {
      to: email,
      subject: 'Reset your CoE-NNECT password',
      text: [
        `Hi ${user.username},`,
        '',
        'Use this link to choose a new password for your CoE-NNECT account:',
        link,
        '',
        'The link expires in 30 minutes and can be used once. If you did not request this, you can ignore this email.',
      ].join('\n'),
      html: [
        `<p>Hi ${name},</p>`,
        '<p>Use the link below to choose a new password for your CoE-NNECT account.</p>',
        `<p><a href="${this.escapeHtml(link)}">Reset password</a></p>`,
        '<p>This link expires in 30 minutes and can be used once. If you did not request this, you can ignore this email.</p>',
      ].join(''),
    };
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char]!,
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
