import { useCallback, useState } from 'react';
import type {
  ColumnSlice,
  DrawingMode,
  EditingTarget,
  ProspectusPdfTable,
  RowBox,
  Selection,
  ColumnRole,
} from '../types';

interface UseRegionStateResult {
  tables: ProspectusPdfTable[];
  setTables: (tables: ProspectusPdfTable[]) => void;

  selection: Selection;
  setSelection: (s: Selection) => void;

  editing: EditingTarget;
  setEditing: (e: EditingTarget) => void;

  drawingMode: DrawingMode;
  setDrawingMode: (m: DrawingMode) => void;

  upsertTable: (table: ProspectusPdfTable) => void;
  removeTable: (tableId: string) => void;
  setRows: (tableId: string, rows: RowBox[]) => void;
  setColumns: (tableId: string, columns: ColumnSlice[]) => void;
  setRegion: (
    tableId: string,
    region: {
      pageIndex: number;
      xStart: number;
      xEnd: number;
      yStart: number;
      yEnd: number;
    },
  ) => void;
}

export function useRegionState(
  initial: ProspectusPdfTable[],
): UseRegionStateResult {
  const [tables, setTables] = useState<ProspectusPdfTable[]>(initial);
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [editing, setEditing] = useState<EditingTarget>({ kind: 'none' });
  const [drawingMode, setDrawingMode] = useState<DrawingMode>({ kind: 'idle' });

  const upsertTable = useCallback((table: ProspectusPdfTable) => {
    setTables((prev) => {
      const idx = prev.findIndex((t) => t.tableId === table.tableId);
      if (idx === -1) return [...prev, table];
      const next = [...prev];
      next[idx] = table;
      return next;
    });
  }, []);

  const removeTable = useCallback((tableId: string) => {
    setTables((prev) => prev.filter((t) => t.tableId !== tableId));
    setSelection((sel) =>
      sel.kind !== 'none' && sel.tableId === tableId
        ? { kind: 'none' }
        : sel,
    );
    setEditing((ed) =>
      ed.kind !== 'none' && ed.tableId === tableId ? { kind: 'none' } : ed,
    );
  }, []);

  const setRows = useCallback((tableId: string, rows: RowBox[]) => {
    setTables((prev) =>
      prev.map((t) => (t.tableId === tableId ? { ...t, rows } : t)),
    );
  }, []);

  const setColumns = useCallback(
    (tableId: string, columns: ColumnSlice[]) => {
      setTables((prev) =>
        prev.map((t) => (t.tableId === tableId ? { ...t, columns } : t)),
      );
    },
    [],
  );

  const setRegion = useCallback(
    (
      tableId: string,
      region: {
        pageIndex: number;
        xStart: number;
        xEnd: number;
        yStart: number;
        yEnd: number;
      },
    ) => {
      setTables((prev) =>
        prev.map((t) =>
          t.tableId === tableId
            ? {
                ...t,
                regionPageIndex: region.pageIndex,
                regionXStartPt: String(region.xStart),
                regionXEndPt: String(region.xEnd),
                regionYStartPt: String(region.yStart),
                regionYEndPt: String(region.yEnd),
              }
            : t,
        ),
      );
    },
    [],
  );

  return {
    tables,
    setTables,
    selection,
    setSelection,
    editing,
    setEditing,
    drawingMode,
    setDrawingMode,
    upsertTable,
    removeTable,
    setRows,
    setColumns,
    setRegion,
  };
}

export function makeDefaultColumns(
  xStart: number,
  xEnd: number,
): ColumnSlice[] {
  const weights = [0.12, 0.45, 0.15, 0.09, 0.09, 0.1];
  const roles: ColumnRole[] = ['code', 'title', 'prereq', 'lec', 'lab', 'total'];
  const total = xEnd - xStart;
  let cursor = xStart;
  return roles.map((role, i) => {
    const width = total * weights[i];
    const slice: ColumnSlice = {
      role,
      x_start_pt: cursor,
      x_end_pt: cursor + width,
    };
    cursor += width;
    return slice;
  });
}