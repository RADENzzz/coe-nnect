import type { ProspectusPdfTable } from '../types';
import { COLUMN_COLORS, COLUMN_LABELS, COLUMN_ORDER } from '../types';
import type { TextItem } from '../hooks/usePdfTextLayer';
import Icon from '@/components/ui/Icon';
import ExtractedTable from './ExtractedTable';
import { useExtractedTableData } from '../hooks/useExtractedTableData';

interface LiveExtractionPreviewProps {
  table: ProspectusPdfTable | null;
  textItems: TextItem[] | null;
  /** Opens the full-size view of the same table. */
  onExpand?: () => void;
}

export default function LiveExtractionPreview({
  table,
  textItems,
  onExpand,
}: LiveExtractionPreviewProps) {
  const { rows, columnStats, totalCellsFilled } = useExtractedTableData(
    table,
    textItems,
  );

  return (
    <div className="space-y-3">
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
        <div
          className={`rounded-lg border bg-surface-container-lowest overflow-hidden transition-colors ${
            onExpand
              ? 'border-surface-variant hover:border-primary/60 cursor-pointer'
              : 'border-surface-variant'
          }`}
          onClick={onExpand}
          onKeyDown={(e) => {
            if (!onExpand) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onExpand();
            }
          }}
          role={onExpand ? 'button' : undefined}
          tabIndex={onExpand ? 0 : undefined}
          aria-label={onExpand ? 'Open full extracted table' : undefined}
          title={onExpand ? 'Click to open the full table' : undefined}
        >
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
              {onExpand && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary/80"
                  aria-hidden="true"
                >
                  <Icon name="open_in_full" size={11} />
                  Full
                </span>
              )}
            </div>
          </div>

          <ExtractedTable rows={rows} columnStats={columnStats} />

          {/* Footer summary */}
          {rows.length > 0 && (
            <div className="px-3 py-1.5 border-t border-surface-variant bg-surface-container-low/40 text-[10px] text-on-surface-variant flex items-center gap-1.5">
              <Icon name={onExpand ? 'open_in_full' : 'info'} size={10} />
              {onExpand
                ? 'Click to open the full table.'
                : 'Hover a cell to copy. Column headers show filled-cell counts.'}
            </div>
          )}

          {/* Nothing extracted at all — surface it here instead of making
              the user scroll back to the canvas to figure out why. */}
          {rows.length > 0 && totalCellsFilled === 0 && (
            <div className="px-3 py-2 border-t border-amber-300 bg-amber-50 text-amber-900 text-[11px] flex items-start gap-1.5">
              <Icon name="warning" size={12} className="shrink-0 mt-0.5" />
              <span>
                No text found in these cells. The page may be an image or scan
                (not readable), or the table/column edges may not line up with
                the text — try nudging them.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Column legend — reference only, so it sits below the live data */}
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
    </div>
  );
}
