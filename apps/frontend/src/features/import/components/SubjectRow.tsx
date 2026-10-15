import { useCallback, useRef, useState } from 'react';
import type { RowBox } from '../types';

interface SubjectRowProps {
  row: RowBox;
  rowNumber: number;
  regionScreenLeft: number;
  regionScreenTop: number;
  regionScreenWidth: number;
  regionYStart: number;
  regionYEnd: number;
  zoom: number;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onToggleEdit: () => void;
  onChange: (next: RowBox) => void;
  onDelete: () => void;
  zIndex?: number;
}

type DragKind = 'move' | 'resize-top' | 'resize-bottom';

/** Rows shorter than this (px) hide the number badge to avoid overlap. */
const TINY_ROW_THRESHOLD_PX = 22;

/** Delete button anchors inside the region if the region is narrower than this (px). */
const NARROW_REGION_THRESHOLD_PX = 80;

/** Minimum row height in PDF points. */
const MIN_HEIGHT_PT = 4;

/** Keyboard nudge step in PDF points. */
const NUDGE_STEP_PT = 0.5;
const NUDGE_STEP_FAST_PT = 5;

export default function SubjectRow({
  row,
  rowNumber,
  regionScreenLeft,
  regionScreenTop,
  regionScreenWidth,
  regionYStart,
  regionYEnd,
  zoom,
  selected,
  editing,
  onSelect,
  onToggleEdit,
  onChange,
  onDelete,
  zIndex = 0,
}: SubjectRowProps) {
  const dragRef = useRef<{
    kind: DragKind;
    startY: number;
    initial: RowBox;
  } | null>(null);

  const [dragging, setDragging] = useState(false);

  const yToScreen = useCallback(
    (y: number) => (regionYEnd - y) * zoom,
    [regionYEnd, zoom],
  );

  const top = yToScreen(row.y_top_pt);
  const bottom = yToScreen(row.y_bottom_pt);
  const height = bottom - top;

  // ── Derived presentation flags ──
  const isTinyRow = height < TINY_ROW_THRESHOLD_PX;
  const isNarrowRegion = regionScreenWidth < NARROW_REGION_THRESHOLD_PX;
  const hideBadge = isTinyRow && !editing && !selected;

  const beginDrag = (
    kind: DragKind,
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!editing) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      startY: e.clientY,
      initial: { ...row },
    };
    setDragging(true);
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragRef.current;
    if (!ds) return;
    e.stopPropagation();
    const deltaPdf = (e.clientY - ds.startY) / zoom;

    const clampRegionLow = Math.min(regionYStart, regionYEnd);
    const clampRegionHigh = Math.max(regionYStart, regionYEnd);

    if (ds.kind === 'move') {
      const deltaY = -deltaPdf;
      let newTop = ds.initial.y_top_pt + deltaY;
      let newBottom = ds.initial.y_bottom_pt + deltaY;

      if (newBottom < clampRegionLow) {
        const shift = clampRegionLow - newBottom;
        newBottom += shift;
        newTop += shift;
      }
      if (newTop > clampRegionHigh) {
        const shift = newTop - clampRegionHigh;
        newBottom -= shift;
        newTop -= shift;
      }

      onChange({ ...row, y_top_pt: newTop, y_bottom_pt: newBottom });
    } else if (ds.kind === 'resize-top') {
      const deltaY = -deltaPdf;
      let newTop = ds.initial.y_top_pt + deltaY;
      newTop = Math.min(clampRegionHigh, newTop);
      newTop = Math.max(ds.initial.y_bottom_pt + MIN_HEIGHT_PT, newTop);
      onChange({ ...row, y_top_pt: newTop });
    } else {
      const deltaY = -deltaPdf;
      let newBottom = ds.initial.y_bottom_pt + deltaY;
      newBottom = Math.max(clampRegionLow, newBottom);
      newBottom = Math.min(ds.initial.y_top_pt - MIN_HEIGHT_PT, newBottom);
      onChange({ ...row, y_bottom_pt: newBottom });
    }
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setDragging(false);
  };

  // ── Keyboard nudge ──
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editing) return;
    const step = e.shiftKey ? NUDGE_STEP_FAST_PT : NUDGE_STEP_PT;
    let handled = true;

    switch (e.key) {
      case 'ArrowUp':
        // Move up in PDF space = increase y_top and y_bottom
        onChange({
          ...row,
          y_top_pt: Math.min(regionYEnd, row.y_top_pt + step),
          y_bottom_pt: Math.min(
            regionYEnd,
            row.y_bottom_pt + step,
          ),
        });
        break;
      case 'ArrowDown':
        onChange({
          ...row,
          y_top_pt: Math.max(regionYStart, row.y_top_pt - step),
          y_bottom_pt: Math.max(regionYStart, row.y_bottom_pt - step),
        });
        break;
      case 'Delete':
      case 'Backspace':
        onDelete();
        break;
      case 'Escape':
        onToggleEdit();
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  const cursorClass = editing
    ? dragging
      ? 'cursor-grabbing'
      : 'cursor-grab'
    : 'cursor-pointer';

  // ── Delete button anchor logic ──
  // Prefer outside-right (default). If the region is narrow, anchor
  // inside the top-right corner instead so it's never off-screen.
  const deleteButtonStyle: React.CSSProperties = isNarrowRegion
    ? { right: 4, top: 4, transform: 'none' }
    : {
        right: -32,
        top: '50%',
        transform: 'translateY(-50%)',
      };

  return (
    <div
      className="absolute"
      style={{
        left: regionScreenLeft,
        top: regionScreenTop + top,
        width: regionScreenWidth,
        height,
        zIndex,
      }}
    >
      {/* Row number badge — hidden on tiny rows unless selected/editing */}
      {!hideBadge && (
        <button
          type="button"
          onPointerDown={(e) => {
            // Prevent overlay's deselect-all behavior
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            onToggleEdit();
          }}
          className={`
            absolute top-1/2 -translate-y-1/2 -left-8 w-6 h-6 rounded-full
            text-[10px] font-bold flex items-center justify-center
            transition shadow-sm
            ${
              editing
                ? 'bg-primary text-on-primary ring-2 ring-primary/30'
                : selected
                ? 'bg-primary/80 text-on-primary'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }
          `}
          title={
            editing
              ? `Row ${rowNumber} — editing (click to lock)`
              : `Row ${rowNumber} — click to edit`
          }
        >
          {rowNumber}
        </button>
      )}

      {/* Row body */}
      <div
        role="button"
        tabIndex={editing ? 0 : -1}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect();
          if (editing) beginDrag('move', e);
        }}
        onClick={(e) => {
          // Row body click also enters edit mode (unless already editing)
          e.stopPropagation();
          if (!editing) onToggleEdit();
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        className={`
          absolute inset-x-0 top-1 bottom-1
          border-2 transition-all outline-none
          ${cursorClass}
          focus-visible:ring-2 focus-visible:ring-primary/40
          ${
            editing
              ? dragging
                ? 'border-primary bg-primary/20 ring-1 ring-primary/40'
                : 'border-primary bg-primary/10 ring-1 ring-primary/30'
              : selected
              ? 'border-primary/60 bg-primary/5'
              : 'border-slate-300 bg-transparent hover:border-slate-400 hover:bg-slate-100/40'
          }
        `}
      />

      {/* Top resize handle (only in edit mode) */}
      {editing && (
        <div
          onPointerDown={(e) => beginDrag('resize-top', e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/40 bg-primary/20"
          aria-hidden
        />
      )}

      {/* Bottom resize handle (only in edit mode) */}
      {editing && (
        <div
          onPointerDown={(e) => beginDrag('resize-bottom', e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/40 bg-primary/20"
          aria-hidden
        />
      )}

      {/* Delete (only in edit mode) */}
      {editing && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute w-7 h-7 rounded-md bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition shadow z-30"
          style={deleteButtonStyle}
          title="Delete row"
          aria-label={`Delete row ${rowNumber}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            delete
          </span>
        </button>
      )}
    </div>
  );
}