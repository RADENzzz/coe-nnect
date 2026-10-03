import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon';
import { useUiStore } from '../../store/ui.store';
import { supabase } from '../../lib/supabase';

export default function TopBar() {
  const openMobileDrawer = useUiStore((s) => s.openMobileDrawer);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event: Event) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <header className="flex justify-between items-center px-4 md:px-6 w-full h-13 sticky top-0 z-40 bg-white border-b border-slate-200" style={{height:'48px'}}>
      {/* Left: Hamburger (mobile) + Title (desktop) */}
      <div className="flex items-center gap-3">
        <button
          onClick={openMobileDrawer}
          className="md:hidden w-8 h-8 hover:bg-slate-50 flex items-center justify-center text-slate-500"
          aria-label="Open menu"
        >
          <Icon name="menu" />
        </button>

        <span className="hidden md:inline text-base font-extrabold text-slate-900 tracking-tight">
          Lumina Schedule
        </span>
        <span className="md:hidden text-base font-extrabold text-slate-900 tracking-tight">
          CoE-NNECT
        </span>
      </div>

      {/* Right: Search + actions + avatar */}
      <div className="flex items-center gap-1 md:gap-2">
        <div className="relative hidden lg:block">
          <Icon
            name="search"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search..."
            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-all w-52"
          />
        </div>

        <button
          className="w-8 h-8 hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-500"
          aria-label="Notifications"
        >
          <Icon name="notifications" />
        </button>

        <button
          className="hidden md:flex w-8 h-8 hover:bg-slate-50 transition-colors items-center justify-center text-slate-500"
          aria-label="Settings"
        >
          <Icon name="settings" />
        </button>

        <div className="relative" ref={profileRef}>
          <div
            className="w-8 h-8 bg-[#5c1219] text-white overflow-hidden border border-slate-200 cursor-pointer flex items-center justify-center font-bold text-sm"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
          >
            A
          </div>

          {isProfileOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white shadow-sm py-1 border border-slate-200 z-50">
              <button
                onClick={handleLogout}
                className="flex items-center w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors font-medium"
              >
                <Icon name="logout" className="mr-2 text-base" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}