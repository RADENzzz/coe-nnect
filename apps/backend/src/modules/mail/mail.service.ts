import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * SMTP delivery for transactional account email.
 *
 * Mox exposes a standard SMTP submission listener, so the same configuration
 * works for a self-hosted Mox instance and for any other SMTP provider.
 * Missing configuration disables the recovery feature instead of crashing
 * the API at boot.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string | null;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    const host = this.value('SMTP_HOST');
    const from = this.value('SMTP_FROM');
    const appUrl = this.resolveAppUrl();
    const port = Number(this.value('SMTP_PORT') ?? '587');

    this.from = from || null;
    this.appUrl = appUrl;

    if (!host || !from || !appUrl) {
      this.transporter = null;
      this.logger.warn(
        'SMTP is not fully configured; recovery-email features are disabled.',
      );
      return;
    }

    const user = this.value('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');
    if (user && !password) {
      this.transporter = null;
      this.logger.warn(
        'SMTP_USER is set but SMTP_PASSWORD is missing; recovery-email features are disabled.',
      );
      return;
    }

    const secure =
      this.value('SMTP_SECURE') === 'true' ||
      (!this.value('SMTP_SECURE') && port === 465);

    this.transporter = createTransport({
      host,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      secure,
      auth: user ? { user, pass: password ?? '' } : undefined,
      requireTLS: this.value('SMTP_REQUIRE_TLS') !== 'false',
      tls: {
        // Keep certificate verification on by default. The escape hatch is
        // for a local Mox instance using a self-signed certificate.
        rejectUnauthorized:
          this.value('SMTP_TLS_REJECT_UNAUTHORIZED') !== 'false',
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    this.logger.log(
      `SMTP mailer configured for ${host}:${port} (secure=${secure}).`,
    );
  }

  isConfigured(): boolean {
    return this.transporter !== null && this.from !== null && !!this.appUrl;
  }

  /** Public frontend origin used to build verification/reset links. */
  getAppUrl(): string {
    return this.appUrl;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter || !this.from) {
      throw new Error('SMTP mail transport is not configured.');
    }

    await this.transporter.sendMail({
      from: this.from,
      ...message,
    });
  }

  private value(key: string): string | undefined {
    return this.config.get<string>(key)?.trim() || undefined;
  }

  private resolveAppUrl(): string {
    const explicit = this.value('APP_PUBLIC_URL');
    if (explicit) return explicit.replace(/\/+$/, '');

    const frontend = this.value('FRONTEND_URL')
      ?.split(',')[0]
      ?.trim()
      .replace(/\/+$/, '');
    if (frontend) return frontend;

    return this.config.get<string>('NODE_ENV') === 'production'
      ? ''
      : 'http://localhost:5173';
  }
}
