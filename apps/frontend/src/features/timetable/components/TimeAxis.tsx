import { generateTimeSlots, formatTime } from '../utils/time.util';
import { useGridMetrics } from './GridMetricsContext';

export function TimeAxis() {
  const metrics = useGridMetrics();
  const slots = generateTimeSlots();

  return (
    <div className="relative bg-surface-container-low border-r border-surface-variant">
      {slots.map((time, i) => (
        <div
          key={time}
          style={{
            height: metrics.slotHeight,
            top: i * metrics.slotHeight,
            position: 'absolute',
            width: '100%',
          }}
          className="flex items-start justify-end pr-2 text-xs text-on-surface-variant"
        >
          {i % metrics.axisLabelEvery === 0 ? formatTime(time) : ''}
        </div>
      ))}
    </div>
  );
}