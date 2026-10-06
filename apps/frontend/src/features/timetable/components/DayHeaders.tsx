import { DAYS } from '../utils/time.util';
import { useGridMetrics } from './GridMetricsContext';

const DAY_LABELS: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

export function DayHeaders() {
  const metrics = useGridMetrics();

  return (
    <div className="flex bg-surface-container-low border-b border-surface-variant sticky top-0 z-20">
      {DAYS.map((day) => (
        <div
          key={day}
          style={{ width: metrics.dayWidth }}
          className="py-3 text-center text-sm font-semibold text-on-surface"
        >
          {DAY_LABELS[day]}
        </div>
      ))}
    </div>
  );
}