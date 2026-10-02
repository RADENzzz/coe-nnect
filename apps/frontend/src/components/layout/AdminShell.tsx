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
    <div className="min-h-screen flex bg-background text-on-background">
      {/* Admin Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-surface-container-lowest border-r border-surface-variant fixed h-full z-30">
        {/* Logo */}
        <div className="p-6 border-b border-surface-variant">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-lg">
                admin_panel_settings
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-primary">CoE-NNECT</p>
              <p className="text-xs text-on-surface-variant">Admin Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-primary text-on-primary font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`
              }
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-surface-variant">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-on-surface-variant hover:bg-error/10 hover:text-error transition-all w-full"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-surface-variant bg-surface-bright sticky top-0 z-20">
          <p className="text-sm text-on-surface-variant font-medium">System Administrator</p>
          <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-bold">
            A
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto bg-surface">
          <Outlet />
        </main>
      </div>
    </div>
  );
}