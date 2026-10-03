import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileDrawer from './MobileDrawer';
import BottomNav from './BottomNav';

export default function AppShell() {
  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen flex">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile drawer (renders only when open) */}
      <MobileDrawer />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-64">
        <TopBar />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  );
}