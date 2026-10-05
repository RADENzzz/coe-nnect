import { useEffect, useState } from 'react';
import Icon from '../../../components/ui/Icon';
import type { ScheduleEntry } from '../types';
import { exportSchedulePdf, printSchedulePdf } from './generateSchedulePdf';
import {
  exportScheduleGridPdf,
  printScheduleGridPdf,
} from './generateScheduleGridPdf';
import { exportScheduleExcel } from './generateScheduleExcel';

type Format = 'grid' | 'table';

interface Props {
  entries: ScheduleEntry[];
  scopeLabel: string;
  termLabel: string;
  suggestedFilename: string;
  /** Whether the current view can meaningfully be rendered as a grid */
  gridAvailable: boolean;
  /** Short label for grid title, e.g. "Room 205", "Master View" */
  gridScopeLabel: string;
}

export default function ExportToolbar({
  entries,
  scopeLabel,
  termLabel,
  suggestedFilename,
  gridAvailable,
  gridScopeLabel,
}: Props) {
  const [format, setFormat] = useState<Format>('table');
  const [busy, setBusy] = useState<'pdf' | 'excel' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default to grid when viewing a room (or master) — matches PM's reference format
  useEffect(() => {
    if (gridAvailable) setFormat('grid');
    else setFormat('table');
  }, [gridAvailable]);

  const isMaster = scopeLabel === 'Master View';

  const promptFilename = (defaultStem: string, ext: string): string | null => {
    const input = window.prompt('File name (without extension):', defaultStem);
    if (input === null) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    return `${trimmed}.${ext}`;
  };

  // ── Shared tabular doc props ──
  const tableDocProps = {
    entries,
    title: isMaster
      ? 'CoE-NNECT Master Timetable'
      : `CoE-NNECT Timetable — ${scopeLabel}`,
    subtitle: isMaster ? 'College-wide schedule' : `View: ${scopeLabel}`,
    termLabel,
    scopeLabel: isMaster ? undefined : scopeLabel,
  };

  // ── Shared grid doc props ──
  const gridDocProps = {
    entries,
    title: isMaster
      ? 'CoE-NNECT Master Schedule'
      : `Room Schedule — ${gridScopeLabel}`,
    subtitle: isMaster
      ? 'College-wide master schedule'
      : gridScopeLabel,
    termLabel,
  };

  // ── Handlers ──
  const handleExportPdf = async () => {
    setError(null);
    const filename = promptFilename(suggestedFilename, 'pdf');
    if (!filename) return;
    setBusy('pdf');
    try {
      if (format === 'grid' && gridAvailable) {
        await exportScheduleGridPdf(gridDocProps, filename);
      } else {
        await exportSchedulePdf(tableDocProps, filename);
      }
    } catch (err: any) {
      console.error('[PDF export] Failed:', err);
      setError(err?.message ?? 'Failed to generate PDF.');
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = async () => {
    setError(null);
    const filename = suggestedFilename.endsWith('.pdf')
      ? suggestedFilename
      : `${suggestedFilename}.pdf`;
    setBusy('print');
    try {
      if (format === 'grid' && gridAvailable) {
        await printScheduleGridPdf(gridDocProps, filename);
      } else {
        await printSchedulePdf(tableDocProps, filename);
      }
    } catch (err: any) {
      console.error('[Print] Failed:', err);
      setError(err?.message ?? 'Failed to open print view.');
    } finally {
      setBusy(null);
    }
  };

  const handleExportExcel = () => {
    setError(null);
    const filename = promptFilename(suggestedFilename, 'xlsx');
    if (!filename) return;
    setBusy('excel');
    try {
      const stem = filename.replace(/\.xlsx$/i, '');
      exportScheduleExcel({
        entries,
        title: stem,
        termLabel,
        scopeLabel: isMaster ? undefined : scopeLabel,
        sheetName: isMaster ? 'Master' : scopeLabel.slice(0, 31),
      });
    } catch (err: any) {
      console.error('[Excel export] Failed:', err);
      setError(err?.message ?? 'Failed to generate Excel file.');
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null || entries.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <div className="w-full text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* ── Format toggle (PDF + Print only) ── */}
      {gridAvailable && (
        <div className="flex items-center rounded-lg border border-surface-variant overflow-hidden">
          <button
            type="button"
            onClick={() => setFormat('grid')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition ${
              format === 'grid'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
            title="Visual grid format (colored blocks)"
          >
            <Icon name="grid_on" size={14} />
            Grid
          </button>
          <button
            type="button"
            onClick={() => setFormat('table')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition border-l border-surface-variant ${
              format === 'table'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
            title="Tabular format (rows per class)"
          >
            <Icon name="view_list" size={14} />
            Table
          </button>
        </div>
      )}

      {/* ── Export buttons ── */}
      <button
        type="button"
        onClick={handleExportPdf}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          format === 'grid' && gridAvailable
            ? 'Export current view as a visual grid PDF'
            : 'Export current view as a tabular PDF'
        }
      >
        <Icon
          name={busy === 'pdf' ? 'hourglass_top' : 'picture_as_pdf'}
          size={16}
        />
        {busy === 'pdf' ? 'Generating…' : 'Export PDF'}
      </button>

      <button
        type="button"
        onClick={handleExportExcel}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
        title="Export current view as tabular data (Excel)"
      >
        <Icon
          name={busy === 'excel' ? 'hourglass_top' : 'table_view'}
          size={16}
        />
        {busy === 'excel' ? 'Generating…' : 'Export Excel'}
      </button>

      <button
        type="button"
        onClick={handlePrint}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          format === 'grid' && gridAvailable
            ? 'Open the grid PDF for printing'
            : 'Open the tabular PDF for printing'
        }
      >
        <Icon
          name={busy === 'print' ? 'hourglass_top' : 'print'}
          size={16}
        />
        {busy === 'print' ? 'Opening…' : 'Print'}
      </button>
    </div>
  );
}