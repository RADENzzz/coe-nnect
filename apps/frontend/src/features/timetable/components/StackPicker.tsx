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
  // Escape closes
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-surface-container-lowest rounded-xl shadow-2xl border border-surface-variant">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-variant sticky top-0 bg-surface-container-lowest z-10">
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
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* List */}
        <ul className="divide-y divide-surface-variant">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onPick(e)}
                className="w-full text-left px-5 py-3 hover:bg-surface-container-low transition flex items-start gap-3"
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
        <div className="px-5 py-3 border-t border-surface-variant flex justify-end bg-surface-container-low">
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