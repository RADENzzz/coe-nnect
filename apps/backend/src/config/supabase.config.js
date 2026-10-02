"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupabaseConfig = createSupabaseConfig;
function createSupabaseConfig(config) {
    var url = config.get('SUPABASE_URL');
    var anonKey = config.get('SUPABASE_ANON_KEY');
    var serviceRoleKey = config.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceRoleKey) {
        throw new Error('Missing Supabase env vars. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.');
    }
    return { url: url, anonKey: anonKey, serviceRoleKey: serviceRoleKey };
}
