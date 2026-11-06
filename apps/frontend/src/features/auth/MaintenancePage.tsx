// MaintenancePage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSystemStatus } from '../../api/system-status.api';
import { Bbcode } from '../../lib/bbcode';
import { useAuthStore } from '../../store/auth.store';
import { supabase } from '../../lib/supabase';
import {
  isLocalMaintenanceBypassEnabled,
  isMaintenancePreviewEnabled,
} from '../../lib/maintenance-preview';
import Icon from '../../components/ui/Icon';
import CactusRunner from './components/CactusRunner';

export default function MaintenancePage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [started, setStarted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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

  const showWall =
    (data?.maintenanceMode === true && !isLocalMaintenanceBypassEnabled()) ||
    isMaintenancePreviewEnabled();

  // Game exists only after the user pressed Play AND we are still in maintenance.
  // If maintenance ends while the game is running, this flips to false and the
  // CactusRunner unmounts (its RAF loop + listeners are torn down), effectively
  // stopping and hiding the game — "not playable and hide the game".
  const gameStarted = started && showWall;

  // Reset game state if maintenance ends mid-run.
  useEffect(() => {
    if (!showWall) {
      setStarted(false);
      setCollapsed(false);
    }
  }, [showWall]);

  // Redirect out once the wall is no longer shown.
  useEffect(() => {
    if (!data || showWall) return;
    if (
      isDev ||
      profile?.role === 'college_dean' ||
      profile?.role === 'college_secretary'
    ) {
      navigate('/dean/dashboard', { replace: true });
    } else if (profile?.role === 'department_head') {
      navigate('/dashboard', { replace: true });
    } else if (!profile) {
      navigate('/login', { replace: true });
    }
  }, [data, showWall, isDev, profile, navigate]);

  const handleRefresh = async () => {
    setError(null);
    setRefreshing(true);
    try {
      const result = await refetch();
      if (result.error) {
        setError(
          result.error instanceof Error
            ? result.error.message
            : 'Could not reach the status service.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the status service.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    navigate('/login', { replace: true });
  };

  const handlePlay = () => {
    setStarted(true);
    setCollapsed(true);
  };

  const handleResumeGame = () => setCollapsed(true);
  const handleExpandCard = () => setCollapsed(false);

  const title = data?.title?.trim() || 'CoE-NNECT is under maintenance';
  const busy = refreshing || isFetching;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      {/* Game is only mounted after Play, and never when maintenance has ended. */}
      {gameStarted && <CactusRunner active={collapsed} />}

      {/* Wall wrapper — fades out when the game starts. Once collapsed, all
          interactive children drop pointer-events so taps reach the game. */}
      <div
        className={[
          'relative z-10 min-h-[100svh] flex items-center justify-center',
          'px-3 sm:px-4 py-8 sm:py-12',
          'pointer-events-none transition-opacity duration-300',
          collapsed ? 'opacity-0' : 'opacity-100',
        ].join(' ')}
        style={{
          paddingTop: 'max(2rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
        }}
        aria-hidden={collapsed || undefined}
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-center justify-center gap-4 sm:gap-5 w-full max-w-xl sm:max-w-3xl">
          {/* Card */}
          <div
            className={[
              'relative w-full sm:w-auto sm:flex-1 max-w-xl',
              'bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-2xl overflow-hidden',
              collapsed ? 'pointer-events-none' : 'pointer-events-auto',
            ].join(' ')}
          >
            <div className="h-1.5 bg-violet-600" />

            <div className="flex items-center justify-between gap-2 px-3 sm:px-4 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 truncate">
                Scheduled maintenance
              </p>
              {/* Only render "Resume game" after the game has been started. */}
              {started && (
                <button
                  type="button"
                  onClick={handleResumeGame}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:bg-slate-200 transition text-[11px] font-semibold touch-manipulation"
                  title="Back to game"
                  aria-label="Minimize card and resume game"
                >
                  <Icon name="minimize" size={14} />
                  <span className="hidden xs:inline sm:inline">Resume game</span>
                </button>
              )}
            </div>

            <div className="p-5 sm:p-8 pt-4 space-y-5 sm:space-y-6">
              <div className="flex flex-col items-center text-center gap-3 sm:gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-violet-50 border border-violet-200 rounded-full flex items-center justify-center">
                  <Icon name="build" filled size={28} className="text-violet-600 sm:hidden" />
                  <Icon name="build" filled size={32} className="text-violet-600 hidden sm:block" />
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight break-words">
                  {title}
                </h1>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 sm:p-4 text-[13px] sm:text-sm leading-relaxed text-slate-700 whitespace-pre-line break-words">
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
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2"
                >
                  <Icon name="error" size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-[#5c1219] text-white text-sm font-semibold rounded-lg hover:opacity-90 active:opacity-80 transition disabled:opacity-50 touch-manipulation"
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
                    className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation"
                  >
                    <Icon name="logout" size={16} />
                    Sign out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation"
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
                  className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold rounded-lg hover:bg-amber-100 active:bg-amber-200 transition touch-manipulation"
                >
                  <Icon name="developer_mode" size={16} />
                  Open Dev Tools
                </button>
              )}

              <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 border-t border-slate-100 break-words">
                {profile ? (
                  <>
                    Signed in as <strong>{profile.username}</strong> ({profile.email})
                  </>
                ) : (
                  'Only the developer account can sign in during maintenance.'
                )}
                {data?.updatedAt && (
                  <>
                    {' '}· Updated{' '}
                    {new Date(data.updatedAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Play button — only shown before the game has started. */}
          {!started && (
            <div className="shrink-0 w-full sm:w-auto flex justify-center sm:justify-start pointer-events-auto">
              <button
                type="button"
                onClick={handlePlay}
                className={[
                  'group relative inline-flex items-center justify-center gap-2',
                  'bg-gradient-to-br from-violet-600 to-violet-700 text-white',
                  'font-bold rounded-full shadow-lg shadow-violet-500/30',
                  'hover:from-violet-700 hover:to-violet-800',
                  'active:scale-95 active:shadow-md',
                  'transition-all duration-150 touch-manipulation',
                  'ring-2 ring-white/80',
                  'w-full min-h-[48px] px-6 py-3 text-sm',
                  'sm:w-16 sm:h-16 sm:min-h-0 sm:p-0',
                ].join(' ')}
                title="Play Cactus Run"
                aria-label="Play Cactus Run"
              >
                <span className="absolute inset-0 rounded-full bg-violet-500/40 animate-ping opacity-60 pointer-events-none" />
                <Icon name="play_arrow" filled size={26} />
                <span className="sm:hidden">Play</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating status pill — only when the game is actually running. */}
      {gameStarted && collapsed && (
        <div
          className="fixed z-20 pointer-events-auto select-none"
          style={{
            top: 'max(0.75rem, env(safe-area-inset-top))',
            left: 'max(0.75rem, env(safe-area-inset-left))',
          }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 bg-white/90 backdrop-blur-md border border-slate-200 shadow-lg rounded-xl pl-3 pr-1.5 py-1.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Maintenance
              </span>
            </span>
            <div className="w-px h-5 bg-slate-200" />
            <button
              type="button"
              onClick={handleRefresh}
              disabled={busy}
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md text-slate-500 hover:text-[#5c1219] hover:bg-slate-100 active:bg-slate-200 transition disabled:opacity-50 touch-manipulation"
              title="Check again"
              aria-label="Check again"
            >
              {busy ? (
                <span className="block w-3.5 h-3.5 border-2 border-slate-300 border-t-[#5c1219] rounded-full animate-spin" />
              ) : (
                <Icon name="refresh" size={14} />
              )}
            </button>
            <button
              type="button"
              onClick={handleExpandCard}
              className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-violet-700 hover:bg-violet-50 active:bg-violet-100 transition touch-manipulation"
              title="Show details"
              aria-label="Expand maintenance card"
            >
              <Icon name="expand" size={14} />
              Show
            </button>
          </div>
        </div>
      )}

      {gameStarted && collapsed && (
        <div
          className="sm:hidden fixed bottom-0 inset-x-0 z-20 pointer-events-none flex justify-center"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="px-3 py-1.5 rounded-full bg-slate-900/70 backdrop-blur text-white text-[10px] font-medium animate-pulse">
            🔄 Rotate for a wider play area
          </div>
        </div>
      )}
    </div>
  );
}