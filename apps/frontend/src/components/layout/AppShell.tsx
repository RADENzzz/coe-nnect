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
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-blue-900 text-white flex flex-col">
        <div className="p-4 border-b border-blue-800">
          <h1 className="text-xl font-bold">CoE-NNECT</h1>
          <p className="text-xs text-blue-200 mt-1">WMSU Scheduling</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm transition ${
                  isActive
                    ? 'bg-blue-800 text-white font-medium'
                    : 'text-blue-100 hover:bg-blue-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-blue-800">
          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            className="w-full text-left text-sm text-blue-200 hover:text-white"
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