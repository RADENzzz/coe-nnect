import { memo } from 'react';
import { useDraggable } from '@dnd-kit/react';
import clsx from 'clsx';
import type { ScheduleEntry } from '../types';
import { timeToMinutes, formatTime } from '../utils/time.util';
import { minutesToY, DAY_WIDTH_PX } from '../utils/grid-layout.util';

interface Props {
  entry: ScheduleEntry;
  dayIndex: number;
  onClick?: (entry: ScheduleEntry) => void;
}

function ClassBlockBase({ entry, dayIndex, onClick }: Props) {
  const { ref, isDragging } = useDraggable({
    id: entry.id,
    data: { entry },
  });

  const top = minutesToY(timeToMinutes(entry.startTime));
  const height =
    ((timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime)) / 30) *
    24;

  const left = dayIndex * DAY_WIDTH_PX + 4;
  const width = DAY_WIDTH_PX - 8;

  const style: React.CSSProperties = {
    position: 'absolute',
    top,
    left,
    width,
    height,
    // v7 handles transform internally — we just need position
    willChange: isDragging ? 'transform' : undefined,
    contain: 'layout style paint',
    backgroundColor: entry.deptColor,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 9999 : 1,
  };

  return (
    <div
      ref={ref}
      style={style}
      onClick={() => onClick?.(entry)}
      className={clsx(
        'rounded-md px-2 py-1 text-white text-xs cursor-grab select-none',
        'transition-shadow duration-150',
        'hover:shadow-lg',
        entry.loadType === 'laboratory' &&
          'ring-2 ring-inset ring-white/40 [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,0.15)_6px,rgba(255,255,255,0.15)_12px)]',
        entry.hasConflict && 'ring-2 ring-red-500 animate-pulse',
        entry.hasWarning && !entry.hasConflict && 'ring-2 ring-amber-400',
        isDragging && 'cursor-grabbing shadow-2xl',
      )}
    >
      <div className="font-semibold truncate">{entry.subjectCode}</div>
      <div className="truncate opacity-90">{entry.roomNumber}</div>
      <div className="truncate opacity-75">
        {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
      </div>
    </div>
  );
}

export const ClassBlock = memo(ClassBlockBase);