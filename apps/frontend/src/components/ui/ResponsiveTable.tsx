import { useMemo } from 'react';
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
  header: string;
  render: (row: T) => React.ReactNode;
  cardVariant?: CardVariant;
  hideOnMobile?: boolean;
  cellClassName?: string;
  headerClassName?: string;
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
}: ResponsiveTableProps<T>) {
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
        case 'actions':  break; // handled separately
        default:         metaCols.push(c);
      }
    }
    return { titleCols, subtitleCols, badgeCols, metaCols, monoCols };
  }, [columns]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-10">
        <div className="flex items-center justify-center gap-2 text-on-surface-variant text-sm">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-12 text-center">
        <p className="text-sm text-on-surface-variant">
          {hasSourceRows ? noMatchMessage : emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ─── Desktop / tablet: real table ─── */}
      <div className="hidden md:block rounded-xl border border-surface-variant bg-surface-container-lowest overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider">
              {columns.map((c) => {
                const isActionsCol = c.cardVariant === 'actions';
                return (
                  <th
                    key={c.key}
                    className={clsx(
                      'px-5 py-3 font-medium',
                      isActionsCol
                        ? 'text-right w-0 whitespace-nowrap'
                        : 'text-left',
                      c.headerClassName,
                    )}
                  >
                    {c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-white/5 hover:bg-surface-container-low transition-colors"
              >
                {columns.map((c) => {
                  const isActionsCol = c.cardVariant === 'actions';
                  const actions = isActionsCol ? (getActions?.(row) ?? []) : [];

                  if (isActionsCol) {
                    return (
                      <td
                        key={c.key}
                        className="relative py-3.5 px-5 text-right whitespace-nowrap w-0"
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
                      className={clsx('px-5 py-3.5', c.cellClassName)}
                    >
                      {c.render(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Mobile: card list ─── */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => {
          const key = rowKey(row);
          const accent = accentColor?.(row) ?? hashToColor(key);
          const actions = getActions?.(row) ?? [];

          const titleNode = layout.titleCols.map((c) => (
            <span key={c.key}>{c.render(row)}</span>
          ));
          const subtitleNode = layout.subtitleCols.map((c) => (
            <span key={c.key} className="block">{c.render(row)}</span>
          ));

          return (
            <div
              key={key}
              className="bg-white border border-slate-200 flex items-stretch overflow-hidden"
            >
              <span
                className="w-1.5 shrink-0"
                style={{ backgroundColor: accent }}
                aria-hidden
              />

              <div className="flex-1 min-w-0 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-slate-900 truncate flex items-baseline gap-2 flex-wrap">
                      {titleNode.length > 0 ? titleNode : null}
                    </div>
                    {subtitleNode.length > 0 && (
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {subtitleNode}
                      </div>
                    )}
                  </div>

                  {actions.length > 0 && (
                    <RowActionMenu
                      actions={actions}
                      title={rowTitle?.(row) ?? ''}
                      subtitle={rowSubtitle?.(row)}
                    />
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
                        className="text-[11px] text-slate-500 truncate flex items-center gap-1.5"
                      >
                        {c.render(row)}
                      </div>
                    ))}
                    {layout.monoCols.map((c) => (
                      <div
                        key={c.key}
                        className="text-[11px] text-slate-500 font-mono truncate"
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