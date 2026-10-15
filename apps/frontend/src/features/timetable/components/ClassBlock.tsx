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
  /** Mark as foreign — dashed border, no drag cursor. */
  isForeign?: boolean;
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
  isForeign = false,
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
  const isExternalFaculty = !!entry.externalFacultyName;
  const isExternalRoom = !!entry.externalRoomName;
  const isPending = !!entry.pendingFacultyRequestId;
  const isFlagged = !!entry.flagged;

  const isCompact = durationMinutes <= 30;
  const isNarrow = laneCount >= 3;
  const showSecondary = metrics.showSecondaryLines && !isCompact && !isNarrow;

  // Ring priority: conflict > warning > pending > flagged > foreign
  const ringClass = entry.hasConflict
    ? 'ring-2 ring-red-500 animate-pulse'
    : entry.hasWarning
    ? 'ring-2 ring-amber-400'
    : isPending
    ? 'ring-2 ring-amber-500 animate-pulse'
    : isFlagged
    ? 'ring-2 ring-rose-500'
    : isForeign
    ? 'ring-2 ring-slate-300 ring-offset-1'
    : '';

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

  // Badge padding — pl is 5 when any left-side badge is present
  const hasAnyBadge =
    locked ||
    isForeign ||
    isFlagged ||
    isExternalFaculty ||
    isExternalRoom ||
    isPending;

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
      }, ${formatTime(entry.startTime)} to ${formatTime(entry.endTime)}${
        isExternalFaculty ? ', external faculty' : ''
      }${isExternalRoom ? `, external room ${entry.externalRoomName}` : ''}${
        isPending ? ', pending cross-department approval' : ''
      }${entry.flagged ? ', flagged for review' : ''}${
        entry.hasConflict ? ', has conflict' : ''
      }`}
      className={clsx(
        'rounded-md px-1.5 py-1 text-white leading-tight select-none',
        'transition-shadow duration-150 hover:shadow-lg overflow-hidden flex flex-col gap-0.5',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-white',
        locked || isForeign ? 'cursor-pointer' : 'cursor-grab',
        isLab &&
          '[background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,0.15)_6px,rgba(255,255,255,0.15)_12px)]',
        ringClass,
        dragging && 'cursor-grabbing shadow-2xl',
      )}
    >
      {/* ── Top-left badges ──
          Priority: locked/foreign (leftmost), then flag,
          then external faculty, then external room */}

      <div className="absolute top-0.5 left-1 flex items-center gap-0.5 pointer-events-none">
        {locked && (
          <span
            className="bg-black/70 text-white rounded px-1 py-px leading-none flex items-center"
            title="Finalized — locked"
          >
            <Icon name="lock" size={9} />
          </span>
        )}
        {!locked && isForeign && (
          <span
            className="bg-black/40 text-white rounded px-1 py-px leading-none flex items-center"
            title="Read-only — other department"
          >
            <Icon name="visibility" size={9} />
          </span>
        )}
        {isExternalFaculty && (
          <span
            className="bg-amber-500 text-white rounded px-1 py-px leading-none flex items-center"
            title={`External faculty: ${entry.facultyName}`}
          >
            <Icon name="badge" size={9} />
          </span>
        )}
        {isExternalRoom && (
          <span
            className="bg-amber-500 text-white rounded px-1 py-px leading-none flex items-center"
            title={`External room: ${entry.externalRoomName}`}
          >
            <Icon name="home_work" size={9} />
          </span>
        )}
        {isFlagged && (
          <span
            className="bg-rose-600 text-white rounded px-1 py-px leading-none flex items-center"
            title={entry.flagReason ?? 'Flagged for review'}
          >
            <Icon name="flag" filled size={9} />
          </span>
        )}
      </div>

      {isPending && (
        <span
          className="bg-amber-600 text-white rounded px-1 py-px leading-none flex items-center"
          title="Pending cross-department faculty approval"
        >
          <Icon name="hourglass_top" size={9} />
        </span>
      )}

      {/* ── Top-right overlap counter ── */}
      {overlapCount > 1 && (
        <span className="absolute top-0.5 right-1 bg-black/70 text-white text-[9px] font-bold rounded px-1 py-px leading-none pointer-events-none">
          +{overlapCount - 1}
        </span>
      )}

      {/* ── Line 1: subject code + section ── */}
      <div
        className={clsx(
          'font-bold truncate',
          hasAnyBadge && 'pl-5',
        )}
      >
        {entry.subjectCode}
        {entry.sectionCode && showSecondary && (
          <span className="font-normal opacity-90 ml-1">
            · {entry.sectionCode}
          </span>
        )}
      </div>

      {/* ── Line 2: faculty ── */}
      {showSecondary && (
        <div
          className={clsx(
            'truncate opacity-90',
            isExternalFaculty && 'italic',
          )}
          style={{ fontSize: metrics.blockFontSize - 1 }}
          title={isExternalFaculty ? 'External faculty' : undefined}
        >
          {entry.facultyName}
        </div>
      )}

      {/* ── Line 2b: room (external takes priority when set) ── */}
      {showSecondary && (isExternalRoom || (entry.roomNumber && entry.roomNumber !== '—')) && (
        <div
          className={clsx(
            'truncate',
            isExternalRoom ? 'opacity-95 italic' : 'opacity-80',
          )}
          style={{ fontSize: metrics.blockFontSize - 1 }}
          title={isExternalRoom ? 'External room' : undefined}
        >
          {isExternalRoom ? entry.externalRoomName : entry.roomNumber}
        </div>
      )}

      {/* ── Line 3: time ── */}
      {showSecondary && durationMinutes >= 60 && (
        <div
          className="truncate opacity-80"
          style={{ fontSize: metrics.blockFontSize - 1 }}
        >
          {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
        </div>
      )}
    </div>
  );
}

export const ClassBlock = memo(ClassBlockBase);