import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';
import { ROUTES } from '../../router';

const mainNav = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: 'dashboard' },
  { label: 'Schedule Planner', path: ROUTES.TIMETABLE, icon: 'calendar_view_month' },
  { label: 'Faculty Directory', path: ROUTES.FACULTY, icon: 'groups' },
  { label: 'Conflict Resolver', path: ROUTES.APPROVALS, icon: 'report_problem' },
];

const footerNav = [
  { label: 'Archive', path: ROUTES.AUDIT_TRAIL, icon: 'archive' },
  { label: 'Help', path: '/help', icon: 'help_outline' },
];

export default function Sidebar() {
  return (
    <nav className="hidden md:flex flex-col h-screen w-[280px] bg-surface-container-low fixed left-0 top-0 py-6 px-3 gap-2 z-50">
      {/* Brand */}
      <div className="px-3 mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary">
            <Icon name="school" filled />
          </div>
          <div>
            <h1 className="font-bold text-lg text-primary leading-tight tracking-tight">
              Computer Engineering
            </h1>
            <p className="label">Department Admin</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-3 mb-6">
        <button className="w-full bg-primary text-on-primary font-semibold text-xs py-3 rounded-lg hover:bg-tertiary transition-colors flex items-center justify-center gap-2">
          <Icon name="add" />
          Create New Term
        </button>
      </div>

      {/* Main Nav */}
      <div className="flex-1 flex flex-col gap-1">
        {mainNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-3 py-2 text-primary font-bold bg-surface-container-highest rounded-lg transition-all'
                : 'flex items-center gap-3 px-3 py-2 text-on-surface-variant font-medium hover:text-secondary hover:bg-surface-container-high transition-all rounded-lg'
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} filled={isActive} />
                <span className="text-xs font-semibold">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Footer Nav */}
      <div className="flex flex-col gap-1 mt-auto">
        {footerNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-3 py-2 text-primary font-bold bg-surface-container-highest rounded-lg transition-all'
                : 'flex items-center gap-3 px-3 py-2 text-on-surface-variant font-medium hover:text-secondary hover:bg-surface-container-high transition-all rounded-lg'
            }
          >
            <Icon name={item.icon} />
            <span className="text-xs font-semibold">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}