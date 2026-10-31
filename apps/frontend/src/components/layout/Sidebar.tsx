import { useRef, useCallback, useEffect } from 'react';
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
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const toggleSidebarPin = useUiStore((s) => s.toggleSidebarPin);

  const subtitle =
    nav.brandSubtitle === 'Department Portal' ? deptName : nav.brandSubtitle;

  // Filter role-gated items (e.g. Dev Tools is administrator-only)
  const visibleMain = filterNavByRole(nav.main, profile?.role);
  const visibleFooter = filterNavByRole(nav.footer, profile?.role);

  const collapseTimerRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);

  const expand = useCallback(() => {
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setSidebarCollapsed(false);
  }, [setSidebarCollapsed]);

  const scheduleCollapse = useCallback(() => {
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    // A rail pinned open never auto-collapses.
    if (useUiStore.getState().sidebarPin === 'open') return;
    collapseTimerRef.current = window.setTimeout(() => {
      setSidebarCollapsed(true);
      collapseTimerRef.current = null;
    }, 150);
  }, [setSidebarCollapsed]);

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

  const pinLabel =
    pin === 'auto'
      ? collapsed
        ? 'Pin sidebar collapsed'
        : 'Pin sidebar open'
      : 'Unpin sidebar';

  // Removed from the layout entirely (not just collapsed) — used while a
  // table/row is being edited so the rail can't be hover-expanded mid-drag.
  useEffect(() => {
    if (!hidden) return;
    // No mouseleave fires when the element unmounts, so clear the hover
    // bookkeeping by hand.
    hoveredRef.current = false;
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav
      onMouseEnter={() => {
        hoveredRef.current = true;
        // A rail pinned shut stays shut on hover; the chevron is the only
        // way to open it explicitly.
        if (useUiStore.getState().sidebarPin !== 'closed') expand();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        scheduleCollapse();
      }}
      onFocus={expand}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          scheduleCollapse();
        }
      }}
      aria-label="Main navigation"
      data-tour="sidebar"
      className={clsx(
        'hidden md:flex flex-col h-screen bg-[#5c1219] border-r border-black/10 fixed left-0 top-0 z-50 app-sidebar',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      {/* Brand + toggle */}
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
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleTogglePin}
              aria-pressed={pin !== 'auto'}
              aria-label={pinLabel}
              title={
                pin === 'auto'
                  ? 'Pin sidebar open — keep it expanded'
                  : 'Unpin sidebar — back to hover behaviour'
              }
              className={clsx(
                'w-7 h-7 flex items-center justify-center transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                pin !== 'auto'
                  ? 'text-white bg-white/15 hover:bg-white/25'
                  : 'text-white/60 hover:text-white hover:bg-white/10',
              )}
            >
              <Icon name="push_pin" size={16} filled={pin !== 'auto'} />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <Icon name="chevron_left" size={18} />
            </button>
          </div>
        )}
      </div>

      {collapsed && (
        <div className="mx-2 mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={expand}
            className="flex-1 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <Icon name="chevron_right" size={18} />
          </button>
          <button
            type="button"
            onClick={handleTogglePin}
            aria-pressed={pin !== 'auto'}
            aria-label={pinLabel}
            title={
              pin === 'auto'
                ? 'Pin sidebar collapsed — stop it expanding on hover'
                : 'Unpin sidebar — back to hover behaviour'
            }
            className={clsx(
              'w-8 h-8 flex items-center justify-center transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
              pin !== 'auto'
                ? 'text-white bg-white/15 hover:bg-white/25'
                : 'text-white/60 hover:text-white hover:bg-white/10',
            )}
          >
            <Icon name="push_pin" size={16} filled={pin !== 'auto'} />
          </button>
        </div>
      )}

      {/* Main Nav */}
      <div className="flex-1 flex flex-col gap-px py-2 overflow-y-auto px-2">
        {visibleMain.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 font-semibold text-sm transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                collapsed ? 'justify-center py-2.5 px-2' : 'px-3 py-2.5',
                isActive
                  ? 'sidebar-active'
                  : 'text-white/80 hover:bg-white/10 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} filled={isActive} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Footer Nav */}
      {visibleFooter.length > 0 && (
        <div className="flex flex-col gap-px py-2 border-t border-white/10 px-2">
          {visibleFooter.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 font-semibold text-sm transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                  collapsed ? 'justify-center py-2.5 px-2' : 'px-3 py-2.5',
                  isActive
                    ? 'sidebar-active'
                    : 'text-white/80 hover:bg-white/10 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} filled={isActive} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}