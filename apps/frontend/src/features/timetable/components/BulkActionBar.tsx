import Icon from '../../../components/ui/Icon';
import type { BulkScheduleAction } from '../hooks/useBulkScheduleActions';

interface BulkActionBarProps {
  count: number;
  pendingAction: BulkScheduleAction | null;
  onAction: (action: BulkScheduleAction) => void;
  onClearSelection: () => void;
}

/** Floating bar shown while timetable rows are selected. */
export default function BulkActionBar({
  count,
  pendingAction,
  onAction,
  onClearSelection,
}: BulkActionBarProps) {
  if (count <= 0) return null;

  const disabled = pendingAction !== null;

  const buttonClass =
    'flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';

  return (
    <div
      role="toolbar"
      aria-label="Bulk schedule actions"
      className="fixed above-bottom-nav left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-xl bg-slate-900 text-white shadow-2xl border border-slate-700 max-w-[calc(100vw-2rem)]"
    >
      <span className="text-xs sm:text-sm font-semibold px-2 whitespace-nowrap">
        {count} selected
      </span>
      <div className="h-6 w-px bg-slate-700 shrink-0" />
      <button
        type="button"
        onClick={() => onAction('delete')}
        disabled={disabled}
        className={`${buttonClass} text-rose-400 hover:bg-rose-500/20`}
        title="Delete selected"
      >
        <Icon name="delete" size={14} />
        <span>Delete</span>
      </button>
      <button
        type="button"
        onClick={() => onAction('review')}
        disabled={disabled}
        className={buttonClass}
        title="Send selected for review"
      >
        <Icon name="fact_check" size={14} className="text-sky-400" />
        <span>Review</span>
      </button>
      <button
        type="button"
        onClick={() => onAction('finalize')}
        disabled={disabled}
        className={buttonClass}
        title="Finalize selected"
      >
        <Icon name="check_circle" size={14} className="text-emerald-400" />
        <span>Finalize</span>
      </button>
      <button
        type="button"
        onClick={() => onAction('request-publish')}
        disabled={disabled}
        className={buttonClass}
        title="Request publish for selected"
      >
        <Icon name="send" size={14} className="text-amber-400" />
        <span>Request publish</span>
      </button>
      <div className="h-6 w-px bg-slate-700 shrink-0" />
      <button
        type="button"
        onClick={onClearSelection}
        disabled={disabled}
        className="p-1.5 rounded-lg hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        aria-label="Clear selection"
        title="Clear selection"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
