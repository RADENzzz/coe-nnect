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
    void heartbeatPresence(1_500).catch(() => {});
    queryClient.clear();
    clearAuth();

    const signOutPromise = supabase.auth.signOut({ scope: 'local' }).catch(
      () => undefined,
    );
    const signOutTimeout = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1_500);
    });

    await Promise.race([signOutPromise, signOutTimeout]);
    navigate('/login', { replace: true });
  };
}