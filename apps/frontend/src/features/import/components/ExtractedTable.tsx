import { useState } from 'react';
import type { ExtractedRow } from '../hooks/useExtractedTableData';
import { COLUMN_COLORS, COLUMN_LABELS, COLUMN_ORDER } from '../types';
import Icon from '@/components/ui/Icon';

interface ExtractedTableProps {
  rows: ExtractedRow[];
  columnStats: Record<string, number>;
  /**
   * `compact` truncates cells to keep the sticky side panel narrow.
   * `full` wraps text so nothing is hidden — used in the modal.
   */
  variant?: 'compact' | 'full';
}

export default function ExtractedTable({
  rows,
  columnStats,
  variant = 'compact',
}: ExtractedTableProps) {
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const full = variant === 'full';

  const copyCell = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCell(key);
      setTimeout(() => setCopiedCell((c) => (c === key ? null : c)), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  const cellPadding = full ? 'px-3 py-2' : 'px-2 py-1.5';
  const fontSize = full ? 'text-[12px]' : 'text-[11px]';

  return (
    <div className={full ? undefined : 'overflow-x-auto'}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-variant">
            <th
              className={`text-left ${cellPadding} font-semibold text-[10px] uppercase tracking-wide text-slate-400 ${
                full ? 'w-10' : 'w-8'
              } ${full ? 'sticky top-0 z-10 bg-surface-container-lowest' : ''}`}
            >
              #
            </th>
            {COLUMN_ORDER.map((role) => (
              <th
                key={role}
                className={`text-left ${cellPadding} font-semibold text-[10px] uppercase tracking-wide ${
                  full ? 'sticky top-0 z-10 bg-surface-container-lowest' : ''
                }`}
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
                i % 2 === 0 ? 'bg-surface-container-low/40' : undefined
              }
            >
              <td
                className={`${cellPadding} text-slate-400 font-mono text-[10px] tabular-nums align-top`}
              >
                {row.index}
              </td>
              {row.cells.map((cell) => {
                const key = `${row.row_id}:${cell.role}`;
                const copied = copiedCell === key;
                const isEmpty = !cell.text.trim();
                // Code + title are what make a row importable — flag them.
                const required = cell.role === 'code' || cell.role === 'title';
                return (
                  <td
                    key={cell.role}
                    className={`${cellPadding} align-top font-mono ${fontSize} ${
                      full ? 'max-w-[22rem]' : 'max-w-[260px]'
                    } group ${isEmpty && required ? 'bg-amber-50' : ''}`}
                    title={cell.text || undefined}
                  >
                    <div className="flex items-start gap-1">
                      <span
                        className={`flex-1 ${
                          full ? 'whitespace-pre-wrap break-words' : 'truncate'
                        } ${isEmpty ? 'text-slate-300 italic' : 'text-on-surface'}`}
                      >
                        {isEmpty ? (required ? 'missing' : '—') : cell.text}
                      </span>
                      {!isEmpty && (
                        <button
                          type="button"
                          onClick={() => copyCell(key, cell.text)}
                          className={`shrink-0 p-0.5 text-slate-400 hover:text-slate-700 transition-opacity ${
                            full
                              ? 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                              : 'opacity-0 group-hover:opacity-100'
                          }`}
                          title="Copy cell"
                          aria-label={`Copy ${COLUMN_LABELS[cell.role]} cell`}
                        >
                          <Icon
                            name={copied ? 'check' : 'content_copy'}
                            size={full ? 13 : 11}
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
  );
}
