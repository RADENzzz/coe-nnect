// components/auth/ProtectedRoute.tsx
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type Role = 'administrator' | 'department_head' | 'college_dean';

export default function ProtectedRoute({
  allowedRoles,
  redirectTo = '/login',
}: {
  allowedRoles: Role[];
  redirectTo?: string;
}) {
  const location = useLocation();
  const [status, setStatus] = useState<'loading' | 'authed' | 'unauthed'>('loading');
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let mounted = true;

    // Initial check — but rely on the event, not just getSession
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (!session?.user) {
          setRole(null);
          setStatus('unauthed');
          return;
        }

        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('user_id', session.user.id)
          .single();

        if (!mounted) return;
        setRole((profile?.role as Role) ?? null);
        setStatus(profile ? 'authed' : 'unauthed');
      }

      if (event === 'SIGNED_OUT') {
        setRole(null);
        setStatus('unauthed');
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (status === 'loading') {
    // small spinner so we never flash-redirect during hydration
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthed') {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (role && !allowedRoles.includes(role)) {
    // logged in but wrong role
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}