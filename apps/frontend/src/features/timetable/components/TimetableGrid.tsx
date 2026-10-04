import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import type { ScheduleEntry, DropCellData, Day } from '../types';
import {
  DAYS,
  generateTimeSlots,
  timesOverlap,
  timeToMinutes,
  minutesToTime,
  formatTimeShort,
  SLOT_MINUTES,
} from '../utils/time.util';
import {
  CELL_HEIGHT_PX,
  DAY_WIDTH_PX,
  TIME_AXIS_WIDTH_PX,
  getGridHeightPx,
  minutesToY,
  durationToHeight,
} from '../utils/grid-layout.util';

interface Props {
  entries: ScheduleEntry[];
  onEntryMove?: (entryId: string, newDay: string, newStartTime: string) => void | Promise<void>;
  onEntryClick?: (entry: ScheduleEntry) => void;
}

const DAY_LABELS: Record<Day, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

export default function TimetableGrid({
  entries,
  onEntryMove,
  onEntryClick,
}: Props) {
  const [validCells, setValidCells] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const gridHeight = getGridHeightPx();
  const gridWidth = DAYS.length * DAY_WIDTH_PX;

  // ── Compute all drop cells (for the background grid) ──
  const allCells = useMemo<DropCellData[]>(() => {
    const slots = generateTimeSlots();
    const cells: DropCellData[] = [];
    for (const day of DAYS) {
      for (let i = 0; i < slots.length - 1; i++) {
        cells.push({
          day,
          startTime: slots[i],
          endTime: slots[i + 1],
          cellId: `${day}-${slots[i]}`,
        });
      }
    }
    return cells;
  }, []);

  const slotsPerDay = allCells.length / DAYS.length;

  // ── Compute valid drop cells for a dragged entry ──
  const computeValidCells = useCallback(
  (entry: ScheduleEntry): Set<string> => {
    const valid = new Set<string>();
    const duration = timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
    const operatingEnd = timeToMinutes('19:00');

    for (const cell of allCells) {
      const cellStart = timeToMinutes(cell.startTime);
      const cellEnd = cellStart + duration;

      // Must fit within operating hours
      if (cellEnd > operatingEnd) continue;

      // Only block exact same-position collisions:
      // another block in the same day + same start time + same room.
      const sameCellBlock = entries.some(
        (e) =>
          e.id !== entry.id &&
          e.day === cell.day &&
          e.startTime === cell.startTime &&
          e.roomId === entry.roomId,
      );
      if (sameCellBlock) continue;

      valid.add(cell.cellId);
    }
    return valid;
  },
  [allCells, entries],
  );

  // ── Drag handlers ──
  const handleDragStart = useCallback(
    (event: any) => {
      const entry = event.operation?.source?.data?.entry as ScheduleEntry | undefined;
      if (!entry) return;
      setDraggingId(entry.id);
      setValidCells(computeValidCells(entry));
    },
    [computeValidCells],
  );

  const handleDragEnd = useCallback(
    (event: any) => {
      setDraggingId(null);
      const source = event.operation?.source;
      const target = event.operation?.target;

      if (!source || !target) {
        setValidCells(new Set());
        return;
      }

      const entry = source.data?.entry as ScheduleEntry | undefined;
      const cell = target.data as DropCellData | undefined;

      if (!entry || !cell) {
        setValidCells(new Set());
        return;
      }

      if (validCells.has(cell.cellId)) {
        onEntryMove?.(entry.id, cell.day, cell.startTime);
      }

      setValidCells(new Set());
    },
    [onEntryMove, validCells],
  );

  return (
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-variant overflow-hidden">
        {/* ──────── Scrollable grid wrapper ──────── */}
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <div
            className="relative"
            style={{
              width: TIME_AXIS_WIDTH_PX + gridWidth,
              minWidth: '100%',
            }}
          >
            {/* ──────── Sticky day header row ──────── */}
            <div
              className="flex sticky top-0 z-30 bg-surface-container-low"
              style={{ paddingLeft: TIME_AXIS_WIDTH_PX }}
            >
              {DAYS.map((day) => (
                <div
                  key={day}
                  style={{ width: DAY_WIDTH_PX, minWidth: DAY_WIDTH_PX }}
                  className="py-3 text-center text-sm font-semibold text-on-surface border-b border-l border-surface-variant first:border-l-0"
                >
                  {DAY_LABELS[day]}
                </div>
              ))}
            </div>

            {/* ──────── Main grid body ──────── */}
            <div className="flex" style={{ height: gridHeight }}>
              {/* Sticky time axis */}
              <div
                className="sticky left-0 z-20 bg-surface-container-low border-r border-surface-variant shrink-0"
                style={{ width: TIME_AXIS_WIDTH_PX }}
              >
                {generateTimeSlots().map((time, i) => (
                  <div
                    key={time}
                    style={{
                      height: CELL_HEIGHT_PX,
                      top: i * CELL_HEIGHT_PX,
                      position: 'absolute',
                      width: '100%',
                    }}
                    className="flex items-start justify-end pr-2 text-[11px] text-on-surface-variant"
                  >
                    {i % 2 === 0 ? formatTimeShort(time) : ''}
                  </div>
                ))}
              </div>

              {/* Day columns container */}
              <div
                className="relative"
                style={{ width: gridWidth, height: gridHeight }}
              >
                {/* ── Background drop cells ── */}
                {allCells.map((cell, idx) => {
                  const dayIndex = DAYS.indexOf(cell.day);
                  const slotIndex = idx % slotsPerDay;
                  const x = dayIndex * DAY_WIDTH_PX;
                  const y = slotIndex * CELL_HEIGHT_PX;
                  const isDragging = draggingId !== null;
                  const isValid = validCells.has(cell.cellId);

                  return (
                    <DropCell
                      key={cell.cellId}
                      cell={cell}
                      x={x}
                      y={y}
                      width={DAY_WIDTH_PX}
                      height={CELL_HEIGHT_PX}
                      isValidTarget={isValid}
                      isDragging={isDragging}
                      isEvenSlot={slotIndex % 2 === 0}
                    />
                  );
                })}

                {/* ── Class blocks ── */}
                {entries.map((entry) => {
                  const dayIndex = DAYS.indexOf(entry.day);
                  if (dayIndex === -1) return null;

                  const top = minutesToY(timeToMinutes(entry.startTime));
                  const height = durationToHeight(
                    timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime),
                  );
                  const left = dayIndex * DAY_WIDTH_PX;

                  return (
                    <ClassBlock
                      key={entry.id}
                      entry={entry}
                      top={top}
                      left={left}
                      width={DAY_WIDTH_PX}
                      height={height}
                      onClick={onEntryClick}
                      isDragging={draggingId === entry.id}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DragDropProvider>
  );
}

/* ──────────────────────────────────────────────
   DropCell — background target for drag-drop
   ────────────────────────────────────────────── */
import { memo } from 'react';
import { useDroppable } from '@dnd-kit/react';
import clsx from 'clsx';

interface DropCellProps {
  cell: DropCellData;
  x: number;
  y: number;
  width: number;
  height: number;
  isValidTarget: boolean;
  isDragging: boolean;
  isEvenSlot: boolean;
}

const DropCell = memo(function DropCell({
  cell,
  x,
  y,
  width,
  height,
  isValidTarget,
  isDragging,
  isEvenSlot,
}: DropCellProps) {
  const { ref, isDropTarget } = useDroppable({
    id: cell.cellId,
    data: cell,
  });

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
      }}
      className={clsx(
        'border-b border-r border-surface-variant/40 transition-colors duration-75',
        isEvenSlot && 'bg-surface-container/20',
        !isDragging && 'hover:bg-surface-container-high/40',
        isDragging && isValidTarget && 'bg-green-100/60',
        isDragging && !isValidTarget && 'bg-red-50/40',
        isDropTarget && isValidTarget && 'bg-green-300/70 ring-2 ring-green-500 ring-inset',
        isDropTarget && !isValidTarget && 'bg-red-300/60 ring-2 ring-red-500 ring-inset',
      )}
    />
  );
});

/* ──────────────────────────────────────────────
   ClassBlock — draggable entry
   ────────────────────────────────────────────── */
import { useDraggable } from '@dnd-kit/react';
import { formatTime } from '../utils/time.util';

interface ClassBlockProps {
  entry: ScheduleEntry;
  top: number;
  left: number;
  width: number;
  height: number;
  onClick?: (entry: ScheduleEntry) => void;
  isDragging: boolean;
}

const ClassBlock = memo(function ClassBlock({
  entry,
  top,
  left,
  width,
  height,
  onClick,
  isDragging,
}: ClassBlockProps) {
  const { ref } = useDraggable({
    id: entry.id,
    data: { entry },
  });

  const isLab = entry.loadType === 'laboratory';

  return (
    <div
      ref={ref}
      onClick={() => onClick?.(entry)}
      style={{
        position: 'absolute',
        top: top + 2,
        left: left + 2,
        width: width - 4,
        height: height - 4,
        backgroundColor: isLab ? '#800000' : '#570000',
        contain: 'layout style paint',
      }}
      className={clsx(
        'rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing select-none',
        'text-white text-xs shadow-sm hover:shadow-md transition-shadow',
        'overflow-hidden flex flex-col gap-0.5',
        isLab && 'ring-1 ring-inset ring-white/30',
        isLab &&
          '[background-image:repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,255,255,0.08)_8px,rgba(255,255,255,0.08)_16px)]',
        isDragging && 'opacity-40',
      )}
    >
      <div className="font-bold truncate leading-tight">{entry.subjectCode}</div>
      <div className="truncate opacity-90 leading-tight text-[10px]">
        {entry.roomNumber && `Room ${entry.roomNumber}`}
      </div>
      <div className="truncate opacity-75 leading-tight text-[10px]">
        {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
      </div>
      {height > 100 && (
        <div className="truncate opacity-75 leading-tight text-[10px] mt-auto">
          {entry.facultyName}
        </div>
      )}
    </div>
  );
});