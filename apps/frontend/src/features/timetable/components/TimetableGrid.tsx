import { useMemo, useState, useCallback } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { ClassBlock } from './ClassBlock';
import { DropCell } from './DropCell';
import { TimeAxis } from './TimeAxis';
import { DayHeaders } from './DayHeaders';
import type { ScheduleEntry, DropCellData } from '../types';
import {
  DAYS,
  generateTimeSlots,
  timesOverlap,
  timeToMinutes,
  minutesToTime,
} from '../utils/time.util';
import {
  CELL_HEIGHT_PX,
  DAY_WIDTH_PX,
  TIME_AXIS_WIDTH_PX,
  getGridHeightPx,
} from '../utils/grid-layout.util';

interface Props {
  entries: ScheduleEntry[];
  onEntryMove?: (
    entryId: string,
    newDay: string,
    newStartTime: string,
  ) => void;
  onEntryClick?: (entry: ScheduleEntry) => void;
}

export default function TimetableGrid({
  entries,
  onEntryMove,
  onEntryClick,
}: Props) {
  const [validCells, setValidCells] = useState<Set<string>>(new Set());

  // ── Memoize cell layout ──
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

  // ── Memoize cell positions ──
  const cellElements = useMemo(() => {
    const slotsPerDay = allCells.length / DAYS.length;
    return allCells.map((cell, idx) => {
      const dayIndex = DAYS.indexOf(cell.day);
      const slotIndex = idx % slotsPerDay;
      return {
        cell,
        x: dayIndex * DAY_WIDTH_PX,
        y: slotIndex * CELL_HEIGHT_PX,
        width: DAY_WIDTH_PX,
        height: CELL_HEIGHT_PX,
      };
    });
  }, [allCells]);

  // ── Compute valid drop cells when drag starts ──
  const computeValidCells = useCallback(
    (entry: ScheduleEntry): Set<string> => {
      const valid = new Set<string>();
      const duration =
        timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);

      for (const cell of allCells) {
        const cellStart = timeToMinutes(cell.startTime);
        const cellEnd = cellStart + duration;

        if (cellEnd > timeToMinutes('19:00')) continue;

        const endTimeStr = minutesToTime(cellEnd);

        const overlaps = entries.some((e) => {
          if (e.id === entry.id) return false;
          if (e.day !== cell.day) return false;
          return timesOverlap(
            cell.startTime,
            endTimeStr,
            e.startTime,
            e.endTime,
          );
        });

        if (!overlaps) valid.add(cell.cellId);
      }
      return valid;
    },
    [allCells, entries],
  );

  // ── Drag handlers (v7 API) ──
  const handleDragStart = useCallback(
    (event: any) => {
      const entry = event.operation?.source?.data?.entry as
        | ScheduleEntry
        | undefined;
      if (!entry) return;
      setValidCells(computeValidCells(entry));
    },
    [computeValidCells],
  );

  const handleDragEnd = useCallback(
    (event: any) => {
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
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-variant overflow-auto">
        <div style={{ marginLeft: TIME_AXIS_WIDTH_PX }}>
          <DayHeaders />
        </div>

        <div className="flex relative">
          <div
            style={{
              width: TIME_AXIS_WIDTH_PX,
              height: getGridHeightPx(),
            }}
            className="relative shrink-0"
          >
            <TimeAxis />
          </div>

          <div
            className="relative flex-1"
            style={{
              width: DAYS.length * DAY_WIDTH_PX,
              height: getGridHeightPx(),
            }}
          >
            {cellElements.map(({ cell, x, y, width, height }) => (
              <DropCell
                key={cell.cellId}
                cell={cell}
                isValidTarget={validCells.has(cell.cellId)}
                x={x}
                y={y}
                width={width}
                height={height}
              />
            ))}

            {entries.map((entry) => (
              <ClassBlock
                key={entry.id}
                entry={entry}
                dayIndex={DAYS.indexOf(entry.day)}
                onClick={onEntryClick}
              />
            ))}

            {DAYS.map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: i * DAY_WIDTH_PX,
                  top: 0,
                  bottom: 0,
                  width: 1,
                }}
                className="bg-surface-variant pointer-events-none"
              />
            ))}
          </div>
        </div>
      </div>
    </DragDropProvider>
  );
}