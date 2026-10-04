import { memo } from 'react';
import { useDraggable } from '@dnd-kit/react';
import clsx from 'clsx';
import type { ScheduleEntry } from '../types';
import { timeToMinutes, formatTime } from '../utils/time.util';
import {
  minutesToY,
  DAY_WIDTH_PX,
  CELL_HEIGHT_PX,
} from '../utils/grid-layout.util';

interface Props {
  entry: ScheduleEntry;
  dayIndex: number;
  onClick?: (entry: ScheduleEntry) => void;
  isDragging?: boolean;
}

function ClassBlockBase({ entry, dayIndex, onClick, isDragging }: Props) {
  const { ref, isDragging: isDraggingInternal } = useDraggable({
    id: entry.id,
    data: { entry },
  });

  const top = minutesToY(timeToMinutes(entry.startTime));
  const durationMinutes =
    timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
  const height = (durationMinutes / 30) * CELL_HEIGHT_PX;

  const left = dayIndex * DAY_WIDTH_PX + 4;
  const width = DAY_WIDTH_PX - 8;

  const dragging = isDragging || isDraggingInternal;
  const isLab = entry.loadType === 'laboratory';

  // Show the compact view when the block is only ~1 slot tall
  const isCompact = durationMinutes <= 30;

  const style: React.CSSProperties = {
    position: 'absolute',
    top,
    left,
    width,
    height,
    willChange: dragging ? 'transform' : undefined,
    contain: 'layout style paint',
    backgroundColor: entry.color,
    opacity: dragging ? 0.4 : 1,
    zIndex: dragging ? 9999 : 1,
  };

  return (
    <div
      ref={ref}
      style={style}
      onClick={() => onClick?.(entry)}
      className={clsx(
        'rounded-md px-1.5 py-1 text-white text-[10px] leading-tight cursor-grab select-none',
        'transition-shadow duration-150 hover:shadow-lg overflow-hidden flex flex-col gap-0.5',
        isLab &&
          '[background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,0.15)_6px,rgba(255,255,255,0.15)_12px)]',
        entry.hasConflict && 'ring-2 ring-red-500 animate-pulse',
        entry.hasWarning && !entry.hasConflict && 'ring-2 ring-amber-400',
        dragging && 'cursor-grabbing shadow-2xl',
      )}
    >
      {/* Line 1: subject code + section */}
      <div className="font-bold truncate">
        {entry.subjectCode}
        {entry.sectionCode && !isCompact && (
          <span className="font-normal opacity-90 ml-1">
            · {entry.sectionCode}
          </span>
        )}
      </div>

      {/* Line 2: faculty — hidden when compact */}
      {!isCompact && (
        <div className="truncate opacity-90 text-[9px]">
          {entry.facultyName}
        </div>
      )}

      {/* Line 3: time — hidden when very short */}
      {!isCompact && durationMinutes >= 60 && (
        <div className="truncate opacity-80 text-[9px]">
          {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
        </div>
      )}
    </div>
  );
}

export const ClassBlock = memo(ClassBlockBase);