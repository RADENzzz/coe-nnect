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
 * Contract 2 / 4.5 / 6.5 — HMAC-SHA256 webhook verification.
 *
 * Signed content : raw JSON body, unmodified
 * Headers        : X-IDP-Signature (`sha256=<hex>`), X-IDP-Timestamp (ISO 8601)
 * Aliases        : X-COE-NNECT-Signature, X-COE-NNECT-Timestamp
 * Tolerance      : 5 minutes for server-to-server (configurable)
 *
 * `POST /api/idp/v1/webhooks/change-request` additionally accepts the shared
 * integration key through `X-IDP-API-Key` or `X-COE-NNECT-Key` (and the
 * generic `X-API-Key` / `Authorization: Bearer` forms). The other webhook
 * stays HMAC-only.
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

    const path = String(req.path ?? req.originalUrl ?? req.url ?? '').split(
      '?',
    )[0];
    const changeRequestWebhook = /\/webhooks\/change-request\/?$/i.test(path);

    // Contract 4.5 — the change-request webhook allows an API-key fallback.
    if (changeRequestWebhook) {
      const providedApiKey = firstHeader(
        req.headers['x-idp-api-key'],
        req.headers['x-coe-nnect-key'],
        req.headers['x-api-key'],
        bearerToken(req.headers.authorization),
      );
      const expectedApiKey = this.config.get<string>('IDP_API_KEY')?.trim();
      if (
        providedApiKey &&
        expectedApiKey &&
        isEqualSecret(expectedApiKey, providedApiKey.trim())
      ) {
        this.logger.log(
          'Accepted IDP change-request webhook via API key fallback.',
        );
        return true;
      }
      // A supplied key that does not match is not a reason to skip HMAC when
      // a signature is also present; fall through and let HMAC decide.
    }

    const secret = this.config.get<string>('IDP_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error(
        'IDP_WEBHOOK_SECRET is not set; rejecting every IDP webhook.',
      );
      throw idpErrors.unauthorized(
        'IDP webhook receiving is not configured on this deployment.',
      );
    }

    const signatureHeader = firstHeader(
      req.headers['x-idp-signature'],
      req.headers['x-coe-nnect-signature'],
    );
    const timestampHeader = firstHeader(
      req.headers['x-idp-timestamp'],
      req.headers['x-coe-nnect-timestamp'],
    );

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

function firstHeader(
  ...values: Array<string | string[] | undefined>
): string | undefined {
  for (const value of values) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string' && first.trim()) return first;
  }
  return undefined;
}

function bearerToken(
  value: string | string[] | undefined,
): string | undefined {
  const header = firstHeader(value);
  if (!header) return undefined;
  const trimmed = header.trim();
  const prefix = 'bearer ';
  if (trimmed.slice(0, prefix.length).toLowerCase() !== prefix) {
    return undefined;
  }
  return trimmed.slice(prefix.length).trim() || undefined;
}

/** Constant-time comparison for the shared integration key. */
function isEqualSecret(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isEqualHex(expected: string, provided: string): boolean {
  if (!/^[0-9a-f]+$/.test(provided) || provided.length !== expected.length) {
    return false;
  }
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
