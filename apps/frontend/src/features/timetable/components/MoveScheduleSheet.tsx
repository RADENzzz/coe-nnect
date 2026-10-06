import { useEffect, useMemo, useState } from 'react';
import BottomSheet from '../../../components/ui/BottomSheet';
import Icon from '../../../components/ui/Icon';
import type { ScheduleEntry, Day } from '../types';
import {
  DAYS,
  generateTimeSlots,
  formatTime,
  timeToMinutes,
} from '../utils/time.util';


interface Props {
  open: boolean;
  entry: ScheduleEntry | null;
  onClose: () => void;
  onMove: (
  entryId: string,
  newDay: string,
  newStartTime: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
  isPending: boolean;
}

const DAY_LABEL: Record<Day, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

export default function MoveScheduleSheet({
  open,
  entry,
  onClose,
  onMove,
  isPending,
}: Props) {
  const [day, setDay] = useState<Day>('MON');
  const [startTime, setStartTime] = useState('07:00');
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever a new entry is targeted
  useEffect(() => {
    if (!entry) return;
    setDay(entry.day);
    setStartTime(entry.startTime);
    setError(null);
  }, [entry?.id, entry?.day, entry?.startTime]);

  // Available start times: half-hour slots that leave enough room for the duration
  const availableSlots = useMemo(() => {
    if (!entry) return [];
    const duration =
      timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
    const operatingEnd = timeToMinutes('19:00');
    return generateTimeSlots().filter(
      (t) => timeToMinutes(t) + duration <= operatingEnd,
    );
  }, [entry]);

  if (!entry) return null;

  const durationMinutes =
    timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
  const endTime = (() => {
    const totalMin = timeToMinutes(startTime) + durationMinutes;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  })();

  const hasChanges = day !== entry.day || startTime !== entry.startTime;

  const handleSubmit = async () => {
    setError(null);
    const result = await onMove(entry.id, day, startTime);
    if (result.ok) {
      onClose();
    } else if (result.reason) {
      setError(result.reason);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Move class"
      description={`${entry.subjectCode}${entry.sectionCode ? ` · ${entry.sectionCode}` : ''}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasChanges || isPending}
            className="flex items-center gap-2 px-6 py-2 text-sm font-semibold bg-primary text-on-primary hover:bg-tertiary transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Moving…
              </>
            ) : (
              <>
                <Icon name="check" size={16} />
                Move here
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* Day picker */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
            Day
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                className={`flex items-center justify-center py-2.5 text-xs font-semibold border transition ${
                  day === d
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {DAY_LABEL[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Start time picker */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
            Start time
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-[280px] overflow-y-auto overscroll-contain pr-1">
            {availableSlots.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setStartTime(t)}
                className={`flex items-center justify-center py-2 text-[11px] font-semibold border tabular-nums transition ${
                  startTime === t
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {formatTime(t)}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            New schedule
          </p>
          <p className="text-sm text-slate-900 font-medium">
            {DAY_LABEL[day]} · {formatTime(startTime)} – {formatTime(endTime)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Duration: {durationMinutes} minutes
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}