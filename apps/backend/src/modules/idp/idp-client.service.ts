import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IdpChangeRequestAckPayload,
  IdpFacultyQualification,
  IdpFacultyQuery,
  IdpFacultyRecord,
  IdpFacultyRequestPayload,
  IdpFacultyUnavailability,
  IdpPublishedSchedulePayload,
} from './idp.types';

/** Raised when IDP answers with a non-2xx status, or cannot be reached. */
export class IdpUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** How many HTTP attempts were made before giving up. */
    readonly attempts: number = 1,
  ) {
    super(message);
    this.name = 'IdpUpstreamError';
  }
}

/**
 * Outbound Pattern A client (contract 6.1 / 9.2).
 *
 * Paths are the agreed ones from contract 9.2; the IDP team implements the
 * receiving side. All calls are server-to-server over HTTPS with a bearer
 * API key and an `X-Request-ID` per attempt.
 */
@Injectable()
export class IdpClientService {
  private readonly logger = new Logger(IdpClientService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return (
      this.config.get<string>('IDP_ENABLED')?.trim().toLowerCase() === 'true'
    );
  }

  get baseUrl(): string {
    return (this.config.get<string>('IDP_BASE_URL') ?? '').replace(/\/+$/, '');
  }

  get hasApiKey(): boolean {
    return Boolean(this.config.get<string>('IDP_API_KEY'));
  }

  get hasWebhookSecret(): boolean {
    return Boolean(this.config.get<string>('IDP_WEBHOOK_SECRET'));
  }

  /** Pattern C: bearer key the IDP desktop uses to call CoE-NNECT. */
  get hasDeviceApiKey(): boolean {
    return Boolean(this.config.get<string>('IDP_DEVICE_API_KEY')?.trim());
  }

  get isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  /** Contract 5.1 — `GET {IDP_BASE}/faculty`. */
  async listFaculty(query: IdpFacultyQuery = {}): Promise<IdpFacultyRecord[]> {
    const body = await this.request('/faculty', {
      department_code: query.departmentCode,
      updated_since: query.updatedSince,
    });
    return this.unwrapArray<IdpFacultyRecord>(body, ['faculty', 'data', 'items']);
  }

  /** Contract 5.2 — `GET {IDP_BASE}/faculty/{key}/qualifications`. */
  async listQualifications(
    facultyKey: string,
  ): Promise<IdpFacultyQualification[]> {
    const body = await this.request(
      `/faculty/${encodeURIComponent(facultyKey)}/qualifications`,
    );
    return this.unwrapArray<IdpFacultyQualification>(body, [
      'qualifications',
      'data',
      'items',
    ]);
  }

  /** Contract 5.3 — `GET {IDP_BASE}/faculty/{key}/unavailability`. */
  async listUnavailability(
    facultyKey: string,
    termCode?: string,
  ): Promise<IdpFacultyUnavailability[]> {
    const body = await this.request(
      `/faculty/${encodeURIComponent(facultyKey)}/unavailability`,
      { term_code: termCode },
    );
    return this.unwrapArray<IdpFacultyUnavailability>(body, [
      'unavailability',
      'data',
      'items',
    ]);
  }

  /** Contract 5.4 — `POST {IDP_BASE}/schedules/published`. */
  async pushPublishedSchedule(
    payload: IdpPublishedSchedulePayload,
  ): Promise<{ status: number; attempts: number }> {
    const response = await this.send('/schedules/published', payload);
    return { status: response.status, attempts: response.attempts };
  }

  /** Contract 5.5 — `POST {IDP_BASE}/faculty-requests`. */
  async pushFacultyRequest(
    payload: IdpFacultyRequestPayload,
  ): Promise<{ status: number; attempts: number }> {
    const response = await this.send('/faculty-requests', payload);
    return { status: response.status, attempts: response.attempts };
  }

  /** Contract 5.7 / 4.8 — `POST {IDP_BASE}/change-requests/{id}/ack`. */
  async pushChangeRequestAck(
    idpRequestId: string,
    payload: IdpChangeRequestAckPayload,
  ): Promise<{ status: number; attempts: number }> {
    const response = await this.send(
      `/change-requests/${encodeURIComponent(idpRequestId)}/ack`,
      payload,
    );
    return { status: response.status, attempts: response.attempts };
  }

  private async send(
    path: string,
    body: unknown,
  ): Promise<{ status: number; attempts: number }> {
    if (!this.enabled) {
      throw new IdpUpstreamError(
        503,
        'internal_error',
        'IDP integration is disabled (IDP_ENABLED is not true).',
      );
    }
    if (!this.baseUrl) {
      throw new IdpUpstreamError(
        503,
        'internal_error',
        'IDP_BASE_URL is not configured.',
      );
    }

    const url = new URL(`${this.baseUrl}${path}`);
    const maxAttempts = this.pushMaxAttempts();
    const timeoutMs = this.timeoutMs();
    let lastError: IdpUpstreamError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const apiKey = this.config.get<string>('IDP_API_KEY');
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            'X-Request-ID': randomRequestId(),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const text = await response.text();
        const parsed = text ? safeJsonParse(text) : null;

        this.logger.log(
          `IDP POST ${url.pathname} -> ${response.status} ` +
            `(${Date.now() - startedAt}ms, attempt ${attempt}/${maxAttempts})`,
        );

        if (response.ok) return { status: response.status, attempts: attempt };

        const error = (parsed as any)?.error;
        lastError = new IdpUpstreamError(
          response.status,
          error?.code ?? 'internal_error',
          error?.message ?? `IDP push failed with status ${response.status}.`,
          attempt,
        );

        // 409 is the documented idempotency answer: the version was already
        // accepted. Treat it as delivered so the caller does not retry.
        if (response.status === 409) {
          return { status: response.status, attempts: attempt };
        }
        if (!isRetryable(response.status) || attempt === maxAttempts) break;
      } catch (err) {
        lastError =
          (err as any)?.name === 'AbortError'
            ? new IdpUpstreamError(
                504,
                'internal_error',
                `IDP request timed out after ${timeoutMs}ms.`,
                attempt,
              )
            : new IdpUpstreamError(
                502,
                'internal_error',
                `Could not reach IDP: ${(err as Error)?.message ?? 'unknown error'}.`,
                attempt,
              );
        if (attempt === maxAttempts) break;
      } finally {
        clearTimeout(timer);
      }

      await delay(this.pushRetryDelayMs(attempt));
    }

    throw lastError ?? new IdpUpstreamError(502, 'internal_error', 'IDP push failed.');
  }

  private pushMaxAttempts(): number {
    const parsed = Number(this.config.get<string>('IDP_PUSH_MAX_ATTEMPTS'));
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 8
      ? Math.floor(parsed)
      : 3;
  }

  /**
   * Bounded in-request backoff. The full 6.6 ladder (1m .. 2h) needs the
   * outbox in Milestone 3; holding an HTTP request open that long is not an
   * option here.
   */
  private pushRetryDelayMs(attempt: number): number {
    const parsed = Number(this.config.get<string>('IDP_PUSH_RETRY_DELAY_MS'));
    const base = Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
    return base * 4 ** (attempt - 1);
  }

  private async request(
    path: string,
    query?: Record<string, string | undefined>,
  ): Promise<unknown> {
    if (!this.enabled) {
      throw new IdpUpstreamError(
        503,
        'internal_error',
        'IDP integration is disabled (IDP_ENABLED is not true).',
      );
    }
    if (!this.baseUrl) {
      throw new IdpUpstreamError(
        503,
        'internal_error',
        'IDP_BASE_URL is not configured.',
      );
    }

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }

    const timeoutMs = this.timeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const apiKey = this.config.get<string>('IDP_API_KEY');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'X-Request-ID': randomRequestId(),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      const body = text ? safeJsonParse(text) : null;

      this.logger.log(
        `IDP GET ${url.pathname} -> ${response.status} (${Date.now() - startedAt}ms)`,
      );

      if (!response.ok) {
        const error = (body as any)?.error;
        throw new IdpUpstreamError(
          response.status,
          error?.code ?? 'internal_error',
          error?.message ?? `IDP request failed with status ${response.status}.`,
        );
      }

      return body;
    } catch (err) {
      if (err instanceof IdpUpstreamError) throw err;
      if ((err as any)?.name === 'AbortError') {
        throw new IdpUpstreamError(
          504,
          'internal_error',
          `IDP request timed out after ${timeoutMs}ms.`,
        );
      }
      throw new IdpUpstreamError(
        502,
        'internal_error',
        `Could not reach IDP: ${(err as Error)?.message ?? 'unknown error'}.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private timeoutMs(): number {
    const raw = this.config.get<string>('IDP_REQUEST_TIMEOUT_MS');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
  }

  /**
   * IDP responses may be a bare array or wrapped in one of the documented
   * collection keys. Accept both so a harmless envelope change does not
   * break the sync.
   */
  private unwrapArray<T>(body: unknown, keys: string[]): T[] {
    if (Array.isArray(body)) return body as T[];
    if (body && typeof body === 'object') {
      for (const key of keys) {
        const value = (body as Record<string, unknown>)[key];
        if (Array.isArray(value)) return value as T[];
      }
    }
    return [];
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Contract 7.5 — only 429 and 5xx are retried. */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
