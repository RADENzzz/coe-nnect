import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
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

interface RetryConfig extends AxiosRequestConfig {
  _retryCount?: number;
}

@Injectable()
export class ProspectusParserClient implements OnModuleInit {
  private readonly logger = new Logger(ProspectusParserClient.name);
  private readonly http: AxiosInstance;
  private readonly healthHttp: AxiosInstance;
  private readonly baseUrl: string;

  private isWarm = false;
  private wakePromise: Promise<void> | null = null;
  private lastWarmAt = 0;

  private static readonly HEALTH_TIMEOUT_MS = 30_000;
  private static readonly WARM_TTL_MS = 10 * 60 * 1000;
  private static readonly REQUEST_TIMEOUT_MS = 60_000;
  private static readonly MAX_ATTEMPTS = 3;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('PROSPECTUS_PARSER_URL') ??
      'http://localhost:8001';

    const agentOpts = { keepAlive: true, maxSockets: 20 };
    const common = {
      baseURL: this.baseUrl,
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
    this.healthHttp = axios.create({
      ...common,
      timeout: ProspectusParserClient.HEALTH_TIMEOUT_MS,
    });

    this.logger.log(`Prospectus parser client → ${this.baseUrl}`);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.wakeUp();
    } catch {
      this.logger.warn(
        'Parser did not warm up on boot; will retry on first request.',
      );
    }
  }

  private async wakeUp(): Promise<void> {
    if (
      this.isWarm &&
      Date.now() - this.lastWarmAt < ProspectusParserClient.WARM_TTL_MS
    ) {
      return;
    }
    if (this.wakePromise) return this.wakePromise;

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

  private async postWithRetry<T>(url: string, body: unknown): Promise<T> {
    let lastErr: unknown;

    for (
      let attempt = 1;
      attempt <= ProspectusParserClient.MAX_ATTEMPTS;
      attempt++
    ) {
      const cfg: RetryConfig = {
        timeout: ProspectusParserClient.REQUEST_TIMEOUT_MS,
        _retryCount: attempt,
      };

      try {
        await this.wakeUp();
        const { data } = await this.http.post<T>(url, body, cfg);
        return data;
      } catch (err) {
        lastErr = err;
        const e = err as AxiosError;
        const transient =
          !e.response ||
          e.response.status === 502 ||
          e.response.status === 503 ||
          e.response.status === 504 ||
          e.code === 'ECONNRESET' ||
          e.code === 'ETIMEDOUT';

        if (!transient || attempt === ProspectusParserClient.MAX_ATTEMPTS) {
          throw err;
        }

        this.isWarm = false;
        const delay = 1500 * attempt;
        this.logger.warn(
          `Parser ${url} transient (${
            e.response?.status ?? e.code ?? 'network'
          }), retry ${attempt}/${
            ProspectusParserClient.MAX_ATTEMPTS - 1
          } in ${delay}ms`,
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