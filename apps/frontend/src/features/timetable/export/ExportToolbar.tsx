import { useState } from 'react';
import Icon from '../../../components/ui/Icon';
import type { ScheduleEntry } from '../types';
import {
  exportSchedulePdf,
  printSchedulePdf,
} from './generateSchedulePdf';
import { exportScheduleExcel } from './generateScheduleExcel';

interface Props {
  entries: ScheduleEntry[];
  // Describes the current scope so the PDF/XLSX titles are correct
  scopeLabel: string;      // "Master View" | "Room 205" | "Computer Engineering" | ...
  termLabel: string;       // "1st Semester AY 2026-2027"
  // Suggested filename stem (no extension). The user can override it.
  suggestedFilename: string;
}

export default function ExportToolbar({
  entries,
  scopeLabel,
  termLabel,
  suggestedFilename,
}: Props) {
  const [busy, setBusy] = useState<'pdf' | 'excel' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMaster = scopeLabel === 'Master View';

  // ── PDF/XLSX props shared by both output paths ──
  const docProps = {
    entries,
    title: isMaster
      ? 'CoE-NNECT Master Timetable'
      : `CoE-NNECT Timetable — ${scopeLabel}`,
    subtitle: isMaster
      ? 'College-wide schedule'
      : `View: ${scopeLabel}`,
    termLabel,
    scopeLabel: isMaster ? undefined : scopeLabel,
  };

  const promptFilename = (defaultStem: string, ext: string): string | null => {
    const input = window.prompt(
      'File name (without extension):',
      defaultStem,
    );
    if (input === null) return null; // user cancelled
    const trimmed = input.trim();
    if (!trimmed) return null;
    return `${trimmed}.${ext}`;
  };

  const handleExportPdf = async () => {
    setError(null);
    const filename = promptFilename(suggestedFilename, 'pdf');
    if (!filename) return;
    setBusy('pdf');
    try {
      await exportSchedulePdf(docProps, filename);
    } catch (err: any) {
      console.error('[PDF export] Failed:', err);
      setError(err?.message ?? 'Failed to generate PDF.');
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
      // xlsx writeFile uses the title-derived filename; pass a custom one instead
      // by temporarily overriding through the title.
      // Simpler: use XLSX.write + manual download here.
      const stem = filename.replace(/\.xlsx$/i, '');
      exportScheduleExcel({
        entries: docProps.entries,
        title: stem,
        termLabel: docProps.termLabel,
        scopeLabel: docProps.scopeLabel,
        sheetName: isMaster ? 'Master' : scopeLabel.slice(0, 31),
      });
    } catch (err: any) {
      console.error('[Excel export] Failed:', err);
      setError(err?.message ?? 'Failed to generate Excel file.');
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
      await printSchedulePdf(docProps, filename);
    } catch (err: any) {
      console.error('[Print] Failed:', err);
      setError(err?.message ?? 'Failed to open print view.');
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

      <button
        type="button"
        onClick={handleExportPdf}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
        title="Export current view to PDF"
      >
        <Icon name={busy === 'pdf' ? 'hourglass_top' : 'picture_as_pdf'} size={16} />
        {busy === 'pdf' ? 'Generating…' : 'Export PDF'}
      </button>

      <button
        type="button"
        onClick={handleExportExcel}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
        title="Export current view to Excel"
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
        title="Open print view"
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