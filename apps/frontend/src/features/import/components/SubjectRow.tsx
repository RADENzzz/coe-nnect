import { useCallback, useRef } from 'react';
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

  const yToScreen = useCallback(
    (y: number) => (regionYEnd - y) * zoom,
    [regionYEnd, zoom],
  );

  const top = yToScreen(row.y_top_pt);
  const bottom = yToScreen(row.y_bottom_pt);
  const height = bottom - top;

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
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragRef.current;
    if (!ds) return;
    e.stopPropagation();
    const deltaPdf = (e.clientY - ds.startY) / zoom;

    const MIN_HEIGHT_PT = 4;
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
  };

  const cursorClass = editing ? 'cursor-move' : 'cursor-pointer';

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
      {/* Row number badge — click toggles edit */}
      <button
        type="button"
        onPointerDown={(e) => {
          // prevent overlay's deselect-all behavior
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

      {/* Row body */}
      <div
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
        className={`
          absolute inset-x-0 top-1 bottom-1
          border-2 transition-all
          ${cursorClass}
          ${
            editing
              ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
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
          className="absolute -right-9 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition shadow"
          title="Delete row"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            delete
          </span>
        </button>
      )}
    </div>
  );
}