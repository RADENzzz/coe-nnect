import { useMemo, useState } from 'react';
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
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!table || !textItems) return [];
    return [...table.rows]
      .sort((a, b) => b.y_top_pt - a.y_top_pt)
      .map((row, index) => {
        const cells = COLUMN_ORDER.map((role) => {
          const col = table.columns.find((c) => c.role === role);
          if (!col) return { role, text: '' };
          const text = extractTextInRect(
            textItems,
            col.x_start_pt,
            row.y_bottom_pt,
            col.x_end_pt,
            row.y_top_pt,
          );
          return { role, text };
        });
        return { row_id: row.row_id, index: index + 1, cells };
      });
  }, [table, textItems]);

  // Per-column non-empty count for the header
  const columnStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const role of COLUMN_ORDER) stats[role] = 0;
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.text && cell.text.trim()) {
          stats[cell.role] = (stats[cell.role] ?? 0) + 1;
        }
      }
    }
    return stats;
  }, [rows]);

  const copyCell = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCell(key);
      setTimeout(
        () => setCopiedCell((c) => (c === key ? null : c)),
        1200,
      );
    } catch {
      /* clipboard blocked */
    }
  };

  const totalCellsFilled = Object.values(columnStats).reduce(
    (sum, n) => sum + n,
    0,
  );

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
        <div className="rounded-lg border border-surface-variant bg-surface-container-lowest overflow-hidden">
          <div className="px-3 py-2 border-b border-surface-variant bg-surface-container-low">
            <div className="h-3 w-40 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-surface-variant bg-surface-container-lowest overflow-hidden">
          <div className="px-3 py-2 border-b border-surface-variant bg-surface-container-low flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-on-surface truncate">
              Year {table.yearLevel} · {table.semester}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-on-surface-variant font-mono">
                {rows.length} row{rows.length === 1 ? '' : 's'}
              </span>
              {totalCellsFilled > 0 && (
                <>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-emerald-700 font-mono font-semibold">
                    {totalCellsFilled} cell{totalCellsFilled === 1 ? '' : 's'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Horizontal scroll hint when content is wide */}
          <div className="relative">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-variant">
                    <th className="text-left px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wide text-slate-400 w-8">
                      #
                    </th>
                    {COLUMN_ORDER.map((role) => (
                      <th
                        key={role}
                        className="text-left px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wide"
                        style={{ color: COLUMN_COLORS[role] }}
                        title={`${COLUMN_LABELS[role]} — ${columnStats[role] ?? 0} filled`}
                      >
                        <div className="flex items-center gap-1">
                          <span>{COLUMN_LABELS[role]}</span>
                          <span className="text-[9px] font-normal opacity-60">
                            ({columnStats[role] ?? 0})
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={COLUMN_ORDER.length + 1}
                        className="text-center py-6 text-on-surface-variant text-xs"
                      >
                        No rows yet. Add a row to see extraction.
                      </td>
                    </tr>
                  )}
                  {rows.map((row, i) => (
                    <tr
                      key={row.row_id}
                      className={
                        i % 2 === 0 ? 'bg-surface-container-low/40' : ''
                      }
                    >
                      <td className="px-2 py-1.5 text-slate-400 font-mono text-[10px] tabular-nums align-top">
                        {row.index}
                      </td>
                      {row.cells.map((cell) => {
                        const key = `${row.row_id}:${cell.role}`;
                        const copied = copiedCell === key;
                        const isEmpty = !cell.text || !cell.text.trim();
                        return (
                          <td
                            key={cell.role}
                            className="px-2 py-1.5 align-top font-mono text-[11px] max-w-[260px] group"
                            title={cell.text || undefined}
                          >
                            <div className="flex items-start gap-1">
                              <span
                                className={`flex-1 truncate ${
                                  isEmpty
                                    ? 'text-slate-300 italic'
                                    : 'text-on-surface'
                                }`}
                              >
                                {isEmpty ? '—' : cell.text}
                              </span>
                              {!isEmpty && (
                                <button
                                  type="button"
                                  onClick={() => copyCell(key, cell.text)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-slate-700 shrink-0"
                                  title="Copy cell"
                                  aria-label={`Copy ${COLUMN_LABELS[cell.role]} cell`}
                                >
                                  <Icon
                                    name={copied ? 'check' : 'content_copy'}
                                    size={11}
                                  />
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer summary */}
          {rows.length > 0 && (
            <div className="px-3 py-1.5 border-t border-surface-variant bg-surface-container-low/40 text-[10px] text-on-surface-variant flex items-center gap-1.5">
              <Icon name="info" size={10} />
              Hover a cell to copy. Column headers show filled-cell counts.
            </div>
          )}
        </div>
      )}
    </div>
  );
}