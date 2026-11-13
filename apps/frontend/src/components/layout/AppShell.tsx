import { useEffect, useMemo, useRef } from 'react';
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
import { useNavAttention } from '../../hooks/use-nav-attention';
import { useNavUsageRecorder } from '../../hooks/use-nav-usage';
import SystemStatusBanner from '../../features/auth/components/SystemStatusBanner';
import NotificationToaster from '../../features/notifications/NotificationToaster';
import ChatSoundListener from '../../features/chat/ChatSoundListener';
import { FeedbackProvider } from '../../components/ui/FeedbackToast';
import { installSoundUnlock } from '../../lib/sound';
import LiquidBackground from './LiquidBackground';
import TutorialProvider from '../../features/tutorial/TutorialProvider';

function ShellInner() {
  const profile = useAuthStore((s) => s.profile);
  const setLastPath = useUiStore((s) => s.setLastPath);
  const collapsed = useUiStore((s) => s.isSidebarCollapsed);
  const hidden = useUiStore((s) => s.isSidebarHidden);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  const nav = getNavForRole(profile?.role);
  const attention = useNavAttention(nav, profile?.role);

  useNotificationSocketBridge();
  useNavUsageRecorder();

  // Browsers require a gesture before Web Audio can start; arm the context
  // on the first click or keypress and keep it ready for socket events.
  useEffect(() => installSoundUnlock(), []);

  // The bottom bar renders a subset of the rail; carry the same unread
  // counts down so the two never disagree.
  const bottomBadges = useMemo(() => {
    const badges: Record<string, number> = {};
    for (const item of nav.bottom) {
      const count = attention.badgeFor(item);
      if (count > 0) badges[item.path] = count;
    }
    return badges;
  }, [attention, nav.bottom]);

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
    <div className="app-shell bg-slate-50 text-slate-900 min-h-screen flex">
      <LiquidBackground />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:px-3 focus:py-2 focus:bg-white focus:text-primary focus:font-semibold focus:rounded focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Skip to content
      </a>

      <Sidebar nav={nav} />
      <MobileDrawer nav={nav} />

      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-200 ease-out ${
          hidden ? 'md:ml-0' : collapsed ? 'md:ml-[68px]' : 'md:ml-64'
        }`}
      >
        <TopBar label={nav.topBarLabel} />

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 focus:outline-none"
        >
          <SystemStatusBanner />
          <div key={location.pathname} className="animate-page-roll h-full">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav items={nav.bottom} badges={bottomBadges} />
      <NotificationToaster />
      <ChatSoundListener />
      <TutorialProvider />
    </div>
  );
}

export default function AppShell() {
  return (
    <NotificationSocketProvider>
      <FeedbackProvider>
        <ChatProvider>
          <ShellInner />
        </ChatProvider>
      </FeedbackProvider>
    </NotificationSocketProvider>
  );
}