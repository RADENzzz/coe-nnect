import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth.store';
import { heartbeatPresence } from '../api/users.api';

export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return async () => {
    // Stamp the exact moment the user left. Cap the wait so a slow or
    // unreachable API cannot strand them on the current page — the regular
    // one-minute heartbeat has already covered earlier activity.
    await heartbeatPresence(4_000).catch(() => {});

    queryClient.clear();
    clearAuth();
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };
}