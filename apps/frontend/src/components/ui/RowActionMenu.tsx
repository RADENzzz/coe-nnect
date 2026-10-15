import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import BottomSheet from './BottomSheet';
import Icon from './Icon';

export interface RowAction {
  label: string;
  onClick: () => void;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
}

interface RowActionMenuProps {
  actions: RowAction[];
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md';
}

function useIsMobile(): boolean {
  const [is, setIs] = useState(() =>
    typeof window === 'undefined'
      ? false
      : !window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handle = () => setIs(!mq.matches);
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);
  return is;
}

export default function RowActionMenu({
  actions,
  title,
  subtitle,
  size = 'md',
}: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, isMobile]);

  if (actions.length === 0) return null;

  const triggerCls = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={clsx(
          triggerCls,
          'inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors',
        )}
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="more_vert" size={18} />
      </button>

      {isMobile && (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title={title}
          description={subtitle}
        >
          <div className="space-y-1">
            {actions.map((action, idx) => (
              <button
                key={idx}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-3 text-left transition disabled:opacity-40 disabled:cursor-not-allowed',
                  action.danger
                    ? 'text-red-700 hover:bg-red-50'
                    : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                {action.icon && (
                  <Icon
                    name={action.icon}
                    size={18}
                    className={action.danger ? 'text-red-600' : 'text-slate-500'}
                  />
                )}
                <span className="text-sm font-semibold">{action.label}</span>
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {!isMobile && open && (
        <div
          ref={popoverRef}
          role="menu"
          className="absolute right-0 top-full mt-1 z-[200] min-w-[180px] bg-white border border-slate-200 shadow-lg py-1"
        >
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                action.onClick();
              }}
              className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition disabled:opacity-40 disabled:cursor-not-allowed',
                action.danger
                  ? 'text-red-700 hover:bg-red-50'
                  : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              {action.icon && (
                <Icon
                  name={action.icon}
                  size={16}
                  className={action.danger ? 'text-red-600' : 'text-slate-500'}
                />
              )}
              <span className="font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}