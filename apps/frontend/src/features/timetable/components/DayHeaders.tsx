import { DAYS } from '../utils/time.util';
import { DAY_WIDTH_PX } from '../utils/grid-layout.util';

const DAY_LABELS: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

export function DayHeaders() {
  return (
    <div className="flex bg-surface-container-low border-b border-surface-variant sticky top-0 z-20">
      {DAYS.map((day) => (
        <div
          key={day}
          style={{ width: DAY_WIDTH_PX }}
          className="py-3 text-center text-sm font-semibold text-on-surface"
        >
          {DAY_LABELS[day]}
        </div>
      ))}
    </div>
  );
}