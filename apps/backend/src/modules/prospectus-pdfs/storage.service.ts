import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'prospectus-pdfs';

@Injectable()
export class ProspectusStorageService {
  private readonly logger = new Logger(ProspectusStorageService.name);
  private readonly client: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      throw new InternalServerErrorException(
        'Supabase credentials missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async uploadPdf(params: {
    departmentId: string;
    pdfUuid: string;
    buffer: Buffer;
    contentType?: string;
  }): Promise<{ storagePath: string; bucket: string }> {
    const path = `dept-${params.departmentId}/${params.pdfUuid}/prospectus.pdf`;
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(path, params.buffer, {
        contentType: params.contentType ?? 'application/pdf',
        upsert: true,
      });
    if (error) {
      this.logger.error(`Supabase upload failed: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to upload PDF to storage: ${error.message}`,
      );
    }
    return { storagePath: path, bucket: BUCKET };
  }

  async downloadPdf(storagePath: string): Promise<Buffer> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .download(storagePath);
    if (error || !data) {
      this.logger.error(`Supabase download failed: ${error?.message}`);
      throw new InternalServerErrorException(
        `Failed to download PDF: ${error?.message ?? 'unknown'}`,
      );
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deletePdf(storagePath: string): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .remove([storagePath]);
    if (error) {
      this.logger.warn(`Supabase delete failed: ${error.message}`);
    }
  }

  async getSignedUrl(
    storagePath: string,
    ttlSeconds = 3600,
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, ttlSeconds);
    if (error || !data?.signedUrl) {
      this.logger.error(
        `Supabase signed URL failed: ${error?.message ?? 'no data'}`,
      );
      throw new InternalServerErrorException(
        `Failed to create signed URL: ${error?.message ?? 'unknown'}`,
      );
    }
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    return { signedUrl: data.signedUrl, expiresAt };
  }
}