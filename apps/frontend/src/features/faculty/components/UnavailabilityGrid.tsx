import { useCallback, useMemo, useRef, useState } from 'react';

export interface GridBlock {
  day: string;
  /** Minutes since midnight. */
  startMin: number;
  /** Minutes since midnight (exclusive). */
  endMin: number;
}

interface Props {
  blocks: GridBlock[];
  onChange: (next: GridBlock[]) => void;
  /** Whether the grid is interactive. */
  disabled?: boolean;
}

// ── Config ──
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const DAY_SHORT: Record<string, string> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
};

const RANGE_START = 7 * 60;   // 07:00
const RANGE_END = 19 * 60;    // 19:00
const CELL_MINUTES = 30;
const ROWS = (RANGE_END - RANGE_START) / CELL_MINUTES; // 24 rows

// ── Helpers ──

function cellStartMin(row: number): number {
  return RANGE_START + row * CELL_MINUTES;
}

function rowFromMinutes(min: number): number {
  return Math.floor((min - RANGE_START) / CELL_MINUTES);
}

function fmtRowLabel(row: number): string {
  const m = cellStartMin(row);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  // Show only on the hour to reduce noise.
  if (mm !== 0) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(mm).padStart(2, '0')} ${period}`;
}

/** Is the given cell covered by any block? */
function isCellCovered(day: string, row: number, blocks: GridBlock[]): boolean {
  const start = cellStartMin(row);
  const end = start + CELL_MINUTES;
  return blocks.some(
    (b) => b.day === day && start < b.endMin && b.startMin < end,
  );
}

/** Convert a rectangular selection into GridBlocks (one per day). */
function rectToBlocks(
  fromDay: string,
  fromRow: number,
  toDay: string,
  toRow: number,
): GridBlock[] {
  const fromIdx = DAYS.indexOf(fromDay as (typeof DAYS)[number]);
  const toIdx = DAYS.indexOf(toDay as (typeof DAYS)[number]);
  const [dayFrom, dayTo] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  const [rowFrom, rowTo] = fromRow <= toRow ? [fromRow, toRow] : [toRow, fromRow];

  const blocks: GridBlock[] = [];
  for (let d = dayFrom; d <= dayTo; d++) {
    blocks.push({
      day: DAYS[d],
      startMin: cellStartMin(rowFrom),
      endMin: cellStartMin(rowTo) + CELL_MINUTES,
    });
  }
  return blocks;
}

/** Merge adjacent/overlapping blocks on the same day. */
function mergeBlocks(blocks: GridBlock[]): GridBlock[] {
  const byDay = new Map<string, GridBlock[]>();
  for (const b of blocks) {
    const list = byDay.get(b.day) ?? [];
    list.push(b);
    byDay.set(b.day, list);
  }

  const merged: GridBlock[] = [];
  for (const [day, list] of byDay.entries()) {
    list.sort((a, b) => a.startMin - b.startMin);
    let current: GridBlock | null = null;
    for (const b of list) {
      if (!current) {
        current = { ...b };
      } else if (b.startMin <= current.endMin) {
        current.endMin = Math.max(current.endMin, b.endMin);
      } else {
        merged.push(current);
        current = { ...b };
      }
    }
    if (current) merged.push(current);
  }
  return merged;
}

// ── Component ──

export default function UnavailabilityGrid({
  blocks,
  onChange,
  disabled = false,
}: Props) {
  // Drag state
  const dragRef = useRef<{
    active: boolean;
    startDay: string;
    startRow: number;
    /** true = adding; false = erasing */
    adding: boolean;
  } | null>(null);

  const [hover, setHover] = useState<{
    day: string;
    row: number;
  } | null>(null);

  const covered = useMemo(() => {
    // Precompute coverage for fast render
    const map = new Map<string, boolean>();
    for (const day of DAYS) {
      for (let r = 0; r < ROWS; r++) {
        map.set(`${day}:${r}`, isCellCovered(day, r, blocks));
      }
    }
    return map;
  }, [blocks]);

  const cellsInRect = useMemo(() => {
    if (!dragRef.current?.active || !hover) return null;
    const { startDay, startRow } = dragRef.current;
    const rect = rectToBlocks(startDay, startRow, hover.day, hover.row);
    const set = new Set<string>();
    for (const b of rect) {
      const r0 = rowFromMinutes(b.startMin);
      const r1 = rowFromMinutes(b.endMin);
      for (let r = r0; r < r1; r++) set.add(`${b.day}:${r}`);
    }
    return set;
  }, [hover]);

  const onCellDown = useCallback(
    (day: string, row: number, e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      const alreadyOn = covered.get(`${day}:${row}`) === true;
      dragRef.current = {
        active: true,
        startDay: day,
        startRow: row,
        adding: !alreadyOn,
      };
      setHover({ day, row });
    },
    [covered, disabled],
  );

  const onCellEnter = useCallback(
    (day: string, row: number) => {
      if (!dragRef.current?.active) return;
      setHover({ day, row });
    },
    [],
  );

  const commitDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag?.active || !hover) {
      dragRef.current = null;
      setHover(null);
      return;
    }

    const rect = rectToBlocks(drag.startDay, drag.startRow, hover.day, hover.row);

    let next: GridBlock[];
    if (drag.adding) {
      next = mergeBlocks([...blocks, ...rect]);
    } else {
      // Erase: remove coverage in the rect
      next = [];
      for (const b of blocks) {
        // For each existing block, subtract each rectangle-day overlap
        const rectForDay = rect.find((r) => r.day === b.day);
        if (!rectForDay) {
          next.push(b);
          continue;
        }
        const overlapStart = Math.max(b.startMin, rectForDay.startMin);
        const overlapEnd = Math.min(b.endMin, rectForDay.endMin);
        if (overlapStart >= overlapEnd) {
          next.push(b);
          continue;
        }
        // Split the block into left and right remnants
        if (b.startMin < overlapStart) {
          next.push({ day: b.day, startMin: b.startMin, endMin: overlapStart });
        }
        if (b.endMin > overlapEnd) {
          next.push({ day: b.day, startMin: overlapEnd, endMin: b.endMin });
        }
      }
    }

    dragRef.current = null;
    setHover(null);
    onChange(next);
  }, [blocks, hover, onChange]);

  const onUp = useCallback(() => {
    commitDrag();
  }, [commitDrag]);

  return (
    <div
      className="select-none"
      onMouseUp={onUp}
      onMouseLeave={onUp}
      role="grid"
      aria-label="Weekly unavailability grid"
    >
      <div className="overflow-hidden border border-slate-200 rounded-lg">
        {/* Header */}
        <div
          className="grid bg-slate-50"
          style={{
            gridTemplateColumns: `56px repeat(${DAYS.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-2">
            Time
          </div>
          {DAYS.map((d) => (
            <div
              key={d}
              className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center py-2 border-l border-slate-200"
            >
              {DAY_SHORT[d]}
            </div>
          ))}
        </div>

        {/* Body */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `56px repeat(${DAYS.length}, minmax(0, 1fr))`,
          }}
        >
          {/* Time axis column */}
          <div className="bg-slate-50">
            {Array.from({ length: ROWS }).map((_, r) => (
              <div
                key={r}
                className="h-6 border-t border-slate-100 text-[9px] text-slate-400 font-mono text-right pr-2 leading-6"
              >
                {fmtRowLabel(r)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((day) => (
            <div key={day} className="border-l border-slate-200">
              {Array.from({ length: ROWS }).map((_, r) => {
                const isCovered = covered.get(`${day}:${r}`) === true;
                const isHover =
                  cellsInRect !== null && cellsInRect.has(`${day}:${r}`);
                const willAdd = dragRef.current?.adding === true;

                return (
                  <div
                    key={r}
                    role="gridcell"
                    aria-selected={isCovered}
                    onMouseDown={(e) => onCellDown(day, r, e)}
                    onMouseEnter={() => onCellEnter(day, r)}
                    className={[
                      'h-6 border-t border-slate-100 cursor-pointer',
                      isCovered
                        ? 'bg-[#5c1219]/85'
                        : 'bg-white hover:bg-[#5c1219]/5',
                      isHover
                        ? willAdd
                          ? 'bg-[#5c1219]/50'
                          : 'bg-rose-200'
                        : '',
                      disabled ? 'cursor-not-allowed opacity-60' : '',
                    ].join(' ')}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500">
        <span>
          Click + drag to select a range. Click a filled cell to erase.
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-[#5c1219]/85 rounded-sm" />
            Unavailable
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 border border-slate-200 bg-white rounded-sm" />
            Available
          </span>
        </span>
      </div>
    </div>
  );
}