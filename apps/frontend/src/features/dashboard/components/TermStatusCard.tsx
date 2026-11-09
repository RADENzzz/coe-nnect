import Icon from '../../../components/ui/Icon';

/**
 * One-line term summary for the department dashboard.
 *
 * The term name, its status, and the entry count are the only three things
 * a department head needs before plotting schedules, so the strip stays a
 * single band instead of a full card.
 */
export default function TermStatusCard({
  term,
  scheduleStatusCounts,
}: {
  term: any | undefined;
  scheduleStatusCounts: {
    draft: number;
    review: number;
    finalized: number;
    published: number;
  };
}) {
  if (!term) {
    return (
      <div
        className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-4 py-3"
        data-tour="dash-term"
      >
        <Icon
          name="warning"
          size={16}
          className="mt-0.5 shrink-0 text-amber-600"
        />
        <p className="text-xs leading-relaxed text-amber-800">
          <span className="font-semibold text-amber-900">No active term.</span>{' '}
          The College Dean activates one in System Settings before schedules
          can be plotted.
        </p>
      </div>
    );
  }

  const total =
    scheduleStatusCounts.draft +
    scheduleStatusCounts.review +
    scheduleStatusCounts.finalized +
    scheduleStatusCounts.published;

  const dominant: 'draft' | 'review' | 'finalized' | 'published' =
    scheduleStatusCounts.published > 0 &&
    scheduleStatusCounts.draft === 0 &&
    scheduleStatusCounts.review === 0
      ? 'published'
      : scheduleStatusCounts.finalized > 0 &&
        scheduleStatusCounts.draft === 0
      ? 'finalized'
      : scheduleStatusCounts.review > 0
      ? 'review'
      : 'draft';

  const tone = {
    draft: {
      label: 'In progress',
      className:
        'border-outline-variant bg-surface-container-low text-on-surface-variant',
    },
    review: {
      label: 'Under review',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    finalized: {
      label: 'Finalized',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    published: {
      label: 'Published',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
  }[dominant];

  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-outline-variant bg-surface px-4 py-3 shadow-sm"
      data-tour="dash-term"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon name="calendar_month" size={15} />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
        Active term
      </span>
      <span className="text-sm font-semibold text-on-surface">
        {term.termName} · {term.schoolYear}
      </span>
      <span
        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone.className}`}
      >
        {tone.label}
      </span>
      <span className="ml-auto text-[11px] text-on-surface-variant tabular-nums">
        {total} entr{total === 1 ? 'y' : 'ies'}
      </span>
    </div>
  );
}
