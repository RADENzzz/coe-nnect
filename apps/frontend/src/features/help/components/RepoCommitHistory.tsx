import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  fetchRepoCommits,
  fetchRepoContributors,
} from '../../../api/stats.api';

// ── Time helpers ──

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(mo / 12);
  return `${yr}y ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

// ── Commits per contributor (top 6) ──

function CommitCountChart() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['repo-contributors'],
    queryFn: fetchRepoContributors,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 text-center">
        <span className="material-symbols-outlined animate-spin text-[20px] text-brand-700">
          progress_activity
        </span>
        <p className="mt-2 text-xs text-slate-500">
          Loading contribution breakdown…
        </p>
      </div>
    );
  }

  if (error || !data?.topContributor) return null;

  const contributors = data.allContributors.slice(0, 6);
  const totalCommits = data.totalCommits;
  const max = Math.max(...contributors.map((c) => c.contributions), 1);

  return (
    <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-brand-700">
            bar_chart
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-800">
            Commits per Contributor
          </h3>
        </div>
        <span className="text-[9px] italic text-slate-400">
          Click a row to view profile
        </span>
      </div>

      <div className="space-y-0.5">
        {contributors.map((c, i) => {
          const pct = (c.contributions / max) * 100;
          const shareOfTotal =
            totalCommits > 0
              ? Math.round((c.contributions / totalCommits) * 100)
              : 0;
          const isTop = i === 0;

          return (
            <a
              key={c.login}
              href={c.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open @${c.login} on GitHub`}
              className="group flex cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 transition-all hover:border-brand-300 hover:bg-white hover:shadow-sm"
            >
              <span className="w-4 shrink-0 text-right font-mono text-[10px] text-slate-400 transition-colors group-hover:text-brand-700">
                {i + 1}
              </span>
              <img
                src={c.avatarUrl}
                alt={c.login}
                className="h-5 w-5 shrink-0 rounded-full border border-slate-200 transition-transform group-hover:scale-110"
              />
              <span className="w-20 shrink-0 truncate text-[11px] font-medium text-slate-700 transition-colors group-hover:text-brand-700">
                {c.name ?? c.login}
              </span>
              <div className="relative h-4 flex-1 overflow-hidden bg-slate-100">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{
                    duration: 0.8,
                    delay: i * 0.08,
                    ease: [0.2, 0.9, 0.3, 1],
                  }}
                  className={
                    'h-full transition-opacity group-hover:opacity-90 ' +
                    (isTop ? 'bg-brand-700' : 'bg-brand-400')
                  }
                />
              </div>
              <span className="w-[80px] shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-brand-700">
                {c.contributions.toLocaleString()}
                <span className="ml-0.5 text-[9px] font-normal text-slate-400">
                  commits
                </span>
              </span>
              <span className="w-9 shrink-0 text-right text-[9px] tabular-nums text-slate-400 transition-colors group-hover:text-brand-700">
                {shareOfTotal}%
              </span>
              <span className="material-symbols-outlined w-4 shrink-0 text-[13px] text-slate-300 opacity-0 transition-all group-hover:text-brand-700 group-hover:opacity-100">
                open_in_new
              </span>
            </a>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-brand-100 pt-3 text-[10px]">
        <span className="text-slate-500">
          Top {contributors.length} of {data.allContributors.length} contributors
        </span>
        <span className="font-mono text-brand-700">
          {totalCommits.toLocaleString()} total commits
        </span>
      </div>
    </div>
  );
}

// ── Commits per week (activity bar graph) ──

/**
 * Vertical bar graph showing commit count per week. Each bar is one
 * week; height is scaled to the busiest week. Bars are clickable
 * if we know the week's commits (we don't — GitHub groups weekly),
 * so instead hovering shows the tooltip with week + count.
 */
function CommitActivityBarGraph() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['repo-contributors'],
    queryFn: fetchRepoContributors,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const weeks = data?.weeklyActivity ?? [];

  if (isLoading) {
    return (
      <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 text-center">
        <span className="material-symbols-outlined animate-spin text-[20px] text-brand-700">
          progress_activity
        </span>
        <p className="mt-2 text-xs text-slate-500">Loading activity…</p>
      </div>
    );
  }

  if (error || weeks.length === 0) return null;

  const max = Math.max(...weeks.map((w) => w.count), 1);
  const totalInWindow = weeks.reduce((sum, w) => sum + w.count, 0);

  // Take last 26 weeks (6 months) for a compact, readable chart
  const recent = weeks.slice(-26);

  return (
    <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-brand-700">
            calendar_month
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-800">
            Commit Activity · Last {recent.length} Weeks
          </h3>
        </div>
        <span className="text-[9px] font-mono text-slate-500">
          {totalInWindow.toLocaleString()} commits
        </span>
      </div>

      {/* Bar chart */}
      <div className="relative flex items-end gap-[3px] h-32">
        {/* Y-axis guide lines */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[max, Math.round(max * 0.66), Math.round(max * 0.33), 0].map(
            (v, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-[8px] text-slate-400"
              >
                <span className="w-6 text-right font-mono tabular-nums">
                  {v}
                </span>
                <div className="flex-1 border-t border-dashed border-slate-200" />
              </div>
            ),
          )}
        </div>

        {/* Bars */}
        <div className="relative ml-8 flex flex-1 items-end gap-[2px] h-full">
          {recent.map((w, i) => {
            const heightPct =
              w.count === 0 ? 2 : Math.max(4, (w.count / max) * 100);
            const weekDate = new Date(w.weekStart);
            const weekLabel = weekDate.toLocaleDateString('en-PH', {
              month: 'short',
              day: '2-digit',
            });

            return (
              <motion.div
                key={w.weekStart}
                initial={{ height: 0 }}
                animate={{ height: `${heightPct}%` }}
                transition={{
                  duration: 0.6,
                  delay: i * 0.015,
                  ease: [0.2, 0.9, 0.3, 1],
                }}
                className={
                  'group relative flex-1 min-w-[4px] transition-colors ' +
                  (w.count === 0
                    ? 'bg-slate-200'
                    : 'bg-brand-500 hover:bg-brand-700')
                }
                title={`Week of ${weekLabel}: ${w.count} commit${
                  w.count === 1 ? '' : 's'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* X-axis labels — sparse, only every 4th week */}
      <div className="relative mt-2 ml-8 flex gap-[2px] text-[8px] text-slate-400">
        {recent.map((w, i) => {
          const showLabel = i % 4 === 0 || i === recent.length - 1;
          const weekDate = new Date(w.weekStart);
          const label = weekDate.toLocaleDateString('en-PH', {
            month: 'short',
            day: '2-digit',
          });

          return (
            <div
              key={w.weekStart}
              className="flex-1 min-w-[4px] text-center"
            >
              {showLabel ? (
                <span className="whitespace-nowrap">{label}</span>
              ) : (
                <span className="opacity-0">{label}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-brand-100 pt-3 text-[10px]">
        <span className="text-slate-500">
          Busiest week: <strong className="text-brand-700">{max}</strong>{' '}
          commits
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-500">
            <span className="h-2 w-2 bg-brand-500" />
            Active week
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <span className="h-2 w-2 bg-slate-200" />
            No commits
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main ──

export function RepoCommitHistory() {
  const { data } = useQuery({
    queryKey: ['repo-commits'],
    queryFn: fetchRepoCommits,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const authors = new Set<string>();
    for (const c of data.commits) {
      if (c.authorLogin) authors.add(c.authorLogin);
    }
    return {
      total: data.totalFetched,
      uniqueAuthors: authors.size,
      earliest: data.earliestAt ? formatDate(data.earliestAt) : null,
      latest: data.latestAt ? relativeTime(data.latestAt) : null,
    };
  }, [data]);

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

      {/* Summary tiles (optional) */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              Authors
            </div>
            <div className="mt-1 text-lg font-bold text-brand-700">
              {stats.uniqueAuthors}
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
            <div className="mt-1 text-sm font-bold text-brand-700">
              {stats.latest ?? '—'}
            </div>
          </div>
        </div>
      )}

      {/* Chart 1: Commits per contributor */}
      <CommitCountChart />

      {/* Chart 2: Commit activity per week */}
      <CommitActivityBarGraph />
    </motion.div>
  );
}