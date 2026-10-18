import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { fetchRepoCommits } from '../../../api/stats.api';

// ═══════════════════════════════════════════════════════════
// Live clock
// ═══════════════════════════════════════════════════════════

function useLiveNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ═══════════════════════════════════════════════════════════
// Time formatting
// ═══════════════════════════════════════════════════════════

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);

  const MIN = 60;
  const HR = 60 * 60;
  const DAY = 60 * 60 * 24;
  const MON = 60 * 60 * 24 * 30;
  const YR = 60 * 60 * 24 * 365;

  const years = Math.floor(totalSec / YR);
  const months = Math.floor((totalSec % YR) / MON);
  const days = Math.floor((totalSec % MON) / DAY);
  const hours = Math.floor((totalSec % DAY) / HR);
  const minutes = Math.floor((totalSec % HR) / MIN);
  const seconds = totalSec % MIN;

  if (totalSec < MIN) return `${seconds}s`;
  if (totalSec < HR) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  if (totalSec < DAY) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (totalSec < MON) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (totalSec < YR) return days > 0 ? `${months}mo ${days}d` : `${months}mo`;
  return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}

function liveRelative(iso: string, now: number): string {
  return `${formatDuration(now - new Date(iso).getTime())} ago`;
}

function formatDay(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatDayShort(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatMonthYear(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    year: 'numeric',
  });
}

/** Human label like "Today", "Yesterday", "3 days ago", else formatted date */
function smartDayLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDay(ymd);
}

/** ISO YYYY-MM-DD for a Date in local time (matches `committedAt.slice(0,10)`) */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ═══════════════════════════════════════════════════════════
// Color intensity scale
// ═══════════════════════════════════════════════════════════

const INTENSITY_BG = [
  'bg-slate-100 hover:bg-slate-200',
  'bg-brand-200 hover:bg-brand-300',
  'bg-brand-400 hover:bg-brand-500',
  'bg-brand-600 hover:bg-brand-700',
  'bg-brand-800 hover:bg-brand-900',
];

function intensityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  const ratio = count / Math.max(max, 1);
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

// ═══════════════════════════════════════════════════════════
// Summary tile
// ═══════════════════════════════════════════════════════════

function SummaryTile({
  label,
  value,
  icon,
  sublabel,
  delay = 0,
  accent = false,
}: {
  label: string;
  value: string;
  icon: string;
  sublabel?: string;
  delay?: number;
  accent?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.2, 0.9, 0.3, 1] }}
      className={
        'group relative overflow-hidden border px-3 py-3 text-center transition-colors ' +
        (accent
          ? 'border-brand-300 bg-gradient-to-br from-brand-100 via-brand-50 to-white'
          : 'border-brand-200 bg-gradient-to-br from-brand-50 to-white hover:border-brand-300')
      }
    >
      {accent && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-brand-200/40 blur-2xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div className="relative">
        <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-slate-500">
          <span className="material-symbols-outlined text-[12px] text-brand-600">
            {icon}
          </span>
          {label}
        </div>
        <div
          className={
            'mt-1.5 font-bold tabular-nums text-brand-800 ' +
            (accent ? 'text-xl' : 'text-sm')
          }
        >
          {value}
        </div>
        {sublabel && (
          <div className="mt-0.5 text-[9px] font-medium text-slate-400">
            {sublabel}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Activity heatmap (GitHub-style calendar) — full range, unfiltered
// ═══════════════════════════════════════════════════════════

function ActivityHeatmap({
  days,
}: {
  days: Array<{ day: string; count: number }>;
}) {
  const max = Math.max(...days.map((d) => d.count), 1);

  const weeks = useMemo(() => {
    if (days.length === 0) return [];
    const out: Array<Array<{ day: string; count: number } | null>> = [];
    let current: Array<{ day: string; count: number } | null> = [];

    const firstDate = new Date(`${days[0].day}T00:00:00`);
    const firstWeekday = firstDate.getDay();
    for (let i = 0; i < firstWeekday; i++) current.push(null);

    for (const d of days) {
      current.push(d);
      if (current.length === 7) {
        out.push(current);
        current = [];
      }
    }
    if (current.length > 0) {
      while (current.length < 7) current.push(null);
      out.push(current);
    }
    return out;
  }, [days]);

  const monthLabels = useMemo(() => {
    const labels: Array<{ index: number; label: string }> = [];
    let lastMonth = '';
    weeks.forEach((week, i) => {
      const firstReal = week.find((d) => d !== null);
      if (!firstReal) return;
      const m = new Date(`${firstReal.day}T00:00:00`).getMonth();
      const key = String(m);
      if (key !== lastMonth) {
        labels.push({ index: i, label: formatMonthYear(firstReal.day) });
        lastMonth = key;
      }
    });
    return labels;
  }, [weeks]);

  const totalActive = days.filter((d) => d.count > 0).length;
  const total = days.reduce((s, d) => s + d.count, 0);

  const streak = useMemo(() => {
    let s = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) s++;
      else break;
    }
    return s;
  }, [days]);

  const longestStreak = useMemo(() => {
    let best = 0;
    let cur = 0;
    for (const d of days) {
      if (d.count > 0) {
        cur++;
        best = Math.max(best, cur);
      } else {
        cur = 0;
      }
    }
    return best;
  }, [days]);

  return (
    <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-brand-700">
            grid_view
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-800">
            Contribution Heatmap
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-slate-500">
          <span>
            <strong className="text-brand-700">{streak}</strong>-day streak
          </span>
          <span className="text-slate-300">·</span>
          <span>
            best <strong className="text-brand-700">{longestStreak}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            <strong className="text-brand-700">{totalActive}</strong> active
          </span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          {/* Month labels */}
          <div className="mb-1 flex gap-[3px] pl-6 text-[9px] text-slate-400">
            {weeks.map((_, i) => {
              const lbl = monthLabels.find((m) => m.index === i);
              return (
                <div
                  key={i}
                  className="w-[11px] shrink-0 whitespace-nowrap"
                  style={{ minWidth: 11 }}
                >
                  {lbl ? (
                    <span className="block -translate-x-1 font-medium">
                      {lbl.label}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex gap-[3px]">
            {/* Weekday labels */}
            <div className="mr-1 flex flex-col gap-[3px] text-[8px] text-slate-400">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div
                  key={i}
                  className="flex h-[11px] w-4 items-center justify-end pr-0.5"
                >
                  {i % 2 === 1 ? d : ''}
                </div>
              ))}
            </div>

            {/* Cells */}
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((d, di) => {
                  if (!d) {
                    return (
                      <div
                        key={di}
                        className="h-[11px] w-[11px] bg-transparent"
                      />
                    );
                  }
                  const lvl = intensityLevel(d.count, max);
                  return (
                    <motion.div
                      key={d.day}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.25,
                        delay: Math.min(wi * 0.008, 0.6),
                        ease: [0.2, 0.9, 0.3, 1],
                      }}
                      title={`${formatDay(d.day)} — ${d.count} commit${
                        d.count === 1 ? '' : 's'
                      }`}
                      className={
                        'group relative h-[11px] w-[11px] cursor-pointer transition-transform hover:scale-125 ' +
                        INTENSITY_BG[lvl]
                      }
                    >
                      {d.count > 0 && (
                        <div className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap border border-brand-700 bg-white px-1.5 py-0.5 text-[9px] font-medium text-brand-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                          {formatDayShort(d.day)} · {d.count}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-between border-t border-brand-100 pt-3 text-[9px] text-slate-500">
        <span>
          <strong className="text-brand-700">{total.toLocaleString()}</strong>{' '}
          commits across{' '}
          <strong className="text-brand-700">{days.length}</strong> days
        </span>
        <div className="flex items-center gap-1">
          <span>Less</span>
          {INTENSITY_BG.map((bg, i) => (
            <div key={i} className={`h-[10px] w-[10px] ${bg.split(' ')[0]}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════

export function RepoCommitHistory() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['repo-commits'],
    queryFn: fetchRepoCommits,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const now = useLiveNow(1000);

  const stats = useMemo(() => {
    if (!data) return null;
    return {
      total: data.totalFetched,
      earliest: data.earliestAt ? formatDate(data.earliestAt) : null,
      latest: data.latestAt ? liveRelative(data.latestAt, now) : null,
      earliestRaw: data.earliestAt,
      latestRaw: data.latestAt,
    };
  }, [data, now]);

  // Build the day-by-day series once, reused by both visualisations
  const days = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const c of data.commits) {
      const key = c.committedAt.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const sorted = Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    if (sorted.length === 0) return [];

    const first = sorted[0][0];
    const last = sorted[sorted.length - 1][0];
    const start = new Date(`${first}T00:00:00`);
    const end = new Date(`${last}T00:00:00`);
    const out: Array<{ day: string; count: number }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = toYmd(cursor);
      out.push({ day: key, count: map.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [data]);

  // Derived headline numbers (always from the FULL dataset)
  const derived = useMemo(() => {
    if (days.length === 0)
      return {
        spanDays: 0,
        velocity: '0',
        busiestDay: null as { day: string; count: number } | null,
      };
    const total = days.reduce((s, d) => s + d.count, 0);
    const spanDays = days.length;
    const weeks = spanDays / 7;
    const velocity = weeks > 0 ? (total / weeks).toFixed(1) : '0';
    const busiestDay = days.reduce((a, b) => (b.count > a.count ? b : a));
    return { spanDays, velocity, busiestDay };
  }, [days]);

  if (isLoading) {
    return (
      <div className="border border-slate-200 bg-white p-5 text-center">
        <span className="material-symbols-outlined animate-spin text-[20px] text-brand-700">
          progress_activity
        </span>
        <p className="mt-2 text-xs text-slate-500">Loading commit history…</p>
      </div>
    );
  }

  if (error || !data || !stats) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* ── Section header ── */}
      <div className="relative overflow-hidden border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-brand-50 p-5">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-200/40 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-brand-700">
            <span className="material-symbols-outlined text-[14px]">
              commit
            </span>
            Live repository activity
            <span className="ml-1 flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[9px] font-normal normal-case text-emerald-600">
                syncing
              </span>
            </span>
          </div>
          <h2 className="text-xl font-semibold text-slate-900">
            Development History
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-700">
            Commit activity across the CoE-NNECT repository since the project
            began — {stats.total.toLocaleString()} commits over{' '}
            {derived.spanDays.toLocaleString()} days, averaging{' '}
            <strong className="text-brand-700">{derived.velocity}</strong>{' '}
            commits per week.
          </p>
        </div>
      </div>

      {/* ── Summary tiles ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile
          label="Total commits"
          value={stats.total.toLocaleString()}
          icon="commit"
          sublabel="all-time"
          accent
          delay={0}
        />
        <SummaryTile
          label="Project span"
          value={`${derived.spanDays.toLocaleString()}d`}
          icon="date_range"
          sublabel={stats.earliest ? `since ${stats.earliest}` : undefined}
          delay={0.05}
        />
        <SummaryTile
          label="Velocity"
          value={`${derived.velocity}/wk`}
          icon="speed"
          sublabel="weekly average"
          delay={0.1}
        />
        <SummaryTile
          label="Latest"
          value={stats.latest ?? '—'}
          icon="schedule"
          sublabel={
            stats.latestRaw
              ? new Date(stats.latestRaw).toLocaleDateString('en-PH')
              : undefined
          }
          delay={0.15}
        />
      </div>

      {/* ── Heatmap (full range) ── */}
      <ActivityHeatmap days={days} />

      {/* ── Peak day callout (full dataset) ── */}
      {derived.busiestDay && derived.busiestDay.count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="relative overflow-hidden border border-brand-300 bg-gradient-to-r from-brand-100 via-brand-50 to-white p-4"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-brand-700 text-white">
              <span className="material-symbols-outlined text-[20px]">
                local_fire_department
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                Most productive day
              </div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">
                {smartDayLabel(derived.busiestDay.day)} —{' '}
                <span className="text-brand-700">
                  {derived.busiestDay.count} commit
                  {derived.busiestDay.count === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <span className="hidden shrink-0 font-mono text-[10px] text-slate-500 sm:block">
              {formatDay(derived.busiestDay.day)}
            </span>
          </div>
        </motion.div>
      )}

      {/* ── Footnote ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
        <span>
          Data from GitHub API ·{' '}
          {data.cached ? (
            <span className="font-medium text-slate-600">cached</span>
          ) : (
            <span className="font-medium text-emerald-600">fresh</span>
          )}{' '}
          · updated {liveRelative(data.fetchedAt, now)}
        </span>
        <span className="font-mono text-[9px]">
          refetches every 5 min · live clock
        </span>
      </div>
    </motion.div>
  );
}