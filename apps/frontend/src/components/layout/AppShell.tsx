import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function AppShell() {
  return (
    <div className="bg-background text-on-background min-h-screen flex">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 md:ml-[280px]">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}