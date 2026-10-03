import { Outlet, NavLink } from 'react-router-dom';
import { useLogout } from '../../hooks/use-logout';
import { useAuthStore } from '../../store/auth.store';
import { useState, useRef, useEffect } from 'react';
import Icon from '../ui/Icon';

const navItems = [
  { label: 'Dashboard', icon: 'dashboard', path: '/admin/dashboard' },
  { label: 'Departments', icon: 'domain', path: '/admin/departments' },
  { label: 'Users', icon: 'manage_accounts', path: '/admin/users' },
];

export default function AdminShell() {
  const logout = useLogout();
  const profile = useAuthStore((s) => s.profile);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const initial = profile?.username?.[0]?.toUpperCase() ?? 'A';

  useEffect(() => {
    function handleClickOutside(event: Event) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Admin Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-white border-r border-slate-200 fixed h-full z-30">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#5c1219] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-[20px]">
                admin_panel_settings
              </span>
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900 leading-tight tracking-tight">CoE-NNECT</p>
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
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-[#5c1219] text-white'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

      </aside>

      {/* Main content area */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-slate-200 bg-white sticky top-0 z-20">
          <p className="text-sm text-slate-500 font-medium">System Administrator</p>

          <div className="relative" ref={profileRef}>
            <div
              className="w-10 h-10 rounded-full bg-[#5c1219] text-white overflow-hidden border border-slate-200 cursor-pointer flex items-center justify-center font-bold text-base hover:opacity-90 transition-opacity"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              {initial}
            </div>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white shadow-md rounded-md py-1 border border-slate-200 z-50">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-900">{profile?.username ?? 'Admin'}</p>
                  <p className="text-xs text-slate-400 truncate">{profile?.email ?? ''}</p>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors font-medium"
                >
                  <Icon name="logout" className="mr-3 text-lg" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}