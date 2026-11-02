import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check your .env file.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Builds a throwaway client used to verify credentials without creating an
 * app session.
 *
 * During maintenance the login page must know whether the person signing in
 * is the developer before admitting them. Using the main client would briefly
 * create a real session, and signing it out again revokes that account's
 * sessions on every device. This client keeps everything in memory and never
 * persists or refreshes anything, so probing a normal account cannot disturb
 * a session that is already signed in elsewhere.
 */
export function createAuthProbeClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'coe-nnect-auth-probe',
    },
  });
}