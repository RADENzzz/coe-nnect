import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import {
  fetchSystemStatus,
  type SystemStatusSeverity,
} from '../../../api/system-status.api';

const DISMISSED_KEY = 'coe-nnect:dismissed-status';

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

/**
 * Login-page banner driven by the `system_status` table.
 *
 * Behavior:
 *  - Fetched on mount (public endpoint — no auth required).
 *  - Renders nothing when `enabled=false` or when the user has dismissed
 *    this exact version (keyed by `updatedAt` so a NEW message re-shows).
 *  - Dismissible per browser session via sessionStorage.
 */
export default function SystemStatusBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    staleTime: 60_000,
    retry: 1,
  });

  const [dismissedVersion, setDismissedVersion] = useState<string | null>(
    () => {
      try {
        return sessionStorage.getItem(DISMISSED_KEY);
      } catch {
        return null;
      }
    },
  );

  useEffect(() => {
    // When the server sends a different version (different updatedAt),
    // clear the dismissed state so the user sees the new message.
    if (!data?.updatedAt) return;
    if (dismissedVersion && dismissedVersion !== data.updatedAt) {
      setDismissedVersion(null);
      try {
        sessionStorage.removeItem(DISMISSED_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [data?.updatedAt, dismissedVersion]);

  if (isLoading || !data?.enabled) return null;
  if (!data.title) return null;
  if (dismissedVersion === data.updatedAt) return null;

  const theme = THEMES[data.severity];

  const dismiss = () => {
    setDismissedVersion(data.updatedAt);
    try {
      sessionStorage.setItem(DISMISSED_KEY, data.updatedAt);
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
            {data.title}
          </p>
          {data.message && (
            <p
              className={`text-xs mt-1 whitespace-pre-line leading-relaxed ${theme.body}`}
            >
              {data.message}
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