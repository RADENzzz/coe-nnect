import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';
import { ROUTES } from '../../router';

const bottomNavItems = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: 'dashboard' },
  { label: 'Planner', path: ROUTES.TIMETABLE, icon: 'calendar_view_month' },
  { label: 'Faculty', path: ROUTES.FACULTY, icon: 'groups' },
  { label: 'Conflicts', path: ROUTES.APPROVALS, icon: 'report_problem' },
];

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white border-t border-slate-200 flex justify-around items-center h-14 z-40 pb-[env(safe-area-inset-bottom)]">
      {bottomNavItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full h-full transition-colors ${
              isActive
                ? 'text-[#5c1219] font-bold'
                : 'text-slate-500 font-medium hover:text-slate-900'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} filled={isActive} className="mb-1" size={20} />
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