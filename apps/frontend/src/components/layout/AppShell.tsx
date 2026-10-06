import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileDrawer from './MobileDrawer';
import BottomNav from './BottomNav';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import { getNavForRole } from '../../lib/constants/nav-config';

export default function AppShell() {
  const profile = useAuthStore((s) => s.profile);
  const setLastPath = useUiStore((s) => s.setLastPath);
  const location = useLocation();

  const nav = getNavForRole(profile?.role);

  // Auto-close mobile drawer when the route changes.
  useEffect(() => {
    setLastPath(location.pathname);
  }, [location.pathname, setLastPath]);

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen flex">
      {/* Desktop sidebar */}
      <Sidebar nav={nav} />

      {/* Mobile drawer (renders only when open) */}
      <MobileDrawer nav={nav} />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-64">
        <TopBar label={nav.topBarLabel} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav items={nav.bottom} />
    </div>
  );
}