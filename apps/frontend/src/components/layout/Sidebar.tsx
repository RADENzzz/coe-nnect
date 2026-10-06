import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import Icon from '../ui/Icon';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import { useUiStore } from '../../store/ui.store';
import type { RoleNav } from '../../lib/constants/nav-config';

interface SidebarProps {
  nav: RoleNav;
}

export default function Sidebar({ nav }: SidebarProps) {
  const { deptName } = useDepartmentLabel();
  const collapsed = useUiStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const subtitle =
    nav.brandSubtitle === 'Department Portal' ? deptName : nav.brandSubtitle;
  const isDH = nav.brandSubtitle === 'Department Portal';

  return (
    <nav
      className={clsx(
        'hidden md:flex flex-col h-screen bg-[#5c1219] border-r border-black/10 fixed left-0 top-0 z-50',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      {/* Brand + toggle */}
      <div
        className={clsx(
          'border-b border-white/10 flex items-center',
          collapsed ? 'px-3 py-4 justify-center' : 'px-5 py-5 justify-between gap-2',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-white/10 flex items-center justify-center shrink-0">
            <Icon name="school" filled className="text-white" size={20} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-white leading-tight tracking-tight">
                CoE-NNECT
              </p>
              <p className="text-xs text-white/70 truncate max-w-[140px]">
                {subtitle}
              </p>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <Icon name="chevron_left" size={18} />
          </button>
        )}
      </div>

      {/* Expand button when collapsed (below brand) */}
      {collapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="mx-2 mt-2 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <Icon name="chevron_right" size={18} />
        </button>
      )}

      {/* CTA — DH only */}
      {isDH && collapsed && (
        <div className="px-2 py-3 border-b border-white/10">
          <button
            className="w-full bg-white text-[#5c1219] flex items-center justify-center h-9 hover:bg-white/90 transition-colors"
            title="Create New Term"
            aria-label="Create New Term"
          >
            <Icon name="add" />
          </button>
        </div>
      )}

      {/* Main Nav */}
      <div className="flex-1 flex flex-col gap-px py-2 overflow-y-auto px-2">
        {nav.main.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 font-semibold text-sm transition-colors',
                collapsed
                  ? 'justify-center py-2.5 px-2'
                  : 'px-3 py-2.5',
                isActive
                  ? 'bg-white text-[#5c1219]'
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
      {nav.footer.length > 0 && (
        <div className="flex flex-col gap-px py-2 border-t border-white/10 px-2">
          {nav.footer.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 font-semibold text-sm transition-colors',
                  collapsed
                    ? 'justify-center py-2.5 px-2'
                    : 'px-3 py-2.5',
                  isActive
                    ? 'bg-white text-[#5c1219]'
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