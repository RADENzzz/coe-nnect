import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import Icon from './Icon';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;
      if (active && panel.contains(active)) return;
      panel.focus();
    }, 40);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative w-full bg-white shadow-2xl border border-slate-200 flex flex-col outline-none',
          'rounded-t-2xl max-h-[90vh] animate-[sheetUp_260ms_cubic-bezier(0.2,0.9,0.3,1)]',
          'md:rounded-none md:max-w-md md:max-h-[85vh] md:animate-fade-up',
        )}
      >
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <span className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 truncate">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-target -mr-2 hover:bg-slate-50 flex items-center justify-center text-slate-500"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain p-5">
          {children}
        </div>

        {footer && (
          <footer className="border-t border-slate-100 p-4 bg-slate-50 flex items-center justify-end gap-2 pb-safe md:pb-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}