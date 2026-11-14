import type {
  ColumnRole,
  ProspectusPdfTable,
  RowBox,
} from '../types';
import { COLUMN_ORDER } from '../types';
import type { TextItem } from '../hooks/usePdfTextLayer';
import { extractTextInRect } from '../hooks/useCellExtraction';

export type RowMoveDirection = 'up' | 'down';

export function makeRowId(): string {
  return `r_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Rows are stored unordered; the UI always reads them top-down. */
export function sortRowsTopDown(rows: RowBox[]): RowBox[] {
  return [...rows].sort((a, b) => b.y_top_pt - a.y_top_pt);
}

export function rowHeight(row: RowBox): number {
  return Math.max(0, row.y_top_pt - row.y_bottom_pt);
}

/**
 * Fallback height when the PDF text layer has no usable baselines.
 *
 * Divide the whole region by the number of rows it should hold instead of
 * reserving two phantom rows (the old `N + 2` formula). The old formula made
 * every added row too short to reach the next text line, which is why only
 * the first row ever extracted anything.
 */
export function defaultRowHeight(
  regionHeight: number,
  currentRowCount: number,
): number {
  const n = Math.max(1, currentRowCount + 1);
  return Math.max(8, regionHeight / n);
}

export interface RowSnapshot {
  /** Non-empty cell text plus any existing explicit overrides. */
  cells: Partial<Record<ColumnRole, string>>;
  /** Roles that were empty when the snapshot was taken. */
  pinnedEmpty: ColumnRole[];
}

export interface InsertRowResult {
  rows: RowBox[];
  /** Region bottom extended when the new row needed more room. */
  regionYStart: number;
  insertedRowId: string;
}

/**
 * Insert a row at `sortedIndex` (0 = above the first row).
 *
 * Existing rows from the insertion point downwards are pushed down by the
 * new row's height, and the region's lower edge grows when needed. The PDF
 * text itself never moves: row geometry is what the extractor reads, so a
 * blank inserted row reads whatever sits at its new coordinates.
 *
 * Duplicate passes the source row's exact height and a `cells` snapshot, so
 * its content does NOT depend on where that geometry lands.
 */
export function insertRow(
  table: ProspectusPdfTable,
  sortedIndex: number,
  options: {
    height?: number;
    cells?: Partial<Record<ColumnRole, string>>;
    pinnedEmpty?: ColumnRole[];
    rowId?: string;
    /** Make the new row explicitly empty instead of reading the PDF below. */
    blank?: boolean;
    /**
     * Snapshots for rows that will shift down. Without this, shifting a row's
     * geometry changes which PDF text it reads, so existing rows would
     * silently appear to swap content.
     */
    pinSnapshots?: Record<string, RowSnapshot>;
  } = {},
): InsertRowResult {
  const sorted = sortRowsTopDown(table.rows);
  const regionYStart = Number(table.regionYStartPt);
  const regionYEnd = Number(table.regionYEndPt);
  const regionHeight = Math.max(0, regionYEnd - regionYStart);

  const index = Math.max(0, Math.min(sorted.length, sortedIndex));
  const preferredHeight =
    options.height && options.height > 0
      ? options.height
      : defaultRowHeight(regionHeight, sorted.length);

  let top: number;
  if (index === 0) {
    top = sorted[0]?.y_top_pt ?? regionYEnd;
  } else if (index >= sorted.length) {
    top = sorted[sorted.length - 1]?.y_bottom_pt ?? regionYStart;
  } else {
    top = sorted[index].y_top_pt;
  }

  // Rows at or below the insertion point shift down by the new row's height.
  // Never let that push a row past the page's bottom edge: the backend
  // rejects negative coordinates and an off-page row can't be extracted.
  const roomBelow = sorted
    .slice(index)
    .reduce((lowest, row) => Math.min(lowest, row.y_bottom_pt), top);
  const height = Math.max(0.5, Math.min(preferredHeight, roomBelow));

  const insertedRowId = options.rowId ?? makeRowId();
  const newRow: RowBox = {
    row_id: insertedRowId,
    y_top_pt: top,
    y_bottom_pt: top - height,
    ...(options.blank
      ? { blank: true }
      : {
          ...(options.cells ? { cells: options.cells } : {}),
          ...(options.pinnedEmpty?.length
            ? { pinned_empty: options.pinnedEmpty }
            : {}),
        }),
  };

  const shifted = sorted.map((row, i) => {
    if (i < index) return row;
    const pin = options.pinSnapshots?.[row.row_id];
    const pinned = pin
      ? {
          cells: pin.cells,
          ...(pin.pinnedEmpty.length
            ? { pinned_empty: pin.pinnedEmpty }
            : {}),
        }
      : {};
    return {
      ...row,
      y_top_pt: row.y_top_pt - height,
      y_bottom_pt: row.y_bottom_pt - height,
      ...pinned,
    };
  });

  const lowest = Math.min(
    newRow.y_bottom_pt,
    ...shifted.map((row) => row.y_bottom_pt),
    regionYStart,
  );

  // Rebuild in the table's original order, then append the new row.
  const byId = new Map(shifted.map((row) => [row.row_id, row]));
  const rows = table.rows.map((row) => byId.get(row.row_id) ?? row);
  rows.push(newRow);

  return {
    rows,
    regionYStart: Math.max(0, lowest),
    insertedRowId,
  };
}

/**
 * Swap a row's geometry with its neighbour. Cell overrides stay attached to
 * the row that owns them, so duplicated/edited text travels with the row.
 */
export function moveRow(
  table: ProspectusPdfTable,
  rowId: string,
  direction: RowMoveDirection,
): RowBox[] | null {
  const sorted = sortRowsTopDown(table.rows);
  const index = sorted.findIndex((row) => row.row_id === rowId);
  if (index === -1) return null;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) return null;

  const current = sorted[index];
  const target = sorted[targetIndex];
  const geometry = new Map<string, Pick<RowBox, 'y_top_pt' | 'y_bottom_pt'>>([
    [
      current.row_id,
      { y_top_pt: target.y_top_pt, y_bottom_pt: target.y_bottom_pt },
    ],
    [
      target.row_id,
      { y_top_pt: current.y_top_pt, y_bottom_pt: current.y_bottom_pt },
    ],
  ]);

  return table.rows.map((row) => {
    const swap = geometry.get(row.row_id);
    return swap ? { ...row, ...swap } : row;
  });
}

/**
 * Current text-layer snapshot for one row, used when copying it or when its
 * geometry is about to change.
 *
 * Only non-empty text is stored in `cells`. Empty results are recorded in
 * `pinnedEmpty` instead, so a later geometry change does not turn a genuinely
 * empty PDF cell into a permanent empty-string override.
 */
export function snapshotRow(
  table: ProspectusPdfTable,
  row: RowBox,
  textItems: TextItem[] | null,
): RowSnapshot {
  // Existing overrides are the row's real content; never replace them with
  // fresh extraction, or duplicating an edited row would lose the edits.
  const cells: Partial<Record<ColumnRole, string>> = { ...(row.cells ?? {}) };
  const pinnedEmpty = new Set<ColumnRole>(row.pinned_empty ?? []);
  if (!textItems) return { cells, pinnedEmpty: [...pinnedEmpty] };

  for (const column of table.columns) {
    if (typeof cells[column.role] === 'string') continue;
    if (pinnedEmpty.has(column.role)) continue;
    const text = extractTextInRect(
      textItems,
      column.x_start_pt,
      row.y_bottom_pt,
      column.x_end_pt,
      row.y_top_pt,
    );
    if (text.trim()) cells[column.role] = text;
    else pinnedEmpty.add(column.role);
  }
  return { cells, pinnedEmpty: [...pinnedEmpty] };
}
