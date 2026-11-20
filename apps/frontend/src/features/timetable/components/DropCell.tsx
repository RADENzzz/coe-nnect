import { memo, useState } from 'react';
import { useDroppable } from '@dnd-kit/react';
import clsx from 'clsx';
import {
  PLOT_DRAG_MIME,
  type DropCellData,
  type ExternalPlotDragPayload,
} from '../types';

interface Props {
  cell: DropCellData;
  isValidTarget: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Accept an unscheduled subject dragged from the focus-mode palette. */
  onExternalDrop?: (
    cell: DropCellData,
    payload: ExternalPlotDragPayload,
  ) => void;
}

function DropCellBase({
  cell,
  isValidTarget,
  x,
  y,
  width,
  height,
  onExternalDrop,
}: Props) {
  const { ref, isDropTarget } = useDroppable({
    id: cell.cellId,
    data: cell,
  });
  const [externalOver, setExternalOver] = useState(false);

  const carriesPlotPayload = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(PLOT_DRAG_MIME);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
      }}
      onDragOver={(event) => {
        if (!onExternalDrop || !carriesPlotPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setExternalOver(true);
      }}
      onDragLeave={() => setExternalOver(false)}
      onDrop={(event) => {
        if (!onExternalDrop) return;
        const raw = event.dataTransfer.getData(PLOT_DRAG_MIME);
        setExternalOver(false);
        if (!raw) return;
        event.preventDefault();
        try {
          onExternalDrop(cell, JSON.parse(raw) as ExternalPlotDragPayload);
        } catch {
          // A malformed payload is ignored; the palette always writes JSON.
        }
      }}
      className={clsx(
        'transition-colors duration-100',
        externalOver && 'bg-primary/15 ring-2 ring-inset ring-primary/60',
        !externalOver &&
          isDropTarget &&
          isValidTarget &&
          'bg-emerald-500/20 ring-2 ring-inset ring-emerald-500/40',
        !externalOver &&
          isDropTarget &&
          !isValidTarget &&
          'bg-red-500/20 ring-2 ring-inset ring-red-500/40',
        !externalOver && !isDropTarget && 'hover:bg-surface-container/50',
      )}
    />
  );
}

export const DropCell = memo(DropCellBase);