import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  SupabaseClient,
  User as SupabaseAuthUser,
} from '@supabase/supabase-js';
import { Agent, fetch as undiciFetch } from 'undici';
import { createSupabaseConfig } from '../config/supabase.config';

export type VerifyAccessTokenResult =
  | { status: 'valid'; user: SupabaseAuthUser }
  | { status: 'invalid'; message: string }
  | { status: 'unavailable'; message: string };

/**
 * Node's built-in fetch gives DNS + TCP + TLS 10 seconds by default. On some
 * local networks the first DNS lookup alone can take longer, which previously
 * surfaced as an invalid token and signed the user out. Give Supabase calls
 * more room and reuse the connection so only the first request pays for DNS.
 */
const SUPABASE_CONNECT_TIMEOUT_MS = 30_000;

/** How long a successfully verified token may skip the network round-trip. */
const VERIFIED_TOKEN_TTL_MS = 30_000;

/** Treat a burst of parallel requests as one Supabase verification. */
const MAX_VERIFIED_TOKENS = 2_000;

function createSupabaseFetch(): typeof fetch {
  const dispatcher = new Agent({
    connect: { timeout: SUPABASE_CONNECT_TIMEOUT_MS },
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
  });

  return ((
    input: Parameters<typeof undiciFetch>[0],
    init?: Parameters<typeof undiciFetch>[1],
  ) =>
    undiciFetch(input, {
      ...init,
      dispatcher,
    })) as typeof fetch;
}

/**
 * True when `auth.getUser` failed because the auth service could not be
 * reached (or answered with a server error), rather than because the token
 * was actually rejected. Network failures must never invalidate a session.
 */
export function isSupabaseAuthOutage(
  error:
    | { name?: string; status?: number; message?: string }
    | null
    | undefined,
): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return true;
  if (
    typeof error.status === 'number' &&
    (error.status === 0 || error.status >= 500)
  ) {
    return true;
  }
  return /fetch failed|failed to fetch|network|timeout|timed out|econn|enotfound|eai_again/i.test(
    error.message ?? '',
  );
}

function jwtRemainingMs(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) return 0;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { exp?: unknown };
    return typeof decoded.exp === 'number'
      ? decoded.exp * 1000 - Date.now()
      : 0;
  } catch {
    return 0;
  }
}

@Injectable()
export class SupabaseService implements OnModuleInit {
  private anonClient!: SupabaseClient;
  private adminClient!: SupabaseClient;

  private readonly verifiedTokens = new Map<
    string,
    { user: SupabaseAuthUser; expiresAt: number }
  >();
  private readonly inFlightVerifications = new Map<
    string,
    Promise<VerifyAccessTokenResult>
  >();

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const { url, anonKey, serviceRoleKey } = createSupabaseConfig(this.config);
    const fetch = createSupabaseFetch();

    // Anon client — used to VERIFY user JWTs
    this.anonClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch },
    });

    // Admin client — used to CREATE/MANAGE users (service role)
    this.adminClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch },
    });
  }

  /** Verify user session / get user info from a JWT */
  getClient(): SupabaseClient {
    return this.anonClient;
  }

  /** Bypass RLS; create users, etc. */
  getAdminClient(): SupabaseClient {
    return this.adminClient;
  }

  /**
   * Verify a bearer token against Supabase Auth.
   *
   * The result distinguishes "this token is invalid" from "the auth service
   * is unreachable". Only the first may invalidate a user session.
   */
  async verifyAccessToken(token: string): Promise<VerifyAccessTokenResult> {
    const now = Date.now();
    const cached = this.verifiedTokens.get(token);
    if (cached) {
      if (cached.expiresAt > now) {
        return { status: 'valid', user: cached.user };
      }
      this.verifiedTokens.delete(token);
    }

    const pending = this.inFlightVerifications.get(token);
    if (pending) return pending;

    const verification = this.verifyAccessTokenUncached(token).finally(() => {
      this.inFlightVerifications.delete(token);
    });
    this.inFlightVerifications.set(token, verification);
    return verification;
  }

  private async verifyAccessTokenUncached(
    token: string,
  ): Promise<VerifyAccessTokenResult> {
    try {
      const { data, error } = await this.getClient().auth.getUser(token);

      if (error || !data.user?.id) {
        if (isSupabaseAuthOutage(error)) {
          return {
            status: 'unavailable',
            message: error?.message ?? 'Supabase auth is unreachable',
          };
        }
        return {
          status: 'invalid',
          message: error?.message ?? 'Invalid or expired token',
        };
      }

      // Cache only while the token is still valid; 30s is enough to collapse
      // the burst of requests the SPA fires when a page loads.
      const ttl = Math.min(
        VERIFIED_TOKEN_TTL_MS,
        jwtRemainingMs(token) - 30_000,
      );
      if (ttl > 0) {
        this.pruneVerifiedTokens();
        this.verifiedTokens.set(token, {
          user: data.user,
          expiresAt: Date.now() + ttl,
        });
      }

      return { status: 'valid', user: data.user };
    } catch (err) {
      // getUser normally reports HTTP failures as `error`, but a thrown
      // network error is still an outage, not a bad token.
      return {
        status: 'unavailable',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private pruneVerifiedTokens(): void {
    if (this.verifiedTokens.size < MAX_VERIFIED_TOKENS) return;
    const now = Date.now();
    for (const [token, entry] of this.verifiedTokens) {
      if (entry.expiresAt <= now) this.verifiedTokens.delete(token);
    }
    if (this.verifiedTokens.size >= MAX_VERIFIED_TOKENS) {
      this.verifiedTokens.clear();
    }
  }
}
