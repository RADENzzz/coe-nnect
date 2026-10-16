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

// ── Commit count bar chart ──

/**
 * Compact horizontal bar chart of commits per contributor.
 * Reuses fetchRepoContributors — no extra GitHub API call needed
 * beyond what the easter egg also consumes (they share the query
 * cache via React Query).
 */
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

  if (error || !data?.topContributor) {
    return null;
  }

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

// ── Main component ──

export function RepoCommitHistory() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['repo-commits'],
    queryFn: fetchRepoCommits,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [visibleCount, setVisibleCount] = useState(20);

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

  const visibleCommits = data.commits.slice(0, visibleCount);
  const hasMore = visibleCount < data.commits.length;

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
          Every commit made to the CoE-NNECT repository since the project began.
        </p>
      </div>

      {/* Commit count bar chart — NEW */}
      <CommitCountChart />

      {/* Timeline card */}
      <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-brand-700">
              history
            </span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-800">
              Commit Timeline
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            {stats.total} commits
          </span>
        </div>

        {/* Summary */}
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="border border-brand-200 bg-white/60 px-2 py-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              Total
            </div>
            <div className="text-sm font-bold text-brand-700">
              {stats.total.toLocaleString()}
            </div>
          </div>
          <div className="border border-brand-200 bg-white/60 px-2 py-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              Authors
            </div>
            <div className="text-sm font-bold text-brand-700">
              {stats.uniqueAuthors}
            </div>
          </div>
          <div className="border border-brand-200 bg-white/60 px-2 py-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              Since
            </div>
            <div className="text-sm font-bold text-brand-700">
              {stats.earliest ?? '—'}
            </div>
          </div>
        </div>

        {/* Commit list */}
        <ol className="space-y-0.5">
          {visibleCommits.map((c) => (
            <li key={c.sha} className="relative">
              <div className="absolute left-[6px] top-3 bottom-0 w-px bg-brand-200" />
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 rounded-sm p-2 pl-6 transition-colors hover:bg-white/70"
              >
                <span className="absolute left-0 top-[14px] h-[13px] w-[13px] border-2 border-brand-300 bg-white transition-colors group-hover:border-brand-700" />

                {c.authorAvatarUrl ? (
                  <img
                    src={c.authorAvatarUrl}
                    alt={c.authorLogin ?? c.authorName}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-slate-200"
                  />
                ) : (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-slate-200 text-[9px] font-bold text-slate-500">
                    {c.authorName.slice(0, 1).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-slate-800 transition-colors group-hover:text-brand-700">
                    {c.message}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-500">
                    <span className="font-mono text-slate-400">
                      {c.shortSha}
                    </span>
                    <span>·</span>
                    <span>{c.authorLogin ?? c.authorName}</span>
                    <span>·</span>
                    <span title={formatDate(c.committedAt)}>
                      {relativeTime(c.committedAt)}
                    </span>
                  </div>
                </div>

                <span className="material-symbols-outlined mt-1 shrink-0 text-[14px] text-slate-300 transition-colors group-hover:text-brand-700">
                  open_in_new
                </span>
              </a>
            </li>
          ))}
        </ol>

        {hasMore && (
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + 20)}
            className="mt-3 w-full border border-brand-300 bg-white/60 py-2 text-[10px] font-semibold uppercase tracking-wider text-brand-700 transition-colors hover:bg-white"
          >
            Load more ({data.commits.length - visibleCount} remaining)
          </button>
        )}

        <p className="mt-3 text-center text-[9px] text-slate-400">
          Latest: {stats.latest ?? '—'}
        </p>
      </div>
    </motion.div>
  );
}