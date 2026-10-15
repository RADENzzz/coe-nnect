import { useMemo, useState, useCallback, useId } from 'react';
import clsx from 'clsx';
import RowActionMenu, { type RowAction } from './RowActionMenu';

export type CardVariant =
  | 'title'
  | 'subtitle'
  | 'badge'
  | 'meta'
  | 'mono'
  | 'actions';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  cardVariant?: CardVariant;
  hideOnMobile?: boolean;
  cellClassName?: string;
  headerClassName?: string;
  /** Enable client-side sort on this column. `sortValue` extracts the key. */
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
}

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowTitle?: (row: T) => string;
  rowSubtitle?: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  noMatchMessage?: string;
  hasSourceRows?: boolean;
  accentColor?: (row: T) => string;
  getActions?: (row: T) => RowAction[];

  /** Called when a row is clicked (desktop row or mobile card). */
  onRowClick?: (row: T) => void;
  /** Optional caption rendered above the table (visually or a11y). */
  caption?: string;

  /** Visual density. */
  density?: 'comfortable' | 'compact';

  /** Sticky header inside the scroll container. */
  stickyHeader?: boolean;

  /** Enable row selection with checkboxes. */
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;

  /** Skeleton row count while loading. */
  skeletonRows?: number;

  /** Empty state extras. */
  emptyIcon?: string;
  emptyAction?: React.ReactNode;

  /** Initial sort state (uncontrolled). */
  defaultSort?: SortState;
}

const ACCENT_PALETTE = [
  '#0d47a1', '#4a148c', '#880e4f', '#b71c1c',
  '#e65100', '#f57f17', '#33691e', '#1b5e20',
  '#004d40', '#006064', '#37474f', '#3e2723',
  '#6a1b9a', '#283593', '#ad1457', '#00838f',
];

function hashToColor(key: string): string {
  if (!key) return ACCENT_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length];
}

function defaultSortValue<T>(row: T, col: Column<T>): string | number {
  const raw = col.render(row);
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  return String(raw ?? '');
}

export default function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  rowTitle,
  rowSubtitle,
  isLoading,
  emptyMessage = 'No records found.',
  noMatchMessage = 'No records match your filters.',
  hasSourceRows = true,
  accentColor,
  getActions,
  onRowClick,
  caption,
  density = 'comfortable',
  stickyHeader = false,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  skeletonRows = 5,
  emptyIcon,
  emptyAction,
  defaultSort,
}: ResponsiveTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const tableId = useId();

  // ── Layout grouping for mobile cards ──
  const layout = useMemo(() => {
    const titleCols: Column<T>[] = [];
    const subtitleCols: Column<T>[] = [];
    const badgeCols: Column<T>[] = [];
    const metaCols: Column<T>[] = [];
    const monoCols: Column<T>[] = [];

    for (const c of columns) {
      if (c.hideOnMobile) continue;
      switch (c.cardVariant) {
        case 'title':    titleCols.push(c); break;
        case 'subtitle': subtitleCols.push(c); break;
        case 'badge':    badgeCols.push(c); break;
        case 'meta':     metaCols.push(c); break;
        case 'mono':     monoCols.push(c); break;
        case 'actions':  break;
        default:         metaCols.push(c);
      }
    }
    return { titleCols, subtitleCols, badgeCols, metaCols, monoCols };
  }, [columns]);

  const hasActions = useMemo(
    () => columns.some((c) => c.cardVariant === 'actions'),
    [columns],
  );

  // ── Sorting ──
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const getVal = col.sortValue ?? ((r: T) => defaultSortValue(r, col));
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, sort, columns]);

  const toggleSort = useCallback((col: Column<T>) => {
    if (!col.sortable) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) {
        return { key: col.key, direction: 'asc' };
      }
      if (prev.direction === 'asc') return { key: col.key, direction: 'desc' };
      return null; // 3rd click clears
    });
  }, []);

  // ── Selection ──
  const allKeysOnPage = useMemo(
    () => sortedRows.map((r) => rowKey(r)),
    [sortedRows, rowKey],
  );

  const allSelected =
    selectable &&
    allKeysOnPage.length > 0 &&
    selectedKeys != null &&
    allKeysOnPage.every((k) => selectedKeys.has(k));

  const someSelected =
    selectable &&
    selectedKeys != null &&
    !allSelected &&
    allKeysOnPage.some((k) => selectedKeys.has(k));

  const toggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys ?? []);
    if (allSelected) {
      allKeysOnPage.forEach((k) => next.delete(k));
    } else {
      allKeysOnPage.forEach((k) => next.add(k));
    }
    onSelectionChange(next);
  }, [allSelected, allKeysOnPage, selectedKeys, onSelectionChange]);

  const toggleOne = useCallback(
    (key: string) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedKeys ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectionChange(next);
    },
    [onSelectionChange, selectedKeys],
  );

  // ── Density ──
  const cellPad = density === 'compact' ? 'px-4 py-2' : 'px-5 py-3.5';
  const headPad = density === 'compact' ? 'px-4 py-2' : 'px-5 py-3';

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <div className="p-4 space-y-3">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 bg-slate-100 rounded animate-pulse flex-1" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Empty ──
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-12 text-center">
        {emptyIcon && (
          <Icon
            name={emptyIcon}
            size={48}
            className="text-slate-300 mx-auto mb-3"
          />
        )}
        <p className="text-sm text-on-surface-variant">
          {hasSourceRows ? noMatchMessage : emptyMessage}
        </p>
        {!hasSourceRows && emptyAction && (
          <div className="mt-4 flex justify-center">{emptyAction}</div>
        )}
      </div>
    );
  }

  // ── Row activation helper ──
  const activateRow = (row: T) => {
    if (!onRowClick) return;
    onRowClick(row);
  };

  return (
    <>
{/* ─── Desktop / tablet table ─── */}
<div className="hidden md:block rounded-xl border border-surface-variant bg-surface-container-lowest">
  <div
    className={clsx(
      'overflow-x-auto',
      stickyHeader && 'max-h-[70vh] overflow-y-auto',
    )}
  >
    <table
      id={tableId}
      className="w-full text-sm border-collapse"
      role="table"
    >
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead
        className={clsx(
          'border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider',
          stickyHeader &&
            'sticky top-0 z-20 bg-surface-container-lowest shadow-[0_1px_0_0] shadow-surface-variant',
        )}
      >
        <tr>
          {selectable && (
            <th
              className={clsx(
                headPad,
                'w-0 text-left font-medium',
                stickyHeader && 'bg-surface-container-lowest',
              )}
            >
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                aria-label="Select all rows"
                className="cursor-pointer accent-primary"
              />
            </th>
          )}
          {columns.map((c) => {
            const isActionsCol = c.cardVariant === 'actions';
            const sortable = !!c.sortable;
            const isSorted = sort?.key === c.key;
            return (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  isSorted
                    ? sort!.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : sortable
                    ? 'none'
                    : undefined
                }
                className={clsx(
                  headPad,
                  'font-medium',
                  isActionsCol
                    ? 'text-right w-0 whitespace-nowrap'
                    : 'text-left',
                  // ★ Sticky actions column
                  isActionsCol &&
                    'sticky right-0 z-20 bg-surface-container-lowest shadow-[-1px_0_0_0_theme(colors.slate.200)]',
                  c.headerClassName,
                )}
              >
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(c)}
                    className={clsx(
                      'inline-flex items-center gap-1 select-none rounded transition',
                      'hover:text-on-surface',
                      isSorted && 'text-primary',
                    )}
                  >
                    {c.header}
                    <Icon
                      name={
                        !isSorted
                          ? 'unfold_more'
                          : sort!.direction === 'asc'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                      }
                      size={12}
                    />
                  </button>
                ) : (
                  c.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => {
          const key = rowKey(row);
          const isSelected = !!selectedKeys?.has(key);
          const clickable = !!onRowClick;
          return (
            <tr
              key={key}
              onClick={clickable ? () => activateRow(row) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (
                        e.key === 'Enter' &&
                        e.target === e.currentTarget
                      ) {
                        e.preventDefault();
                        activateRow(row);
                      }
                    }
                  : undefined
              }
              tabIndex={clickable ? 0 : undefined}
              className={clsx(
                'group border-b border-slate-100 transition-colors',
                clickable &&
                  'cursor-pointer focus:outline-none focus-visible:bg-primary/5',
                isSelected
                  ? 'bg-primary/5'
                  : 'hover:bg-surface-container-low',
              )}
              data-selected={isSelected || undefined}
            >
              {selectable && (
                <td className={clsx(cellPad, 'w-0')}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleOne(key);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={
                      rowTitle ? `Select ${rowTitle(row)}` : 'Select row'
                    }
                    className="cursor-pointer accent-primary"
                  />
                </td>
              )}
              {columns.map((c) => {
                const isActionsCol = c.cardVariant === 'actions';
                const actions = isActionsCol
                  ? getActions?.(row) ?? []
                  : [];

                if (isActionsCol) {
                  if (!hasActions) return null;
                  return (
                    <td
                      key={c.key}
                      className={clsx(
                        cellPad,
                        'relative text-right whitespace-nowrap w-0',
                        // ★ Sticky actions column — matches row background
                        'sticky right-0 z-10',
                        'shadow-[-1px_0_0_0_theme(colors.slate.100)]',
                        isSelected
                          ? 'bg-primary/5'
                          : 'bg-surface-container-lowest group-hover:bg-surface-container-low',
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actions.length > 0 && (
                        <RowActionMenu
                          actions={actions}
                          title={rowTitle?.(row) ?? ''}
                          subtitle={rowSubtitle?.(row)}
                          size="sm"
                        />
                      )}
                    </td>
                  );
                }

                return (
                  <td
                    key={c.key}
                    className={clsx(cellPad, c.cellClassName)}
                  >
                    {c.render(row)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
</div>

      {/* ─── Mobile card list ─── */}
      <div className="md:hidden space-y-2" role="list">
        {sortedRows.map((row) => {
          const key = rowKey(row);
          const accent = accentColor?.(row) ?? hashToColor(key);
          const actions = getActions?.(row) ?? [];
          const isSelected = !!selectedKeys?.has(key);
          const clickable = !!onRowClick;

          const titleNode = layout.titleCols.map((c) => (
            <span key={c.key}>{c.render(row)}</span>
          ));
          const subtitleNode = layout.subtitleCols.map((c) => (
            <span key={c.key} className="block">{c.render(row)}</span>
          ));

          return (
            <div
              key={key}
              role="listitem"
              onClick={clickable ? () => activateRow(row) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) {
                        e.preventDefault();
                        activateRow(row);
                      }
                    }
                  : undefined
              }
              tabIndex={clickable ? 0 : undefined}
              className={clsx(
                'bg-white border border-slate-200 flex items-stretch overflow-hidden rounded-xl transition',
                clickable &&
                  'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                isSelected
                  ? 'border-primary/40 bg-primary/5'
                  : 'hover:border-slate-300',
              )}
            >
              <span
                className="w-1.5 shrink-0"
                style={{ backgroundColor: accent }}
                aria-hidden
              />

              <div className="flex-1 min-w-0 p-3">
                <div className="flex items-start gap-2">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleOne(key);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={
                        rowTitle ? `Select ${rowTitle(row)}` : 'Select row'
                      }
                      className="mt-1 cursor-pointer accent-primary shrink-0"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-slate-900 flex items-baseline gap-2 flex-wrap">
                      {titleNode.length > 0 ? titleNode : null}
                    </h3>
                    {subtitleNode.length > 0 && (
                      <div className="text-xs text-slate-500 mt-0.5 break-words">
                        {subtitleNode}
                      </div>
                    )}
                  </div>

                  {actions.length > 0 && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu
                        actions={actions}
                        title={rowTitle?.(row) ?? ''}
                        subtitle={rowSubtitle?.(row)}
                      />
                    </div>
                  )}
                </div>

                {layout.badgeCols.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {layout.badgeCols.map((c) => (
                      <span key={c.key}>{c.render(row)}</span>
                    ))}
                  </div>
                )}

                {(layout.metaCols.length > 0 || layout.monoCols.length > 0) && (
                  <div className="mt-2 space-y-1">
                    {layout.metaCols.map((c) => (
                      <div
                        key={c.key}
                        className="text-[11px] text-slate-500 break-words flex items-center gap-1.5"
                      >
                        {c.render(row)}
                      </div>
                    ))}
                    {layout.monoCols.map((c) => (
                      <div
                        key={c.key}
                        className="text-[11px] text-slate-500 font-mono break-words"
                      >
                        {c.render(row)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Local Icon shim (delete if you import from './Icon') ──
import Icon from './Icon';