import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

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
export class ProspectusParserClient {
  private readonly logger = new Logger(ProspectusParserClient.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('PROSPECTUS_PARSER_URL') ??
      'http://localhost:8001';
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 60_000,
      // Base64 payloads can be large (a 5MB PDF → ~7MB base64)
      maxBodyLength: 50 * 1024 * 1024,
      maxContentLength: 50 * 1024 * 1024,
    });
    this.logger.log(`Prospectus parser client → ${this.baseUrl}`);
  }

  /**
   * Render's free tier spins down services after 15 minutes of inactivity.
   * Pinging /health wakes up the Python container. Once awake, the
   * subsequent POST requests go through instantly.
   */
  private async wakeUp(): Promise<void> {
    try {
      this.logger.log(`Waking up parser service at ${this.baseUrl}...`);
      // 90 second timeout to allow Render to cold-start
      await this.http.get('/health', { timeout: 90_000 });
      this.logger.log(`Parser service is awake.`);
    } catch (err) {
      this.logger.warn(
        `Parser wake-up ping failed: ${(err as Error).message}. Proceeding anyway.`,
      );
    }
  }

  async extract(params: {
    pdfBase64: string;
    regions: ParserRegionInput[];
  }): Promise<ParserExtractResponse> {
    await this.wakeUp(); // <-- Wake up the container first

    try {
      const { data } = await this.http.post<ParserExtractResponse>(
        '/extract',
        {
          pdf_base64: params.pdfBase64,
          regions: params.regions,
        },
      );
      return data;
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
    await this.wakeUp(); // <-- Wake up the container first

    try {
      const { data } = await this.http.post<ParserPageInfo>('/info', {
        pdf_base64: pdfBase64,
      });
      return data;
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
    const { data } = await this.http.get('/health');
    return data;
  }
}