import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth.store';
import type { UserProfile } from '../../store/auth.store';

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, username, email, role, dept_id, faculty_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserProfile;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setProfile, setLoading } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    // Load initial session
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(session.user);

      // First: try app_metadata for the role (no RLS, set by service role)
      const metaRole = session.user.app_metadata?.role as string | undefined;

      if (metaRole) {
        // Build a minimal profile from metadata so ProtectedRoute doesn't spin forever
        setProfile({
          user_id: session.user.id,
          username: session.user.app_metadata?.username ?? session.user.email?.split('@')[0] ?? '',
          email: session.user.email ?? '',
          role: metaRole as UserProfile['role'],
          dept_id: session.user.app_metadata?.dept_id ?? null,
          faculty_id: session.user.app_metadata?.faculty_id ?? null,
        });
        setLoading(false);
      }

      // Then: fetch the full profile from the DB (may succeed if RLS allows it)
      const profile = await fetchProfile(session.user.id);
      if (cancelled) return;
      if (profile) {
        setProfile(profile);
      }
      setLoading(false);
    })();

    // Subscribe for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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
          setProfile({
            user_id: session.user.id,
            username: session.user.app_metadata?.username ?? session.user.email?.split('@')[0] ?? '',
            email: session.user.email ?? '',
            role: metaRole as UserProfile['role'],
            dept_id: session.user.app_metadata?.dept_id ?? null,
            faculty_id: session.user.app_metadata?.faculty_id ?? null,
          });
          setLoading(false);
        }

        const profile = await fetchProfile(session.user.id);
        if (cancelled) return;
        if (profile) setProfile(profile);
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setUser, setProfile, setLoading]);

  return <>{children}</>;
}