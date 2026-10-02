import { ConfigService } from '@nestjs/config';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export function createSupabaseConfig(config: ConfigService): SupabaseConfig {
  const url = config.get<string>('SUPABASE_URL');
  const anonKey = config.get<string>('SUPABASE_ANON_KEY');
  const serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase env vars. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return { url, anonKey, serviceRoleKey };
}