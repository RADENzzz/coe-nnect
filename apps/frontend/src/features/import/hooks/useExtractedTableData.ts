import { useMemo } from 'react';
import type { ColumnRole, ProspectusPdfTable } from '../types';
import { COLUMN_LABELS, COLUMN_ORDER } from '../types';
import { extractTextInRect } from './useCellExtraction';
import type { TextItem } from './usePdfTextLayer';

export interface ExtractedCell {
  role: ColumnRole;
  text: string;
}

export interface ExtractedRow {
  row_id: string;
  index: number;
  cells: ExtractedCell[];
}

export interface ExtractedTableData {
  rows: ExtractedRow[];
  columnStats: Record<string, number>;
  totalCellsFilled: number;
}

const EMPTY_STATS: Record<string, number> = COLUMN_ORDER.reduce(
  (acc, role) => {
    acc[role] = 0;
    return acc;
  },
  {} as Record<string, number>,
);

/**
 * Reads the PDF text layer cell-by-cell for the table's current row/column
 * geometry. Shared by the live preview and the full-table modal so both
 * always show exactly the same numbers.
 */
export function useExtractedTableData(
  table: ProspectusPdfTable | null,
  textItems: TextItem[] | null,
): ExtractedTableData {
  const rows = useMemo<ExtractedRow[]>(() => {
    if (!table || !textItems) return [];
    return [...table.rows]
      .sort((a, b) => b.y_top_pt - a.y_top_pt)
      .map((row, index) => ({
        row_id: row.row_id,
        index: index + 1,
        cells: COLUMN_ORDER.map((role) => {
          const col = table.columns.find((c) => c.role === role);
          if (!col) return { role, text: '' };
          return {
            role,
            text: extractTextInRect(
              textItems,
              col.x_start_pt,
              row.y_bottom_pt,
              col.x_end_pt,
              row.y_top_pt,
            ),
          };
        }),
      }));
  }, [table, textItems]);

  const columnStats = useMemo(() => {
    const stats: Record<string, number> = { ...EMPTY_STATS };
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.text.trim()) stats[cell.role] = (stats[cell.role] ?? 0) + 1;
      }
    }
    return stats;
  }, [rows]);

  const totalCellsFilled = useMemo(
    () => Object.values(columnStats).reduce((sum, n) => sum + n, 0),
    [columnStats],
  );

  return { rows, columnStats, totalCellsFilled };
}

/** Tab-separated rows — pastes straight into Excel / Google Sheets. */
export function extractedRowsToTsv(rows: ExtractedRow[]): string {
  const header = ['#', ...COLUMN_ORDER.map((role) => COLUMN_LABELS[role])];
  const lines = [header.join('\t')];
  for (const row of rows) {
    lines.push(
      [
        String(row.index),
        ...row.cells.map((cell) => cell.text.replace(/\t/g, ' ')),
      ].join('\t'),
    );
  }
  return lines.join('\n');
}
