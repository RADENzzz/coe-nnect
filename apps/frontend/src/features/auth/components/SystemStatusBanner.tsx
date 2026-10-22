import { useEffect, useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import {
  fetchSystemStatus,
  type SystemStatusSeverity,
} from '../../../api/system-status.api';

const DISMISSED_KEY = 'coe-nnect:dismissed-status';
const FALLBACK_GRACE_MS = 1500;

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
  link: string;
}

const THEMES: Record<SystemStatusSeverity, SeverityTheme> = {
  info: {
    wrap: 'bg-blue-50 border-blue-200',
    icon: 'bg-blue-100 text-blue-700',
    iconName: 'info',
    title: 'text-blue-900',
    body: 'text-blue-800',
    close: 'text-blue-500 hover:text-blue-700',
    link: 'text-blue-700 underline underline-offset-2 hover:text-blue-900 font-semibold',
  },
  warning: {
    wrap: 'bg-amber-50 border-amber-200',
    icon: 'bg-amber-100 text-amber-700',
    iconName: 'warning',
    title: 'text-amber-900',
    body: 'text-amber-800',
    close: 'text-amber-500 hover:text-amber-700',
    link: 'text-amber-800 underline underline-offset-2 hover:text-amber-950 font-semibold',
  },
  critical: {
    wrap: 'bg-red-50 border-red-200',
    icon: 'bg-red-100 text-red-700',
    iconName: 'error',
    title: 'text-red-900',
    body: 'text-red-800',
    close: 'text-red-500 hover:text-red-700',
    link: 'text-red-700 underline underline-offset-2 hover:text-red-950 font-semibold',
  },
  maintenance: {
    wrap: 'bg-violet-50 border-violet-200',
    icon: 'bg-violet-100 text-violet-700',
    iconName: 'build',
    title: 'text-violet-900',
    body: 'text-violet-800',
    close: 'text-violet-500 hover:text-violet-700',
    link: 'text-violet-700 underline underline-offset-2 hover:text-violet-950 font-semibold',
  },
};

/**
 * Parses a plain-text message into React nodes, supporting:
 *   - **bold**           → <strong>
 *   - [label](url)       → <a href="url">label</a>
 *   - bare https:// URLs → <a href="url">url</a>
 *   - \n                 → line breaks (via whitespace-pre-line on parent)
 *
 * No `dangerouslySetInnerHTML`. Every string is rendered by React, so
 * HTML in the message is escaped automatically and cannot execute.
 * Only http/https URLs are linked — `javascript:` / `data:` / `mailto:`
 * are rejected to prevent scheme-based XSS.
 */
function RichMessage({
  text,
  linkClassName,
}: {
  text: string;
  linkClassName: string;
}) {
  // Split on markdown links OR bare URLs OR **bold** — in one pass.
  // Group 1: markdown label, Group 2: markdown url,
  // Group 3: bold text,
  // Group 4: bare url
  const TOKEN_RE =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s]+)/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    const [fullMatch, mdLabel, mdUrl, boldText, bareUrl] = match;

    // Push the plain text between the previous match and this one
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`t-${key++}`}>
          {text.slice(lastIndex, match.index)}
        </Fragment>,
      );
    }

    if (mdLabel && mdUrl) {
      // [label](url)
      nodes.push(
        <a
          key={`md-${key++}`}
          href={mdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {mdLabel}
        </a>,
      );
    } else if (boldText) {
      // **bold**
      nodes.push(
        <strong key={`b-${key++}`} className="font-semibold">
          {boldText}
        </strong>,
      );
    } else if (bareUrl) {
      // bare https://...  — strip trailing punctuation like .,),,
      const cleaned = bareUrl.replace(/[.,;!?)]+$/, '');
      const trailing = bareUrl.slice(cleaned.length);
      nodes.push(
        <a
          key={`u-${key++}`}
          href={cleaned}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClassName} break-all`}
        >
          {cleaned}
        </a>,
      );
      if (trailing) {
        nodes.push(<Fragment key={`tr-${key++}`}>{trailing}</Fragment>);
      }
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Push the remaining text
  if (lastIndex < text.length) {
    nodes.push(
      <Fragment key={`tail-${key++}`}>{text.slice(lastIndex)}</Fragment>,
    );
  }

  return <>{nodes}</>;
}

export default function SystemStatusBanner() {
  const { data, isError, isLoading, refetch } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

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
              <RichMessage text={active.message} linkClassName={theme.link} />
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