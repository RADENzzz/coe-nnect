import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth.store';
import { heartbeatPresence } from '../api/users.api';
import { waitForMinimumLogoutAnimation } from './logout-flow';

export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setLoggingOut = useAuthStore((s) => s.setLoggingOut);

  return async () => {
    setLoggingOut(true);
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
    await waitForMinimumLogoutAnimation();
    setLoggingOut(false);
    await waitForMinimumLogoutAnimation(160);
    navigate('/login', { replace: true });
  };
}