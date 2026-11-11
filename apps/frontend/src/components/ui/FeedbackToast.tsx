import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export type FeedbackVariant = 'success' | 'error' | 'failed';

export interface FeedbackOptions {
  /** Card heading. Defaults to the variant label (e.g. "Success"). */
  title?: string;
  /** How long the card stays on screen. Errors default to a longer delay. */
  durationMs?: number;
}

export interface FeedbackApi {
  success: (message: string, options?: FeedbackOptions) => void;
  error: (message: string, options?: FeedbackOptions) => void;
  failed: (message: string, options?: FeedbackOptions) => void;
}

interface FeedbackItem extends Required<Omit<FeedbackOptions, 'title'>> {
  id: number;
  variant: FeedbackVariant;
  title: string;
  message: string;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

const VARIANT_META: Record<
  FeedbackVariant,
  {
    label: string;
    icon: string;
    accent: string;
    iconWrap: string;
    labelClass: string;
    defaultDurationMs: number;
  }
> = {
  success: {
    label: 'Success',
    icon: 'check_circle',
    accent: 'bg-emerald-500',
    iconWrap: 'bg-emerald-50 text-emerald-600',
    labelClass: 'text-emerald-700',
    defaultDurationMs: 4200,
  },
  error: {
    label: 'Error',
    icon: 'error',
    accent: 'bg-red-500',
    iconWrap: 'bg-red-50 text-red-600',
    labelClass: 'text-red-700',
    defaultDurationMs: 6500,
  },
  failed: {
    label: 'Failed',
    icon: 'report',
    accent: 'bg-red-600',
    iconWrap: 'bg-red-50 text-red-600',
    labelClass: 'text-red-700',
    defaultDurationMs: 6500,
  },
};

const MAX_CARDS = 4;

/**
 * App-wide popup feedback cards.
 *
 * Replaces inline success/error banners with a small stack anchored to the
 * top-right. Cards are announced to assistive tech, auto-dismiss, and can be
 * closed manually. Mounted once in AppShell.
 */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant: FeedbackVariant, message: string, options?: FeedbackOptions) => {
      if (!message.trim()) return;
      const meta = VARIANT_META[variant];
      const id = ++nextId.current;
      const durationMs = Math.max(
        800,
        options?.durationMs ?? meta.defaultDurationMs,
      );

      setItems((prev) => [
        ...prev.slice(-(MAX_CARDS - 1)),
        {
          id,
          variant,
          title: options?.title?.trim() || meta.label,
          message: message.trim(),
          durationMs,
        },
      ]);

      const existing = timers.current.get(id);
      if (existing !== undefined) window.clearTimeout(existing);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), durationMs),
      );
    },
    [dismiss],
  );

  const api = useMemo<FeedbackApi>(
    () => ({
      success: (message, options) => push('success', message, options),
      error: (message, options) => push('error', message, options),
      failed: (message, options) => push('failed', message, options),
    }),
    [push],
  );

  // Clear pending timers when the provider unmounts.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => window.clearTimeout(timer));
      map.clear();
    };
  }, []);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-live="polite"
            aria-label="Status messages"
            className="pointer-events-none fixed inset-x-3 top-3 z-[200] flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-[380px]"
          >
            {items.map((item) => {
              const meta = VARIANT_META[item.variant];
              const isAlert = item.variant !== 'success';
              return (
                <div
                  key={item.id}
                  role={isAlert ? 'alert' : 'status'}
                  className="pointer-events-auto relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-fade-up"
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-1 ${meta.accent}`}
                  />
                  <div className="flex gap-3 p-3.5 pl-4">
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.iconWrap}`}
                    >
                      <Icon name={meta.icon} size={18} />
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
                      onClick={() => dismiss(item.id)}
                      className="shrink-0 self-start rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Dismiss message"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
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
