import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';
import { useUiStore } from '../../store/ui.store';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import type { RoleNav } from '../../lib/constants/nav-config';

interface MobileDrawerProps {
  nav: RoleNav;
}

export default function MobileDrawer({ nav }: MobileDrawerProps) {
  const { isMobileDrawerOpen, closeMobileDrawer } = useUiStore();
  const { deptName } = useDepartmentLabel();
  const drawerRef = useRef<HTMLElement>(null);

  const subtitle =
    nav.brandSubtitle === 'Department Portal' ? deptName : nav.brandSubtitle;

  // Escape to close + body scroll lock + initial focus
  useEffect(() => {
    if (!isMobileDrawerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileDrawer();
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    // Move focus into the drawer so screen readers + keyboard land here.
    const focusTimer = window.setTimeout(() => {
      drawerRef.current?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      window.clearTimeout(focusTimer);
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
              <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={closeMobileDrawer}
            className="tap-target hover:bg-slate-50 flex items-center justify-center text-slate-500 -mr-2"
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* CTA — DH only */}

        {/* Main Nav */}
        <div className="flex-1 flex flex-col gap-px py-2 overflow-y-auto px-2 overscroll-contain">
          {nav.main.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeMobileDrawer}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-3 px-3 py-3 bg-[#5c1219] text-white font-semibold text-sm transition-colors'
                  : 'flex items-center gap-3 px-3 py-3 text-slate-600 font-semibold text-sm hover:bg-slate-50 hover:text-slate-900 transition-colors'
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
        {nav.footer.length > 0 && (
          <div className="flex flex-col gap-px py-2 border-t border-slate-100 px-2 pb-safe">
            {nav.footer.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeMobileDrawer}
                className={({ isActive }) =>
                  isActive
                    ? 'flex items-center gap-3 px-3 py-3 bg-[#5c1219] text-white font-semibold text-sm transition-colors'
                    : 'flex items-center gap-3 px-3 py-3 text-slate-600 font-semibold text-sm hover:bg-slate-50 hover:text-slate-900 transition-colors'
                }
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}