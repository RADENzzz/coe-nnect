import { useMemo, useState, useCallback, useEffect } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import type { ScheduleEntry, DropCellData, Day } from '../types';
import { computeLanes } from '../utils/lane-layout.util';
import {
  DAYS,
  generateTimeSlots,
  timeToMinutes,
} from '../utils/time.util';
import { ClassBlock } from './ClassBlock';
import { DropCell } from './DropCell';
import {
  GridMetricsProvider,
  useGridMetrics,
  type GridDensity,
} from './GridMetricsContext';

interface Props {
  entries: ScheduleEntry[];
  density: GridDensity;
  onEntryMove?: (
    entryId: string,
    newDay: string,
    newStartTime: string,
  ) => void | Promise<void>;
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

/** True once the viewport is at least md: (768px). */
function useIsDesktopLike(): boolean {
  const [is, setIs] = useState(() =>
    typeof window === 'undefined'
      ? true
      : window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handle = () => setIs(mq.matches);
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);
  return is;
}

export default function TimetableGrid({
  entries,
  density,
  onEntryMove,
  onEntryClick,
}: Props) {
  return (
    <GridMetricsProvider density={density}>
      <GridBody
        entries={entries}
        onEntryMove={onEntryMove}
        onEntryClick={onEntryClick}
      />
    </GridMetricsProvider>
  );
}

function GridBody({ entries, onEntryMove, onEntryClick }: Omit<Props, 'density'>) {
  const metrics = useGridMetrics();
  const isDesktopLike = useIsDesktopLike();
  const [validCells, setValidCells] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const gridWidth = DAYS.length * metrics.dayWidth;

  // Drop cells — 6 days × 24 slots
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
  const laneInfo = useMemo(() => computeLanes(entries), [entries]);

  const overlapCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const groups = new Map<string, ScheduleEntry[]>();
    for (const e of entries) {
      const key = `${e.day}-${e.startTime}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    for (const group of groups.values()) {
      for (const e of group) counts.set(e.id, group.length);
    }
    return counts;
  }, [entries]);

  const computeValidCells = useCallback(
    (entry: ScheduleEntry): Set<string> => {
      const valid = new Set<string>();
      const duration =
        timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
      const operatingEnd = timeToMinutes('19:00');

      for (const cell of allCells) {
        const cellStart = timeToMinutes(cell.startTime);
        const cellEnd = cellStart + duration;
        if (cellEnd > operatingEnd) continue;

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

  const handleDragStart = useCallback(
    (event: any) => {
      const entry = event.operation?.source?.data?.entry as
        | ScheduleEntry
        | undefined;
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

  const dragActive = draggingId !== null;

  // On mobile we don't render drop cells at all unless dragging,
  // and dragging is disabled — so effectively they never mount.
  const shouldRenderDropCells = isDesktopLike || dragActive;

  return (
    <DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-variant overflow-hidden flex flex-col h-full min-h-0">
        <div className="flex-1 overflow-auto overscroll-contain">
          <div
            className="relative"
            style={{
              width: metrics.axisWidth + gridWidth,
              minWidth: '100%',
            }}
          >
            {/* Sticky day header row */}
            <div
              className="flex sticky top-0 z-30 bg-surface-container-low"
              style={{ paddingLeft: metrics.axisWidth }}
            >
              {DAYS.map((day) => (
                <div
                  key={day}
                  style={{
                    width: metrics.dayWidth,
                    minWidth: metrics.dayWidth,
                  }}
                  className="py-2.5 text-center text-xs font-semibold text-on-surface border-b border-l border-surface-variant first:border-l-0"
                >
                  {DAY_LABELS[day]}
                </div>
              ))}
            </div>

            {/* Main grid body */}
            <div className="flex" style={{ height: metrics.gridHeight }}>
              {/* Sticky time axis */}
              <div
                className="sticky left-0 z-20 bg-surface-container-low border-r border-surface-variant shrink-0"
                style={{ width: metrics.axisWidth }}
              >
                {generateTimeSlots().map((time, i) => (
                  <div
                    key={time}
                    style={{
                      height: metrics.slotHeight,
                      top: i * metrics.slotHeight,
                      position: 'absolute',
                      width: '100%',
                    }}
                    className="flex items-start justify-end pr-2 text-[10px] text-on-surface-variant"
                  >
                    {i % metrics.axisLabelEvery === 0 ? time : ''}
                  </div>
                ))}
              </div>

              {/* Day columns container */}
              <div
                className="relative"
                style={{ width: gridWidth, height: metrics.gridHeight }}
              >
                {/* Background drop cells — only when a drag is active */}
                {shouldRenderDropCells &&
                  allCells.map((cell, idx) => {
                    const dayIndex = DAYS.indexOf(cell.day);
                    const slotIndex = idx % slotsPerDay;
                    const x = dayIndex * metrics.dayWidth;
                    const y = slotIndex * metrics.slotHeight;
                    const isValid = validCells.has(cell.cellId);

                    return (
                      <DropCell
                        key={cell.cellId}
                        cell={cell}
                        x={x}
                        y={y}
                        width={metrics.dayWidth}
                        height={metrics.slotHeight}
                        isValidTarget={isValid}
                      />
                    );
                  })}

                {/* Class blocks */}
                {entries.map((entry) => {
                  const dayIndex = DAYS.indexOf(entry.day);
                  if (dayIndex === -1) return null;

                  const info = laneInfo.get(entry.id);
                  const laneCount = info?.laneCount ?? 1;
                  const lane = info?.lane ?? 0;
                  const overlapCount = overlapCounts.get(entry.id) ?? 1;

                  const locked =
                    entry.status === 'finalized' ||
                    entry.status === 'published';

                  return (
                    <ClassBlock
                      key={entry.id}
                      entry={entry}
                      dayIndex={dayIndex}
                      lane={lane}
                      laneCount={laneCount}
                      overlapCount={overlapCount}
                      onClick={onEntryClick}
                      isDragging={draggingId === entry.id}
                      // Disable dragging on <md viewports — the columns
                      // are too narrow for reliable finger dragging.
                      disabled={locked || !isDesktopLike}
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