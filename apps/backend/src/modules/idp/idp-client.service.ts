import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IdpFacultyQualification,
  IdpFacultyQuery,
  IdpFacultyRecord,
  IdpFacultyUnavailability,
} from './idp.types';

/** Raised when IDP answers with a non-2xx status. */
export class IdpUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IdpUpstreamError';
  }
}

/**
 * Outbound Pattern A client (contract 6.1 / 9.2).
 *
 * Path names below are the indicative ones from the contract; the IDP team
 * will confirm the final paths. All calls are server-to-server over HTTPS
 * with a bearer API key.
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

function randomRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
