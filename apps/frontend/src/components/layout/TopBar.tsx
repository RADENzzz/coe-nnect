import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../ui/Icon';
import { useUiStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { useLogout } from '../../hooks/use-logout';
import { getNavForRole } from '../../lib/constants/nav-config';
import NotificationBell from '../notifications/NotificationBell';
import { searchApi, type SearchResult } from '../../api/search.api';

const RECENT_SEARCHES_KEY = 'coe-nnect:recent-searches';
const MAX_RECENT = 5;

interface TopBarProps {
  label?: string;
}

function usePageTitle(): string {
  const { pathname } = useLocation();
  const profile = useAuthStore((s) => s.profile);
  const nav = getNavForRole(profile?.role);

  const all = [...nav.main, ...nav.footer];
  const match = all
    .filter(
      (item) =>
        pathname === item.path || pathname.startsWith(item.path + '/'),
    )
    .sort((a, b) => b.path.length - a.path.length)[0];

  return match?.label ?? 'CoE-NNECT';
}

const TYPE_META: Record<
  SearchResult['type'],
  { label: string; icon: string }
> = {
  subject: { label: 'Subject', icon: 'menu_book' },
  faculty: { label: 'Faculty', icon: 'groups' },
  room: { label: 'Room', icon: 'meeting_room' },
  section: { label: 'Section', icon: 'view_module' },
  user: { label: 'User', icon: 'manage_accounts' },
};

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 350;

// ── Recent searches helper ──
function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(list: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* ignore quota errors */
  }
}

// Highlight matched substring inside a string
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-100 text-slate-900 rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function TopBar({ label }: TopBarProps) {
  const openMobileDrawer = useUiStore((s) => s.openMobileDrawer);
  const profile = useAuthStore((s) => s.profile);
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const initial = profile?.username?.[0]?.toUpperCase() ?? 'U';
  const pageTitle = usePageTitle();
  const settingsPath = location.pathname.startsWith('/dean')
    ? '/dean/settings'
    : '/settings';

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    loadRecentSearches(),
  );
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isMac = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  );
  const shortcutHint = isMac ? '⌘K' : 'Ctrl+K';

  // Debounce input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: ({ signal }) => searchApi.search(debouncedQuery, signal),
    enabled: debouncedQuery.length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const results = useMemo(() => data?.results ?? [], [data]);

  // Group results by type for a nicer dropdown
  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const r of results) {
      const arr = groups.get(r.type) ?? [];
      arr.push(r);
      groups.set(r.type, arr);
    }
    return Array.from(groups.entries());
  }, [results]);

  // Reset on route change
  useEffect(() => {
    setIsSearchOpen(false);
    setMobileSearchOpen(false);
    setSearchQuery('');
    setDebouncedQuery('');
  }, [location.pathname]);

  // Click outside
  useEffect(() => {
    function handleClickOutside(event: Event) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Ctrl/Cmd+K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const pushRecentSearch = useCallback((term: string) => {
    if (!term || term.length < MIN_QUERY_LENGTH) return;
    setRecentSearches((prev) => {
      const next = [term, ...prev.filter((s) => s !== term)].slice(0, MAX_RECENT);
      saveRecentSearches(next);
      return next;
    });
  }, []);

  const handleSelect = (result: SearchResult) => {
    pushRecentSearch(debouncedQuery);
    navigate(result.path);
    setIsSearchOpen(false);
    setMobileSearchOpen(false);
    setSearchQuery('');
    setDebouncedQuery('');
  };

  const handleClear = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setIsSearchOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selectedIndex];
      if (r) handleSelect(r);
    }
  };

  const showDropdown =
    isSearchOpen && debouncedQuery.length >= MIN_QUERY_LENGTH;
  const showRecent = isSearchOpen && !debouncedQuery && recentSearches.length > 0;
  const showClear = searchQuery.length > 0;

  // ── Render: search dropdown content (shared between desktop and mobile) ──
  const renderSearchDropdown = (variant: 'desktop' | 'mobile' = 'desktop') => {
    const widthClass = variant === 'desktop' ? 'w-[22rem] right-0 mt-1' : 'w-full mt-2';

    if (showRecent) {
      return (
        <div
          className={`animate-fade-in absolute ${widthClass} border border-slate-200 bg-white shadow-lg z-50`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Recent searches
            </span>
            <button
              type="button"
              onClick={() => {
                setRecentSearches([]);
                saveRecentSearches([]);
              }}
              className="text-[10px] text-slate-400 hover:text-slate-700 font-semibold"
            >
              Clear
            </button>
          </div>
          <ul>
            {recentSearches.map((term) => (
              <li key={term}>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery(term);
                    setIsSearchOpen(true);
                    inputRef.current?.focus();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                >
                  <Icon name="history" className="text-slate-400 text-[16px]" />
                  <span className="text-sm text-slate-700 truncate">{term}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (!showDropdown) return null;

    return (
      <div
        id="global-search-results"
        className={`animate-fade-in absolute ${widthClass} max-h-[70vh] overflow-y-auto border border-slate-200 bg-white shadow-lg z-50`}
      >
        {isFetching && results.length === 0 ? (
          <div className="px-4 py-3 text-xs text-slate-400">Searching…</div>
        ) : results.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500">
            No results for &ldquo;{debouncedQuery}&rdquo;
          </div>
        ) : (
          <ul role="listbox" className="py-1">
            {groupedResults.map(([type, items]) => {
              const meta = TYPE_META[type as SearchResult['type']];
              return (
                <li key={type}>
                  <div className="px-3 py-1.5 flex items-center gap-2 bg-slate-50 border-y border-slate-100">
                    <Icon name={meta.icon} className="text-slate-400 text-[14px]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {items.length}
                    </span>
                  </div>
                  <ul>
                    {items.map((r) => {
                      const i = results.indexOf(r);
                      const isSelected = i === selectedIndex;
                      return (
                        <li key={`${r.type}-${r.id}`}>
                          <button
                            type="button"
                            onClick={() => handleSelect(r)}
                            onMouseEnter={() => setSelectedIndex(i)}
                            className={`flex w-full items-start gap-3 px-3 py-2 text-left transition-colors ${
                              isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'
                            }`}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <span className="material-symbols-outlined mt-0.5 text-[18px] text-slate-400">
                              {meta.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-900">
                                <Highlighted text={r.label} query={debouncedQuery} />
                              </div>
                              {r.sublabel && (
                                <div className="mt-0.5 truncate text-xs text-slate-500">
                                  {r.sublabel}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}

        {results.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400">
            <span>
              <kbd className="border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono">
                ↑↓
              </kbd>{' '}
              navigate ·{' '}
              <kbd className="border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono">
                Enter
              </kbd>{' '}
              open ·{' '}
              <kbd className="border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono">
                Esc
              </kbd>{' '}
              close
            </span>
            <span>
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <header
        className="flex justify-between items-center px-4 md:px-6 w-full sticky top-0 z-40 bg-white border-b border-slate-200 pt-safe"
        style={{ height: '48px' }}
      >
        {/* Left */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={openMobileDrawer}
            className="md:hidden tap-target hover:bg-slate-50 flex items-center justify-center text-slate-600 -ml-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>

          <span className="md:hidden text-sm font-bold text-slate-900 truncate">
            {pageTitle}
          </span>

          {label && (
            <span className="hidden md:inline text-sm text-slate-500 font-medium">
              {label}
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1 md:gap-2">
          {/* Mobile search trigger */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen(true)}
            className="md:hidden tap-target hover:bg-slate-50 flex items-center justify-center text-slate-500 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
            aria-label="Search"
          >
            <Icon name="search" />
          </button>

          {/* Desktop search */}
          <div ref={searchRef} className="relative hidden md:block">
            <Icon
              name="search"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              ref={inputRef}
              role="combobox"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={`Search… (${shortcutHint})`}
              className="pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors w-48 md:w-56 lg:w-72 rounded"
              aria-label="Global search"
              aria-autocomplete="list"
              aria-expanded={showDropdown || showRecent}
              aria-controls="global-search-results"
            />

            {isFetching && !showClear ? (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              </div>
            ) : showClear ? (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center text-slate-400 hover:text-slate-700 transition-colors rounded"
                aria-label="Clear search"
                tabIndex={-1}
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            ) : null}

            {renderSearchDropdown('desktop')}
          </div>

          <NotificationBell />

          <button
            type="button"
            onClick={() => navigate(settingsPath)}
            className="hidden md:flex tap-target hover:bg-slate-50 transition-colors items-center justify-center text-slate-500 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
            aria-label="Settings"
          >
            <Icon name="settings" />
          </button>

          {/* Profile */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="w-9 h-9 rounded-full bg-[#5c1219] text-white overflow-hidden border border-slate-200 cursor-pointer flex items-center justify-center font-bold text-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              aria-label="Open profile menu"
              aria-expanded={isProfileOpen}
              aria-haspopup="menu"
            >
              {initial}
            </button>

            {isProfileOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-52 bg-white shadow-md rounded-md py-1 border border-slate-200 z-50"
              >
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {profile?.username ?? 'User'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {profile?.email ?? ''}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate(settingsPath);
                  }}
                  className="flex items-center w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors font-medium md:hidden"
                >
                  <Icon name="settings" className="mr-3 text-base" />
                  Settings
                </button>
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

      {/* ── Mobile full-screen search overlay ── */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-[150] bg-white md:hidden flex flex-col">
          <div className="flex items-center gap-2 p-3 border-b border-slate-200 pt-safe">
            <button
              type="button"
              onClick={() => {
                setMobileSearchOpen(false);
                setSearchQuery('');
                setDebouncedQuery('');
              }}
              className="p-2 -ml-2 text-slate-600"
              aria-label="Close search"
            >
              <Icon name="arrow_back" />
            </button>
            <div className="flex-1 relative">
              <Icon
                name="search"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                autoFocus
                role="combobox"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search subjects, faculty, rooms…"
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:border-slate-400 rounded"
                aria-label="Search"
              />
              {showClear && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center text-slate-400 hover:text-slate-700 rounded"
                  aria-label="Clear"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              )}
            </div>
          </div>
          <div className="relative flex-1 overflow-y-auto">
            {renderSearchDropdown('mobile')}
          </div>
        </div>
      )}
    </>
  );
}