import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
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

// ── Context so children (e.g. ModalSection) can adapt ──
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

// ── Types ──
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Disable close via Escape/backdrop/close button. */
  busy?: boolean;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  /** Optional element to focus when the modal opens. */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** Hide the top-right X button. */
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

// ── Focus trap helpers ──
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

  // Keep latest onClose for the keydown handler.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // ── Open lifecycle ──
  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    lockBody();
    stackOrderRef.current = modalStack - 1; // this modal's index in the stack

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

    // Focus management — prefer caller's target, else first focusable, else panel.
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

      // Restore focus to the trigger if it's still in the DOM.
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

  // ── Backdrop click: only close if both down + up land on backdrop ──
  const downOnBackdropRef = useRef(false);

  if (!open) return null;

  const ctx: ModalContextValue = {
    titleId,
    descriptionId: description ? descriptionId : undefined,
    busy,
    onClose,
  };

  return (
    <ModalContext.Provider value={ctx}>
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6"
        role="presentation"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-backdrop-in"
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
            'relative w-full bg-white shadow-2xl border border-slate-200 flex flex-col',
            'max-h-[90vh] outline-none animate-fade-up rounded-xl overflow-hidden',
            SIZE_CLASSES[size],
            className,
          )}
        >
          <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-base font-bold text-slate-900 truncate"
              >
                {title}
              </h2>
              {description && (
                <p
                  id={descriptionId}
                  className="text-xs text-slate-500 mt-0.5"
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
                className="tap-target -mr-2 hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
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
            <footer className="border-t border-slate-100 p-4 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </ModalContext.Provider>
  );
}

// ── Helper: sectioned content inside a modal ──
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
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {title}
          </h3>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
      )}
      {children}
    </section>
  );
}