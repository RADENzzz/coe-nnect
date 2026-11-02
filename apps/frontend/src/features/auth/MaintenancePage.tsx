import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSystemStatus } from '../../api/system-status.api';
import { Bbcode } from '../../lib/bbcode';
import { useAuthStore } from '../../store/auth.store';
import { supabase } from '../../lib/supabase';
import Icon from '../../components/ui/Icon';

/**
 * The wall shown to everyone except the hidden developer account while
 * `system_status.maintenance_mode` is true.
 *
 * It reads the same public system_status row as the login banner, so the
 * title and message the developer writes in Dev Tools are exactly what
 * users see here. The page polls, so it clears itself as soon as the
 * developer turns maintenance mode off.
 */
export default function MaintenancePage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    retry: false,
    staleTime: 0,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const isDev = profile?.role === 'administrator';

  // If the gate is lifted (or this page is opened when there is no
  // maintenance), send the visitor back to where they belong.
  useEffect(() => {
    if (!data || data.maintenanceMode) return;
    if (isDev || profile?.role === 'college_dean') {
      navigate('/dean/dashboard', { replace: true });
    } else if (profile?.role === 'department_head') {
      navigate('/dashboard', { replace: true });
    } else if (!profile) {
      navigate('/login', { replace: true });
    }
  }, [data, isDev, profile, navigate]);

  const handleRefresh = async () => {
    setError(null);
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    navigate('/login', { replace: true });
  };

  const title = data?.title?.trim() || 'CoE-NNECT is under maintenance';
  const busy = refreshing || isFetching;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-xl bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="h-1.5 bg-violet-600" />

        <div className="p-8 space-y-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-violet-50 border border-violet-200 rounded-full flex items-center justify-center">
              <Icon name="build" filled size={32} className="text-violet-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                Scheduled maintenance
              </p>
              <h1 className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight">
                {title}
              </h1>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 whitespace-pre-line">
            {data?.message?.trim() ? (
              <Bbcode
                text={data.message}
                linkClassName="font-semibold text-[#5c1219] underline underline-offset-2"
              />
            ) : (
              <p>
                CoE-NNECT is temporarily unavailable while the developer
                performs maintenance. Please check back shortly.
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <Icon name="error" size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#5c1219] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {busy ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  <Icon name="refresh" size={16} />
                  Check again
                </>
              )}
            </button>

            {profile ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
              >
                <Icon name="logout" size={16} />
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
              >
                <Icon name="lock" size={16} />
                Sign in
              </button>
            )}
          </div>

          {isDev && (
            <button
              type="button"
              onClick={() => navigate('/dean/dev-tools')}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold rounded-lg hover:bg-amber-100 transition"
            >
              <Icon name="developer_mode" size={16} />
              Open Dev Tools
            </button>
          )}

          <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 border-t border-slate-100">
            {profile ? (
              <>
                Signed in as <strong>{profile.username}</strong> (
                {profile.email})
              </>
            ) : (
              'Only the developer account can sign in during maintenance.'
            )}
            {data?.updatedAt && (
              <>
                {' '}
                · Updated{' '}
                {new Date(data.updatedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
