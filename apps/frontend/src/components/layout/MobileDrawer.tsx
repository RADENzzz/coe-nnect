import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';
import { useUiStore } from '../../store/ui.store';
import { mainNavItems, footerNavItems } from './Sidebar';

export default function MobileDrawer() {
  const { isMobileDrawerOpen, closeMobileDrawer } = useUiStore();

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileDrawer();
    };
    if (isMobileDrawerOpen) {
      document.addEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isMobileDrawerOpen, closeMobileDrawer]);

  if (!isMobileDrawerOpen) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-[fadeIn_200ms_ease-out]"
        onClick={closeMobileDrawer}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside className="absolute left-0 top-0 bottom-0 w-[85%] max-w-[300px] bg-white border-r border-slate-200 flex flex-col animate-[slideIn_250ms_cubic-bezier(0.2,0.9,0.3,1)]">
        {/* Brand */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#5c1219] flex items-center justify-center shrink-0">
              <Icon name="school" filled className="text-white" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900 leading-tight tracking-tight">
                Computer Engineering
              </p>
              <p className="text-[11px] text-slate-500">Department Admin</p>
            </div>
          </div>
          <button
            onClick={closeMobileDrawer}
            className="w-7 h-7 hover:bg-slate-50 flex items-center justify-center text-slate-500"
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* CTA */}
        <div className="px-4 py-3 border-b border-slate-100">
          <button className="w-full bg-[#5c1219] text-white font-semibold text-xs py-2 hover:opacity-90 transition flex items-center justify-center gap-2">
            <Icon name="add" />
            Create New Term
          </button>
        </div>

        {/* Main Nav */}
        <div className="flex-1 flex flex-col gap-px py-2 overflow-y-auto px-2">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeMobileDrawer}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-2.5 px-3 py-2.5 bg-[#5c1219] text-white font-semibold text-xs transition-all'
                  : 'flex items-center gap-2.5 px-3 py-2.5 text-slate-600 font-semibold text-xs hover:bg-slate-50 hover:text-slate-900 transition-all'
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
        <div className="flex flex-col gap-px py-2 border-t border-slate-100 px-2">
          {footerNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeMobileDrawer}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-2.5 px-3 py-2.5 bg-[#5c1219] text-white font-semibold text-xs transition-all'
                  : 'flex items-center gap-2.5 px-3 py-2.5 text-slate-600 font-semibold text-xs hover:bg-slate-50 hover:text-slate-900 transition-all'
              }
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </aside>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}