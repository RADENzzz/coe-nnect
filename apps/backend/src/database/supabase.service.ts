import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseConfig } from '../config/supabase.config';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private anonClient: SupabaseClient;
  private adminClient: SupabaseClient;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const { url, anonKey, serviceRoleKey } = createSupabaseConfig(this.config);

    // Anon client — used to VERIFY user JWTs
    this.anonClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Admin client — used to CREATE/MANAGE users (service role)
    this.adminClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
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
}