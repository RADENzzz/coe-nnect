import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth.store';
import type { UserProfile } from '../../store/auth.store';

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select(
      `user_id, username, email, role, dept_id, faculty_id,
       department:dept_id ( dept_code, dept_name ),
       faculty:faculty_id ( first_name )`,
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  // Supabase returns relations as nested objects or arrays depending on the FK shape.
  const dept = Array.isArray((data as any).department)
    ? (data as any).department[0]
    : (data as any).department;
  const fac = Array.isArray((data as any).faculty)
    ? (data as any).faculty[0]
    : (data as any).faculty;

  return {
    user_id: data.user_id,
    username: data.username,
    email: data.email,
    role: data.role as UserProfile['role'],
    dept_id: data.dept_id,
    dept_code: dept?.dept_code ?? null,
    dept_name: dept?.dept_name ?? null,
    faculty_id: data.faculty_id,
    first_name: fac?.first_name ?? data.username ?? 'User',
  };
}

function profileFromMeta(user: any): UserProfile {
  const meta = user.app_metadata ?? {};
  const username =
    meta.username ?? user.email?.split('@')[0] ?? '';

  return {
    user_id: user.id,
    username,
    email: user.email ?? '',
    role: (meta.role ?? 'viewer') as UserProfile['role'],
    dept_id: meta.dept_id ?? null,
    dept_code: meta.dept_code ?? null,
    dept_name: meta.dept_name ?? null,
    faculty_id: meta.faculty_id ?? null,
    first_name: meta.first_name ?? username,
  };
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setUser, setProfile, setLoading } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    // Load initial session
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(session.user);

      // 1. Try app_metadata first (no RLS, set by service role)
      const metaRole = session.user.app_metadata?.role as string | undefined;
      if (metaRole) {
        setProfile(profileFromMeta(session.user));
        setLoading(false);
      }

      // 2. Then refine with the full DB profile (may succeed if RLS allows)
      const profile = await fetchProfile(session.user.id);
      if (cancelled) return;
      if (profile) setProfile(profile);
      setLoading(false);
    })();

    // Subscribe for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(session.user);

      const metaRole = session.user.app_metadata?.role as string | undefined;
      if (metaRole) {
        setProfile(profileFromMeta(session.user));
        setLoading(false);
      }

      const profile = await fetchProfile(session.user.id);
      if (cancelled) return;
      if (profile) setProfile(profile);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setUser, setProfile, setLoading]);

  return <>{children}</>;
}