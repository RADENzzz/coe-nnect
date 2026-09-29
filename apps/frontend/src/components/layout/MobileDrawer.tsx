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
      // Lock body scroll
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
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_200ms_ease-out]"
        onClick={closeMobileDrawer}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside className="absolute left-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-surface-container-low flex flex-col py-6 px-3 gap-2 animate-[slideIn_250ms_cubic-bezier(0.2,0.9,0.3,1)]">
        {/* Brand */}
        <div className="px-3 mb-6 flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary">
              <Icon name="school" filled />
            </div>
            <div>
              <h1 className="font-bold text-lg text-primary leading-tight">
                Computer Engineering
              </h1>
              <p className="label">Department Admin</p>
            </div>
          </div>
          <button
            onClick={closeMobileDrawer}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* CTA */}
        <div className="px-3 mb-4">
          <button className="w-full bg-primary text-on-primary font-semibold text-xs py-3 rounded-lg hover:bg-tertiary transition-colors flex items-center justify-center gap-2">
            <Icon name="add" />
            Create New Term
          </button>
        </div>

        {/* Main Nav */}
        <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeMobileDrawer}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-3 px-3 py-3 text-primary font-bold bg-surface-container-highest rounded-lg transition-all'
                  : 'flex items-center gap-3 px-3 py-3 text-on-surface-variant font-medium hover:text-secondary hover:bg-surface-container-high transition-all rounded-lg'
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} filled={isActive} />
                  <span className="text-sm font-semibold">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Footer Nav */}
        <div className="flex flex-col gap-1 mt-auto pt-4 border-t border-surface-variant">
          {footerNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeMobileDrawer}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-3 px-3 py-3 text-primary font-bold bg-surface-container-highest rounded-lg transition-all'
                  : 'flex items-center gap-3 px-3 py-3 text-on-surface-variant font-medium hover:text-secondary hover:bg-surface-container-high transition-all rounded-lg'
              }
            >
              <Icon name={item.icon} />
              <span className="text-sm font-semibold">{item.label}</span>
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