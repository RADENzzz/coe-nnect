import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import {
  fetchSystemStatus,
  type SystemStatusSeverity,
} from '../../../api/system-status.api';

const DISMISSED_KEY = 'coe-nnect:dismissed-status';
const FALLBACK_GRACE_MS = 1500;

/**
 * Hardcoded fallback that renders when the backend/Supabase can't be
 * reached in time. The whole point of the banner is to warn about
 * outages — so the warning itself must not depend on a healthy backend.
 */
const FALLBACK: {
  enabled: boolean;
  severity: SystemStatusSeverity;
  title: string;
  message: string;
} = {
  enabled: true,
  severity: 'warning',
  title:
    'Backend, Solver (Automatic Generation), and PDF Parser migrated to Render',
  message:
    'Railway is experiencing a global platform outage, so the backend, ' +
    'solver, and PDF parser have been moved to Render in the meantime.\n\n' +
    'Render is a downgrade, so you may experience:\n' +
    '• Long loading wait times\n' +
    '• Auto Generation failures\n' +
    '• PDF parser failures\n\n' +
    'This is because these services need to stay awake to function.\n\n' +
    'Once Railway is fixed, we will move back.\n\n' +
    'Thank you for your understanding.\n— RadenZ',
};

interface SeverityTheme {
  wrap: string;
  icon: string;
  iconName: string;
  title: string;
  body: string;
  close: string;
}

const THEMES: Record<SystemStatusSeverity, SeverityTheme> = {
  info: {
    wrap: 'bg-blue-50 border-blue-200',
    icon: 'bg-blue-100 text-blue-700',
    iconName: 'info',
    title: 'text-blue-900',
    body: 'text-blue-800',
    close: 'text-blue-500 hover:text-blue-700',
  },
  warning: {
    wrap: 'bg-amber-50 border-amber-200',
    icon: 'bg-amber-100 text-amber-700',
    iconName: 'warning',
    title: 'text-amber-900',
    body: 'text-amber-800',
    close: 'text-amber-500 hover:text-amber-700',
  },
  critical: {
    wrap: 'bg-red-50 border-red-200',
    icon: 'bg-red-100 text-red-700',
    iconName: 'error',
    title: 'text-red-900',
    body: 'text-red-800',
    close: 'text-red-500 hover:text-red-700',
  },
  maintenance: {
    wrap: 'bg-violet-50 border-violet-200',
    icon: 'bg-violet-100 text-violet-700',
    iconName: 'build',
    title: 'text-violet-900',
    body: 'text-violet-800',
    close: 'text-violet-500 hover:text-violet-700',
  },
};

export default function SystemStatusBanner() {
  const { data, isError, isLoading, refetch } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    retry: false,
    // Safety net — poll every 30s while the tab is visible
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    // Fires on minimize→restore / alt+tab within the OS
    refetchOnWindowFocus: true,
    // Fires when the network comes back online
    refetchOnReconnect: true,
    staleTime: 0,
  });

  /**
   * The `refetchOnWindowFocus` option covers OS-level focus events
   * (minimize/restore, alt+tab between apps). It does NOT fire on
   * tab-switch within the same browser window — e.g. user opens
   * /login in tab A, switches to tab B to read Slack, comes back to
   * tab A. `visibilitychange` fires in both cases, so we listen to it
   * to guarantee the banner refreshes the moment the user returns to
   * the page. This also covers mobile Safari/Chrome lock→unlock.
   */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refetch]);

  // Grace timer — prevents the fallback from flashing on healthy loads
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGraceElapsed(true), FALLBACK_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  const showLive = !!data?.enabled && !!data.title;
  const showFallback =
    FALLBACK.enabled &&
    (isError ||
      (!data && !isLoading && graceElapsed) ||
      (!data && isLoading && graceElapsed));

  const active = showLive
    ? {
        severity: data!.severity,
        title: data!.title!,
        message: data!.message,
        updatedAt: data!.updatedAt,
        isFallback: false,
      }
    : showFallback
      ? {
          severity: FALLBACK.severity,
          title: FALLBACK.title,
          message: FALLBACK.message,
          updatedAt: 'fallback',
          isFallback: true,
        }
      : null;

  const [dismissedVersion, setDismissedVersion] = useState<string | null>(
    () => {
      try {
        return sessionStorage.getItem(DISMISSED_KEY);
      } catch {
        return null;
      }
    },
  );

  // New message from the server → clear dismissed state so the user
  // sees the fresh notice.
  useEffect(() => {
    if (!active?.updatedAt) return;
    if (dismissedVersion && dismissedVersion !== active.updatedAt) {
      setDismissedVersion(null);
      try {
        sessionStorage.removeItem(DISMISSED_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [active?.updatedAt, dismissedVersion]);

  if (!active) return null;
  if (dismissedVersion === active.updatedAt) return null;

  const theme = THEMES[active.severity];

  const dismiss = () => {
    setDismissedVersion(active.updatedAt);
    try {
      sessionStorage.setItem(DISMISSED_KEY, active.updatedAt);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`mb-5 rounded-lg border ${theme.wrap} p-3.5 animate-fade-in`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${theme.icon}`}
        >
          <Icon name={theme.iconName} filled size={18} />
        </span>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-snug ${theme.title}`}>
            {active.title}
          </p>
          {active.message && (
            <p
              className={`text-xs mt-1 whitespace-pre-line leading-relaxed ${theme.body}`}
            >
              {active.message}
            </p>
          )}
          {active.isFallback && (
            <p className={`text-[10px] mt-2 opacity-70 ${theme.body}`}>
              (Live status unavailable — showing cached notice)
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className={`shrink-0 p-1 rounded transition-colors ${theme.close}`}
          aria-label="Dismiss notice"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}