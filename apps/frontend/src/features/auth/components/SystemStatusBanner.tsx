import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import {
  fetchSystemStatus,
  type SystemStatusSeverity,
} from '../../../api/system-status.api';

const DISMISSED_KEY = 'coe-nnect:dismissed-status';

/**
 * How long we wait before deciding the backend is "asleep" and
 * rendering the fallback banner. This window exists so a healthy
 * backend (which responds in <100ms) never flashes the fallback.
 *
 * Too short → banner flashes on every login (bad UX).
 * Too long  → user stares at a blank form for too long (bad UX).
 * 1.5s is the sweet spot — long enough for the fetch to land,
 * short enough that the warning appears before the user gives up.
 */
const FALLBACK_GRACE_MS = 1500;

/**
 * Hardcoded fallback that renders when the backend doesn't answer in
 * time. This is the whole point of the feature: if the backend is
 * asleep, we can't fetch a warning *from the backend*.
 *
 * Set `enabled: false` to disable the fallback entirely.
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
    'Backend, Solver (Automatic Generation) and PDF parser are currently on Render',
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
  const { data, isError, isLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  /**
   * Grace timer — flips to `true` after FALLBACK_GRACE_MS if the
   * backend hasn't answered yet. This is what prevents the fallback
   * from flashing for 50ms on every healthy login.
   */
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGraceElapsed(true), FALLBACK_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  // Decide what to render:
  //
  //  1. Fetch succeeded with enabled=true  → LIVE
  //  2. Fetch succeeded with enabled=false → NOTHING (backend is fine)
  //  3. Fetch errored                      → FALLBACK (backend is down)
  //  4. Fetch still loading, grace elapsed → FALLBACK (backend is slow)
  //  5. Fetch still loading, grace pending → NOTHING (wait for it)
  //
  const showLive = !!data?.enabled && !!data.title;
  const showFallback =
    FALLBACK.enabled &&
    (isError || (!data && !isLoading && graceElapsed) || (!data && isLoading && graceElapsed));

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

  // New message from server → clear dismissed state so user sees it.
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