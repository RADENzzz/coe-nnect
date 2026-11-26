import {
  type CSSProperties,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { playErrorSound, playSuccessSound } from '../../lib/sound';
import Icon from './Icon';

export type FeedbackVariant = 'success' | 'error' | 'failed';

export interface FeedbackOptions {
  /** Accepted for compatibility but ignored. */
  id?: string;
  /** Card heading. Defaults to the variant label (e.g. "Success"). */
  title?: string;
  /** How long the card stays on screen. Clamped to at least 800ms. */
  durationMs?: number;
}

export interface FeedbackApi {
  success: (message: string, options?: FeedbackOptions) => void;
  error: (message: string, options?: FeedbackOptions) => void;
  failed: (message: string, options?: FeedbackOptions) => void;
}

interface FeedbackItem {
  /** Internal monotonically increasing key. */
  id: number;
  variant: FeedbackVariant;
  title: string;
  message: string;
  durationMs: number;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

const RESULT_PATHS = {
  check: 'M4 12.5 9.5 18 20 6.5',
  cross: 'M5 5 19 19M19 5 5 19',
} as const;

const VARIANT_META: Record<
  FeedbackVariant,
  {
    label: string;
    result: 'check' | 'cross';
    toneClass: string;
    iconClass: string;
    iconWrap: string;
    labelClass: string;
    defaultDurationMs: number;
  }
> = {
  success: {
    label: 'Success',
    result: 'check',
    toneClass: 'text-emerald-600 border-emerald-500 bg-emerald-50',
    iconClass: 'text-emerald-600',
    iconWrap: 'bg-white/70 border border-slate-200',
    labelClass: 'text-emerald-700',
    defaultDurationMs: 6000,
  },
  error: {
    label: 'Error',
    result: 'cross',
    toneClass: 'text-red-600 border-red-500 bg-red-50',
    iconClass: 'text-red-600',
    iconWrap: 'bg-white/70 border border-slate-200',
    labelClass: 'text-red-700',
    defaultDurationMs: 6000,
  },
  failed: {
    label: 'Failed',
    result: 'cross',
    toneClass: 'text-red-700 border-red-600 bg-red-50',
    iconClass: 'text-red-700',
    iconWrap: 'bg-white/70 border border-slate-200',
    labelClass: 'text-red-700',
    defaultDurationMs: 6000,
  },
};

const MIN_DURATION_MS = 800;

/**
 * App-wide feedback popups.
 *
 * One banner is shown at a time, in a portal above all app content, centered
 * near the top of the screen. A new feedback immediately replaces the active
 * one and restarts its timer. Dismissal runs on a JS timer that pauses while
 * the banner is hovered/focused; leaving the tab/window hides the popup. A
 * variant-colored sheen shrinks around the card over the same duration.
 */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<FeedbackItem | null>(null);
  const [paused, setPaused] = useState(false);

  const nextId = useRef(0);
  const activeRef = useRef<FeedbackItem | null>(null);
  const timerRef = useRef<number | null>(null);
  const remainingRef = useRef(0);
  const startedAtRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismissActive = useCallback(
    (id: number) => {
      clearTimer();
      if (activeRef.current?.id === id) {
        activeRef.current = null;
        setActive(null);
      }
    },
    [clearTimer],
  );

  const startTimer = useCallback(
    (item: FeedbackItem) => {
      clearTimer();
      startedAtRef.current = Date.now();
      remainingRef.current = item.durationMs;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        dismissActive(item.id);
      }, item.durationMs);
    },
    [clearTimer, dismissActive],
  );

  const becomeActive = useCallback(
    (item: FeedbackItem) => {
      setPaused(false);
      activeRef.current = item;
      setActive(item);
      startTimer(item);
      if (item.variant === 'success') {
        playSuccessSound();
      } else {
        playErrorSound();
      }
    },
    [startTimer],
  );

  const push = useCallback(
    (variant: FeedbackVariant, message: string, options?: FeedbackOptions) => {
      if (!message.trim()) return;
      const meta = VARIANT_META[variant];
      const durationMs = Math.max(
        MIN_DURATION_MS,
        options?.durationMs ?? meta.defaultDurationMs,
      );
      const item: FeedbackItem = {
        id: ++nextId.current,
        variant,
        title: options?.title?.trim() || meta.label,
        message: message.trim(),
        durationMs,
      };
      becomeActive(item);
    },
    [becomeActive],
  );

  const pauseTimer = useCallback(() => {
    const item = activeRef.current;
    if (!item || timerRef.current === null) return;
    remainingRef.current = Math.max(
      0,
      item.durationMs - (Date.now() - startedAtRef.current),
    );
    clearTimer();
  }, [clearTimer]);

  const resumeTimer = useCallback(() => {
    const item = activeRef.current;
    if (!item || timerRef.current !== null) return;
    if (remainingRef.current <= 0) {
      dismissActive(item.id);
      return;
    }
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      dismissActive(item.id);
    }, remainingRef.current);
  }, [dismissActive]);

  // Hovering or focusing the banner pauses the countdown; leaving resumes it.
  const onBannerEnter = useCallback(() => {
    pauseTimer();
    setPaused(true);
  }, [pauseTimer]);

  const onBannerLeave = useCallback(() => {
    resumeTimer();
    setPaused(false);
  }, [resumeTimer]);

  const hideOnAway = useCallback(() => {
    clearTimer();
    activeRef.current = null;
    remainingRef.current = 0;
    setPaused(false);
    setActive(null);
  }, [clearTimer]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hideOnAway();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', hideOnAway);
    document.addEventListener('mouseleave', hideOnAway);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', hideOnAway);
      document.removeEventListener('mouseleave', hideOnAway);
    };
  }, [hideOnAway]);

  useEffect(() => {
    return () => {
      clearTimer();
      activeRef.current = null;
    };
  }, [clearTimer]);

  const api = useMemo<FeedbackApi>(
    () => ({
      success: (message, options) => push('success', message, options),
      error: (message, options) => push('error', message, options),
      failed: (message, options) => push('failed', message, options),
    }),
    [push],
  );

  const renderBanner = (item: FeedbackItem) => {
    const meta = VARIANT_META[item.variant];
    const playState = paused ? 'paused' : 'running';
    const bannerStyle = {
      '--feedback-duration': `${item.durationMs}ms`,
    } as CSSProperties;
    const bannerClass =
      'pointer-events-auto relative border-2 shadow-2xl animate-fade-up ' +
      meta.toneClass;
    const body = (
      <>
        <div
          aria-hidden
          className="feedback-sheen pointer-events-none absolute inset-0"
          style={{ animationPlayState: playState }}
        />
        <div className="flex gap-3 p-3.5 pl-4">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center ${meta.iconWrap}`}
          >
            <svg
              aria-hidden
              className={`feedback-result-icon h-[18px] w-[18px] ${meta.iconClass}`}
              viewBox="0 0 24 24"
            >
              <path
                className="feedback-result-path"
                pathLength="32"
                d={RESULT_PATHS[meta.result]}
                style={{ animationPlayState: playState }}
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <p
              className={`text-[10px] font-bold uppercase tracking-wider ${meta.labelClass}`}
            >
              {meta.label}
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-tight text-slate-900">
              {item.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {item.message}
            </p>
          </div>

          <button
            type="button"
            onClick={() => dismissActive(item.id)}
            className="shrink-0 self-start rounded-none border border-slate-200 bg-white/60 p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Dismiss message"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </>
    );

    return item.variant === 'success' ? (
      <div
        key={item.id}
        role="status"
        className={bannerClass}
        style={bannerStyle}
        onMouseEnter={onBannerEnter}
        onMouseLeave={onBannerLeave}
        onFocus={onBannerEnter}
        onBlur={onBannerLeave}
      >
        {body}
      </div>
    ) : (
      <div
        key={item.id}
        role="alert"
        className={bannerClass}
        style={bannerStyle}
        onMouseEnter={onBannerEnter}
        onMouseLeave={onBannerLeave}
        onFocus={onBannerEnter}
        onBlur={onBannerLeave}
      >
        {body}
      </div>
    );
  };

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-live="polite"
            aria-label="Status messages"
            className="feedback-portal pointer-events-none fixed left-1/2 top-3 z-[220] -translate-x-1/2 w-full max-w-[720px] px-4"
          >
            {active ? renderBanner(active) : null}
          </div>,
          document.body,
        )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used inside <FeedbackProvider>');
  }
  return ctx;
}
