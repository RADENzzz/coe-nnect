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
    <header className="flex justify-between items-center px-4 md:px-6 w-full h-16 sticky top-0 z-40 bg-surface-bright border-b border-surface-variant">
      {/* Left: Hamburger (mobile) + Title (desktop) */}
      <div className="flex items-center gap-3">
        <button
          onClick={openMobileDrawer}
          className="md:hidden w-10 h-10 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
          aria-label="Open menu"
        >
          <Icon name="menu" />
        </button>

        <span className="hidden md:inline text-xl font-bold text-primary">
          Lumina Schedule
        </span>
        <span className="md:hidden text-lg font-bold text-primary">
          CoE-NNECT
        </span>
      </div>

      {/* Right: Search (desktop) + actions + avatar */}
      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative hidden lg:block">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            type="text"
            placeholder="Search..."
            className="pl-10 pr-4 py-2 bg-surface-container-low border border-surface-variant rounded-full text-sm focus:outline-none focus:border-secondary-container focus:ring-1 focus:ring-secondary-container transition-all"
          />
        </div>

        <button
          className="hidden md:flex w-10 h-10 rounded-full hover:bg-surface-container-high transition-colors items-center justify-center text-on-surface-variant"
          aria-label="Search"
        >
          <Icon name="search" className="md:hidden" />
        </button>

        <button
          className="w-10 h-10 rounded-full hover:bg-surface-container-high transition-colors flex items-center justify-center text-on-surface-variant"
          aria-label="Notifications"
        >
          <Icon name="notifications" />
        </button>

        <button
          className="hidden md:flex w-10 h-10 rounded-full hover:bg-surface-container-high transition-colors items-center justify-center text-on-surface-variant"
          aria-label="Settings"
        >
          <Icon name="settings" />
        </button>

        <div className="relative" ref={profileRef}>
          <div 
            className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary text-on-primary overflow-hidden border border-surface-variant cursor-pointer flex items-center justify-center font-bold text-sm"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
          >
            A
          </div>
          
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-surface-bright rounded-md shadow-lg py-1 border border-surface-variant z-50">
              <button
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
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