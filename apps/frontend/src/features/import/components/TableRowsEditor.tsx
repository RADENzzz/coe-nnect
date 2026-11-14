import Icon from '@/components/ui/Icon';
import type { ColumnRole, ProspectusPdfTable } from '../types';
import type { ExtractedRow } from '../hooks/useExtractedTableData';
import { tableLabel } from '../utils/labels';
import {
  COLUMN_COLORS,
  COLUMN_LABELS,
  COLUMN_ORDER,
} from '../types';

interface TableRowsEditorProps {
  table: ProspectusPdfTable;
  extractedRows: ExtractedRow[];
  selectedRowId: string | null;
  disabled?: boolean;
  onSelectRow: (rowId: string) => void;
  onAddRow: () => void;
  onAddAbove: (rowId: string) => void;
  onAddBelow: (rowId: string) => void;
  onDuplicate: (rowId: string) => void;
  onMove: (rowId: string, direction: 'up' | 'down') => void;
  onDelete: (rowId: string) => void;
  onCellChange: (rowId: string, role: ColumnRole, value: string) => void;
}

/**
 * Sidebar row editor: pick a row, edit its cells, add rows above/below,
 * duplicate it, or move it. Everything writes into local table state and is
 * persisted by the table's normal Save button.
 */
export default function TableRowsEditor({
  table,
  extractedRows,
  selectedRowId,
  disabled = false,
  onSelectRow,
  onAddRow,
  onAddAbove,
  onAddBelow,
  onDuplicate,
  onMove,
  onDelete,
  onCellChange,
}: TableRowsEditorProps) {
  const selectedIndex = extractedRows.findIndex(
    (row) => row.row_id === selectedRowId,
  );
  const selected = selectedIndex >= 0 ? extractedRows[selectedIndex] : null;

  const cellValue = (role: ColumnRole) =>
    selected?.cells.find((cell) => cell.role === role)?.text ?? '';

  return (
    <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-on-surface">
            Rows — {tableLabel(table)}
          </div>
          <p className="text-[10px] text-on-surface-variant">
            Select a row to edit its cells or reorder it.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRow}
          disabled={disabled}
          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-on-primary hover:opacity-90 transition disabled:opacity-50"
          title="Add a row at the bottom"
        >
          <Icon name="add" size={13} />
          Add
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto overscroll-contain rounded-md border border-surface-variant/70">
        {extractedRows.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-on-surface-variant text-center">
            No rows yet — click Add.
          </p>
        ) : (
          <ul className="divide-y divide-surface-variant/60">
            {extractedRows.map((row, index) => {
              const active = row.row_id === selectedRowId;
              const code =
                row.cells.find((cell) => cell.role === 'code')?.text ?? '';
              const title =
                row.cells.find((cell) => cell.role === 'title')?.text ?? '';
              return (
                <li
                  key={row.row_id}
                  className={`flex items-center gap-1 px-1.5 py-1 ${
                    active ? 'bg-primary/10' : 'hover:bg-surface-container-low'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectRow(row.row_id)}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left ${
                      active ? 'text-primary' : 'text-on-surface'
                    }`}
                    title={`Select row ${row.index}`}
                  >
                    <span
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                        active
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {row.index}
                    </span>
                    <span className="min-w-0 truncate text-[11px]">
                      {code || title ? (
                        <>
                          {code && (
                            <span className="font-semibold">{code}</span>
                          )}
                          {code && title ? ' · ' : null}
                          <span className="text-on-surface-variant">
                            {title}
                          </span>
                        </>
                      ) : (
                        <span className="italic text-slate-400">empty row</span>
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onMove(row.row_id, 'up')}
                    disabled={disabled || index === 0}
                    className="rounded p-0.5 text-slate-500 hover:bg-surface-container-high hover:text-on-surface disabled:opacity-25"
                    title="Move row up"
                    aria-label={`Move row ${row.index} up`}
                  >
                    <Icon name="arrow_upward" size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(row.row_id, 'down')}
                    disabled={disabled || index === extractedRows.length - 1}
                    className="rounded p-0.5 text-slate-500 hover:bg-surface-container-high hover:text-on-surface disabled:opacity-25"
                    title="Move row down"
                    aria-label={`Move row ${row.index} down`}
                  >
                    <Icon name="arrow_downward" size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicate(row.row_id)}
                    disabled={disabled}
                    className="rounded p-0.5 text-slate-500 hover:bg-surface-container-high hover:text-primary disabled:opacity-25"
                    title="Duplicate this row"
                    aria-label={`Duplicate row ${row.index}`}
                  >
                    <Icon name="content_copy" size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(row.row_id)}
                    disabled={disabled}
                    className="rounded p-0.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-25"
                    title="Delete this row"
                    aria-label={`Delete row ${row.index}`}
                  >
                    <Icon name="delete" size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <div className="mt-3 rounded-md border border-primary/25 bg-primary/5 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-on-surface">
              Editing row {selected.index}
              <span className="ml-1 font-normal text-on-surface-variant">
                of {extractedRows.length}
              </span>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAddAbove(selected.row_id)}
                disabled={disabled}
                className="rounded border border-surface-variant bg-white px-1.5 py-0.5 text-[10px] font-semibold hover:bg-surface-container-low disabled:opacity-50"
                title="Insert a blank row above"
              >
                + Above
              </button>
              <button
                type="button"
                onClick={() => onAddBelow(selected.row_id)}
                disabled={disabled}
                className="rounded border border-surface-variant bg-white px-1.5 py-0.5 text-[10px] font-semibold hover:bg-surface-container-low disabled:opacity-50"
                title="Insert a blank row below"
              >
                + Below
              </button>
            </div>
          </div>

          <div className="mt-2 space-y-2">
            {COLUMN_ORDER.map((role) => {
              const isUnit = role === 'lec' || role === 'lab' || role === 'total';
              return (
                <label
                  key={role}
                  className={`block ${isUnit ? 'inline-block w-[31%] mr-[3.5%] last:mr-0' : ''}`}
                >
                  <span
                    className="block text-[9px] font-bold uppercase tracking-wider mb-0.5"
                    style={{ color: COLUMN_COLORS[role] }}
                  >
                    {COLUMN_LABELS[role]}
                  </span>
                  <input
                    type="text"
                    value={cellValue(role)}
                    onChange={(e) =>
                      onCellChange(selected.row_id, role, e.target.value)
                    }
                    disabled={disabled}
                    placeholder={role === 'title' ? 'Course title' : '—'}
                    className="w-full rounded border border-surface-variant bg-white px-1.5 py-1 text-[11px] text-on-surface placeholder:text-slate-300 focus:border-primary focus:outline-none disabled:opacity-50"
                  />
                </label>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-primary/15 pt-2">
            <button
              type="button"
              onClick={() => onDuplicate(selected.row_id)}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-semibold text-on-primary hover:opacity-90 disabled:opacity-50"
              title="Copy this row's cells into a new row below"
            >
              <Icon name="content_copy" size={11} />
              Copy row
            </button>
            <button
              type="button"
              onClick={() => onMove(selected.row_id, 'up')}
              disabled={disabled || selectedIndex === 0}
              className="inline-flex items-center gap-1 rounded border border-surface-variant bg-white px-2 py-1 text-[10px] font-semibold hover:bg-surface-container-low disabled:opacity-40"
            >
              <Icon name="arrow_upward" size={11} />
              Up
            </button>
            <button
              type="button"
              onClick={() => onMove(selected.row_id, 'down')}
              disabled={
                disabled || selectedIndex === extractedRows.length - 1
              }
              className="inline-flex items-center gap-1 rounded border border-surface-variant bg-white px-2 py-1 text-[10px] font-semibold hover:bg-surface-container-low disabled:opacity-40"
            >
              <Icon name="arrow_downward" size={11} />
              Down
            </button>
            <button
              type="button"
              onClick={() => onDelete(selected.row_id)}
              disabled={disabled}
              className="ml-auto inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <Icon name="delete" size={11} />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
