import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import BottomSheet from './BottomSheet';
import Icon from './Icon';

// ── Types ──

export interface RowAction {
  /** Label shown in the menu. Ignored when `divider` is true. */
  label?: string;
  onClick?: () => void;
  icon?: string;
  /** Renders the item in red; used for destructive actions. */
  danger?: boolean;
  disabled?: boolean;
  /** Shows a spinner in place of the icon and disables the item. */
  loading?: boolean;
  /** Optional right-aligned hint, e.g. "⌘D". */
  shortcut?: string;
  /** Optional section header — items following this render under a label. */
  group?: string;
  /** Renders a horizontal rule. When true, all other fields are ignored. */
  divider?: boolean;
}

interface RowActionMenuProps {
  actions: RowAction[];
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md';
  /** Optional className applied to the trigger button. */
  triggerClassName?: string;
  /** aria-label override for the trigger. */
  triggerAriaLabel?: string;
}

// ── Helpers ──

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

const MENU_WIDTH = 220; // px — also enforced by min-width
const GAP = 4;          // px between trigger and menu
const VIEWPORT_PAD = 8; // px minimum distance from viewport edges

interface MenuPosition {
  top: number;
  left: number;
  placement: 'bottom' | 'top';
}

/**
 * Compute a viewport-relative position for the popover. Prefers below the
 * trigger, flips to above if there's not enough space, and clamps to the
 * viewport horizontally.
 */
function computePosition(
  trigger: DOMRect,
  menuHeight: number,
): MenuPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceBelow = vh - trigger.bottom - VIEWPORT_PAD;
  const spaceAbove = trigger.top - VIEWPORT_PAD;

  let placement: 'bottom' | 'top' = 'bottom';
  if (spaceBelow < menuHeight + GAP && spaceAbove > spaceBelow) {
    placement = 'top';
  }

  const top =
    placement === 'bottom'
      ? trigger.bottom + GAP
      : trigger.top - menuHeight - GAP;

  // Right-align the menu with the trigger, then clamp to viewport.
  let left = trigger.right - MENU_WIDTH;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
  if (left + MENU_WIDTH > vw - VIEWPORT_PAD) {
    left = vw - MENU_WIDTH - VIEWPORT_PAD;
  }

  return { top, left, placement };
}

// ── Component ──

export default function RowActionMenu({
  actions,
  title,
  subtitle,
  size = 'md',
  triggerClassName,
  triggerAriaLabel = 'Row actions',
}: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeaheadRef = useRef<{ query: string; timeout: number | null }>({
    query: '',
    timeout: null,
  });

  // Filter to real (non-divider) actions for navigation math.
  const navigableIndexes = useMemo(() => {
    const idx: number[] = [];
    actions.forEach((a, i) => {
      if (!a.divider && !a.disabled) idx.push(i);
    });
    return idx;
  }, [actions]);

  // ── Reposition on open, scroll, resize ──
  const recalcPosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    setPosition(computePosition(triggerRect, menuRect.height));
  }, []);

useLayoutEffect(() => {
  if (!open || isMobile) return;

  let cancelled = false;
  let attempts = 0;

  const tryMeasure = () => {
    if (cancelled) return;

    const menu = menuRef.current;
    const trigger = triggerRef.current;

    if (!menu || !trigger) {
      // Portal hasn't committed yet — try again next frame.
      if (attempts++ < 30) requestAnimationFrame(tryMeasure);
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    if (menuRect.height === 0 || menuRect.width === 0) {
      // DOM exists but layout isn't ready — retry.
      if (attempts++ < 30) requestAnimationFrame(tryMeasure);
      return;
    }

    setPosition(computePosition(triggerRect, menuRect.height));
    // Give the browser a frame to apply the new position before fading in.
    requestAnimationFrame(() => !cancelled && setMounted(true));
  };

  requestAnimationFrame(tryMeasure);

  return () => {
    cancelled = true;
  };
}, [open, isMobile]);

  useEffect(() => {
    if (!open || isMobile) return;
    const onScrollOrResize = () => recalcPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, isMobile, recalcPosition]);

  // ── Outside click / Escape ──
  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, isMobile]);

  // ── Focus management on open ──
  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      setMounted(false);
      setPosition(null);
      return;
    }
    if (isMobile) return;
    // Focus first navigable item.
    const first = navigableIndexes[0] ?? -1;
    setActiveIndex(first);
    requestAnimationFrame(() => {
      if (first >= 0) itemRefs.current[first]?.focus();
    });
  }, [open, isMobile, navigableIndexes]);

  // ── Close and return focus to trigger ──
  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  // ── Keyboard nav ──
  const moveActive = useCallback(
    (dir: 1 | -1 | 'home' | 'end') => {
      if (navigableIndexes.length === 0) return;
      const currentPos = navigableIndexes.indexOf(activeIndex);
      let nextPos: number;
      if (dir === 'home') nextPos = 0;
      else if (dir === 'end') nextPos = navigableIndexes.length - 1;
      else {
        const start = currentPos < 0 ? 0 : currentPos;
        nextPos =
          (start + dir + navigableIndexes.length) % navigableIndexes.length;
      }
      const nextIdx = navigableIndexes[nextPos];
      setActiveIndex(nextIdx);
      itemRefs.current[nextIdx]?.focus();
    },
    [activeIndex, navigableIndexes],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveActive(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveActive(-1);
          break;
        case 'Home':
          e.preventDefault();
          moveActive('home');
          break;
        case 'End':
          e.preventDefault();
          moveActive('end');
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case 'Tab':
          // Let tab exit and close.
          close(false);
          break;
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const action = actions[activeIndex];
          if (action && !action.disabled && !action.divider && action.onClick) {
            close();
            action.onClick();
          }
          break;
        }
        default: {
          // Typeahead.
          if (e.key.length === 1 && /\S/.test(e.key)) {
            const ta = typeaheadRef.current;
            ta.query += e.key.toLowerCase();
            if (ta.timeout) window.clearTimeout(ta.timeout);
            ta.timeout = window.setTimeout(() => {
              ta.query = '';
            }, 500);
            const matchIdx = actions.findIndex(
              (a) =>
                !a.divider &&
                !a.disabled &&
                a.label?.toLowerCase().startsWith(ta.query),
            );
            if (matchIdx >= 0) {
              setActiveIndex(matchIdx);
              itemRefs.current[matchIdx]?.focus();
            }
          }
        }
      }
    },
    [actions, activeIndex, close, moveActive],
  );

  // ── Early return ──
  if (actions.length === 0) return null;

  const triggerCls = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const menuId = `row-action-menu-${Math.random().toString(36).slice(2, 9)}`;

  // ── Mobile: bottom sheet ──
  if (isMobile) {
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
            triggerClassName,
          )}
          aria-label={triggerAriaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Icon name="more_vert" size={18} />
        </button>

        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title={title}
          description={subtitle}
        >
          <div className="space-y-1" role="menu">
            {actions.map((action, idx) =>
              action.divider ? (
                <div
                  key={`div-${idx}`}
                  className="my-1 h-px bg-slate-200"
                  role="separator"
                />
              ) : (
                <button
                  key={idx}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled || action.loading}
                  onClick={() => {
                    setOpen(false);
                    action.onClick?.();
                  }}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-3 text-left transition rounded-lg disabled:opacity-40 disabled:cursor-not-allowed',
                    action.danger
                      ? 'text-red-700 hover:bg-red-50'
                      : 'text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {action.loading ? (
                    <Icon
                      name="progress_activity"
                      size={18}
                      className="animate-spin text-slate-500"
                    />
                  ) : action.icon ? (
                    <Icon
                      name={action.icon}
                      size={18}
                      className={action.danger ? 'text-red-600' : 'text-slate-500'}
                    />
                  ) : null}
                  <span className="text-sm font-semibold flex-1">
                    {action.label}
                  </span>
                  {action.shortcut && (
                    <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {action.shortcut}
                    </kbd>
                  )}
                </button>
              ),
            )}
          </div>
        </BottomSheet>
      </>
    );
  }

  // ── Desktop: popover with portal ──
// ── Desktop: popover with portal ──
// NOTE: rendered whenever `open` is true, NOT when `position` is set.
// We park it offscreen with `visibility: hidden` until measured.
// ── Desktop: popover with portal ──
const menuEl = open
  ? createPortal(
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-label={title}
        onKeyDown={onKeyDown}
        style={{
          position: 'fixed',
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          width: MENU_WIDTH,
          zIndex: 9999,
          visibility: position ? 'visible' : 'hidden',
        }}
        className={clsx(
          'bg-white border border-slate-200 rounded-lg shadow-xl py-1 overflow-hidden',
          'transition-[opacity,transform] duration-100 ease-out',
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
        )}
      >
        {actions.map((action, idx) => {
          if (action.divider) {
            return (
              <div
                key={`div-${idx}`}
                role="separator"
                className="my-1 h-px bg-slate-100"
              />
            );
          }
          const isActive = idx === activeIndex;
          const isDisabled = action.disabled || action.loading;
          return (
            <button
              key={idx}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              role="menuitem"
              aria-disabled={isDisabled || undefined}
              disabled={isDisabled}
              tabIndex={-1}
              onMouseEnter={() => !isDisabled && setActiveIndex(idx)}
              onClick={(e) => {
                e.stopPropagation();
                if (isDisabled) return;
                close();
                action.onClick?.();
              }}
              className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition outline-none',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                action.danger
                  ? isActive && !isDisabled
                    ? 'bg-red-50 text-red-800'
                    : 'text-red-700'
                  : isActive && !isDisabled
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-700',
              )}
            >
              {action.loading ? (
                <Icon
                  name="progress_activity"
                  size={16}
                  className="animate-spin text-slate-500"
                />
              ) : action.icon ? (
                <Icon
                  name={action.icon}
                  size={16}
                  className={action.danger ? 'text-red-600' : 'text-slate-500'}
                />
              ) : (
                <span className="w-4" />
              )}
              <span className="font-medium flex-1 truncate">
                {action.label}
              </span>
              {action.shortcut && (
                <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  {action.shortcut}
                </kbd>
              )}
            </button>
          );
        })}
      </div>,
      document.body,
    )
  : null;

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
          open && 'bg-slate-100 text-slate-900',
          triggerClassName,
        )}
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <Icon name="more_vert" size={18} />
      </button>
      {menuEl}
    </>
  );
}