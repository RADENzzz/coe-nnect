import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import Icon from './Icon';

// ── Stack counter so stacked modals coordinate body lock & Escape ──
let modalStack = 0;
const modalBodyLocks = { overflow: '', paddingRight: '' };

function lockBody() {
  if (modalStack === 0) {
    modalBodyLocks.overflow = document.body.style.overflow;
    modalBodyLocks.paddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  modalStack++;
}

function unlockBody() {
  modalStack = Math.max(0, modalStack - 1);
  if (modalStack === 0) {
    document.body.style.overflow = modalBodyLocks.overflow;
    document.body.style.paddingRight = modalBodyLocks.paddingRight;
  }
}

/**
 * True if at least one Modal is currently mounted.
 *
 * Surfaces that also listen for Escape (e.g. side panels rendered at a lower
 * z-index than modals) should consult this so they defer to whichever modal
 * is on top instead of closing underneath it.
 */
export function isAnyModalOpen() {
  return modalStack > 0;
}

interface ModalContextValue {
  titleId: string;
  descriptionId?: string;
  busy: boolean;
  onClose: () => void;
}
const ModalContext = createContext<ModalContextValue | null>(null);

export function useModal() {
  return useContext(ModalContext);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  busy?: boolean;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  hideCloseButton?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-[min(96vw,80rem)]',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return nodes.filter((el) => {
    if (el.hasAttribute('inert')) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  busy = false,
  closeOnEscape = true,
  closeOnBackdrop = true,
  initialFocusRef,
  hideCloseButton = false,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const stackOrderRef = useRef<number>(-1);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    lockBody();
    stackOrderRef.current = modalStack - 1;

    const isTopmost = () => stackOrderRef.current === modalStack - 1;

    const onKey = (e: KeyboardEvent) => {
      if (!isTopmost()) return;

      if (e.key === 'Escape' && closeOnEscape && !busyRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = getFocusable(panel);
        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (!active || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
          return;
        }
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKey, true);

    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;

      const explicit = initialFocusRef?.current;
      if (explicit && panel.contains(explicit)) {
        explicit.focus();
        return;
      }

      const focusables = getFocusable(panel);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        panel.focus();
      }
    }, 40);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.clearTimeout(timer);
      unlockBody();

      const prev = previouslyFocusedRef.current;
      if (prev && document.body.contains(prev)) {
        requestAnimationFrame(() => {
          try {
            prev.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const downOnBackdropRef = useRef(false);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const ctx: ModalContextValue = {
    titleId,
    descriptionId: description ? descriptionId : undefined,
    busy,
    onClose,
  };

  return createPortal(
    <ModalContext.Provider value={ctx}>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
        role="presentation"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in"
          onMouseDown={(e) => {
            downOnBackdropRef.current = e.target === e.currentTarget;
          }}
          onMouseUp={(e) => {
            const wasBackdrop = downOnBackdropRef.current;
            downOnBackdropRef.current = false;
            if (
              wasBackdrop &&
              e.target === e.currentTarget &&
              closeOnBackdrop &&
              !busy
            ) {
              onClose();
            }
          }}
          aria-hidden="true"
        />

        {/* Panel */}
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          className={clsx(
            'relative w-full bg-surface-container-lowest text-on-surface shadow-2xl border border-surface-variant flex flex-col',
            'max-h-[90vh] outline-none animate-fade-up rounded-xl overflow-hidden',
            SIZE_CLASSES[size],
            className,
          )}
        >
          <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-variant shrink-0">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-base font-bold text-on-surface truncate"
              >
                {title}
              </h2>
              {description && (
                <p
                  id={descriptionId}
                  className="text-xs text-on-surface-variant mt-0.5"
                >
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={() => !busy && onClose()}
                disabled={busy}
                className="tap-target -mr-2 hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
                aria-label="Close dialog"
              >
                <Icon name="close" />
              </button>
            )}
          </header>

          <div className="flex-1 overflow-y-auto overscroll-contain p-5">
            {children}
          </div>

          {footer && (
            <footer className="border-t border-surface-variant p-4 bg-surface-container-low flex flex-wrap items-center justify-end gap-2 shrink-0">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </ModalContext.Provider>,
    document.body
  );
}

export function ModalSection({
  title,
  icon,
  children,
  className,
}: {
  title?: string;
  icon?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('space-y-3', className)}>
      {title && (
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} size={16} className="text-primary" />}
          <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {title}
          </h3>
          <div className="flex-1 h-px bg-surface-variant" />
        </div>
      )}
      {children}
    </section>
  );
}