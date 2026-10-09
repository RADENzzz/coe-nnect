import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileDrawer from './MobileDrawer';
import BottomNav from './BottomNav';
import ChatWidget from '../../features/chat/ChatWidget';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import { getNavForRole } from '../../lib/constants/nav-config';

export default function AppShell() {
  const profile = useAuthStore((s) => s.profile);
  const setLastPath = useUiStore((s) => s.setLastPath);
  const collapsed = useUiStore((s) => s.isSidebarCollapsed);
  const location = useLocation();

  const nav = getNavForRole(profile?.role);

  useEffect(() => {
    const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    const mqDesktop = window.matchMedia('(min-width: 1024px)');
    const set = useUiStore.getState().setSidebarCollapsed;

    const handle = () => {
      if (mqTablet.matches) set(true);
      else if (mqDesktop.matches) set(false);
    };

    handle();

    mqTablet.addEventListener('change', handle);
    mqDesktop.addEventListener('change', handle);
    return () => {
      mqTablet.removeEventListener('change', handle);
      mqDesktop.removeEventListener('change', handle);
    };
  }, []);

  useEffect(() => {
    setLastPath(location.pathname);
  }, [location.pathname, setLastPath]);

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen flex">
      <Sidebar nav={nav} />
      <MobileDrawer nav={nav} />

      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-200 ease-out ${
          collapsed ? 'md:ml-[68px]' : 'md:ml-64'
        }`}
      >
        <TopBar label={nav.topBarLabel} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      <BottomNav items={nav.bottom} />

      {/* Chat widget — floating, mounted once per shell.
          Admin and Dean shells are wrappers around AppShell, so they inherit it. */}
      {profile?.role !== 'viewer' && <ChatWidget />}
    </div>
  );
}