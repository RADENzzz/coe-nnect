import { memo } from 'react';
import { useDraggable } from '@dnd-kit/react';
import clsx from 'clsx';
import type { ScheduleEntry } from '../types';
import { timeToMinutes, formatTime } from '../utils/time.util';
import { useGridMetrics } from './GridMetricsContext';
import Icon from '../../../components/ui/Icon';

interface Props {
  entry: ScheduleEntry;
  dayIndex: number;
  lane?: number;
  laneCount?: number;
  overlapCount?: number;
  onClick?: (entry: ScheduleEntry) => void;
  isDragging?: boolean;
  disabled?: boolean;
}

function ClassBlockBase({
  entry,
  dayIndex,
  lane = 0,
  laneCount = 1,
  overlapCount = 1,
  onClick,
  isDragging,
  disabled = false,
}: Props) {
  const metrics = useGridMetrics();

  const { ref, isDragging: isDraggingInternal } = useDraggable({
    id: entry.id,
    data: { entry },
    disabled,
  });

  const DAY_START_MIN = timeToMinutes('07:00');
  const durationMinutes =
    timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
  const top =
    ((timeToMinutes(entry.startTime) - DAY_START_MIN) / 30) * metrics.slotHeight;
  const height = (durationMinutes / 30) * metrics.slotHeight;

  const dayColumnWidth = metrics.dayWidth;
  const blockWidth = dayColumnWidth / laneCount;
  const left = dayIndex * dayColumnWidth + lane * blockWidth + 2;
  const width = blockWidth - 4;

  const dragging = isDragging || isDraggingInternal;
  const isLab = entry.loadType === 'laboratory';
  const locked =
    entry.status === 'finalized' || entry.status === 'published';

  const isCompact = durationMinutes <= 30;
  const isNarrow = laneCount >= 3;
  const showSecondary = metrics.showSecondaryLines && !isCompact && !isNarrow;

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
    fontSize: metrics.blockFontSize,
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(entry);
    }
  };

  return (
    <div
      ref={ref}
      style={style}
      onClick={() => onClick?.(entry)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${entry.subjectCode}${
        entry.sectionCode ? ' ' + entry.sectionCode : ''
      }, ${formatTime(entry.startTime)} to ${formatTime(entry.endTime)}`}
      className={clsx(
        'rounded-md px-1.5 py-1 text-white leading-tight select-none',
        'transition-shadow duration-150 hover:shadow-lg overflow-hidden flex flex-col gap-0.5',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-white',
        locked ? 'cursor-pointer' : 'cursor-grab',
        isLab &&
          '[background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,0.15)_6px,rgba(255,255,255,0.15)_12px)]',
        entry.hasConflict && 'ring-2 ring-red-500 animate-pulse',
        entry.hasWarning && !entry.hasConflict && 'ring-2 ring-amber-400',
        dragging && 'cursor-grabbing shadow-2xl',
      )}
    >
      {locked && (
        <span
          className="absolute top-0.5 left-1 bg-black/70 text-white rounded px-1 py-px leading-none pointer-events-none flex items-center"
          title="Finalized — locked"
        >
          <Icon name="lock" size={9} />
        </span>
      )}

      {overlapCount > 1 && (
        <span className="absolute top-0.5 right-1 bg-black/70 text-white text-[9px] font-bold rounded px-1 py-px leading-none pointer-events-none">
          +{overlapCount - 1}
        </span>
      )}

      {/* Line 1: subject code + section */}
      <div className={clsx('font-bold truncate', locked ? 'pl-4' : 'pr-4')}>
        {entry.subjectCode}
        {entry.sectionCode && showSecondary && (
          <span className="font-normal opacity-90 ml-1">
            · {entry.sectionCode}
          </span>
        )}
      </div>

      {/* Line 2: faculty */}
      {showSecondary && (
        <div className="truncate opacity-90" style={{ fontSize: metrics.blockFontSize - 1 }}>
          {entry.facultyName}
        </div>
      )}

      {/* Line 3: time */}
      {showSecondary && durationMinutes >= 60 && (
        <div className="truncate opacity-80" style={{ fontSize: metrics.blockFontSize - 1 }}>
          {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
        </div>
      )}
    </div>
  );
}

export const ClassBlock = memo(ClassBlockBase);