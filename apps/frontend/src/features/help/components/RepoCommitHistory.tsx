import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { fetchRepoCommits } from '../../../api/stats.api';

/** Short relative time like "3d ago", "2mo ago", "1y ago". */
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
      <div className="mt-4 border border-slate-200 bg-white p-5 text-center">
        <span className="material-symbols-outlined animate-spin text-[20px] text-brand-700">
          progress_activity
        </span>
        <p className="mt-2 text-xs text-slate-500">Loading commit history…</p>
      </div>
    );
  }

  if (error || !data || !stats) {
    return null; // silently hide if GitHub isn't configured
  }

  const visibleCommits = data.commits.slice(0, visibleCount);
  const hasMore = visibleCount < data.commits.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-4 border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5"
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-brand-700">
            history
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-800">
            Commit History
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
        {visibleCommits.map((c, i) => (
          <li key={c.sha} className="relative">
            {/* Timeline dot + vertical line */}
            <div className="absolute left-[6px] top-3 bottom-0 w-px bg-brand-200" />
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-sm p-2 pl-6 transition-colors hover:bg-white/70"
            >
              {/* Dot */}
              <span className="absolute left-0 top-[14px] h-[13px] w-[13px] border-2 border-brand-300 bg-white transition-colors group-hover:border-brand-700" />

              {/* Avatar */}
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

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-slate-800 transition-colors group-hover:text-brand-700">
                  {c.message}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-500">
                  <span className="font-mono text-slate-400">{c.shortSha}</span>
                  <span>·</span>
                  <span>{c.authorLogin ?? c.authorName}</span>
                  <span>·</span>
                  <span title={formatDate(c.committedAt)}>
                    {relativeTime(c.committedAt)}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <span className="material-symbols-outlined mt-1 shrink-0 text-[14px] text-slate-300 transition-colors group-hover:text-brand-700">
                open_in_new
              </span>
            </a>
          </li>
        ))}
      </ol>

      {/* Load more */}
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
    </motion.div>
  );
}