import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';

/**
 * Local structural types for the parts of capjs-core this service uses.
 *
 * capjs-core is an ESM-only package and the backend is CommonJS. Importing its
 * types directly makes TypeScript demand a `resolution-mode` attribute, which
 * this module format does not accept. These shapes mirror the published
 * declarations closely enough for the calls below.
 */
export interface CapRedeemBody {
  token: string;
  solutions: number[] | Array<Record<string, unknown>>;
  instr?: Record<string, unknown>;
  instr_blocked?: boolean;
  instr_timeout?: boolean;
  instr_error?: string;
}

interface CapValidateSuccess {
  success: true;
  token: string;
  tokenKey?: string;
  expires: number;
}

interface CapValidateFailure {
  success: false;
  reason: string;
}

type CapValidateResult = CapValidateSuccess | CapValidateFailure;

interface CapCore {
  generateChallenge(
    secret: string,
    opts?: {
      scope?: string;
      format?: 2;
      protocols?: string[];
      expiresMs?: number;
    },
  ): Promise<unknown>;
  validateChallenge(
    secret: string,
    body: CapRedeemBody,
    opts?: {
      scope?: string;
      tokenTtlMs?: number;
      consumeNonce?: (
        signature: string,
        ttlMs: number,
      ) => Promise<boolean> | boolean;
    },
  ): Promise<CapValidateResult>;
}

/** Bound into every challenge and checked again during redemption. */
const CAP_SCOPE = 'login';

/** The visitor has 10 minutes to solve the proof of work. */
const CAP_CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** A redeemed token is handed straight to the login form, so keep it short. */
const CAP_TOKEN_TTL_MS = 10 * 60 * 1000;

const MIN_SECRET_BYTES = 16;
const TOKEN_PART_RE = /^[a-f0-9]+$/i;

/**
 * Re-derive the lookup key for a Cap redeem token.
 *
 * Cap returns `token` as `id:secret` and stores `tokenKey` as
 * `id:sha256(secret)`. The recipe is from the Cap Core docs and must stay
 * byte-for-byte compatible with the library.
 */
export function deriveCapTokenKey(token: string): string | null {
  if (typeof token !== 'string') return null;

  const separator = token.indexOf(':');
  if (separator <= 0 || separator === token.length - 1) return null;

  const id = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!TOKEN_PART_RE.test(id) || !TOKEN_PART_RE.test(secret)) return null;
  if (id.length > 64 || secret.length > 128) return null;

  return `${id}:${createHash('sha256').update(secret).digest('hex')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class CapService implements OnModuleInit {
  private readonly logger = new Logger(CapService.name);
  private secret: string | null = null;
  private core: Promise<CapCore> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    const secret = this.config.get<string>('CAP_SECRET')?.trim();
    if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
      this.logger.error(
        'CAP_SECRET is missing or shorter than 16 bytes. ' +
          'Login CAPTCHA will fail closed until it is configured.',
      );
      return;
    }
    this.secret = secret;
  }

  private requireSecret(): string {
    if (!this.secret) {
      throw new ServiceUnavailableException({
        code: 'CAP_UNAVAILABLE',
        message:
          'Human verification is temporarily unavailable. Please try again later.',
      });
    }
    return this.secret;
  }

  private loadCore(): Promise<CapCore> {
    // capjs-core is ESM-only. A dynamic import keeps the CommonJS build
    // working on Node 24 and avoids loading its WASM/script tooling at boot.
    this.core ??= import('capjs-core') as unknown as Promise<CapCore>;
    return this.core;
  }

  /** POST /v1/auth/cap/challenge — public. */
  async createChallenge() {
    const { generateChallenge } = await this.loadCore();
    return generateChallenge(this.requireSecret(), {
      scope: CAP_SCOPE,
      format: 2,
      protocols: ['hashwx', 'instrumentation'],
      expiresMs: CAP_CHALLENGE_TTL_MS,
    });
  }

  /**
   * POST /v1/auth/cap/redeem — public.
   *
   * The widget expects `{ success, token, expires }` or `{ success: false,
   * error }`. Cap's failure shape uses `reason`, so map it to `error`.
   */
  async redeem(body: CapRedeemBody) {
    const { validateChallenge } = await this.loadCore();
    const result = await validateChallenge(this.requireSecret(), body, {
      scope: CAP_SCOPE,
      tokenTtlMs: CAP_TOKEN_TTL_MS,
      consumeNonce: (signature, ttlMs) =>
        this.consumeNonce(signature, ttlMs),
    });

    if (result.success !== true) {
      const reason = 'reason' in result ? result.reason : 'verification_failed';
      this.logger.warn(`Cap redeem rejected: ${reason}`);
      return { success: false as const, error: reason };
    }

    if (!result.tokenKey) {
      this.logger.error('Cap redeem succeeded without a tokenKey');
      return { success: false as const, error: 'token_store_error' };
    }

    try {
      await this.storeToken(result.tokenKey, result.expires);
    } catch (err) {
      this.logger.error(
        `Failed to store Cap redeem token: ${errorMessage(err)}`,
      );
      return { success: false as const, error: 'token_store_error' };
    }

    return {
      success: true as const,
      token: result.token,
      expires: result.expires,
    };
  }

  /**
   * Consume a solved-challenge token exactly once.
   *
   * The DELETE ... RETURNING is the atomic get-and-delete: two concurrent
   * logins with the same token can only ever return one row. Expired rows are
   * removed here too, so a stale token cannot be replayed.
   */
  async consumeLoginToken(token: string): Promise<void> {
    const tokenKey = deriveCapTokenKey(token);
    if (!tokenKey) {
      throw this.captchaFailed(
        'Human verification failed. Please complete the challenge again.',
      );
    }

    let result: unknown;
    try {
      result = await this.dataSource.query(
        `DELETE FROM public.cap_token
         WHERE token_key = $1
         RETURNING expires_at`,
        [tokenKey],
      );
    } catch (err) {
      this.logger.error(`Failed to consume Cap token: ${errorMessage(err)}`);
      throw new ServiceUnavailableException({
        code: 'CAP_UNAVAILABLE',
        message:
          'Human verification is temporarily unavailable. Please try again later.',
      });
    }

    // TypeORM returns `[rows, affected]` for DELETE and UPDATE, but a plain
    // rows array for INSERT/SELECT. Accept either shape so this stays correct
    // if the query is ever changed.
    const returned = Array.isArray(result) ? result : [];
    const rows = Array.isArray(returned[0])
      ? (returned[0] as Array<{ expires_at: Date | string }>)
      : (returned as Array<{ expires_at: Date | string }>);

    const expiresAt = rows[0]?.expires_at;
    if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
      throw this.captchaFailed(
        'Human verification expired or was already used. Please complete the challenge again.',
      );
    }
  }

  /**
   * Atomic replay protection for challenge redemption. Cap calls this after
   * the proof of work checks out. A duplicate signature loses the insert race
   * and returns false, which becomes `already_redeemed`.
   */
  private async consumeNonce(
    signature: string,
    ttlMs: number,
  ): Promise<boolean> {
    const rows = await this.dataSource.query(
      `INSERT INTO public.cap_nonce (signature, expires_at)
       VALUES ($1, now() + make_interval(secs => $2::double precision / 1000))
       ON CONFLICT (signature) DO NOTHING
       RETURNING signature`,
      [signature, Math.max(1, Math.ceil(ttlMs))],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async storeToken(tokenKey: string, expires: number): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO public.cap_token (token_key, expires_at)
       VALUES ($1, to_timestamp($2::double precision / 1000))
       ON CONFLICT (token_key) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [tokenKey, expires],
    );
  }

  private captchaFailed(message: string): BadRequestException {
    return new BadRequestException({ code: 'CAPTCHA_FAILED', message });
  }

  /** Keep both tables small without depending on an external scheduler. */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired(): Promise<void> {
    try {
      await this.dataSource.query(
        `DELETE FROM public.cap_nonce WHERE expires_at < now()`,
      );
      await this.dataSource.query(
        `DELETE FROM public.cap_token WHERE expires_at < now()`,
      );
    } catch (err) {
      this.logger.warn(`Cap expiry sweep failed: ${errorMessage(err)}`);
    }
  }
}
