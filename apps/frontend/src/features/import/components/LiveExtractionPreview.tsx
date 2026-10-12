import { useMemo } from 'react';
import type { ProspectusPdfTable } from '../types';
import { COLUMN_COLORS, COLUMN_LABELS, COLUMN_ORDER } from '../types';
import { extractTextInRect } from '../hooks/useCellExtraction';
import type { TextItem } from '../hooks/usePdfTextLayer';
import Icon from '@/components/ui/Icon';

interface LiveExtractionPreviewProps {
  table: ProspectusPdfTable | null;
  textItems: TextItem[] | null;
}

export default function LiveExtractionPreview({
  table,
  textItems,
}: LiveExtractionPreviewProps) {
  const rows = useMemo(() => {
    if (!table || !textItems) return [];
    return [...table.rows]
      .sort((a, b) => b.y_top_pt - a.y_top_pt)
      .map((row) => {
        const cells = COLUMN_ORDER.map((role) => {
          const col = table.columns.find((c) => c.role === role);
          if (!col) return '';
          return extractTextInRect(
            textItems,
            col.x_start_pt,
            row.y_bottom_pt,
            col.x_end_pt,
            row.y_top_pt,
          );
        });
        return { row_id: row.row_id, cells };
      });
  }, [table, textItems]);

  return (
    <div className="space-y-3">
      {/* Column legend */}
      <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-3">
        <div className="text-xs font-semibold text-on-surface mb-2">
          Column legend
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {COLUMN_ORDER.map((role) => (
            <div key={role} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block w-3 h-3 rounded-sm shrink-0"
                style={{ background: COLUMN_COLORS[role] }}
              />
              <span className="text-on-surface-variant">
                {COLUMN_LABELS[role]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Live extraction */}
      {!table ? (
        <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-6 text-center">
          <Icon
            name="touch_app"
            size={32}
            className="text-on-surface-variant mx-auto mb-2"
          />
          <p className="text-on-surface font-semibold text-sm mb-1">
            Nothing selected
          </p>
          <p className="text-on-surface-variant text-xs">
            Select a table on the canvas to preview extracted subjects.
          </p>
        </div>
      ) : !textItems ? (
        <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-6 text-center">
          <Icon
            name="progress_activity"
            size={24}
            className="text-primary mx-auto mb-2 animate-spin"
          />
          <p className="text-on-surface-variant text-xs">
            Loading text layer…
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-surface-variant bg-surface-container-lowest overflow-hidden">
          <div className="px-3 py-2 border-b border-surface-variant bg-surface-container-low flex items-center justify-between">
            <div className="text-xs font-semibold text-on-surface">
              Live extraction — Year {table.yearLevel} · {table.semester}
            </div>
            <span className="text-[10px] text-on-surface-variant font-mono">
              {rows.length} row{rows.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-variant">
                  {COLUMN_ORDER.map((role) => (
                    <th
                      key={role}
                      className="text-left px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wide"
                      style={{ color: COLUMN_COLORS[role] }}
                    >
                      {COLUMN_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={COLUMN_ORDER.length}
                      className="text-center py-6 text-on-surface-variant text-xs"
                    >
                      No rows yet.
                    </td>
                  </tr>
                )}
                {rows.map((row, i) => (
                  <tr
                    key={row.row_id}
                    className={i % 2 === 0 ? 'bg-surface-container-low/40' : ''}
                  >
                    {row.cells.map((cell, j) => (
                      <td
                        key={j}
                        className="px-2 py-1.5 text-on-surface align-top font-mono text-[11px] max-w-[260px] truncate"
                        title={cell}
                      >
                        {cell || (
                          <span className="text-on-surface-variant italic">
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}