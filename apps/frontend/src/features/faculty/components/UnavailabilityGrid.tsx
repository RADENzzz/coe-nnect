import { useCallback, useMemo, useRef, useState, useEffect } from 'react';

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

const PRESETS = [
  { label: 'Full Day', startMin: 7 * 60, endMin: 19 * 60 },
  { label: 'AM', startMin: 7 * 60, endMin: 12 * 60 },
  { label: 'PM', startMin: 13 * 60, endMin: 19 * 60 },
] as const;

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
  if (mm !== 0) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(mm).padStart(2, '0')} ${period}`;
}

function fmtRange(startMin: number, endMin: number): string {
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 || 12;
    return `${hh}:${String(mm).padStart(2, '0')} ${period}`;
  };
  return `${fmt(startMin)} – ${fmt(endMin)}`;
}

function isCellCovered(day: string, row: number, blocks: GridBlock[]): boolean {
  const start = cellStartMin(row);
  const end = start + CELL_MINUTES;
  return blocks.some(
    (b) => b.day === day && start < b.endMin && b.startMin < end,
  );
}

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
  const dragRef = useRef<{
    active: boolean;
    startDay: string;
    startRow: number;
    adding: boolean;
  } | null>(null);

  const [hover, setHover] = useState<{ day: string; row: number } | null>(null);
  const [history, setHistory] = useState<GridBlock[][]>([]);
  const [future, setFuture] = useState<GridBlock[][]>([]);

  // Keyboard focus
  const [focusCell, setFocusCell] = useState<{ day: string; row: number } | null>(null);

  const covered = useMemo(() => {
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

  const commit = useCallback(
    (next: GridBlock[]) => {
      setHistory((h) => [...h.slice(-19), blocks]);
      setFuture([]);
      onChange(next);
    },
    [blocks, onChange],
  );

  const onCellDown = useCallback(
    (day: string, row: number, e: React.MouseEvent | React.PointerEvent) => {
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
      setFocusCell({ day, row });
    },
    [covered, disabled],
  );

  const onCellEnter = useCallback((day: string, row: number) => {
    if (!dragRef.current?.active) return;
    setHover({ day, row });
  }, []);

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
      next = [];
      for (const b of blocks) {
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
    commit(next);
  }, [blocks, hover, commit]);

  const onUp = useCallback(() => {
    commitDrag();
  }, [commitDrag]);

  // Undo/redo
  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [blocks, ...f]);
    onChange(prev);
  }, [history, blocks, onChange]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, blocks]);
    onChange(next);
  }, [future, blocks, onChange]);

  // Apply preset to all days
  const applyPreset = useCallback(
    (startMin: number, endMin: number) => {
      const added: GridBlock[] = DAYS.map((day) => ({ day, startMin, endMin }));
      commit(mergeBlocks([...blocks, ...added]));
    },
    [blocks, commit],
  );

  const clearAll = useCallback(() => {
    if (blocks.length === 0) return;
    commit([]);
  }, [blocks, commit]);

  // Keyboard nav
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled || !focusCell) return;
      const { day, row } = focusCell;
      const dayIdx = DAYS.indexOf(day as (typeof DAYS)[number]);
      let newDay = dayIdx;
      let newRow = row;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          newRow = Math.max(0, row - 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          newRow = Math.min(ROWS - 1, row + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          newDay = Math.max(0, dayIdx - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          newDay = Math.min(DAYS.length - 1, dayIdx + 1);
          break;
        case ' ':
        case 'Enter': {
          e.preventDefault();
          const isCovered = covered.get(`${day}:${row}`) === true;
          if (isCovered) {
            const next = blocks.filter(
              (b) =>
                !(
                  b.day === day &&
                  cellStartMin(row) < b.endMin &&
                  b.startMin < cellStartMin(row) + CELL_MINUTES
                ),
            );
            commit(next);
          } else {
            commit(
              mergeBlocks([
                ...blocks,
                {
                  day,
                  startMin: cellStartMin(row),
                  endMin: cellStartMin(row) + CELL_MINUTES,
                },
              ]),
            );
          }
          return;
        }
        default:
          return;
      }
      setFocusCell({ day: DAYS[newDay], row: newRow });
    },
    [disabled, focusCell, covered, blocks, commit],
  );

  // Touch support via pointer events
  useEffect(() => {
    const handlePointerUp = () => {
      if (dragRef.current?.active) commitDrag();
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, [commitDrag]);

  const totalBlocks = blocks.length;

  return (
    <div className="select-none" role="grid" aria-label="Weekly unavailability grid">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.startMin, p.endMin)}
              disabled={disabled}
              className="px-2.5 py-1 text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:border-[#5c1219] hover:text-[#5c1219] transition disabled:opacity-50"
              title={`Add ${p.label} unavailability to all days`}
            >
              + {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={disabled || history.length === 0}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition disabled:opacity-30"
            title="Undo"
          >
            <Icon name="undo" size={14} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={disabled || future.length === 0}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition disabled:opacity-30"
            title="Redo"
          >
            <Icon name="redo" size={14} />
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled || totalBlocks === 0}
            className="px-2 py-1 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 rounded transition disabled:opacity-30"
            title="Clear all blocks"
          >
            Clear all
          </button>
        </div>
      </div>

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
          {/* Time axis */}
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
                const isFocused =
                  focusCell?.day === day && focusCell?.row === r;

                return (
                  <div
                    key={r}
                    role="gridcell"
                    tabIndex={isFocused ? 0 : -1}
                    aria-selected={isCovered}
                    onMouseDown={(e) => onCellDown(day, r, e)}
                    onMouseEnter={() => onCellEnter(day, r)}
                    onKeyDown={onKeyDown}
                    onFocus={() => setFocusCell({ day, row: r })}
                    title={
                      isCovered
                        ? `${day} ${fmtRange(cellStartMin(r), cellStartMin(r) + CELL_MINUTES)} — click to erase`
                        : `${day} ${fmtRange(cellStartMin(r), cellStartMin(r) + CELL_MINUTES)} — drag to mark unavailable`
                    }
                    className={[
                      'h-6 border-t border-slate-100 transition-colors',
                      isCovered
                        ? 'bg-[#5c1219]/85'
                        : 'bg-white hover:bg-[#5c1219]/5',
                      isHover
                        ? willAdd
                          ? 'bg-[#5c1219]/50'
                          : 'bg-rose-200'
                        : '',
                      isFocused ? 'ring-2 ring-inset ring-primary' : '',
                      disabled
                        ? 'cursor-not-allowed opacity-60'
                        : willAdd
                        ? 'cursor-crosshair'
                        : 'cursor-pointer',
                    ].join(' ')}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[10px] text-slate-500">
        <span>
          Drag to select. Click filled cells to erase. Arrow keys + Space for keyboard.
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

// Minimal Icon shim — replace with your real Icon import
function Icon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}