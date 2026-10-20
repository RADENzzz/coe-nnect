import { memo } from 'react';
import { useDroppable } from '@dnd-kit/react';
import clsx from 'clsx';
import type { DropCellData } from '../types';

interface Props {
  cell: DropCellData;
  isValidTarget: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

function DropCellBase({ cell, isValidTarget, x, y, width, height }: Props) {
  const { ref, isDropTarget } = useDroppable({
    id: cell.cellId,
    data: cell,
  });

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
      className={clsx(
        'transition-colors duration-100',
        isDropTarget &&
          isValidTarget &&
          'bg-emerald-500/20 ring-2 ring-inset ring-emerald-500/40',
        isDropTarget &&
          !isValidTarget &&
          'bg-red-500/20 ring-2 ring-inset ring-red-500/40',
        !isDropTarget && 'hover:bg-surface-container/50',
      )}
    />
  );
}

export const DropCell = memo(DropCellBase);