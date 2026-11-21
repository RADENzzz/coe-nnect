import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from '../ui/Icon';
import CetLogo from '../brand/CetLogo';
import { useUiStore } from '../../store/ui.store';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import {
  filterNavByRole,
  groupNav,
  resolveActiveNavPath,
  type RoleNav,
} from '../../lib/constants/nav-config';
import { useNavAttention } from '../../hooks/use-nav-attention';
import { useAuthStore } from '../../store/auth.store';
import { useAppearanceStore } from '../../store/appearance.store';
import { lockBodyScroll } from '../../lib/body-scroll-lock';
import { prefetchRoute } from '../../lib/route-prefetch';

interface MobileDrawerProps {
  nav: RoleNav;
}

interface DrawerNavLinkProps {
  item: { label: string; path: string; icon: string; shortLabel?: string };
  badge: number;
  active: boolean;
  /** The newest unread notification points at this page. */
  highlight: boolean;
  onNavigate: () => void;
}

function DrawerNavLink({
  item,
  badge,
  active,
  highlight,
  onNavigate,
}: DrawerNavLinkProps) {
  return (
    <NavLink
      to={item.path}
      end
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      onMouseEnter={() => prefetchRoute(item.path)}
      onFocus={() => prefetchRoute(item.path)}
      className={[
        'flex items-center gap-3 px-3 py-3 font-semibold text-sm transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
        active
          ? 'sidebar-active'
          : 'text-white/80 hover:bg-white/10 hover:text-white',
        !active && highlight ? 'nav-attention-rule' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon name={item.icon} filled={active} />
      <span className="min-w-0 flex-1 truncate">
        {item.shortLabel ?? item.label}
      </span>
      {badge > 0 && (
        <span
          className="nav-attention-pill flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none tabular-nums"
          aria-label={`${badge} unread`}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  );
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function MobileDrawer({ nav }: MobileDrawerProps) {
  const { pathname } = useLocation();
  const { isMobileDrawerOpen, closeMobileDrawer } = useUiStore();
  const { deptName } = useDepartmentLabel();
  const drawerRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);

  const subtitle =
    nav.brandSubtitle === 'Department Portal' ? deptName : nav.brandSubtitle;

  const profile = useAuthStore((s) => s.profile);
  const brandLogo = useAppearanceStore((s) => s.logo);
  const visibleMain = filterNavByRole(nav.main, profile?.role);
  const visibleFooter = filterNavByRole(nav.footer, profile?.role);
  const groups = useMemo(() => groupNav(visibleMain), [visibleMain]);
  const activePath = useMemo(
    () =>
      resolveActiveNavPath(pathname, [...visibleMain, ...visibleFooter]),
    [pathname, visibleMain, visibleFooter],
  );
  const attention = useNavAttention(nav, profile?.role);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const releaseBodyLock = lockBodyScroll();

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
      releaseBodyLock();
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
        className="absolute inset-0 bg-black/50 animate-backdrop-in"
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
        className="absolute left-0 top-0 bottom-0 w-[86%] max-w-[320px] bg-primary border-r border-black/20 shadow-2xl flex flex-col animate-drawer-in outline-none"
      >
        {/* Brand */}
        <div className="px-5 py-4 border-b border-white/20 flex items-start justify-between gap-2 pt-safe">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden">
              {brandLogo ? (
                <img
                  src={brandLogo}
                  alt="CoE-NNECT logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <CetLogo variant="mark" className="h-full w-full p-0.5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-white leading-tight tracking-tight">
                CoE-NNECT
              </p>
              <p
                className="text-[11px] text-white/70 truncate max-w-[180px]"
                title={subtitle}
              >
                {subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={closeMobileDrawer}
            className="tap-target hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white -mr-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Main Nav */}
        <div className="flex-1 flex flex-col py-2 overflow-y-auto px-2 overscroll-contain">
          {groups.map((group, index) => (
            <div key={group.label} className={index > 0 ? 'mt-1' : undefined}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-yellow-300">
                {group.label}
              </p>
              <div className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <DrawerNavLink
                    key={item.path}
                    item={item}
                    badge={attention.badgeFor(item)}
                    active={item.path === activePath}
                    highlight={attention.latestPath === item.path}
                    onNavigate={closeMobileDrawer}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Nav */}
        {visibleFooter.length > 0 && (
          <div className="flex flex-col gap-px py-2 border-t border-white/20 px-2 pb-safe">
            {visibleFooter.map((item) => (
              <DrawerNavLink
                key={item.path}
                item={item}
                badge={attention.badgeFor(item)}
                active={item.path === activePath}
                highlight={attention.latestPath === item.path}
                onNavigate={closeMobileDrawer}
              />
            ))}
          </div>
        )}

        {/* Swipe hint (subtle) */}
        <div className="px-3 pb-3 text-center">
          <span className="text-[10px] text-white/40">Swipe left to close</span>
        </div>
      </aside>
    </div>
  );
}