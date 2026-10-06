import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';
import type { NavItem } from '../../lib/constants/nav-config';

interface BottomNavProps {
  items: NavItem[];
}

export default function BottomNav({ items }: BottomNavProps) {
  if (items.length === 0) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white border-t border-slate-200 flex justify-around items-stretch z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {items.slice(0, 4).map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 h-14 transition-colors ${
              isActive
                ? 'text-[#5c1219] font-bold'
                : 'text-slate-500 font-medium hover:text-slate-900'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} filled={isActive} className="mb-1" size={22} />
              <span className="text-[10px] leading-tight font-semibold">
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}