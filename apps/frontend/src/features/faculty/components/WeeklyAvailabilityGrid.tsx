import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/ui/Icon';

export interface GridBlock {
  day: string;
  /** Minutes since midnight. */
  startMin: number;
  /** Minutes since midnight (exclusive). */
  endMin: number;
}

export type GridVariant = 'unavailable' | 'preferred';

interface Props {
  blocks: GridBlock[];
  onChange: (next: GridBlock[]) => void;
  /** Persisted blocks — rendered as solid (non-draft) cells. */
  savedBlocks?: GridBlock[];
  /** Locked blocks (e.g. IDP) — rendered amber, not interactive. */
  lockedBlocks?: GridBlock[];
  /**
   * Non-interactive overlay blocks. The other layer of the faculty's
   * schedule data, shown as context.
   *   - In the Preferences grid: unavailability — rendered as a gray hatch.
   *   - In the Unavailability grid: preferences — rendered as a hollow
   *     blue outline (since the primary state is red).
   */
  contextBlocks?: GridBlock[];
  /** Visual + semantic variant. */
  variant?: GridVariant;
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

const RANGE_START = 7 * 60; // 07:00
const RANGE_END = 19 * 60; // 19:00
const CELL_MINUTES = 30;
const ROWS = (RANGE_END - RANGE_START) / CELL_MINUTES; // 24 rows

const PRESETS = [
  { label: 'Full Day', startMin: 7 * 60, endMin: 19 * 60 },
  { label: 'AM', startMin: 7 * 60, endMin: 12 * 60 },
  { label: 'PM', startMin: 13 * 60, endMin: 19 * 60 },
] as const;

// Hatched gray pattern — used for context blocks in the Preferences grid.
const CONTEXT_HATCH_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, #e2e8f0 0 4px, #f8fafc 4px 8px)',
};

/**
 * Stable empty-array reference. Without this, the default `[]` prop creates
 * a fresh array on every render, which invalidates the `saved`/`locked`/
 * `context` useMemo caches and causes 3 × 144 map writes per render.
 */
const EMPTY_BLOCKS: GridBlock[] = [];

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

// ── Visual tokens per variant ──
const VARIANT_TOKENS: Record<
  GridVariant,
  {
    saved: string;
    savedRing: string;
    draft: string;
    draftRing: string;
    locked: string;
    lockedRing: string;
    legendSaved: string;
    legendDraft: string;
    legendLocked: string;
    label: string;
    contextLabel: string;
    contextIcon: string;
  }
> = {
  unavailable: {
    saved: 'bg-rose-500/90 hover:bg-rose-600',
    savedRing: '',
    draft: 'bg-rose-400/60',
    draftRing: 'ring-1 ring-inset ring-rose-600',
    locked: 'bg-amber-400/80',
    lockedRing: 'ring-1 ring-inset ring-amber-600',
    legendSaved: 'bg-rose-500/90',
    legendDraft: 'bg-rose-400/60 ring-1 ring-inset ring-rose-600',
    legendLocked: 'bg-amber-400/80 ring-1 ring-inset ring-amber-600',
    label: 'Unavailable',
    contextLabel: 'Preferred (read-only)',
    contextIcon: 'event_available',
  },
  preferred: {
    saved: 'bg-blue-500/90 hover:bg-blue-600',
    savedRing: '',
    draft: 'bg-blue-400/60',
    draftRing: 'ring-1 ring-inset ring-blue-600',
    locked: 'bg-amber-400/80',
    lockedRing: 'ring-1 ring-inset ring-amber-600',
    legendSaved: 'bg-blue-500/90',
    legendDraft: 'bg-blue-400/60 ring-1 ring-inset ring-blue-600',
    legendLocked: 'bg-amber-400/80 ring-1 ring-inset ring-amber-600',
    label: 'Preferred',
    contextLabel: 'Unavailable (read-only)',
    contextIcon: 'block',
  },
};

// ── Memoized grid cell ──
//
// Re-renders only when one of its primitive props changes, so moving the
// mouse across the grid re-renders 1–2 cells instead of all 144.
// Also drops the per-cell `transition-colors` class, which was forcing the
// CPU to repaint on every frame of a hover/drag transition (the primary
// cause of lag when the browser's GPU acceleration is off).

interface GridCellProps {
  day: string;
  row: number;
  isCovered: boolean;
  isSaved: boolean;
  isLocked: boolean;
  isContext: boolean;
  isHover: boolean;
  willAdd: boolean;
  isFocused: boolean;
  disabled: boolean;
  variant: GridVariant;
  onCellDown: (day: string, row: number, e: React.MouseEvent) => void;
  onCellEnter: (day: string, row: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocusCell: (day: string, row: number) => void;
}

const GridCell = React.memo(function GridCell({
  day,
  row,
  isCovered,
  isSaved,
  isLocked,
  isContext,
  isHover,
  willAdd,
  isFocused,
  disabled,
  variant,
  onCellDown,
  onCellEnter,
  onKeyDown,
  onFocusCell,
}: GridCellProps) {
  const tokens = VARIANT_TOKENS[variant];
  const cellStart = cellStartMin(row);
  const cellEnd = cellStart + CELL_MINUTES;

  let cellClass = 'bg-white hover:bg-slate-50';
  let extraStyle: React.CSSProperties = {};

  if (isLocked) {
    cellClass = tokens.locked;
  } else if (isCovered) {
    cellClass = isSaved ? tokens.saved : tokens.draft;
  } else if (isContext) {
    if (variant === 'preferred') {
      cellClass = 'bg-transparent';
      extraStyle = CONTEXT_HATCH_STYLE;
    } else {
      cellClass = 'bg-transparent ring-1 ring-inset ring-blue-500';
    }
  }

  if (isHover && !isLocked && !isContext) {
    cellClass = willAdd
      ? 'bg-emerald-400/60 ring-1 ring-inset ring-emerald-600'
      : 'bg-rose-300/70 ring-1 ring-inset ring-rose-500';
  }

  const ringClass = isLocked
    ? tokens.lockedRing
    : isCovered && !isSaved
    ? tokens.draftRing
    : '';

  const label = isLocked
    ? `${day} ${fmtRange(cellStart, cellEnd)} — locked (IDP)`
    : isContext && !isCovered
    ? `${day} ${fmtRange(cellStart, cellEnd)} — ${tokens.contextLabel}`
    : isCovered
    ? `${day} ${fmtRange(cellStart, cellEnd)} — ${tokens.label}${isSaved ? ' (saved)' : ' (unsaved)'}`
    : `${day} ${fmtRange(cellStart, cellEnd)} — available`;

  return (
    <div
      role="gridcell"
      tabIndex={isFocused ? 0 : -1}
      aria-selected={isCovered}
      aria-disabled={isContext || isLocked}
      aria-label={label}
      onMouseDown={(e) => onCellDown(day, row, e)}
      onMouseEnter={() => onCellEnter(day, row)}
      onKeyDown={onKeyDown}
      onFocus={() => onFocusCell(day, row)}
      style={extraStyle}
      className={[
        'relative h-6 border-t border-slate-100',
        cellClass,
        ringClass,
        isFocused ? 'ring-2 ring-inset ring-primary' : '',
        disabled || isLocked || isContext ? 'cursor-not-allowed' : 'cursor-pointer',
        disabled && !isContext && !isLocked ? 'opacity-60' : '',
      ].join(' ')}
    >
      {isSaved && !isHover && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-1 h-1 rounded-full bg-white/90 shadow-sm" />
        </span>
      )}
      {isLocked && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-amber-900">
          <Icon name="lock" size={10} />
        </span>
      )}
      {isContext && !isCovered && !isLocked && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-500">
          <Icon name={tokens.contextIcon} size={9} />
        </span>
      )}
    </div>
  );
});

// ── Component ──

export default function WeeklyAvailabilityGrid({
  blocks,
  onChange,
  savedBlocks = EMPTY_BLOCKS,
  lockedBlocks = EMPTY_BLOCKS,
  contextBlocks = EMPTY_BLOCKS,
  variant = 'unavailable',
  disabled = false,
}: Props) {
  const tokens = VARIANT_TOKENS[variant];

  const dragRef = useRef<{
    active: boolean;
    startDay: string;
    startRow: number;
    adding: boolean;
    hasMoved: boolean;
  } | null>(null);

  const [hover, setHover] = useState<{ day: string; row: number } | null>(null);
  const [history, setHistory] = useState<GridBlock[][]>([]);
  const [future, setFuture] = useState<GridBlock[][]>([]);
  const [focusCell, setFocusCell] = useState<{ day: string; row: number } | null>(null);

  // ── Drag tooltip plumbing ──
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const covered = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const day of DAYS) {
      for (let r = 0; r < ROWS; r++) {
        map.set(`${day}:${r}`, isCellCovered(day, r, blocks));
      }
    }
    return map;
  }, [blocks]);

  const saved = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const day of DAYS) {
      for (let r = 0; r < ROWS; r++) {
        map.set(`${day}:${r}`, isCellCovered(day, r, savedBlocks));
      }
    }
    return map;
  }, [savedBlocks]);

  const locked = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const day of DAYS) {
      for (let r = 0; r < ROWS; r++) {
        map.set(`${day}:${r}`, isCellCovered(day, r, lockedBlocks));
      }
    }
    return map;
  }, [lockedBlocks]);

  const context = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const day of DAYS) {
      for (let r = 0; r < ROWS; r++) {
        map.set(`${day}:${r}`, isCellCovered(day, r, contextBlocks));
      }
    }
    return map;
  }, [contextBlocks]);

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

  // Bail out when the value is unchanged — otherwise re-entering the same
  // cell allocates a new object and forces a full re-render for nothing.
  const setHoverStable = useCallback((day: string, row: number) => {
    setHover((prev) =>
      prev?.day === day && prev?.row === row ? prev : { day, row },
    );
  }, []);

  const setFocusCellStable = useCallback((day: string, row: number) => {
    setFocusCell((prev) =>
      prev?.day === day && prev?.row === row ? prev : { day, row },
    );
  }, []);

  // Track cursor for the tooltip without touching React state per pixel.
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!dragRef.current?.active) return;
      mouseRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (tooltipRef.current) {
          const { x, y } = mouseRef.current;
          tooltipRef.current.style.transform = `translate(${x + 16}px, ${y + 16}px)`;
        }
      });
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onCellDown = useCallback(
    (day: string, row: number, e: React.MouseEvent | React.PointerEvent) => {
      if (disabled) return;
      if (locked.get(`${day}:${row}`)) return;
      if (context.get(`${day}:${row}`)) return;
      e.preventDefault();
      mouseRef.current = { x: e.clientX, y: e.clientY };
      const alreadyOn = covered.get(`${day}:${row}`) === true;
      dragRef.current = {
        active: true,
        startDay: day,
        startRow: row,
        adding: !alreadyOn,
        hasMoved: false,
      };
      setHoverStable(day, row);
      setFocusCellStable(day, row);
    },
    [covered, disabled, locked, context, setHoverStable, setFocusCellStable],
  );

  const onCellEnter = useCallback(
    (day: string, row: number) => {
      if (!dragRef.current?.active) return;
      if (context.get(`${day}:${row}`)) return;
      if (day !== dragRef.current.startDay || row !== dragRef.current.startRow) {
        dragRef.current.hasMoved = true;
      }
      setHoverStable(day, row);
    },
    [context, setHoverStable],
  );

  const commitDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag?.active) {
      setHover(null);
      return;
    }

    if (!drag.hasMoved) {
      const { startDay, startRow } = drag;
      const cellStart = cellStartMin(startRow);
      const cellEnd = cellStart + CELL_MINUTES;

      if (drag.adding) {
        if (
          !locked.get(`${startDay}:${startRow}`) &&
          !context.get(`${startDay}:${startRow}`)
        ) {
          commit(
            mergeBlocks([
              ...blocks,
              { day: startDay, startMin: cellStart, endMin: cellEnd },
            ]),
          );
        }
      } else {
        const next: GridBlock[] = [];
        for (const b of blocks) {
          if (b.day !== startDay) {
            next.push(b);
            continue;
          }
          const overlapStart = Math.max(b.startMin, cellStart);
          const overlapEnd = Math.min(b.endMin, cellEnd);
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
        commit(next);
      }
      dragRef.current = null;
      setHover(null);
      return;
    }

    if (!hover) {
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
  }, [blocks, hover, commit, locked, context]);

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
          if (locked.get(`${day}:${row}`)) return;
          if (context.get(`${day}:${row}`)) return;
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
      setFocusCellStable(DAYS[newDay], newRow);
    },
    [disabled, focusCell, covered, blocks, commit, locked, context, setFocusCellStable],
  );

  useEffect(() => {
    const handlePointerUp = () => {
      if (dragRef.current?.active) commitDrag();
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, [commitDrag]);

  const willAdd = dragRef.current?.adding === true;
  const totalBlocks = blocks.length;

  // ── Drag-preview data ──
  // Recomputed on every hover change during a drag (bounded by cell
  // boundaries, not pixels), so it stays cheap even without memoization.
  const dragInfo = (() => {
    if (!dragRef.current?.active || !dragRef.current?.hasMoved || !hover) {
      return null;
    }
    const { startDay, startRow, adding } = dragRef.current;
    const rect = rectToBlocks(startDay, startRow, hover.day, hover.row);
    if (rect.length === 0) return null;

    let startMin = Infinity;
    let endMin = -Infinity;
    for (const b of rect) {
      if (b.startMin < startMin) startMin = b.startMin;
      if (b.endMin > endMin) endMin = b.endMin;
    }

    const firstDay = rect[0].day;
    const lastDay = rect[rect.length - 1].day;
    const daysLabel =
      rect.length === 1
        ? firstDay
        : `${DAY_SHORT[firstDay]} – ${DAY_SHORT[lastDay]} · ${rect.length} days`;

    return {
      startMin,
      endMin,
      daysLabel,
      willAdd: adding,
    };
  })();
  const hasTooltip = !!dragInfo;

  // Snap the tooltip to the cursor synchronously on first appearance to
  // avoid a one-frame flash at (0,0). After that the pointermove handler
  // owns the transform.
  useLayoutEffect(() => {
    if (!hasTooltip || !tooltipRef.current) return;
    const { x, y } = mouseRef.current;
    tooltipRef.current.style.transform = `translate(${x + 16}px, ${y + 16}px)`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTooltip]);

  return (
    <div className="select-none" role="grid" aria-label="Weekly availability grid">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.startMin, p.endMin)}
              disabled={disabled}
              className="px-2.5 py-1 text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:border-primary hover:text-primary transition disabled:opacity-50"
              title={`Add ${p.label} block to all days`}
            >
              + {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={disabled || history.length === 0}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition disabled:opacity-30"
            title="Undo"
            aria-label="Undo"
          >
            <Icon name="undo" size={14} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={disabled || future.length === 0}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition disabled:opacity-30"
            title="Redo"
            aria-label="Redo"
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

      {/*
        Layout + paint containment tells the CPU rasterizer that this
        subtree cannot affect layout outside itself. Big win for hover/drag
        smoothness when hardware acceleration is disabled.
      */}
      <div
        className="overflow-hidden border border-slate-200 rounded-lg"
        style={{ contain: 'layout paint' }}
      >
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
                const key = `${day}:${r}`;
                return (
                  <GridCell
                    key={r}
                    day={day}
                    row={r}
                    isCovered={covered.get(key) === true}
                    isSaved={saved.get(key) === true}
                    isLocked={locked.get(key) === true}
                    isContext={context.get(key) === true}
                    isHover={cellsInRect !== null && cellsInRect.has(key)}
                    willAdd={willAdd}
                    isFocused={focusCell?.day === day && focusCell?.row === r}
                    disabled={disabled}
                    variant={variant}
                    onCellDown={onCellDown}
                    onCellEnter={onCellEnter}
                    onKeyDown={onKeyDown}
                    onFocusCell={setFocusCellStable}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend + help */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[10px] text-slate-500">
        <span>
          <strong>Click</strong> to toggle • <strong>Drag</strong> to mark a range •{' '}
          <strong>Arrow keys + Space</strong> for keyboard.
        </span>
        <span className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm ${tokens.legendSaved}`} />
            Saved
          </span>
          <span className="inline-flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm ${tokens.legendDraft}`} />
            Unsaved
          </span>
          {lockedBlocks.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded-sm ${tokens.legendLocked}`} />
              Locked (IDP)
            </span>
          )}
          {contextBlocks.length > 0 && (
            <span className="inline-flex items-center gap-1">
              {variant === 'preferred' ? (
                <span
                  className="inline-block w-3 h-3 rounded-sm border border-slate-300"
                  style={CONTEXT_HATCH_STYLE}
                />
              ) : (
                <span className="inline-block w-3 h-3 rounded-sm ring-1 ring-inset ring-blue-500" />
              )}
              {tokens.contextLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 border border-slate-200 bg-white rounded-sm" />
            Available
          </span>
        </span>
      </div>

      {/* ── Floating drag-preview tooltip ── */}
      {hasTooltip &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed top-0 left-0 z-[300] pointer-events-none"
            style={{ willChange: 'transform' }}
          >
            <div
              className={`rounded-lg shadow-2xl px-3 py-2 text-white text-xs ${
                dragInfo!.willAdd ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold whitespace-nowrap">
                <Icon name="schedule" size={12} />
                {fmtRange(dragInfo!.startMin, dragInfo!.endMin)}
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[10px] opacity-90 whitespace-nowrap">
                <Icon name="calendar_today" size={10} />
                {dragInfo!.daysLabel}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}