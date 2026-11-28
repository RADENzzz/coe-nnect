import clsx from 'clsx';
import Icon from '../../../components/ui/Icon';
import { formatTime } from '../utils/time.util';
import type { ScheduleEntry } from '../types';

interface Props {
  entry: ScheduleEntry;
  onClick: (entry: ScheduleEntry) => void;
  /** Show the day label (used when grouping is off) — default false. */
  showDay?: boolean;
  /** Show a leading selection checkbox when bulk selection is active. */
  selectable?: boolean;
  /** Checked state of the selection checkbox. */
  selected?: boolean;
  onToggleSelect?: (entry: ScheduleEntry) => void;
}

const DAY_LABEL: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

export default function AgendaClassCard({
  entry,
  onClick,
  showDay,
  selectable = false,
  selected = false,
  onToggleSelect,
}: Props) {
  const locked =
    entry.status === 'finalized' || entry.status === 'published';
  const isLab = entry.loadType === 'laboratory';

  return (
    <div
      className={clsx(
        'w-full bg-white border border-slate-200 hover:border-slate-300 active:bg-slate-50 transition-colors flex items-stretch overflow-hidden',
        selected && 'outline outline-2 outline-primary',
      )}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(entry)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Select ${entry.subjectCode}`}
          className="ml-2 h-4 w-4 shrink-0 self-center cursor-pointer accent-primary"
        />
      )}
      <button
        type="button"
        onClick={() => onClick(entry)}
        className="flex min-w-0 flex-1 items-stretch text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
      >
        {/* Color bar */}
        <span
          className="w-1.5 shrink-0"
          style={{ backgroundColor: entry.color }}
          aria-hidden
        />

        {/* Body */}
        <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col gap-1">
          {/* Time row */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 tabular-nums">
              {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
              {showDay && entry.day && (
                <span className="ml-2 text-slate-400">
                  · {DAY_LABEL[entry.day] ?? entry.day}
                </span>
              )}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {locked && (
                <span
                  className="inline-flex items-center text-slate-400"
                  title="Finalized — locked"
                >
                  <Icon name="lock" size={12} />
                </span>
              )}
              {entry.hasConflict && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-red-500"
                  title="Has conflict"
                  aria-label="Has conflict"
                />
              )}
              {!entry.hasConflict && entry.hasWarning && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400"
                  title="Has warning"
                  aria-label="Has warning"
                />
              )}
              <span
                className={`text-[9px] uppercase font-bold tracking-wide px-1.5 py-px border ${
                  isLab
                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {isLab ? 'Lab' : 'Lec'}
              </span>
            </div>
          </div>

          {/* Subject row */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-sm text-slate-900 truncate">
              {entry.subjectCode}
            </span>
            {entry.sectionCode && (
              <span className="text-xs text-slate-500 truncate">
                · {entry.sectionCode}
              </span>
            )}
          </div>

          {/* Subject title */}
          {entry.subjectTitle && (
            <p className="text-xs text-slate-500 truncate">
              {entry.subjectTitle}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
            {entry.facultyName && entry.facultyName !== 'VL' && (
              <span className="inline-flex items-center gap-1 min-w-0 truncate">
                <Icon name="person" size={12} />
                <span className="truncate">{entry.facultyName}</span>
              </span>
            )}
            {entry.roomNumber && entry.roomNumber !== '—' && (
              <span className="inline-flex items-center gap-1 shrink-0">
                <Icon name="meeting_room" size={12} />
                {entry.roomNumber}
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <span className="flex items-center pr-3 text-slate-300 shrink-0">
          <Icon name="chevron_right" size={18} />
        </span>
      </button>
    </div>
  );
}
