import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth.store';

export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return async () => {
    queryClient.clear();
    clearAuth();
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };
}