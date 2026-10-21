import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import * as http from 'http';
import * as https from 'https';

export interface ParserColumnSpec {
  role: 'code' | 'title' | 'prereq' | 'lec' | 'lab' | 'total';
  x_start_pt: number;
  x_end_pt: number;
}

export interface ParserRowSpec {
  row_id: string;
  y_top_pt: number;
  y_bottom_pt: number;
}

export interface ParserRegionInput {
  table_id: number;
  page_index: number;
  x_start_pt: number;
  x_end_pt: number;
  y_start_pt: number;
  y_end_pt: number;
  columns: ParserColumnSpec[];
  rows: ParserRowSpec[];
}

export interface ParserSubject {
  code: string;
  title: string;
  prereq: string;
  lec: string;
  lab: string;
  total: string;
}

export interface ParserRegionOutput {
  table_id: number;
  subjects: ParserSubject[];
}

export interface ParserExtractResponse {
  regions: ParserRegionOutput[];
}

export interface PageSizePt {
  page_index: number;
  width_pt: number;
  height_pt: number;
}

export interface ParserPageInfo {
  page_count: number;
  page_sizes_pt: PageSizePt[];
}

@Injectable()
export class ProspectusParserClient implements OnModuleInit {
  private readonly logger = new Logger(ProspectusParserClient.name);
  private readonly http: AxiosInstance;
  private readonly healthHttp: AxiosInstance;
  private readonly baseUrl: string;

  // ── Warm-state cache + single-flight guard ──
  private isWarm = false;
  private wakePromise: Promise<void> | null = null;
  private lastWarmAt = 0;

  private static readonly HEALTH_TIMEOUT_MS = 30_000;
  private static readonly WARM_TTL_MS = 10 * 60 * 1000; // 10 min (Render sleeps at 15)
  private static readonly REQUEST_TIMEOUT_MS = 60_000;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('PROSPECTUS_PARSER_URL') ??
      'http://localhost:8001';

    // Keep-alive agents reuse TCP/TLS connections — big win on warm instances
    const agentOpts = { keepAlive: true, maxSockets: 20 };
    const common = {
      baseURL: this.baseUrl,
      // Base64 payloads can be large (a 5MB PDF → ~7MB base64)
      maxBodyLength: 50 * 1024 * 1024,
      maxContentLength: 50 * 1024 * 1024,
      headers: { 'Content-Type': 'application/json' },
      httpAgent: new http.Agent(agentOpts),
      httpsAgent: new https.Agent(agentOpts),
    };

    this.http = axios.create({
      ...common,
      timeout: ProspectusParserClient.REQUEST_TIMEOUT_MS,
    });

    // /health must fail fast — 30s not 90s. If the container is dead,
    // Render's proxy will 502 us around the 30s mark anyway.
    this.healthHttp = axios.create({
      ...common,
      timeout: ProspectusParserClient.HEALTH_TIMEOUT_MS,
    });

    this.logger.log(`Prospectus parser client → ${this.baseUrl}`);
  }

  /**
   * Warm the parser as soon as the backend boots, so the first real user
   * request doesn't pay the cold-start penalty.
   */
  async onModuleInit() {
    void this.wakeUp().catch(() => undefined);
  }

  /**
   * Single-flight warm-up:
   *  - If already warm within TTL → resolve immediately.
   *  - If a wake-up is in progress → await the SAME promise (no thundering herd).
   *  - Otherwise → fire one /health ping.
   *
   * Unlike the original, this THROWS on failure so the caller can return a
   * fast 503 instead of hanging 90s and then 60s more on /extract.
   */
  private async wakeUp(): Promise<void> {
    if (
      this.isWarm &&
      Date.now() - this.lastWarmAt < ProspectusParserClient.WARM_TTL_MS
    ) {
      return;
    }
    if (this.wakePromise) {
      return this.wakePromise;
    }

    this.wakePromise = (async () => {
      const started = Date.now();
      this.logger.log(`Waking up parser service at ${this.baseUrl}...`);
      try {
        await this.healthHttp.get('/health');
        this.isWarm = true;
        this.lastWarmAt = Date.now();
        this.logger.log(`Parser awake in ${Date.now() - started}ms`);
      } catch (err) {
        this.isWarm = false;
        this.logger.warn(
          `Parser wake-up failed after ${Date.now() - started}ms: ${
            (err as Error).message
          }`,
        );
        throw err;
      } finally {
        this.wakePromise = null;
      }
    })();

    return this.wakePromise;
  }

  /**
   * POST with transient retry. Retries on:
   *  - no response (network / ECONNRESET / timeout)
   *  - 502 / 503 / 504 (Render proxy cold-start codes)
   *
   * On a transient failure we invalidate the warm flag and re-wake,
   * because the proxy may have killed the container mid-request.
   */
  private async postWithRetry<T>(
    url: string,
    body: unknown,
    attempts = 3,
  ): Promise<T> {
    let lastErr: unknown;

    for (let i = 0; i < attempts; i++) {
      try {
        await this.wakeUp();
        const { data } = await this.http.post<T>(url, body);
        return data;
      } catch (err) {
        lastErr = err;
        const e = err as AxiosError;
        const transient =
          !e.response ||
          e.response.status === 502 ||
          e.response.status === 503 ||
          e.response.status === 504;

        if (!transient || i === attempts - 1) {
          throw err;
        }

        // Container likely died mid-request — force a re-wake on next loop
        this.isWarm = false;
        const delay = 1500 * (i + 1); // 1.5s, 3s
        this.logger.warn(
          `Parser ${url} transient error (${
            e.response?.status ?? e.code ?? 'network'
          }), retry ${i + 1}/${attempts - 1} in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastErr;
  }

  async extract(params: {
    pdfBase64: string;
    regions: ParserRegionInput[];
  }): Promise<ParserExtractResponse> {
    try {
      return await this.postWithRetry<ParserExtractResponse>('/extract', {
        pdf_base64: params.pdfBase64,
        regions: params.regions,
      });
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? `${err.response?.status ?? 'network'} ${err.message}`
        : String(err);
      this.logger.error(`Parser extract failed: ${msg}`);
      throw new InternalServerErrorException(
        `Prospectus parser failed: ${msg}`,
      );
    }
  }

  async getPageInfo(pdfBase64: string): Promise<ParserPageInfo> {
    try {
      return await this.postWithRetry<ParserPageInfo>('/info', {
        pdf_base64: pdfBase64,
      });
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? `${err.response?.status ?? 'network'} ${err.message}`
        : String(err);
      this.logger.error(`Parser /info failed: ${msg}`);
      throw new InternalServerErrorException(
        `Prospectus parser /info failed: ${msg}`,
      );
    }
  }

  async health(): Promise<{
    status: string;
    service: string;
    version: string;
  }> {
    const { data } = await this.healthHttp.get('/health');
    return data;
  }
}