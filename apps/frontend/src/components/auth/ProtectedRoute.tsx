import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { supabase } from '../../lib/supabase';

interface ProtectedRouteProps {
  allowedRoles?: string[];
  redirectTo?: string;
}

export default function ProtectedRoute({ allowedRoles, redirectTo = '/login' }: ProtectedRouteProps) {
  const { user, profile, isLoading, setUser, setProfile, setLoading } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    // onAuthStateChange fires immediately with the existing session (SIGNED_IN event),
    // so we don't need a separate initAuth() call — that was causing the race condition.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          const { data } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', session.user.id)
            .single();
          if (data) setProfile(data);
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [setUser, setProfile, setLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low text-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-on-surface-variant">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    // Admins always go to /admin; everyone else to /dashboard
    const fallback = profile.role === 'administrator' ? '/admin' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
