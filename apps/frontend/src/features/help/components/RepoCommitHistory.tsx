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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

/** ISO YYYY-MM-DD for a Date in local time (matches `committedAt.slice(0,10)`) */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

  // Build the day-by-day series (still needed for span/velocity)
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
      return { spanDays: 0, velocity: '0' };
    const total = days.reduce((s, d) => s + d.count, 0);
    const spanDays = days.length;
    const weeks = spanDays / 7;
    const velocity = weeks > 0 ? (total / weeks).toFixed(1) : '0';
    return { spanDays, velocity };
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