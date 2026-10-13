import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileDrawer from './MobileDrawer';
import BottomNav from './BottomNav';
import ChatWidget from '../../features/chat/ChatWidget';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import { getNavForRole } from '../../lib/constants/nav-config';
import { NotificationSocketProvider } from '../../hooks/use-notification-socket';
import { useNotificationSocketBridge } from '../../hooks/use-notifications';

/**
 * Inner component — inside the NotificationSocketProvider so it can
 * access the socket context.
 */
function ShellInner() {
  const profile = useAuthStore((s) => s.profile);
  const setLastPath = useUiStore((s) => s.setLastPath);
  const collapsed = useUiStore((s) => s.isSidebarCollapsed);
  const location = useLocation();
  const sidebarStateBeforeHelp = useRef<boolean | null>(null);

  const nav = getNavForRole(profile?.role);

  // Wire socket events into React Query cache
  useNotificationSocketBridge();

  useEffect(() => {
    const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    const mqDesktop = window.matchMedia('(min-width: 1024px)');
    const set = useUiStore.getState().setSidebarCollapsed;

    const handle = () => {
      const isHelpPage =
        location.pathname === '/help' || location.pathname === '/dean/help';

      if (isHelpPage) {
        if (sidebarStateBeforeHelp.current === null) {
          sidebarStateBeforeHelp.current =
            useUiStore.getState().isSidebarCollapsed;
        }
        set(true);
      } else if (sidebarStateBeforeHelp.current !== null) {
        set(sidebarStateBeforeHelp.current || mqTablet.matches);
        sidebarStateBeforeHelp.current = null;
      } else if (mqTablet.matches) {
        set(true);
      } else if (mqDesktop.matches) {
        set(false);
      }
    };

    handle();

    mqTablet.addEventListener('change', handle);
    mqDesktop.addEventListener('change', handle);
    return () => {
      mqTablet.removeEventListener('change', handle);
      mqDesktop.removeEventListener('change', handle);
    };
  }, [location.pathname]);

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

      {profile?.role !== 'viewer' && <ChatWidget />}
    </div>
  );
}

export default function AppShell() {
  return (
    <NotificationSocketProvider>
      <ShellInner />
    </NotificationSocketProvider>
  );
}