import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';
import { ROUTES } from '../../router';
import { useDepartmentLabel } from '../../hooks/use-department-label';



export const mainNavItems = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: 'dashboard' },
  { label: 'Schedule Planner', path: ROUTES.TIMETABLE, icon: 'calendar_view_month' },
  { label: 'Faculty Directory', path: ROUTES.FACULTY, icon: 'groups' },
  { label: 'Conflict Resolver', path: ROUTES.APPROVALS, icon: 'report_problem' },
  { label: 'Rooms', path: ROUTES.ROOMS, icon: 'meeting_room' },
  { label: 'Subjects', path: ROUTES.SUBJECTS, icon: 'menu_book' },
  { label: 'Prospectus', path: ROUTES.PROSPECTUS, icon: 'library_books' },
  { label: 'Sections', path: ROUTES.SECTIONS, icon: 'view_module' },
  { label: 'Reports', path: ROUTES.REPORTS, icon: 'bar_chart' },
];

export const footerNavItems = [
  { label: 'Archive', path: ROUTES.AUDIT_TRAIL, icon: 'archive' },
  { label: 'Help', path: '/help', icon: 'help_outline' },
];

export default function Sidebar() {
  const { deptName } = useDepartmentLabel();
  return (
    <nav className="hidden md:flex flex-col h-screen w-64 bg-white border-r border-slate-200 fixed left-0 top-0 z-50">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#5c1219] flex items-center justify-center shrink-0">
            <Icon name="school" filled className="text-white" size={20} />
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-900 leading-tight tracking-tight">
              CoE-NNECT
            </p>
            <p className="text-xs text-slate-500 truncate max-w-[160px]">
              {deptName}
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 py-3 border-b border-slate-100">
        <button className="w-full bg-[#5c1219] text-white font-semibold text-sm py-2 hover:opacity-90 transition flex items-center justify-center gap-2">
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
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-3 py-2.5 bg-[#5c1219] text-white font-semibold text-sm transition-all'
                : 'flex items-center gap-3 px-3 py-2.5 text-slate-600 font-semibold text-sm hover:bg-slate-50 hover:text-slate-900 transition-all'
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
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-3 py-2.5 bg-[#5c1219] text-white font-semibold text-sm transition-all'
                : 'flex items-center gap-3 px-3 py-2.5 text-slate-600 font-semibold text-sm hover:bg-slate-50 hover:text-slate-900 transition-all'
            }
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}