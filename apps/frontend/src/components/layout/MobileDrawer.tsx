import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';
import { useUiStore } from '../../store/ui.store';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import {
  filterNavByRole,
  type RoleNav,
} from '../../lib/constants/nav-config';
import { useAuthStore } from '../../store/auth.store';

// Global body-lock counter so nested modals cooperate
let bodyLockCount = 0;
const originalOverflow = { value: '' };

function lockBody() {
  if (bodyLockCount === 0) {
    originalOverflow.value = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyLockCount += 1;
}

function unlockBody() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = originalOverflow.value;
  }
}

interface MobileDrawerProps {
  nav: RoleNav;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function MobileDrawer({ nav }: MobileDrawerProps) {
  const { isMobileDrawerOpen, closeMobileDrawer } = useUiStore();
  const { deptName } = useDepartmentLabel();
  const drawerRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);

  const subtitle =
    nav.brandSubtitle === 'Department Portal' ? deptName : nav.brandSubtitle;

  const profile = useAuthStore((s) => s.profile);
  const visibleMain = filterNavByRole(nav.main, profile?.role);
  const visibleFooter = filterNavByRole(nav.footer, profile?.role);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    lockBody();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobileDrawer();
        return;
      }
      if (e.key === 'Tab') {
        const panel = drawerRef.current;
        if (!panel) return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => !el.hasAttribute('inert'));
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

    document.addEventListener('keydown', onKeyDown);

    const focusTimer = window.setTimeout(() => {
      drawerRef.current?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(focusTimer);
      unlockBody();
      // Restore focus
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
  }, [isMobileDrawerOpen, closeMobileDrawer]);

  if (!isMobileDrawerOpen) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-backdrop-in"
        onClick={closeMobileDrawer}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
        onTouchMove={(e) => {
          if (touchStartX == null) return;
          const dx = e.touches[0].clientX - touchStartX;
          // Only allow left swipe (negative dx)
          setDragX(Math.min(0, dx));
        }}
        onTouchEnd={() => {
          if (dragX < -80) closeMobileDrawer();
          setDragX(0);
          setTouchStartX(null);
        }}
        style={{
          transform: dragX < 0 ? `translateX(${dragX}px)` : undefined,
          transition: dragX === 0 ? 'transform 200ms ease-out' : 'none',
        }}
        className="absolute left-0 top-0 bottom-0 w-[85%] max-w-[300px] bg-white border-r border-slate-200 flex flex-col animate-drawer-in outline-none"
      >
        {/* Brand */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-2 pt-safe">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-[#5c1219] flex items-center justify-center shrink-0">
              <Icon name="school" filled className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-slate-900 leading-tight tracking-tight">
                CoE-NNECT
              </p>
              <p
                className="text-[11px] text-slate-500 truncate max-w-[180px]"
                title={subtitle}
              >
                {subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={closeMobileDrawer}
            className="tap-target hover:bg-slate-50 flex items-center justify-center text-slate-500 -mr-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Main Nav */}
        <div className="flex-1 flex flex-col gap-px py-2 overflow-y-auto px-2 overscroll-contain">
          {visibleMain.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeMobileDrawer}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-3 px-3 py-3 bg-[#5c1219] text-white font-semibold text-sm transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/40'
                  : 'flex items-center gap-3 px-3 py-3 text-slate-600 font-semibold text-sm hover:bg-slate-50 hover:text-slate-900 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30'
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} filled={isActive} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Footer Nav */}
        {visibleFooter.length > 0 && (
          <div className="flex flex-col gap-px py-2 border-t border-slate-100 px-2 pb-safe">
            {visibleFooter.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeMobileDrawer}
                className={({ isActive }) =>
                  isActive
                    ? 'flex items-center gap-3 px-3 py-3 bg-[#5c1219] text-white font-semibold text-sm transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/40'
                    : 'flex items-center gap-3 px-3 py-3 text-slate-600 font-semibold text-sm hover:bg-slate-50 hover:text-slate-900 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30'
                }
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        )}

        {/* Swipe hint (subtle) */}
        <div className="px-3 pb-3 text-center">
          <span className="text-[10px] text-slate-300">Swipe left to close</span>
        </div>
      </aside>
    </div>
  );
}