import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';
import type { NavItem } from '../../lib/constants/nav-config';

interface BottomNavProps {
  items: NavItem[];
  /** Optional map of path → badge count. */
  badges?: Record<string, number>;
}

export default function BottomNav({ items, badges }: BottomNavProps) {
  if (items.length === 0) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white border-t border-slate-200 flex justify-around items-stretch z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {items.slice(0, 4).map((item) => {
        const badge = badges?.[item.path];
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center flex-1 h-14 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5c1219]/30 ${
                isActive
                  ? 'text-[#5c1219] font-bold'
                  : 'text-slate-500 font-medium hover:text-slate-900'
              }`
            }
            aria-label={item.label}
          >
            {({ isActive }) => (
              <>
                {/* Top accent bar */}
                <span
                  aria-hidden
                  className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all ${
                    isActive ? 'w-8 bg-[#5c1219]' : 'w-0 bg-transparent'
                  }`}
                />
                <div className="relative">
                  <Icon name={item.icon} filled={isActive} className="mb-1" size={22} />
                  {badge !== undefined && badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#5c1219] text-white text-[9px] font-bold flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] leading-tight font-semibold">
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}