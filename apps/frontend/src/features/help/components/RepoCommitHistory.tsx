import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { fetchRepoCommits } from '../../../api/stats.api';

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

function formatMonth(ym: string): string {
  // "2026-03" → "Mar 2026"
  const [year, month] = ym.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    year: 'numeric',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

// ── Commits-per-month bar graph ──

/**
 * Vertical bar graph of commit activity per month, covering the
 * entire project history. Each bar is one calendar month; height is
 * scaled to the busiest month. Hover a bar to see the exact count.
 */
function CommitActivityBarGraph({
  commits,
}: {
  commits: Array<{ committedAt: string }>;
}) {
  const months = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of commits) {
      const key = c.committedAt.slice(0, 7); // "YYYY-MM"
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, count]) => ({ month, count }));
  }, [commits]);

  if (months.length === 0) return null;

  const max = Math.max(...months.map((m) => m.count), 1);
  const total = months.reduce((sum, m) => sum + m.count, 0);
  const busiest = months.reduce((a, b) => (b.count > a.count ? b : a));

  return (
    <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-brand-700">
            calendar_month
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-800">
            Commits per Month
          </h3>
        </div>
        <span className="text-[9px] font-mono text-slate-500">
          {total.toLocaleString()} commits
        </span>
      </div>

      {/* Bar chart */}
      <div className="relative h-40">
        {/* Y-axis guide lines */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[max, Math.round(max * 0.66), Math.round(max * 0.33), 0].map(
            (v, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-[8px] text-slate-400"
              >
                <span className="w-7 text-right font-mono tabular-nums">
                  {v}
                </span>
                <div className="flex-1 border-t border-dashed border-slate-200" />
              </div>
            ),
          )}
        </div>

        {/* Bars */}
        <div className="relative ml-9 flex flex-1 items-end gap-1 h-full">
          {months.map((m, i) => {
            const heightPct =
              m.count === 0 ? 2 : Math.max(6, (m.count / max) * 100);
            const isBusiest = m.month === busiest.month;

            return (
              <motion.div
                key={m.month}
                initial={{ height: 0 }}
                animate={{ height: `${heightPct}%` }}
                transition={{
                  duration: 0.6,
                  delay: i * 0.04,
                  ease: [0.2, 0.9, 0.3, 1],
                }}
                title={`${formatMonth(m.month)}: ${m.count} commit${
                  m.count === 1 ? '' : 's'
                }`}
                className={
                  'group relative flex-1 min-w-[6px] transition-colors ' +
                  (isBusiest
                    ? 'bg-brand-700 hover:bg-brand-800'
                    : 'bg-brand-400 hover:bg-brand-600')
                }
              >
                {/* Hover tooltip */}
                <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap border border-brand-700 bg-white px-1.5 py-0.5 text-[9px] font-medium text-brand-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                  {m.count}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="relative mt-2 ml-9 flex gap-1 text-[8px] text-slate-400">
        {months.map((m, i) => {
          // Show every label if few, else sparse
          const showEvery = months.length <= 14 ? 1 : Math.ceil(months.length / 10);
          const show = i % showEvery === 0 || i === months.length - 1;
          return (
            <div key={m.month} className="flex-1 min-w-[6px] text-center">
              {show ? (
                <span className="block -rotate-45 origin-top-left whitespace-nowrap">
                  {formatMonth(m.month)}
                </span>
              ) : (
                <span className="opacity-0">&nbsp;</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend / stats */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-brand-100 pt-3 text-[10px]">
        <span className="text-slate-500">
          Busiest month:{' '}
          <strong className="text-brand-700">
            {formatMonth(busiest.month)}
          </strong>{' '}
          · <strong className="text-brand-700">{busiest.count}</strong> commits
        </span>
        <span className="text-slate-500">
          {months.length} month{months.length === 1 ? '' : 's'} of activity
        </span>
      </div>
    </div>
  );
}

// ── Main component ──

export function RepoCommitHistory() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['repo-commits'],
    queryFn: fetchRepoCommits,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const stats = useMemo(() => {
    if (!data) return null;
    return {
      total: data.totalFetched,
      earliest: data.earliestAt ? formatDate(data.earliestAt) : null,
      latest: data.latestAt ? relativeTime(data.latestAt) : null,
    };
  }, [data]);

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
          <div className="mt-1 text-sm font-bold text-brand-700">
            {stats.latest ?? '—'}
          </div>
        </div>
      </div>

      {/* Bar graph */}
      <CommitActivityBarGraph commits={data.commits} />
    </motion.div>
  );
}