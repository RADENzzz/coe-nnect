import { Outlet, NavLink } from 'react-router-dom';
import { useLogout } from '../../hooks/use-logout';

const navItems = [
  { label: 'Dashboard', icon: 'dashboard', path: '/admin' },
  { label: 'Departments', icon: 'domain', path: '/admin/departments' },
  { label: 'Users', icon: 'manage_accounts', path: '/admin/users' },
];

export default function AdminShell() {
  const logout = useLogout();

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Admin Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-white border-r border-slate-200 fixed h-full z-30">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#5c1219] flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-base">
                admin_panel_settings
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight">CoE-NNECT</p>
              <p className="text-xs text-slate-500">Admin Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-[#5c1219] text-white'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={logout}
            className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700 transition-all w-full"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-12 flex items-center justify-between px-6 border-b border-slate-200 bg-white sticky top-0 z-20">
          <p className="text-sm text-slate-500 font-medium">System Administrator</p>
          <div className="w-7 h-7 bg-[#5c1219] text-white flex items-center justify-center text-xs font-bold">
            A
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}