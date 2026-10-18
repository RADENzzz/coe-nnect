import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileDrawer from './MobileDrawer';
import BottomNav from './BottomNav';
import { ChatProvider } from '../../features/chat/ChatWidget';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import { getNavForRole } from '../../lib/constants/nav-config';
import { NotificationSocketProvider } from '../../hooks/use-notification-socket';
import { useNotificationSocketBridge } from '../../hooks/use-notifications';

function ShellInner() {
  const profile = useAuthStore((s) => s.profile);
  const setLastPath = useUiStore((s) => s.setLastPath);
  const collapsed = useUiStore((s) => s.isSidebarCollapsed);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  const nav = getNavForRole(profile?.role);

  useNotificationSocketBridge();

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const set = useUiStore.getState().setSidebarCollapsed;
    const handle = () => {
      if (mq.matches) set(true);
    };
    handle();
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  useEffect(() => {
    setLastPath(location.pathname);
  }, [location.pathname, setLastPath]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:px-3 focus:py-2 focus:bg-white focus:text-[#5c1219] focus:font-semibold focus:rounded focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#5c1219]"
      >
        Skip to content
      </a>

      <Sidebar nav={nav} />
      <MobileDrawer nav={nav} />

      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-200 ease-out ${
          collapsed ? 'md:ml-[68px]' : 'md:ml-64'
        }`}
      >
        <TopBar label={nav.topBarLabel} />

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 focus:outline-none"
        >
          <Outlet />
        </main>
      </div>

      <BottomNav items={nav.bottom} />
    </div>
  );
}

export default function AppShell() {
  return (
    <NotificationSocketProvider>
      <ChatProvider>
        <ShellInner />
      </ChatProvider>
    </NotificationSocketProvider>
  );
}