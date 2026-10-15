import { useCallback, useMemo, useRef, useState } from 'react';
import type { ColumnSlice, ColumnRole } from '../types';
import { COLUMN_COLORS, COLUMN_LABELS } from '../types';

interface ColumnSlicesProps {
  screenLeft: number;
  screenTop: number;
  screenWidth: number;
  screenHeight: number;
  zoom: number;
  regionXStart: number;
  regionXEnd: number;
  columns: ColumnSlice[];
  onChange: (columns: ColumnSlice[]) => void;
  onResetDefaults?: () => void;
  interactive: boolean;
  zIndex?: number;
}

const MIN_WIDTH_PT = 4;
const SNAP_PT = 0.5;

function snap(v: number): number {
  return Math.round(v / SNAP_PT) * SNAP_PT;
}

export default function ColumnSlices({
  screenLeft,
  screenTop,
  screenWidth,
  screenHeight,
  zoom,
  regionXStart,
  regionXEnd,
  columns,
  onChange,
  onResetDefaults,
  interactive,
  zIndex = 0,
}: ColumnSlicesProps) {
  const dragState = useRef<{
    edgeIndex: number;
    startX: number;
    initialColumns: ColumnSlice[];
  } | null>(null);

  const [hoverEdge, setHoverEdge] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...columns].sort((a, b) => a.x_start_pt - b.x_start_pt),
    [columns],
  );

  const pdfXToScreen = useCallback(
    (x: number) => (x - regionXStart) * zoom,
    [regionXStart, zoom],
  );

  const onPointerDownEdge = (
    edgeIndex: number,
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      edgeIndex,
      startX: e.clientX,
      initialColumns: sorted.map((c) => ({ ...c })),
    };
  };

  const onPointerMoveEdge = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current;
    if (!ds) return;
    e.stopPropagation();
    const deltaScreen = e.clientX - ds.startX;
    const deltaPdf = deltaScreen / zoom;

    const next = ds.initialColumns.map((c) => ({ ...c }));
    const i = ds.edgeIndex;
    if (i < 0 || i >= next.length - 1) return;

    const left = next[i];
    const right = next[i + 1];

    let newBoundary = snap(ds.initialColumns[i].x_end_pt + deltaPdf);
    const minBoundary = left.x_start_pt + MIN_WIDTH_PT;
    const maxBoundary = right.x_end_pt - MIN_WIDTH_PT;
    newBoundary = Math.max(minBoundary, Math.min(maxBoundary, newBoundary));

    left.x_end_pt = newBoundary;
    right.x_start_pt = newBoundary;

    onChange(next);
  };

  const onPointerUpEdge = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragState.current = null;
  };

  // Double-click a boundary → auto-center between neighbors (equalizes widths).
  const onDoubleClickEdge = (edgeIndex: number) => {
    if (!interactive) return;
    const next = sorted.map((c) => ({ ...c }));
    const i = edgeIndex;
    if (i < 0 || i >= next.length - 1) return;
    const left = next[i];
    const right = next[i + 1];
    const midpoint = (left.x_start_pt + right.x_end_pt) / 2;
    left.x_end_pt = snap(midpoint);
    right.x_start_pt = snap(midpoint);
    onChange(next);
  };

  const labelVisible = (width: number) => width >= 40;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: screenLeft,
        top: screenTop,
        width: screenWidth,
        height: screenHeight,
        zIndex,
      }}
    >
      {/* Column overlays with labels */}
      {sorted.map((col, i) => {
        const left = pdfXToScreen(col.x_start_pt);
        const right = pdfXToScreen(col.x_end_pt);
        const width = right - left;
        const color = COLUMN_COLORS[col.role];
        return (
          <div
            key={col.role}
            className="absolute top-0 bottom-0"
            style={{
              left,
              width,
              borderLeft: `2px solid ${color}`,
              borderRight:
                i === sorted.length - 1 ? `2px solid ${color}` : 'none',
              background: `${color}14`,
            }}
          >
            {labelVisible(width) && (
              <div
                className="absolute -top-6 left-0 right-0 text-center pointer-events-none overflow-hidden"
                title={COLUMN_LABELS[col.role]}
              >
                <span
                  className="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white whitespace-nowrap rounded-t"
                  style={{ background: color }}
                >
                  {COLUMN_LABELS[col.role]}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Resize handles — wider hit area, visible on hover/drag */}
      {interactive &&
        sorted.slice(0, -1).map((col, i) => {
          const boundary = pdfXToScreen(col.x_end_pt);
          const isHovered = hoverEdge === i;
          const isDragging =
            dragState.current?.edgeIndex === i;
          const active = isHovered || isDragging;
          return (
            <div
              key={`edge-${i}`}
              onPointerDown={(e) => onPointerDownEdge(i, e)}
              onPointerMove={onPointerMoveEdge}
              onPointerUp={onPointerUpEdge}
              onPointerCancel={onPointerUpEdge}
              onDoubleClick={() => onDoubleClickEdge(i)}
              onMouseEnter={() => setHoverEdge(i)}
              onMouseLeave={() =>
                setHoverEdge((curr) => (curr === i ? null : curr))
              }
              className="absolute top-0 bottom-0 pointer-events-auto"
              style={{
                left: boundary - 10,
                width: 20,
                cursor: 'col-resize',
                zIndex: 20,
              }}
              title="Drag to resize · Double-click to center"
            >
              {/* Visible 2px line, only when active */}
              <div
                className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 transition-all"
                style={{
                  width: active ? 3 : 2,
                  background: active ? '#5c1219' : 'rgba(0,0,0,0.4)',
                  boxShadow: active
                    ? '0 0 0 1px rgba(92,18,25,0.2)'
                    : 'none',
                }}
              />
              {/* Small grip dots when hovered */}
              {active && (
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 pointer-events-none"
                  aria-hidden
                >
                  <span
                    className="block w-1 h-1 rounded-full"
                    style={{ background: '#5c1219' }}
                  />
                  <span
                    className="block w-1 h-1 rounded-full"
                    style={{ background: '#5c1219' }}
                  />
                  <span
                    className="block w-1 h-1 rounded-full"
                    style={{ background: '#5c1219' }}
                  />
                </div>
              )}
            </div>
          );
        })}

      {/* Reset-to-defaults pill — only when interactive */}
      {interactive && onResetDefaults && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onResetDefaults();
          }}
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition pointer-events-auto z-30"
          title="Reset columns to default widths"
        >
          <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: 12 }}>
            restart_alt
          </span>
          Reset columns
        </button>
      )}
    </div>
  );
}