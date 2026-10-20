import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import type { ScheduleEntry, DropCellData, Day } from '../types';
import { computeLanes } from '../utils/lane-layout.util';
import {
  DAYS,
  generateTimeSlots,
  generateSlotBoundaries,
  timeToMinutes,
  formatTime, // ← already returns AM/PM
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
  fitToContainer?: boolean;
  onEntryMove?: (
    entryId: string,
    newDay: string,
    newStartTime: string,
  ) => void | Promise<unknown>;
  onEntryClick?: (entry: ScheduleEntry) => void;
  /** IDs of entries the current user cannot drag (foreign dept, etc.). */
  readOnlyEntryIds?: Set<string>;
}

/** Get the index in DAYS array for today, or -1 if today isn't a grid day. */
function getTodayIndex(): number {
  const jsDay = new Date().getDay(); // 0=Sun ... 6=Sat
  const map: Record<number, Day> = {
    1: 'MON',
    2: 'TUE',
    3: 'WED',
    4: 'THU',
    5: 'FRI',
    6: 'SAT',
  };
  const today = map[jsDay];
  if (!today) return -1;
  return DAYS.indexOf(today);
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

function useMeasuredWidth<T extends HTMLElement>(): [
  React.RefObject<T>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setWidth(el.clientWidth);
      });
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return [ref, width];
}

export default function TimetableGrid({
  entries,
  density,
  fitToContainer = true,
  onEntryMove,
  onEntryClick,
  readOnlyEntryIds,
}: Props) {
  const [containerRef, containerWidth] = useMeasuredWidth<HTMLDivElement>();
  const effectiveDensity: GridDensity = fitToContainer ? 'fit' : density;

  return (
    <GridMetricsProvider
      density={effectiveDensity}
      containerWidth={containerWidth}
    >
    <GridBody
      containerRef={containerRef}
      entries={entries}
      onEntryMove={onEntryMove}
      onEntryClick={onEntryClick}
      readOnlyEntryIds={readOnlyEntryIds}
    />
    </GridMetricsProvider>
  );
}

interface GridBodyProps {
  containerRef: React.RefObject<HTMLDivElement>;
  entries: ScheduleEntry[];
  onEntryMove?: Props['onEntryMove'];
  onEntryClick?: Props['onEntryClick'];
  readOnlyEntryIds?: Set<string>;
}

function GridBody({
  containerRef,
  entries,
  onEntryMove,
  onEntryClick,
  readOnlyEntryIds,
}: GridBodyProps) {
  const metrics = useGridMetrics();
  const isDesktopLike = useIsDesktopLike();
  const [validCells, setValidCells] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const todayIdx = useMemo(() => getTodayIndex(), []);

  const gridWidth = DAYS.length * metrics.dayWidth;

  // ── Build cells from BOUNDARIES (N+1 boundaries → N cells) ──
  const allCells = useMemo<DropCellData[]>(() => {
    const boundaries = generateSlotBoundaries();
    const cells: DropCellData[] = [];
    for (const day of DAYS) {
      for (let i = 0; i < boundaries.length - 1; i++) {
        cells.push({
          day,
          startTime: boundaries[i],
          endTime: boundaries[i + 1],
          cellId: `${day}-${boundaries[i]}`,
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
  const shouldRenderDropCells = isDesktopLike || dragActive;

  // ── Time axis: use boundaries so 19:00 has a labeled row ──
  const timeBoundaries = useMemo(() => generateSlotBoundaries(), []);
  const boundaryCount = timeBoundaries.length;
  function CurrentTimeIndicator({
  dayIndex,
  dayWidth,
  slotHeight,
  gridHeight,
}: {
  dayIndex: number;
  dayWidth: number;
  slotHeight: number;
  gridHeight: number;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const minutesSince7am =
    now.getHours() * 60 + now.getMinutes() - 7 * 60;
  if (minutesSince7am < 0 || minutesSince7am > 12 * 60) return null;

  const top = (minutesSince7am / 30) * slotHeight;
  if (top > gridHeight) return null;

  return (
    <div
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        left: dayIndex * dayWidth,
        top,
        width: dayWidth,
        height: 2,
        zIndex: 25,
      }}
    >
      <div className="absolute left-0 right-0 h-0.5 bg-red-500" />
      <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
    </div>
  );  
}
  return (
    <DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-variant overflow-hidden flex flex-col h-full min-h-0">
        <div
          ref={containerRef}
          className="flex-1 overflow-auto overscroll-contain"
        >
          <div
            className="relative"
            style={{
              width: metrics.axisWidth + gridWidth,
              minWidth: '100%',
            }}
          >
            {/* Sticky day header row */}
            <div
              className="flex sticky top-0 z-30 bg-surface-container-low/95 supports-[backdrop-filter]:bg-surface-container-low/85 backdrop-blur-sm"
              style={{ paddingLeft: metrics.axisWidth }}
            >
              {DAYS.map((day, idx) => {
                const isToday = idx === todayIdx;
                return (
                  <div
                    key={day}
                    style={{ width: metrics.dayWidth, minWidth: metrics.dayWidth }}
                    className={
                      'relative py-2.5 text-center text-xs border-b border-l border-surface-variant first:border-l-0 transition-colors ' +
                      (isToday
                        ? 'font-extrabold text-on-surface bg-primary/[0.08]'
                        : 'font-semibold text-on-surface')
                    }
                  >
                    {DAY_LABELS[day]}
                    {isToday && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                        Today
                      </span>
                    )}
                  </div>
                );
              })}
            </div>


            {/* Main grid body */}
            <div className="flex" style={{ height: metrics.gridHeight }}>
              {/* Sticky time axis — now includes 19:00 */}
              <div
                className="sticky left-0 z-20 bg-surface-container-low/95 supports-[backdrop-filter]:bg-surface-container-low/85 backdrop-blur-sm border-r border-surface-variant shrink-0"
                style={{ width: metrics.axisWidth }}
              >
                {timeBoundaries.map((time, i) => (
                  <div
                    key={time}
                    style={{
                      height: metrics.slotHeight,
                      top: i * metrics.slotHeight,
                      position: 'absolute',
                      width: '100%',
                    }}
                    className="flex items-start justify-end pr-2 text-[10px] text-on-surface-variant tabular-nums"
                  >
                    {i % metrics.axisLabelEvery === 0 ? formatTime(time) : ''}
                  </div>
                ))}
              </div>

              {/* Day columns container */}
              <div
                className="relative"
                style={{ width: gridWidth, height: metrics.gridHeight }}
              >
                {/* Today column tint */}
                {todayIdx >= 0 && (
                  <div
                    aria-hidden
                    className="bg-primary/[0.06] pointer-events-none"
                    style={{
                      position: 'absolute',
                      left: todayIdx * metrics.dayWidth,
                      top: 0,
                      width: metrics.dayWidth,
                      height: metrics.gridHeight,
                      zIndex: 0,
                    }}
                  />
                )}
                {/* Current time indicator */}
                {todayIdx >= 0 && (
                  <CurrentTimeIndicator
                    dayIndex={todayIdx}
                    dayWidth={metrics.dayWidth}
                    slotHeight={metrics.slotHeight}
                    gridHeight={metrics.gridHeight}
                  />
                )}

                {/* Zebra shading: every other 30-min slot */}
                {Array.from({ length: boundaryCount - 1 }).map((_, i) => {
                  if (i % 2 === 0) return null;
                  return (
                    <div
                      key={`zebra-${i}`}
                      aria-hidden
                      className="bg-on-surface/[0.035] pointer-events-none"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: i * metrics.slotHeight,
                        height: metrics.slotHeight,
                        zIndex: 0,
                      }}
                    />
                  );
                })}

                {/* Horizontal time boundaries */}
                {timeBoundaries.slice(1).map((time, i) => (
                  <div
                    key={`hline-${time}`}
                    aria-hidden
                    className="absolute left-0 right-0 border-t border-outline-variant/60 pointer-events-none"
                    style={{
                      top: (i + 1) * metrics.slotHeight,
                      zIndex: 0,
                    }}
                  />
                ))}

                {/* Day-column separators */}
                {DAYS.slice(1).map((day, i) => (
                  <div
                    key={`vline-${day}`}
                    aria-hidden
                    className="absolute top-0 bottom-0 border-l border-outline-variant/60 pointer-events-none"
                    style={{
                      left: (i + 1) * metrics.dayWidth,
                      zIndex: 0,
                    }}
                  />
                ))}

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
                  const isForeign = readOnlyEntryIds?.has(entry.id) ?? false;

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
                      disabled={locked || !isDesktopLike || isForeign}
                      isForeign={isForeign}
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