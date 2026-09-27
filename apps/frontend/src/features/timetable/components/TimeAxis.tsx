import { generateTimeSlots, formatTime } from '../utils/time.util';
import { CELL_HEIGHT_PX } from '../utils/grid-layout.util';

export function TimeAxis() {
  const slots = generateTimeSlots();

  return (
    <div className="relative bg-surface-container-low border-r border-surface-variant">
      {slots.map((time, i) => (
        <div
          key={time}
          style={{
            height: CELL_HEIGHT_PX,
            top: i * CELL_HEIGHT_PX,
            position: 'absolute',
            width: '100%',
          }}
          className="flex items-start justify-end pr-2 text-xs text-on-surface-variant"
        >
          {i % 2 === 0 ? formatTime(time) : ''}
        </div>
      ))}
    </div>
  );
}