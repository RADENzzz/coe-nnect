import { useEffect } from 'react';
import type { ScheduleEntry } from '../types';
import Icon from '../../../components/ui/Icon';
import { formatTime } from '../utils/time.util';

interface Props {
  entries: ScheduleEntry[] | null;
  onClose: () => void;
  onPick: (entry: ScheduleEntry) => void;
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

export default function StackPicker({ entries, onClose, onPick }: Props) {
  useEffect(() => {
    if (!entries || entries.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [entries, onClose]);

  if (!entries || entries.length === 0) return null;

  const first = entries[0];
  const dayLabel = DAY_LABEL[first.day] ?? first.day;
  const timeLabel = `${formatTime(first.startTime)} – ${formatTime(first.endTime)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-backdrop-in"
        onClick={onClose}
      />

      <div
        className={[
          'relative w-full bg-surface-container-lowest shadow-2xl border border-surface-variant flex flex-col',
          // Mobile: bottom sheet
          'rounded-t-2xl max-h-[85vh] animate-[sheetUp_260ms_cubic-bezier(0.2,0.9,0.3,1)]',
          // Desktop: centered modal
          'md:rounded-xl md:max-w-lg md:max-h-[85vh] md:animate-none',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <span className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-variant">
          <div>
            <h2 className="text-lg font-bold text-primary">
              {entries.length} classes overlap
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {dayLabel} · {timeLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-target rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant -mr-2"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* List */}
        <ul className="divide-y divide-surface-variant overflow-y-auto overscroll-contain">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onPick(e)}
                className="w-full text-left px-5 py-3.5 hover:bg-surface-container-low active:bg-surface-container transition flex items-start gap-3"
              >
                <span
                  className="w-1.5 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: e.color }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-bold text-sm text-on-surface">
                      {e.subjectCode}
                    </span>
                    {e.sectionCode && (
                      <span className="text-xs text-on-surface-variant">
                        · {e.sectionCode}
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-px rounded bg-surface-container-high text-on-surface-variant">
                      {e.loadType}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                    {e.subjectTitle || '—'}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    {e.facultyName} · Room {e.roomNumber}
                  </p>
                </div>
                <Icon
                  name="chevron_right"
                  size={18}
                  className="text-on-surface-variant shrink-0 mt-2"
                />
              </button>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-surface-variant flex justify-end bg-surface-container-low rounded-b-2xl md:rounded-b-xl pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}