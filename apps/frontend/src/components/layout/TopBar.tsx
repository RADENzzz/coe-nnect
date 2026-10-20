import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../ui/Icon';
import ThemeToggle from '../ui/ThemeToggle';
import { useUiStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { useLogout } from '../../hooks/use-logout';
import { getNavForRole } from '../../lib/constants/nav-config';
import NotificationBell from '../notifications/NotificationBell';
import { searchApi, type SearchResult } from '../../api/search.api';
import { useChatControl } from '../../features/chat/ChatWidget';

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
  action: { label: 'Quick action', icon: 'bolt' },
  subject: { label: 'Subject', icon: 'menu_book' },
  faculty: { label: 'Faculty', icon: 'groups' },
  room: { label: 'Room', icon: 'meeting_room' },
  section: { label: 'Section', icon: 'view_module' },
  user: { label: 'User', icon: 'manage_accounts' },
  term: { label: 'Academic term', icon: 'calendar_month' },
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 220;

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(list: string[]) {
  try {
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(list.slice(0, MAX_RECENT)),
    );
  } catch {
    /* ignore */
  }
}

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-100 text-on-surface rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function SearchSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-1 p-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-surface-container" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-container" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-container" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface SearchResultsListProps {
  groupedResults: Array<[string, SearchResult[]]>;
  results: SearchResult[];
  query: string;
  selectedIndex: number;
  onSelect: (result: SearchResult) => void;
  onHover: (index: number) => void;
  idPrefix: string;
  dense?: boolean;
}

function SearchResultsList({
  groupedResults,
  results,
  query,
  selectedIndex,
  onSelect,
  onHover,
  idPrefix,
  dense = true,
}: SearchResultsListProps) {
  const groupPadding = dense ? 'px-3' : 'px-4';
  const itemPadding = dense ? 'px-3 py-2' : 'px-4 py-3';
  const iconSize = dense ? 'text-[18px]' : 'text-[20px]';

  return (
    <ul role="listbox" className="py-1">
      {groupedResults.map(([type, items]) => {
        const meta = TYPE_META[type as SearchResult['type']] ?? {
          label: type,
          icon: 'search',
        };
        return (
          <li key={type}>
            <div
              className={`${groupPadding} flex items-center gap-2 border-y border-outline-variant/60 bg-surface-container-low py-1.5`}
            >
              <Icon
                name={meta.icon}
                className="text-[14px] text-on-surface-variant"
              />
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                {meta.label}
              </span>
              <span className="text-[10px] text-on-surface-variant/70">
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
                      id={`${idPrefix}-${i}`}
                      data-search-index={i}
                      onClick={() => onSelect(r)}
                      onMouseEnter={() => onHover(i)}
                      className={`flex w-full items-start gap-3 text-left transition-colors ${itemPadding} ${
                        isSelected
                          ? 'bg-primary/[0.08]'
                          : 'hover:bg-surface-container'
                      }`}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <Icon
                        name={meta.icon}
                        className={`mt-0.5 ${iconSize} shrink-0 text-on-surface-variant`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-on-surface">
                          <Highlighted text={r.label} query={query} />
                        </div>
                        {r.sublabel && (
                          <div className="mt-0.5 truncate text-xs text-on-surface-variant">
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
  );
}

export default function TopBar({ label }: TopBarProps) {
  const openMobileDrawer = useUiStore((s) => s.openMobileDrawer);
  const profile = useAuthStore((s) => s.profile);
  const isDevAccount = profile?.role === 'administrator';
  const isDean = profile?.role === 'college_dean';
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();

  const { open: chatOpen, setOpen: setChatOpen, totalUnread } =
    useChatControl();

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
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const mobileResultsRef = useRef<HTMLDivElement>(null);

  const isMac = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  );
  const shortcutHint = isMac ? '⌘K' : 'Ctrl+K';

  const focusSearchInput = useCallback(() => {
    const target = mobileSearchOpen ? mobileInputRef.current : inputRef.current;
    target?.focus();
  }, [mobileSearchOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  // Keep the keyboard-selected result in view when the list is taller than
  // the dropdown.
  useEffect(() => {
    if (!isSearchOpen && !mobileSearchOpen) return;
    const container = mobileSearchOpen
      ? mobileResultsRef.current
      : resultsRef.current;
    container
      ?.querySelector<HTMLElement>(`[data-search-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, isSearchOpen, mobileSearchOpen, debouncedQuery]);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: ({ signal }) => searchApi.search(debouncedQuery, signal),
    enabled: !isDevAccount && debouncedQuery.length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  // Dean-only quick actions surface alongside API results. This is also the
  // search entry point for creating a term without hunting through Settings.
  const quickActions = useMemo<SearchResult[]>(() => {
    if (!isDean || debouncedQuery.length < MIN_QUERY_LENGTH) return [];
    if (!/\b(term|terms|semester|academic)\b/i.test(debouncedQuery)) return [];
    return [
      {
        type: 'action',
        id: 'new-academic-term',
        label: 'New academic term',
        sublabel: 'Open System Settings and create a term',
        path: '/dean/system-settings?newTerm=1',
      },
    ];
  }, [debouncedQuery, isDean]);

  const apiResults = useMemo(() => data?.results ?? [], [data]);
  const results = useMemo(
    () => [...quickActions, ...apiResults],
    [apiResults, quickActions],
  );

  useEffect(() => {
    if (selectedIndex >= results.length) setSelectedIndex(0);
  }, [results.length, selectedIndex]);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const r of results) {
      const arr = groups.get(r.type) ?? [];
      arr.push(r);
      groups.set(r.type, arr);
    }
    return Array.from(groups.entries());
  }, [results]);

  useEffect(() => {
    setIsSearchOpen(false);
    setMobileSearchOpen(false);
    setSearchQuery('');
    setDebouncedQuery('');
  }, [location.pathname]);

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

  useEffect(() => {
    if (isDevAccount) return;

    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.matchMedia('(min-width: 768px)').matches) {
          inputRef.current?.focus();
          setIsSearchOpen(true);
        } else {
          setMobileSearchOpen(true);
        }
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setMobileSearchOpen(false);
        inputRef.current?.blur();
        mobileInputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isDevAccount]);

  const pushRecentSearch = useCallback((term: string) => {
    if (!term || term.length < MIN_QUERY_LENGTH) return;
    setRecentSearches((prev) => {
      const next = [term, ...prev.filter((s) => s !== term)].slice(
        0,
        MAX_RECENT,
      );
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
    focusSearchInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (debouncedQuery.length < MIN_QUERY_LENGTH || results.length === 0) {
      return;
    }

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
    isSearchOpen &&
    (debouncedQuery.length >= MIN_QUERY_LENGTH ||
      (debouncedQuery.length > 0 &&
        debouncedQuery.length < MIN_QUERY_LENGTH));
  const isQueryTooShort =
    debouncedQuery.length > 0 && debouncedQuery.length < MIN_QUERY_LENGTH;
  const showRecent =
    isSearchOpen && !debouncedQuery && recentSearches.length > 0;
  const showClear = searchQuery.length > 0;

  const renderSearchDropdown = () => {
    if (showRecent) {
      return (
        <div
          id="global-search-results"
          className="animate-fade-in absolute right-0 z-50 mt-1 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low/60 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Recent searches
            </span>
            <button
              type="button"
              onClick={() => {
                setRecentSearches([]);
                saveRecentSearches([]);
              }}
              className="text-[10px] font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
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
                    focusSearchInput();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-container"
                >
                  <Icon
                    name="history"
                    className="text-[16px] text-on-surface-variant"
                  />
                  <span className="truncate text-sm text-on-surface">
                    {term}
                  </span>
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
        ref={resultsRef}
        className="animate-fade-in absolute right-0 z-50 mt-1 flex max-h-[min(70vh,32rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isQueryTooShort ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm font-medium text-on-surface">
                Keep typing to search
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Enter at least {MIN_QUERY_LENGTH} characters.
              </p>
            </div>
          ) : isFetching && results.length === 0 ? (
            <SearchSkeleton />
          ) : results.length === 0 ? (
            <div className="px-5 py-8 text-center" role="status">
              <Icon
                name="search_off"
                className="mx-auto mb-2 text-[28px] text-on-surface-variant/50"
              />
              <p className="text-sm font-medium text-on-surface">
                No matches found
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Try a subject code, faculty name, room, or term.
              </p>
            </div>
          ) : (
            <SearchResultsList
              groupedResults={groupedResults}
              results={results}
              query={debouncedQuery}
              selectedIndex={selectedIndex}
              onSelect={handleSelect}
              onHover={setSelectedIndex}
              idPrefix="search-option"
            />
          )}
        </div>
        {!isQueryTooShort && results.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-outline-variant bg-surface-container-low/70 px-3 py-1.5 text-[10px] text-on-surface-variant">
            <span>↑↓ navigate · Enter open · Esc close</span>
            <span className="shrink-0" aria-live="polite">
              {isFetching
                ? 'Searching…'
                : `${results.length} result${results.length === 1 ? '' : 's'}`}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <header
        className="flex justify-between items-center px-4 md:px-6 w-full sticky top-0 z-40 bg-surface border-b border-outline-variant pt-safe"
        style={{ height: '48px' }}
      >
        {/* Left */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={openMobileDrawer}
            className="md:hidden tap-target hover:bg-surface-container flex items-center justify-center text-slate-600 -ml-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30 shrink-0"
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>

          <span className="md:hidden text-sm font-bold text-slate-900 truncate min-w-0">
            {pageTitle}
          </span>

          {label && (
            <span className="hidden md:inline text-sm text-slate-500 font-medium">
              {label}
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          {/* ── Mobile: bell + theme + avatar (dev account hides global actions) ── */}
          {!isDevAccount && (
            <div className="md:hidden flex items-center gap-1">
              <NotificationBell />
            </div>
          )}

          {/* ── Desktop: search + chat + bell + settings + avatar ── */}
          {!isDevAccount && (
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
                placeholder={
                  isDean
                    ? 'Search subjects, faculty, rooms, terms…'
                    : 'Search subjects, faculty, rooms, sections…'
                }
                className="pl-8 pr-14 py-1.5 bg-surface-container-low border border-outline-variant text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all w-48 md:w-56 lg:w-72 rounded-lg"
                aria-label="Global search"
                aria-autocomplete="list"
                aria-expanded={showDropdown || showRecent}
                aria-controls={
                  showDropdown || showRecent
                    ? 'global-search-results'
                    : undefined
                }
                aria-activedescendant={
                  showDropdown && results.length > 0
                    ? `search-option-${selectedIndex}`
                    : undefined
                }
                autoComplete="off"
                spellCheck={false}
              />

              {isFetching && !showClear ? (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-primary" />
                </div>
              ) : showClear ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-on-surface-variant transition-colors hover:text-on-surface"
                  aria-label="Clear search"
                  tabIndex={-1}
                >
                  <Icon name="close" className="text-[16px]" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center rounded border border-outline-variant bg-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-on-surface-variant lg:inline-flex">
                  {shortcutHint}
                </kbd>
              )}

              {renderSearchDropdown()}
            </div>
          )}

          {!isDevAccount && profile?.role !== 'viewer' && (
            <button
              type="button"
              onClick={() => setChatOpen(!chatOpen)}
              className="hidden md:flex tap-target hover:bg-surface-container transition-colors items-center justify-center text-slate-500 relative rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
              aria-label={
                totalUnread > 0
                  ? `Chat (${totalUnread} unread)`
                  : 'Chat'
              }
              aria-pressed={chatOpen}
              title={
                totalUnread > 0
                  ? `${totalUnread} unread message${
                      totalUnread === 1 ? '' : 's'
                    }`
                  : 'Chat'
              }
            >
              <Icon name="forum" filled={chatOpen} />
              {totalUnread > 0 && (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-[#5c1219] text-white text-[10px] font-bold leading-none border border-white"
                >
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </button>
          )}

          {!isDevAccount && (
            <div className="hidden md:block">
              <NotificationBell />
            </div>
          )}

          <ThemeToggle />

          {!isDevAccount && (
            <button
              type="button"
              onClick={() => navigate(settingsPath)}
              className="hidden md:flex tap-target hover:bg-surface-container transition-colors items-center justify-center text-slate-500 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
              aria-label="Settings"
            >
              <Icon name="settings" />
            </button>
          )}

          {/* Profile */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="w-9 h-9 rounded-full bg-[#5c1219] text-white overflow-hidden border border-outline-variant cursor-pointer flex items-center justify-center font-bold text-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
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
                className="absolute right-0 mt-2 w-52 bg-surface shadow-md rounded-md py-1 border border-outline-variant z-50"
              >
                <div className="px-4 py-2.5 border-b border-outline-variant/60">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {profile?.username ?? 'User'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {profile?.email ?? ''}
                  </p>
                </div>
                {!isDevAccount && (
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      setMobileSearchOpen(true);
                    }}
                    className="flex items-center w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-surface-container transition-colors font-medium md:hidden"
                  >
                    <Icon name="search" className="mr-3 text-base" />
                    Search
                  </button>
                )}
                {!isDevAccount && profile?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      setChatOpen(true);
                    }}
                    className="flex items-center w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-surface-container transition-colors font-medium md:hidden"
                  >
                    <Icon name="forum" className="mr-3 text-base" />
                    Chat
                    {totalUnread > 0 && (
                      <span className="ml-auto text-[10px] font-bold text-white bg-[#5c1219] px-1.5 py-0.5 rounded-full">
                        {totalUnread > 9 ? '9+' : totalUnread}
                      </span>
                    )}
                  </button>
                )}
                {!isDevAccount && (
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      navigate(settingsPath);
                    }}
                    className="flex items-center w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-surface-container transition-colors font-medium md:hidden"
                  >
                    <Icon name="settings" className="mr-3 text-base" />
                    Settings
                  </button>
                )}
                <button
                  onClick={logout}
                  className="flex items-center w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-surface-container transition-colors font-medium"
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
      {!isDevAccount && mobileSearchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-[150] flex flex-col bg-surface md:hidden"
        >
          <div className="flex items-center gap-2 border-b border-outline-variant p-3 pt-safe">
            <button
              type="button"
              onClick={() => {
                setMobileSearchOpen(false);
                setSearchQuery('');
                setDebouncedQuery('');
              }}
              className="rounded p-2 -ml-2 text-on-surface-variant hover:bg-surface-container"
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
                ref={mobileInputRef}
                autoFocus
                role="combobox"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isDean
                    ? 'Search subjects, faculty, rooms, terms…'
                    : 'Search subjects, faculty, rooms, sections…'
                }
                className="w-full rounded-lg border border-outline-variant bg-surface-container-low py-2 pl-9 pr-9 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/10"
                aria-label="Search"
                aria-autocomplete="list"
                aria-expanded={
                  results.length > 0 ||
                  isQueryTooShort ||
                  (debouncedQuery.length < MIN_QUERY_LENGTH &&
                    recentSearches.length > 0)
                }
                aria-controls={
                  !isQueryTooShort && results.length > 0
                    ? 'mobile-search-results'
                    : undefined
                }
                aria-activedescendant={
                  !isQueryTooShort && results.length > 0
                    ? `mobile-search-option-${selectedIndex}`
                    : undefined
                }
                autoComplete="off"
                spellCheck={false}
              />
              {showClear && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-on-surface-variant hover:text-on-surface"
                  aria-label="Clear"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              )}
            </div>
          </div>
          <div ref={mobileResultsRef} className="relative flex-1 overflow-y-auto">
            {isQueryTooShort ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-medium text-on-surface">
                  Keep typing to search
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Enter at least {MIN_QUERY_LENGTH} characters.
                </p>
              </div>
            ) : isFetching && results.length === 0 ? (
              <SearchSkeleton rows={4} />
            ) : results.length === 0 &&
              debouncedQuery.length >= MIN_QUERY_LENGTH ? (
              <div className="px-5 py-12 text-center" role="status">
                <Icon
                  name="search_off"
                  className="mx-auto mb-2 text-[32px] text-on-surface-variant/50"
                />
                <p className="text-sm font-medium text-on-surface">
                  No matches found
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Try a subject code, faculty name, room, or term.
                </p>
              </div>
            ) : debouncedQuery.length < MIN_QUERY_LENGTH &&
              recentSearches.length > 0 ? (
              <div>
                <div className="flex items-center justify-between border-b border-outline-variant/60 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Recent searches
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRecentSearches([]);
                      saveRecentSearches([]);
                    }}
                    className="text-[10px] font-semibold text-on-surface-variant hover:text-on-surface"
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
                          focusSearchInput();
                        }}
                        className="flex w-full items-center gap-2 border-b border-outline-variant/60 px-4 py-3 text-left transition-colors hover:bg-surface-container"
                      >
                        <Icon
                          name="history"
                          className="text-[18px] text-on-surface-variant"
                        />
                        <span className="truncate text-sm text-on-surface">
                          {term}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!isQueryTooShort && results.length > 0 && (
              <div id="mobile-search-results">
                <SearchResultsList
                  groupedResults={groupedResults}
                  results={results}
                  query={debouncedQuery}
                  selectedIndex={selectedIndex}
                  onSelect={handleSelect}
                  onHover={setSelectedIndex}
                  idPrefix="mobile-search-option"
                  dense={false}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}