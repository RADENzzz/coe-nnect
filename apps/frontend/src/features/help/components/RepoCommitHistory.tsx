import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { fetchRepoCommits } from '../../../api/stats.api';

// ═══════════════════════════════════════════════════════════
// Live clock
// ═══════════════════════════════════════════════════════════

/**
 * Returns a timestamp that updates once per second. Use this for
 * any "X minutes ago" display that should tick live.
 */
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

/**
 * Format a duration in ms as a compact, granular "ago" string.
 *
 *   < 60s   → "42s"
 *   < 60m   → "13m 5s"
 *   < 24h   → "2h 14m"
 *   < 30d   → "3d 6h"
 *   < 12mo  → "1mo 12d"
 *   ≥ 1y    → "1y 3mo"
 *
 * Shows at most two units so the string stays short even when the
 * value is years old.
 */
function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);

  const MIN = 60;
  const HR = 60 * 60;
  const DAY = 60 * 60 * 24;
  const MON = 60 * 60 * 24 * 30; // approximate
  const YR = 60 * 60 * 24 * 365;

  const years = Math.floor(totalSec / YR);
  const months = Math.floor((totalSec % YR) / MON);
  const days = Math.floor((totalSec % MON) / DAY);
  const hours = Math.floor((totalSec % DAY) / HR);
  const minutes = Math.floor((totalSec % HR) / MIN);
  const seconds = totalSec % MIN;

  if (totalSec < MIN) return `${seconds}s`;

  if (totalSec < HR) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  if (totalSec < DAY) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (totalSec < MON) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (totalSec < YR) {
    return days > 0 ? `${months}mo ${days}d` : `${months}mo`;
  }

  return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}

function liveRelative(iso: string, now: number): string {
  return `${formatDuration(now - new Date(iso).getTime())} ago`;
}

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatDayShort(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString('en-PH', {
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

// ═══════════════════════════════════════════════════════════
// Commits-per-day bar graph
// ═══════════════════════════════════════════════════════════

function CommitActivityBarGraph({
  commits,
}: {
  commits: Array<{ committedAt: string }>;
}) {
  const days = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of commits) {
      const key = c.committedAt.slice(0, 10); // "YYYY-MM-DD"
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
      const key = cursor.toISOString().slice(0, 10);
      out.push({ day: key, count: map.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [commits]);

  if (days.length === 0) return null;

  const max = Math.max(...days.map((d) => d.count), 1);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;
  const busiest = days.reduce((a, b) => (b.count > a.count ? b : a));

  const labelEvery = Math.max(1, Math.ceil(days.length / 12));

  return (
    <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-brand-700">
            calendar_today
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-800">
            Commits per Day
          </h3>
        </div>
        <span className="text-[9px] font-mono text-slate-500">
          {total.toLocaleString()} commits
        </span>
      </div>

      {/* Chart */}
      <div className="relative overflow-x-auto pb-2">
        <div
          className="relative h-40"
          style={{
            minWidth: days.length > 120 ? `${days.length * 6}px` : undefined,
          }}
        >
          {/* Y-axis guide lines */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {[max, Math.round(max * 0.66), Math.round(max * 0.33), 0].map(
              (v, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-[8px] text-slate-400"
                >
                  <span className="w-7 shrink-0 text-right font-mono tabular-nums">
                    {v}
                  </span>
                  <div className="flex-1 border-t border-dashed border-slate-200" />
                </div>
              ),
            )}
          </div>

          {/* Bars */}
          <div className="relative ml-9 flex items-end gap-px h-full">
            {days.map((d, i) => {
              const heightPct =
                d.count === 0 ? 1.5 : Math.max(4, (d.count / max) * 100);
              const isBusiest = d.day === busiest.day;
              const isActive = d.count > 0;

              return (
                <motion.div
                  key={d.day}
                  initial={{ height: 0 }}
                  animate={{ height: `${heightPct}%` }}
                  transition={{
                    duration: 0.4,
                    delay: Math.min(i * 0.005, 0.8),
                    ease: [0.2, 0.9, 0.3, 1],
                  }}
                  title={`${formatDay(d.day)}: ${d.count} commit${
                    d.count === 1 ? '' : 's'
                  }`}
                  className={
                    'group relative flex-1 min-w-[3px] transition-colors ' +
                    (isBusiest
                      ? 'bg-brand-700 hover:bg-brand-800'
                      : isActive
                      ? 'bg-brand-500 hover:bg-brand-700'
                      : 'bg-slate-200 hover:bg-slate-300')
                  }
                >
                  {isActive && (
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap border border-brand-700 bg-white px-1.5 py-0.5 text-[9px] font-medium text-brand-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                      {formatDayShort(d.day)} · {d.count}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="relative overflow-x-auto">
        <div
          className="ml-9 flex gap-px text-[8px] text-slate-400"
          style={{
            minWidth: days.length > 120 ? `${days.length * 6}px` : undefined,
          }}
        >
          {days.map((d, i) => {
            const show = i % labelEvery === 0 || i === days.length - 1;
            return (
              <div key={d.day} className="flex-1 min-w-[3px] text-center">
                {show && d.count > 0 ? (
                  <span className="block -rotate-45 origin-top-left whitespace-nowrap">
                    {formatDayShort(d.day)}
                  </span>
                ) : (
                  <span className="block opacity-0">&nbsp;</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats footer */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-brand-100 pt-3 text-[10px]">
        <span className="text-slate-500">
          Busiest day:{' '}
          <strong className="text-brand-700">{formatDay(busiest.day)}</strong>{' '}
          · <strong className="text-brand-700">{busiest.count}</strong> commits
        </span>
        <span className="text-slate-500">
          <strong className="text-brand-700">{activeDays}</strong> active day
          {activeDays === 1 ? '' : 's'} across{' '}
          <strong className="text-brand-700">{days.length}</strong> total
        </span>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[9px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 bg-brand-700" />
          Peak day
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 bg-brand-500" />
          Active day
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 bg-slate-200" />
          No commits
        </span>
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

  // Live-updating clock — re-renders the "Latest" tile every second
  const now = useLiveNow(1000);

  const stats = useMemo(() => {
    if (!data) return null;
    return {
      total: data.totalFetched,
      earliest: data.earliestAt ? formatDate(data.earliestAt) : null,
      latest: data.latestAt ? liveRelative(data.latestAt, now) : null,
    };
  }, [data, now]);

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
      {/* Section header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Development History
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          Commit activity across the CoE-NNECT repository since the project
          began.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white px-3 py-3 text-center">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">
            Total commits
          </div>
          <div className="mt-1 text-lg font-bold text-brand-700">
            {stats.total.toLocaleString()}
          </div>
        </div>
        <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white px-3 py-3 text-center">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">
            Started
          </div>
          <div className="mt-1 text-sm font-bold text-brand-700">
            {stats.earliest ?? '—'}
          </div>
        </div>
        <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white px-3 py-3 text-center">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">
            Latest
          </div>
          <div
            className="mt-1 text-sm font-bold tabular-nums text-brand-700"
            title={
              data.latestAt
                ? new Date(data.latestAt).toLocaleString('en-PH')
                : ''
            }
          >
            {stats.latest ?? '—'}
          </div>
        </div>
      </div>

      {/* Bar graph */}
      <CommitActivityBarGraph commits={data.commits} />
    </motion.div>
  );
}