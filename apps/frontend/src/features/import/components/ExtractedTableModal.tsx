import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import type { ProspectusPdfTable } from '../types';
import type { TextItem } from '../hooks/usePdfTextLayer';
import ExtractedTable from './ExtractedTable';
import {
  extractedRowsToTsv,
  useExtractedTableData,
} from '../hooks/useExtractedTableData';

interface ExtractedTableModalProps {
  open: boolean;
  onClose: () => void;
  table: ProspectusPdfTable | null;
  textItems: TextItem[] | null;
}

/**
 * Full-size view of everything the editor reads out of one mapped table.
 * The side panel only has room for a truncated flavour of the same data,
 * so clicking it opens this.
 */
export default function ExtractedTableModal({
  open,
  onClose,
  table,
  textItems,
}: ExtractedTableModalProps) {
  const { rows, columnStats, totalCellsFilled } = useExtractedTableData(
    table,
    textItems,
  );
  const [copiedAll, setCopiedAll] = useState(false);

  const missingRows = rows.filter((row) =>
    row.cells.some(
      (cell) =>
        (cell.role === 'code' || cell.role === 'title') && !cell.text.trim(),
    ),
  ).length;

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(extractedRowsToTsv(rows));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const title = table
    ? `Extracted · Year ${table.yearLevel} · ${table.semester}`
    : 'Extracted table';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        table
          ? `${rows.length} row${rows.length === 1 ? '' : 's'} · ${totalCellsFilled} filled cell${
              totalCellsFilled === 1 ? '' : 's'
            } · page ${table.regionPageIndex + 1}`
          : undefined
      }
      size="full"
      footer={
        <>
          <button
            type="button"
            onClick={copyAll}
            disabled={rows.length === 0}
            className="px-4 py-2 text-sm font-semibold border border-surface-variant rounded-lg hover:bg-surface-container-low transition disabled:opacity-50 flex items-center gap-2"
          >
            <Icon name={copiedAll ? 'check' : 'content_copy'} size={16} />
            {copiedAll ? 'Copied' : 'Copy as TSV'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:opacity-90 transition"
          >
            Close
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-variant bg-surface-container-low px-2.5 py-1 font-semibold text-on-surface">
            <Icon name="table_rows" size={13} />
            {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${
              totalCellsFilled > 0
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            <Icon name="check_circle" size={13} />
            {totalCellsFilled} cell{totalCellsFilled === 1 ? '' : 's'} read
          </span>
          {missingRows > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-900">
              <Icon name="warning" size={13} />
              {missingRows} row{missingRows === 1 ? '' : 's'} missing code/title
            </span>
          )}
        </div>

        {totalCellsFilled === 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm flex items-start gap-2">
            <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
            <span>
              Nothing in these cells. The page may be an image or scan, or the
              table/column edges may not line up with the text — nudge them on
              the canvas and check again.
            </span>
          </div>
        )}

        <div className="rounded-lg border border-surface-variant">
          <ExtractedTable
            rows={rows}
            columnStats={columnStats}
            variant="full"
          />
        </div>

        <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
          <Icon name="info" size={11} />
          This is exactly what the importer will read. Hover a cell to copy it,
          or use “Copy as TSV” for the whole table.
        </p>
      </div>
    </Modal>
  );
}
