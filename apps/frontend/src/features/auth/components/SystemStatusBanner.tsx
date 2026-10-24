import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import { Bbcode } from '../../../lib/bbcode';
import {
  fetchSystemStatus,
  type SystemStatusSeverity,
} from '../../../api/system-status.api';

const DISMISSED_KEY = 'coe-nnect:dismissed-status';
/** How long the popup stays un-closable before the close button appears. */
const CLOSE_DELAY_SECONDS = 5;

interface SeverityTheme {
  /** Card border colour. */
  panel: string;
  /** Top accent bar of the card. */
  accent: string;
  /** Icon badge (background + foreground). */
  icon: string;
  iconName: string;
  title: string;
  body: string;
  close: string;
  link: string;
  /** Severity pill (background + foreground). */
  pill: string;
}

const THEMES: Record<SystemStatusSeverity, SeverityTheme> = {
  info: {
    panel: 'border-blue-200',
    accent: 'bg-blue-500',
    icon: 'bg-blue-100 text-blue-700',
    iconName: 'info',
    title: 'text-blue-900',
    body: 'text-blue-800',
    close: 'text-blue-500 hover:text-blue-700',
    link: 'text-blue-700 underline underline-offset-2 hover:text-blue-900 font-semibold',
    pill: 'bg-blue-100 text-blue-700',
  },
  warning: {
    panel: 'border-amber-200',
    accent: 'bg-amber-500',
    icon: 'bg-amber-100 text-amber-700',
    iconName: 'warning',
    title: 'text-amber-900',
    body: 'text-amber-800',
    close: 'text-amber-500 hover:text-amber-700',
    link: 'text-amber-800 underline underline-offset-2 hover:text-amber-950 font-semibold',
    pill: 'bg-amber-100 text-amber-700',
  },
  critical: {
    panel: 'border-red-200',
    accent: 'bg-red-500',
    icon: 'bg-red-100 text-red-700',
    iconName: 'error',
    title: 'text-red-900',
    body: 'text-red-800',
    close: 'text-red-500 hover:text-red-700',
    link: 'text-red-700 underline underline-offset-2 hover:text-red-950 font-semibold',
    pill: 'bg-red-100 text-red-700',
  },
  maintenance: {
    panel: 'border-violet-200',
    accent: 'bg-violet-500',
    icon: 'bg-violet-100 text-violet-700',
    iconName: 'build',
    title: 'text-violet-900',
    body: 'text-violet-800',
    close: 'text-violet-500 hover:text-violet-700',
    link: 'text-violet-700 underline underline-offset-2 hover:text-violet-950 font-semibold',
    pill: 'bg-violet-100 text-violet-700',
  },
};

export default function SystemStatusBanner() {
  const { data, refetch } = useQuery({
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

  const active =
    data?.enabled && data.title
      ? {
          severity: data.severity,
          title: data.title,
          message: data.message,
          updatedAt: data.updatedAt,
        }
      : null;

  // Flattened so the effects below can depend on plain primitives.
  const version = active?.updatedAt ?? null;
  const severity = active?.severity ?? 'info';
  const title = active?.title ?? '';
  const message = active?.message ?? '';

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
    if (!version) return;
    if (dismissedVersion && dismissedVersion !== version) {
      setDismissedVersion(null);
      try {
        sessionStorage.removeItem(DISMISSED_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [version, dismissedVersion]);

  // Popup visibility + the 3 second "read before closing" countdown.
  const [open, setOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CLOSE_DELAY_SECONDS);

  useEffect(() => {
    if (!version || dismissedVersion === version) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setSecondsLeft(CLOSE_DELAY_SECONDS);
  }, [version, dismissedVersion]);

  const locked = secondsLeft > 0;

  useEffect(() => {
    if (!open || secondsLeft <= 0) return;
    const t = window.setTimeout(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => window.clearTimeout(t);
  }, [open, secondsLeft]);

  const dismiss = useCallback(() => {
    if (!version) return;
    setDismissedVersion(version);
    try {
      sessionStorage.setItem(DISMISSED_KEY, version);
    } catch {
      /* ignore */
    }
  }, [version]);

  // Escape closes the popup — but only once the countdown has finished.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (!locked) dismiss();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, locked, dismiss]);

  // Lock background scrolling while the popup is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panelRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  // Once the countdown ends, hand focus to the close button (unless the
  // user already moved focus somewhere else).
  useEffect(() => {
    if (!open || locked) return;
    const focused = document.activeElement;
    if (
      focused &&
      focused !== document.body &&
      focused !== panelRef.current &&
      focused !== closeButtonRef.current
    ) {
      return;
    }
    closeButtonRef.current?.focus();
  }, [open, locked]);

  if (!active || !open) return null;

  const theme = THEMES[severity];

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      {/* Backdrop — click to dismiss, only after the countdown. */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-backdrop-in"
        aria-hidden="true"
        onClick={() => {
          if (!locked) dismiss();
        }}
      />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="system-status-title"
        aria-describedby={message ? 'system-status-message' : undefined}
        tabIndex={-1}
        className={`relative w-full max-w-lg overflow-hidden rounded-xl border bg-white shadow-2xl outline-none animate-dialog-pop ${theme.panel}`}
      >
        <div
          className={`relative h-1.5 w-full overflow-hidden ${theme.accent}`}
          aria-hidden="true"
        >
          <span className="absolute inset-0 -translate-x-full animate-accent-sweep bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${theme.icon}`}
            >
              {severity === 'critical' && (
                <span
                  className="absolute inset-0 animate-ping-slow rounded-lg bg-red-400/50"
                  aria-hidden="true"
                />
              )}
              <Icon
                name={theme.iconName}
                filled
                size={22}
                className="relative animate-icon-pop"
              />
            </span>

            <div
              className="min-w-0 flex-1 animate-reveal"
              style={{ animationDelay: '60ms' }}
            >
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${theme.pill}`}
              >
                {severity}
              </span>
              <h2
                id="system-status-title"
                className={`mt-1.5 text-base font-bold leading-snug ${theme.title}`}
              >
                {title}
              </h2>
            </div>
          </div>

          {message && (
            <div
              id="system-status-message"
              className={`mt-3 max-h-[45vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed animate-reveal ${theme.body}`}
              style={{ animationDelay: '120ms' }}
            >
              <Bbcode text={message} linkClassName={theme.link} />
            </div>
          )}
        </div>

        <div className="h-0.5 w-full bg-slate-100" aria-hidden="true">
          {locked && (
            <div
              className={`h-full origin-left animate-countdown ${theme.accent}`}
              style={{ animationDuration: `${CLOSE_DELAY_SECONDS}s` }}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <p className="text-[11px] text-slate-500">
            {locked
              ? 'Please read the notice before closing.'
              : 'You can close this notice now.'}
          </p>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={dismiss}
            disabled={locked}
            aria-label={
              locked
                ? `Close notice available in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}`
                : 'Close notice'
            }
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
              locked
                ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                : 'bg-slate-900 text-white hover:bg-slate-700 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1'
            }`}
          >
            {locked ? (
              <>
                <Icon name="schedule" size={16} className="animate-pulse" />
                <span className="tabular-nums">{secondsLeft}s</span>
              </>
            ) : (
              <>
                <Icon name="close" size={16} className="animate-icon-pop" />
                Close
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
