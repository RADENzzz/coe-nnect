import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../router';

const navItems = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD },
  { label: 'Timetable', path: ROUTES.TIMETABLE },
  { label: 'Faculty', path: ROUTES.FACULTY },
  { label: 'Rooms', path: ROUTES.ROOMS },
  { label: 'Subjects', path: ROUTES.SUBJECTS },
  { label: 'Sections', path: ROUTES.SECTIONS },
  { label: 'Approvals', path: ROUTES.APPROVALS },
  { label: 'Reports', path: ROUTES.REPORTS },
  { label: 'System Config', path: ROUTES.SYSTEM_CONFIG },
];

export default function AppShell() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-surface-low">
      {/* Sidebar */}
      <aside className="sidebar w-[280px]">
        <div className="px-6 py-5 border-b border-outline-variant">
          <h1 className="text-2xl font-bold text-primary">CoE-NNECT</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            WMSU Scheduling System
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? 'sidebar-item-active' : 'sidebar-item'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-outline-variant">
          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            className="w-full text-left px-4 py-2 text-sm text-on-surface-variant hover:text-primary transition"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}