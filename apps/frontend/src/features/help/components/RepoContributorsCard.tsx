import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { fetchRepoContributors } from '../../../api/stats.api';

function ActivityHeatmap({
  weeks,
}: {
  weeks: Array<{ weekStart: string; count: number }>;
}) {
  if (weeks.length === 0) return null;

  const max = Math.max(...weeks.map((w) => w.count), 1);

  const intensityClass = (count: number) => {
    if (count === 0) return 'bg-slate-100';
    const ratio = count / max;
    if (ratio < 0.25) return 'bg-brand-100';
    if (ratio < 0.5) return 'bg-brand-300';
    if (ratio < 0.75) return 'bg-brand-500';
    return 'bg-brand-700';
  };

  return (
    <div className="mt-5 border-t border-brand-200 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Activity · last {weeks.length} weeks
        </p>
        <div className="flex items-center gap-1 text-[9px] text-slate-400">
          <span>Less</span>
          <span className="inline-block h-2.5 w-2.5 bg-slate-100" />
          <span className="inline-block h-2.5 w-2.5 bg-brand-100" />
          <span className="inline-block h-2.5 w-2.5 bg-brand-300" />
          <span className="inline-block h-2.5 w-2.5 bg-brand-500" />
          <span className="inline-block h-2.5 w-2.5 bg-brand-700" />
          <span>More</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-[3px]">
        {weeks.map((w) => (
          <div
            key={w.weekStart}
            className={`h-3 w-3 transition-transform hover:scale-125 ${intensityClass(
              w.count,
            )}`}
            title={`Week of ${w.weekStart}: ${w.count} commit${
              w.count === 1 ? '' : 's'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function ContributionBars({
  contributors,
}: {
  contributors: Array<{
    login: string;
    name: string | null;
    avatarUrl: string;
    contributions: number;
    profileUrl: string;
  }>;
}) {
  if (contributors.length === 0) return null;

  const max = Math.max(...contributors.map((c) => c.contributions), 1);

  return (
    <div className="mt-5 border-t border-brand-200 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Contribution breakdown · top {contributors.length}
        </p>
        <p className="text-[9px] italic text-slate-400">
          Click a row to view profile
        </p>
      </div>

      <div className="space-y-0.5">
        {contributors.map((c, i) => {
          const pct = (c.contributions / max) * 100;
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
              <span className="w-10 shrink-0 text-right font-mono text-[10px] text-slate-600 transition-colors group-hover:text-brand-700">
                {c.contributions}
              </span>
              <span className="material-symbols-outlined w-4 shrink-0 text-[13px] text-slate-300 opacity-0 transition-all group-hover:text-brand-700 group-hover:opacity-100">
                open_in_new
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function RepoContributorsCard() {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['repo-contributors'],
    queryFn: fetchRepoContributors,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="mt-4 border border-slate-200 bg-white p-5 text-center">
        <span className="material-symbols-outlined animate-spin text-[20px] text-brand-700">
          progress_activity
        </span>
        <p className="mt-2 text-xs text-slate-500">Loading contributors…</p>
      </div>
    );
  }

  if (error || !data?.topContributor) {
    return null;
  }

  const {
    topContributor,
    allContributors,
    weeklyActivity,
    fetchedAt,
    cached,
  } = data;

  const topForBars = allContributors.slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-4 border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-brand-700">
            emoji_events
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-800">
            Top Contributor
          </h3>
        </div>

        <div
          className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wider text-slate-500"
          title={`Last updated ${new Date(fetchedAt).toLocaleTimeString()}${
            cached ? ' (cached)' : ''
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isFetching
                  ? 'animate-ping bg-amber-400'
                  : 'animate-pulse bg-emerald-500'
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isFetching ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
          </span>
          {isFetching ? 'Updating…' : 'Live'}
        </div>
      </div>

      <a
        href={topContributor.profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group -m-2 flex items-center gap-4 rounded-sm p-2 transition-colors hover:bg-white/70"
      >
        <img
          src={topContributor.avatarUrl}
          alt={topContributor.login}
          className="h-16 w-16 rounded-full border-2 border-brand-700 transition-transform group-hover:scale-105"
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-slate-900 transition-colors group-hover:text-brand-700">
            {topContributor.name ?? topContributor.login}
          </span>
          <p className="text-xs text-slate-500">@{topContributor.login}</p>
          <div className="mt-1 flex items-center gap-1 text-sm font-bold text-brand-700">
            <span className="material-symbols-outlined text-[16px]">
              commit
            </span>
            {topContributor.contributions.toLocaleString()} commits
          </div>
        </div>
      </a>

      <ContributionBars contributors={topForBars} />

      {weeklyActivity.length > 0 && (
        <ActivityHeatmap weeks={weeklyActivity} />
      )}

      <p className="mt-4 text-center text-[9px] text-slate-400">
        {allContributors.length} contributor
        {allContributors.length === 1 ? '' : 's'} ·{' '}
        {data.totalCommits.toLocaleString()} total commits
      </p>
    </motion.div>
  );
}