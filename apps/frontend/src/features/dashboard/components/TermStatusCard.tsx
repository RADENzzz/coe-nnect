import Icon from '../../../components/ui/Icon';

export default function TermStatusCard({
  term,
  scheduleStatusCounts,
}: {
  term: any | undefined;
  scheduleStatusCounts: { draft: number; review: number; finalized: number; published: number };
}) {
  if (!term) {
    return (
      <div
        className="bg-white border border-dashed border-amber-300 bg-amber-50/40 p-4 rounded-xl flex items-start gap-3"
        data-tour="dash-term"
      >
        <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <Icon name="warning" size={18} className="text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">No active term</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Wait till the Dean creates a new Term...
          </p>
        </div>
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
      : scheduleStatusCounts.finalized > 0 && scheduleStatusCounts.draft === 0
      ? 'finalized'
      : scheduleStatusCounts.review > 0
      ? 'review'
      : 'draft';

  const toneMap = {
    draft: { label: 'In progress', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    review: { label: 'Under review', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    finalized: { label: 'Finalized', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    published: { label: 'Published', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };
  const tone = toneMap[dominant];

  return (
    <div
      className="bg-white border border-slate-200 p-4 rounded-xl flex flex-wrap items-center gap-4 shadow-sm"
      data-tour="dash-term"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#5c1219]/10 to-[#5c1219]/5 flex items-center justify-center">
          <Icon name="calendar_month" size={20} className="text-[#5c1219]" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Active term
          </p>
          <p className="text-sm font-bold text-slate-900">
            {term.termName} · {term.schoolYear}
          </p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md">
          {total} entr{total === 1 ? 'y' : 'ies'}
        </span>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider border px-2.5 py-1 rounded-md ${tone.color}`}
        >
          {tone.label}
        </span>
      </div>
    </div>
  );
}