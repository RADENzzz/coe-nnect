import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { idpErrors } from './idp.errors';

/**
 * Contract 6.5 / 8.3 — HMAC-SHA256 webhook verification.
 *
 * Signed content : raw JSON body, unmodified
 * Headers        : X-IDP-Signature (`sha256=<hex>`), X-IDP-Timestamp (ISO 8601)
 * Tolerance      : 5 minutes for server-to-server (configurable)
 *
 * Requires `rawBody: true` on the Nest application so `req.rawBody` exists.
 */
@Injectable()
export class IdpSignatureGuard implements CanActivate {
  private readonly logger = new Logger(IdpSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();

    // CORS preflight is handled before this guard in practice; keep it safe.
    if (req.method === 'OPTIONS') return true;

    // Stash the caller's request id for the error envelope / audit logs.
    req.idpRequestId = req.headers['x-request-id'] ?? null;

    const secret = this.config.get<string>('IDP_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error(
        'IDP_WEBHOOK_SECRET is not set; rejecting every IDP webhook.',
      );
      throw idpErrors.unauthorized(
        'IDP webhook receiving is not configured on this deployment.',
      );
    }

    const signatureHeader = firstHeader(req.headers['x-idp-signature']);
    const timestampHeader = firstHeader(req.headers['x-idp-timestamp']);

    if (!signatureHeader || !timestampHeader) {
      throw idpErrors.unauthorized(
        'Missing X-IDP-Signature or X-IDP-Timestamp header.',
      );
    }

    // ── Timestamp window ──
    const toleranceMs = this.toleranceMs();
    const sentAt = Date.parse(timestampHeader);
    if (Number.isNaN(sentAt)) {
      throw idpErrors.unauthorized('X-IDP-Timestamp is not a valid timestamp.');
    }
    if (Math.abs(Date.now() - sentAt) > toleranceMs) {
      throw idpErrors.unauthorized(
        'X-IDP-Timestamp is outside the allowed signing window.',
      );
    }

    // ── Signature ──
    const rawBody: Buffer | undefined = req.rawBody;
    if (!rawBody) {
      // Fail closed: without the exact bytes we cannot verify the HMAC.
      this.logger.error(
        'req.rawBody is unavailable; ensure NestFactory.create(..., { rawBody: true }).',
      );
      throw idpErrors.unauthorized(
        'Webhook body could not be verified because the raw body is unavailable.',
      );
    }

    const provided = signatureHeader
      .trim()
      .replace(/^sha256=/i, '')
      .toLowerCase();
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    if (!isEqualHex(expected, provided)) {
      this.logger.warn('Rejected IDP webhook with an invalid HMAC signature.');
      throw idpErrors.unauthorized('Invalid X-IDP-Signature.');
    }

    return true;
  }

  private toleranceMs(): number {
    const raw = this.config.get<string>('IDP_WEBHOOK_TOLERANCE_MS');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60 * 1000;
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isEqualHex(expected: string, provided: string): boolean {
  if (!/^[0-9a-f]+$/.test(provided) || provided.length !== expected.length) {
    return false;
  }
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
