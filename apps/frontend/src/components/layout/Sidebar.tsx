import {
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import Icon from '../ui/Icon';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import { useUiStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { useAppearanceStore } from '../../store/appearance.store';
import {
  filterNavByRole,
  type RoleNav,
} from '../../lib/constants/nav-config';

type NavLinkItem = RoleNav['main'][number];
type NavTone = 'primary' | 'footer';

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50';
const ICON_BUTTON =
  `flex items-center justify-center transition-colors rounded ${FOCUS_RING}`;
const NAV_LINK_BASE =
  `flex items-center gap-3 font-semibold text-sm transition-colors rounded ${FOCUS_RING}`;

const NAV_TONES: Record<
  NavTone,
  { idle: string; active: string; iconIdleClass?: string }
> = {
  primary: {
    idle: 'text-white/80 hover:bg-white/10 hover:text-white',
    active: 'sidebar-active',
  },
  footer: {
    // Secondary nav reads dimmer at rest, with a warmer active pill.
    idle: 'text-white/55 hover:bg-white/5 hover:text-white/90',
    active: 'sidebar-active sidebar-active--footer',
    iconIdleClass: 'opacity-80',
  },
};

interface SidebarNavItemProps {
  item: NavLinkItem;
  collapsed: boolean;
  tone: NavTone;
}

function SidebarNavItem({ item, collapsed, tone }: SidebarNavItemProps) {
  const t = NAV_TONES[tone];

  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        clsx(
          NAV_LINK_BASE,
          collapsed ? 'justify-center py-2.5 px-2' : 'px-3 py-2.5',
          isActive ? t.active : t.idle,
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            name={item.icon}
            filled={isActive}
            className={isActive ? undefined : t.iconIdleClass}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

interface SidebarNavSectionProps {
  items: NavLinkItem[];
  collapsed: boolean;
  ariaLabel: string;
  tone?: NavTone;
  className?: string;
}

function SidebarNavSection({
  items,
  collapsed,
  ariaLabel,
  tone = 'primary',
  className,
}: SidebarNavSectionProps) {
  if (items.length === 0) return null;

  return (
    <div
      aria-label={ariaLabel}
      className={clsx('flex flex-col gap-px px-2', className)}
    >
      {items.map((item) => (
        <SidebarNavItem
          key={item.path}
          item={item}
          collapsed={collapsed}
          tone={tone}
        />
      ))}
    </div>
  );
}

interface SidebarProps {
  nav: RoleNav;
}

export default function Sidebar({ nav }: SidebarProps) {
  const { deptName } = useDepartmentLabel();
  const profile = useAuthStore((s) => s.profile);
  const brandLogo = useAppearanceStore((s) => s.logo);
  const collapsed = useUiStore((s) => s.isSidebarCollapsed);
  const hidden = useUiStore((s) => s.isSidebarHidden);
  const pin = useUiStore((s) => s.sidebarPin);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const toggleSidebarPin = useUiStore((s) => s.toggleSidebarPin);

  const subtitle = useMemo(
    () =>
      nav.brandSubtitle === 'Department Portal' ? deptName : nav.brandSubtitle,
    [nav.brandSubtitle, deptName],
  );

  // Filter role-gated items (e.g. Dev Tools is administrator-only)
  const visibleMain = useMemo(
    () => filterNavByRole(nav.main, profile?.role),
    [nav.main, profile?.role],
  );
  const visibleFooter = useMemo(
    () => filterNavByRole(nav.footer, profile?.role),
    [nav.footer, profile?.role],
  );

  const collapseTimerRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const expand = useCallback(() => {
    clearCollapseTimer();
    setSidebarCollapsed(false);
  }, [clearCollapseTimer, setSidebarCollapsed]);

  const scheduleCollapse = useCallback(() => {
    clearCollapseTimer();
    // A rail pinned open never auto-collapses.
    if (useUiStore.getState().sidebarPin === 'open') return;
    collapseTimerRef.current = window.setTimeout(() => {
      setSidebarCollapsed(true);
      collapseTimerRef.current = null;
    }, 150);
  }, [clearCollapseTimer, setSidebarCollapsed]);

  const handleTogglePin = useCallback(() => {
    const before = useUiStore.getState().sidebarPin;
    toggleSidebarPin();
    const after = useUiStore.getState().sidebarPin;
    // Releasing a pinned-open rail with the pointer elsewhere (keyboard
    // activation) should close it straight away.
    if (before === 'open' && after === 'auto' && !hoveredRef.current) {
      setSidebarCollapsed(true);
    }
  }, [toggleSidebarPin, setSidebarCollapsed]);

  const handleMouseEnter = useCallback(() => {
    hoveredRef.current = true;
    // A rail pinned shut stays shut on hover; the pin button is the only
    // way to open it explicitly.
    if (useUiStore.getState().sidebarPin !== 'closed') expand();
  }, [expand]);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = false;
    scheduleCollapse();
  }, [scheduleCollapse]);

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        scheduleCollapse();
      }
    },
    [scheduleCollapse],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape' && !collapsed) {
        setSidebarCollapsed(true);
      }
    },
    [collapsed, setSidebarCollapsed],
  );

  const isPinned = pin !== 'auto';
  const pinLabel = isPinned ? 'Unpin sidebar' : 'Pin sidebar open';

  // Removed from the layout entirely (not just collapsed) — used while a
  // table/row is being edited so the rail can't be hover-expanded mid-drag.
  useEffect(() => {
    if (!hidden) return;
    // No mouseleave fires when the element unmounts, so clear the hover
    // bookkeeping by hand.
    hoveredRef.current = false;
    clearCollapseTimer();
  }, [hidden, clearCollapseTimer]);

  if (hidden) return null;

  return (
    <nav
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={expand}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      aria-label="Main navigation"
      data-tour="sidebar"
      className={clsx(
        'hidden md:flex flex-col h-screen bg-[#5c1219] border-r border-black/10 fixed left-0 top-0 z-50 app-sidebar',
        'transition-[width] duration-200 ease-out motion-reduce:transition-none',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      {/* Brand + pin (pin only when expanded) */}
      <div
        className={clsx(
          'border-b border-white/10 flex items-center',
          collapsed
            ? 'px-3 py-4 justify-center'
            : 'px-5 py-5 justify-between gap-2',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
            {brandLogo ? (
              <img
                src={brandLogo}
                alt="CoE-NNECT logo"
                className="w-full h-full object-contain"
              />
            ) : (
              <Icon name="school" filled className="text-white" size={20} />
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-white leading-tight tracking-tight">
                CoE-NNECT
              </p>
              <p
                className="text-xs text-white/70 truncate max-w-[140px]"
                title={subtitle}
              >
                {subtitle}
              </p>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            type="button"
            onClick={handleTogglePin}
            aria-pressed={isPinned}
            aria-label={pinLabel}
            title={
              isPinned
                ? 'Unpin sidebar — back to hover behaviour'
                : 'Pin sidebar open — keep it expanded'
            }
            className={clsx(
              ICON_BUTTON,
              'w-7 h-7 shrink-0',
              isPinned
                ? 'text-white bg-white/15 hover:bg-white/25'
                : 'text-white/60 hover:text-white hover:bg-white/10',
            )}
          >
            <Icon name="push_pin" size={16} filled={isPinned} />
          </button>
        )}
      </div>

      {/* Main Nav */}
      <SidebarNavSection
        items={visibleMain}
        collapsed={collapsed}
        ariaLabel="Primary navigation"
        className="flex-1 py-2 overflow-y-auto"
      />

      {/* Footer Nav — secondary tone */}
      <SidebarNavSection
        items={visibleFooter}
        collapsed={collapsed}
        ariaLabel="Secondary navigation"
        tone="footer"
        className="py-2 border-t border-white/10"
      />
    </nav>
  );
}