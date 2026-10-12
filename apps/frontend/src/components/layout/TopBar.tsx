import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Icon from '../ui/Icon';
import { useUiStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { useLogout } from '../../hooks/use-logout';
import { getNavForRole } from '../../lib/constants/nav-config';
import NotificationBell from '../notifications/NotificationBell';

interface TopBarProps {
  /** Small label shown on desktop only. Mobile shows the current page title. */
  label?: string;
}

/** Map a pathname to a human page title for the mobile header. */
function usePageTitle(): string {
  const { pathname } = useLocation();
  const profile = useAuthStore((s) => s.profile);
  const nav = getNavForRole(profile?.role);

  // Longest matching nav item wins.
  const all = [...nav.main, ...nav.footer];
  const match = all
    .filter((item) => pathname === item.path || pathname.startsWith(item.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0];

  return match?.label ?? 'CoE-NNECT';
}

export default function TopBar({ label }: TopBarProps) {
  const openMobileDrawer = useUiStore((s) => s.openMobileDrawer);
  const profile = useAuthStore((s) => s.profile);
  const logout = useLogout();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const initial = profile?.username?.[0]?.toUpperCase() ?? 'U';
  const pageTitle = usePageTitle();

  useEffect(() => {
    function handleClickOutside(event: Event) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  return (
    <header
      className="flex justify-between items-center px-4 md:px-6 w-full sticky top-0 z-40 bg-white border-b border-slate-200 pt-safe"
      style={{ height: '48px' }}
    >
      {/* Left: Hamburger (mobile) + Page title (mobile) + Portal label (desktop) */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={openMobileDrawer}
          className="md:hidden tap-target hover:bg-slate-50 flex items-center justify-center text-slate-600 -ml-2"
          aria-label="Open menu"
        >
          <Icon name="menu" />
        </button>

        {/* Mobile: current page title */}
        <span className="md:hidden text-sm font-bold text-slate-900 truncate">
          {pageTitle}
        </span>

        {/* Desktop: portal label */}
        {label && (
          <span className="hidden md:inline text-sm text-slate-500 font-medium">
            {label}
          </span>
        )}
      </div>

      {/* Right: Search (desktop) + actions + avatar */}
      <div className="flex items-center gap-1 md:gap-2">
        <div className="relative hidden lg:block">
          <Icon
            name="search"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search..."
            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors w-52"
          />
        </div>

        {/* Notification bell — live, replaces the previous dead button */}
        <NotificationBell />

        <button
          className="hidden md:flex tap-target hover:bg-slate-50 transition-colors items-center justify-center text-slate-500"
          aria-label="Settings"
        >
          <Icon name="settings" />
        </button>

        {/* Profile Avatar + Dropdown */}
        <div className="relative" ref={profileRef}>
          <div
            className="w-9 h-9 rounded-full bg-[#5c1219] text-white overflow-hidden border border-slate-200 cursor-pointer flex items-center justify-center font-bold text-sm hover:opacity-90 transition-opacity"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setIsProfileOpen(!isProfileOpen);
            }}
          >
            {initial}
          </div>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white shadow-md rounded-md py-1 border border-slate-200 z-50">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {profile?.username ?? 'User'}
                </p>
                <p className="text-xs text-slate-400 truncate">{profile?.email ?? ''}</p>
              </div>
              <button
                onClick={logout}
                className="flex items-center w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors font-medium"
              >
                <Icon name="logout" className="mr-3 text-base" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}