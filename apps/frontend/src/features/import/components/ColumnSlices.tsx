import { useCallback, useRef } from 'react';
import type { ColumnSlice } from '../types';
import { COLUMN_COLORS } from '../types';

interface ColumnSlicesProps {
  screenLeft: number;
  screenTop: number;
  screenWidth: number;
  screenHeight: number;
  zoom: number;
  regionXStart: number;
  columns: ColumnSlice[];
  onChange: (columns: ColumnSlice[]) => void;
  interactive: boolean;
  zIndex?: number;
}

export default function ColumnSlices({
  screenLeft,
  screenTop,
  screenWidth,
  screenHeight,
  zoom,
  regionXStart,
  columns,
  onChange,
  interactive,
  zIndex = 0,
}: ColumnSlicesProps) {
  const dragState = useRef<{
    edgeIndex: number;
    startX: number;
    initialColumns: ColumnSlice[];
  } | null>(null);

  const sorted = [...columns].sort((a, b) => a.x_start_pt - b.x_start_pt);

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
    const MIN_WIDTH_PT = 4;
    const i = ds.edgeIndex;
    if (i < 0 || i >= next.length - 1) return;

    const left = next[i];
    const right = next[i + 1];

    let newBoundary = ds.initialColumns[i].x_end_pt + deltaPdf;
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
          />
        );
      })}

      {interactive &&
        sorted.slice(0, -1).map((col, i) => {
          const boundary = pdfXToScreen(col.x_end_pt);
          return (
            <div
              key={`edge-${i}`}
              onPointerDown={(e) => onPointerDownEdge(i, e)}
              onPointerMove={onPointerMoveEdge}
              onPointerUp={onPointerUpEdge}
              onPointerCancel={onPointerUpEdge}
              className="absolute top-0 bottom-0 pointer-events-auto"
              style={{
                left: boundary - 6,
                width: 12,
                cursor: 'col-resize',
                zIndex: 20,
              }}
            >
              <div
                className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5"
                style={{ background: 'rgba(0,0,0,0.4)' }}
              />
            </div>
          );
        })}
    </div>
  );
}