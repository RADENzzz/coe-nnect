import { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import Icon from '../../components/ui/Icon';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type ReportTone = 'brand' | 'info' | 'success' | 'warning';
type ReportCategory = 'analytics' | 'activity' | 'schedule';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  to: string;
  /** Roles that can see this card. Empty = all roles. */
  roles?: string[];
  /** Short label for the FR reference, shown small. */
  fr?: string;
  /** Visual accent color for the icon tile. */
  tone?: ReportTone;
  /** Grouping category for the layout. */
  category: ReportCategory;
  /** Optional search keywords beyond title/description. */
  keywords?: string[];
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const LS_RECENT_KEY = 'coe-nnect:recent-reports';
const MAX_RECENT = 3;

const TONE_CLASSES: Record<
  ReportTone,
  { bg: string; border: string; icon: string; hover: string }
> = {
  brand: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-[#5c1219]',
    hover: 'hover:border-red-300',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-700',
    hover: 'hover:border-blue-300',
  },
  success: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: 'text-emerald-700',
    hover: 'hover:border-emerald-300',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-700',
    hover: 'hover:border-amber-300',
  },
};

const CATEGORY_META: Record<ReportCategory, { label: string; icon: string }> = {
  analytics: { label: 'Analytics', icon: 'insights' },
  activity: { label: 'Activity & Approvals', icon: 'task_alt' },
  schedule: { label: 'Schedule Views', icon: 'calendar_month' },
};

// ─────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────

function loadRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(LS_RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveRecentIds(ids: string[]) {
  try {
    localStorage.setItem(
      LS_RECENT_KEY,
      JSON.stringify(ids.slice(0, MAX_RECENT)),
    );
  } catch {
    /* ignore quota */
  }
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function ReportsHubPage() {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? 'viewer';

  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentIds());
  const searchRef = useRef<HTMLInputElement>(null);

  // After the Admin→Dean consolidation, both the dev account and the
  // College Dean use the /dean route prefix. The /admin prefix is gone.
  const prefix =
    role === 'administrator' || role === 'college_dean' ? '/dean' : '';

  const isAdminOrDean =
    role === 'administrator' || role === 'college_dean';
  const isDH = role === 'department_head';

  // ── Card catalog ──
  const allCards: ReportCard[] = useMemo(
    () => [
      {
        id: 'workload',
        title: 'Faculty Workload',
        description:
          'Compare assigned hours vs. required load. Flags overloaded and under-loaded faculty.',
        icon: 'insights',
        to: `${prefix}/reports/workload`,
        fr: 'FR 6.1.5',
        tone: 'brand',
        category: 'analytics',
        keywords: ['hours', 'load', 'teaching', 'overload', 'underload'],
      },
      {
        id: 'approvals',
        title: 'Approvals Report',
        description:
          'Cross-department faculty assignment requests — status, timeline, decisions.',
        icon: 'assignment',
        to: `${prefix}/reports/approvals`,
        fr: 'FR 6.1.6',
        tone: 'info',
        category: 'activity',
        keywords: [
          'requests',
          'cross-department',
          'faculty',
          'pending',
          'decisions',
        ],
      },
      {
        id: 'rooms',
        title: 'Room Sufficiency',
        description:
          'Projected demand vs. available room-hours per room type. Flags shortfalls before generation.',
        icon: 'meeting_room',
        to: `${prefix}/reports/rooms`,
        fr: 'FR 6.1.7',
        tone: 'warning',
        category: 'analytics',
        keywords: ['capacity', 'deficit', 'inventory', 'classroom', 'lab'],
      },
      {
        id: 'dept-summary',
        title: 'Department Schedule Summary',
        description:
          "Your department's timetable with export options for PDF, Excel, or print.",
        icon: 'grid_on',
        to: '/timetable',
        roles: ['department_head'],
        tone: 'success',
        category: 'schedule',
        keywords: ['timetable', 'export', 'pdf', 'excel', 'print'],
      },
      {
        id: 'college-summary',
        title: 'College-Wide Schedule',
        description:
          'Master view of all scheduled activities across the college with export options.',
        icon: 'public',
        to: `${prefix}/timetable?view=master`,
        roles: ['college_dean'],
        tone: 'success',
        category: 'schedule',
        keywords: ['master', 'timetable', 'all departments', 'export'],
      },
    ],
    [prefix],
  );

  // ── Filter to what this role sees ──
  const effectiveRole = isAdminOrDean ? 'college_dean' : role;
  const visibleCards = useMemo(
    () =>
      allCards.filter((c) => !c.roles || c.roles.includes(effectiveRole)),
    [allCards, effectiveRole],
  );

  // ── Search filter ──
  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleCards;
    return visibleCards.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      if (c.description.toLowerCase().includes(q)) return true;
      if ((c.fr ?? '').toLowerCase().includes(q)) return true;
      if (c.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [visibleCards, query]);

  // ── Recent cards (filtered to visible) ──
  const recentCards = useMemo(
    () =>
      recentIds
        .map((id) => visibleCards.find((c) => c.id === id))
        .filter((c): c is ReportCard => !!c),
    [recentIds, visibleCards],
  );

  // ── Group by category ──
  const grouped = useMemo(() => {
    const map = new Map<ReportCategory, ReportCard[]>();
    for (const card of filteredCards) {
      const list = map.get(card.category) ?? [];
      list.push(card);
      map.set(card.category, list);
    }
    return map;
  }, [filteredCards]);

  const categoryOrder: ReportCategory[] = [
    'analytics',
    'activity',
    'schedule',
  ];

  // ── Record a click ──
  const recordClick = (id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
      saveRecentIds(next);
      return next;
    });
  };

  // ── Keyboard shortcut: / focuses search ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;
      if (e.key === '/' && !inInput) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && inInput && target === searchRef.current) {
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const subtitle = isAdminOrDean
    ? 'College-wide reports across all engineering departments.'
    : isDH
    ? 'Reports for your department and cross-department activity.'
    : 'Reports available to you.';

  const showSearch = visibleCards.length > 2;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3" data-tour="reports-header">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Reports</h1>
          <p className="text-on-surface-variant text-sm mt-1">{subtitle}</p>
        </div>

        {showSearch && (
          <div className="relative w-full max-w-xs">
            <Icon
              name="search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reports…"
              className="w-full pl-9 pr-14 py-2 text-sm bg-surface-container-low border border-surface-variant rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              aria-label="Search reports"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                aria-label="Clear search"
              >
                <Icon name="close" size={14} />
              </button>
            ) : (
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 text-slate-400 rounded">
                /
              </kbd>
            )}
          </div>
        )}
      </div>

      {/* ── Recently viewed ── */}
      {recentCards.length > 0 && !query && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Recent
          </span>
          {recentCards.map((card) => {
            const tone = TONE_CLASSES[card.tone ?? 'brand'];
            return (
              <Link
                key={card.id}
                to={card.to}
                onClick={() => recordClick(card.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition ${tone.bg} ${tone.border} ${tone.hover}`}
              >
                <Icon
                  name={card.icon}
                  filled
                  size={12}
                  className={tone.icon}
                />
                <span className="text-on-surface">{card.title}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Empty: no cards for role ── */}
      {visibleCards.length === 0 ? (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-10 text-center">
          <Icon
            name="inbox"
            size={40}
            className="text-on-surface-variant/40 mx-auto mb-3"
          />
          <p className="text-sm text-on-surface-variant">
            No reports are available for your role.
          </p>
        </div>
      ) : filteredCards.length === 0 ? (
        /* ── Empty: no search match ── */
        <div className="rounded-xl border border-dashed border-surface-variant bg-surface-container-lowest py-16 text-center">
          <Icon
            name="search_off"
            size={40}
            className="text-slate-300 mx-auto mb-3"
          />
          <p className="text-sm font-semibold text-on-surface">
            No reports match &ldquo;{query}&rdquo;
          </p>
          <p className="text-xs text-on-surface-variant mt-1 mb-4">
            Try a different keyword or clear the search.
          </p>
          <button
            onClick={() => setQuery('')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="filter_alt_off" size={16} />
            Clear search
          </button>
        </div>
      ) : (
        /* ── Grouped cards ── */
        <div className="space-y-6" data-tour="reports-cards">
          {categoryOrder.map((category) => {
            const cards = grouped.get(category);
            if (!cards || cards.length === 0) return null;
            const meta = CATEGORY_META[category];
            return (
              <section key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon
                    name={meta.icon}
                    size={16}
                    className="text-slate-400"
                  />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {meta.label}
                  </h2>
                  <span className="text-[10px] text-slate-400">
                    {cards.length}
                  </span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cards.map((card) => {
                    const tone = TONE_CLASSES[card.tone ?? 'brand'];
                    return (
                      <Link
                        key={card.id}
                        to={card.to}
                        onClick={() => recordClick(card.id)}
                        className={`group block p-5 border rounded-xl bg-surface-container-lowest transition-all hover:shadow-sm ${tone.hover} hover:border-opacity-100`}
                        aria-label={`Open ${card.title}`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div
                            className={`w-9 h-9 ${tone.bg} border ${tone.border} flex items-center justify-center shrink-0 rounded-lg`}
                          >
                            <Icon
                              name={card.icon}
                              filled
                              size={18}
                              className={tone.icon}
                            />
                          </div>
                          {card.fr && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                              {card.fr}
                            </span>
                          )}
                        </div>

                        <p className="font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">
                          {card.title}
                        </p>
                        <p className="text-xs text-on-surface-variant leading-relaxed">
                          {card.description}
                        </p>

                        <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary group-hover:gap-2 transition-all">
                          Open
                          <Icon name="arrow_forward" size={14} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── Footer hint ── */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3 text-sm">
        <Icon
          name="info"
          size={18}
          className="text-blue-700 shrink-0 mt-0.5"
        />
        <p className="text-blue-900 text-xs">
          Timetable-specific views (Faculty, Room, Section, Master) live on
          the <strong>Schedule Planner</strong> page. Use the export toolbar
          there to download as PDF, Excel, or print.
        </p>
      </div>
    </div>
  );
}