import { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/ui/Icon';
import type { ScheduleEntry } from '../types';
import type { LayoutMode } from '../TimetablePage';
import {
  exportSchedulePdf,
  printSchedulePdf,
  generateSchedulePdfFile,
  type SchedulePdfProps,
} from './generateSchedulePdf';
import {
  exportScheduleGridPdf,
  printScheduleGridPdf,
  generateScheduleGridPdfFile,
  type ScheduleGridPdfProps,
} from './generateScheduleGridPdf';
import {
  exportScheduleAgendaPdf,
  printScheduleAgendaPdf,
  generateScheduleAgendaPdfFile,
  type ScheduleAgendaPdfProps,
} from './generateScheduleAgendaPdf';
import { exportScheduleExcel } from './generateScheduleExcel';
import ExportFilenameModal from './ExportFilenameModal';
import ExportSheet from './ExportSheet';

export type ExportFormat = 'agenda' | 'grid' | 'table';
type Busy = 'pdf' | 'excel' | 'print' | 'share' | null;

interface Props {
  entries: ScheduleEntry[];
  scopeLabel: string;
  termLabel: string;
  suggestedFilename: string;
  gridAvailable: boolean;
  gridScopeLabel: string;
  layoutMode: LayoutMode;
  /**
   * When set, the toolbar is exporting a historical version instead of
   * the live schedule. Version number is appended to titles, and the
   * "finalized by / on" line is added to the doc subtitle.
   */
  versionContext?: {
    versionNumber: number;
    finalizedByName: string | null;
    capturedAt: string | null;
  } | null;
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return !window.matchMedia('(min-width: 768px)').matches;
}

function useIsMobile(): boolean {
  const [is, setIs] = useState(isMobileViewport);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handle = () => setIs(!mq.matches);
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);
  return is;
}

function useCanShare(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') {
    return false;
  }
  try {
    const probe = new File([new Blob()], 'probe.pdf', {
      type: 'application/pdf',
    });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export default function ExportToolbar({
  entries,
  scopeLabel,
  termLabel,
  suggestedFilename,
  gridAvailable,
  gridScopeLabel,
  layoutMode,
  versionContext,
}: Props) {
  const isMobile = useIsMobile();
  const canShare = useCanShare();

  const availableFormats = useMemo<ExportFormat[]>(() => {
    const list: ExportFormat[] = [];
    if (layoutMode === 'agenda') {
      list.push('agenda');
      if (gridAvailable) list.push('grid');
      list.push('table');
    } else {
      if (gridAvailable) list.push('grid');
      list.push('agenda', 'table');
    }
    return list;
  }, [layoutMode, gridAvailable]);

  const defaultFormat: ExportFormat = useMemo(() => {
    if (layoutMode === 'agenda') return 'agenda';
    if (layoutMode === 'grid' && gridAvailable) return 'grid';
    return 'table';
  }, [layoutMode, gridAvailable]);

  const [format, setFormat] = useState<ExportFormat>(defaultFormat);

  useEffect(() => {
    setFormat(defaultFormat);
  }, [defaultFormat]);

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filenameModal, setFilenameModal] = useState<{
    ext: 'pdf' | 'xlsx';
    pending: (filename: string) => void;
  } | null>(null);

  const isMaster = scopeLabel === 'Master View';

  // ── Version context: title suffix + subtitle ──
  const versionSuffix = versionContext
    ? ` — v${versionContext.versionNumber}`
    : '';

  const versionSubtitle = versionContext
    ? [
        `Version ${versionContext.versionNumber}`,
        versionContext.finalizedByName
          ? `finalized by ${versionContext.finalizedByName}`
          : null,
        versionContext.capturedAt
          ? `on ${new Date(versionContext.capturedAt).toLocaleString(
              undefined,
              {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              },
            )}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  // ── Filename with version suffix ──
  const effectiveFilename = versionContext
    ? `${suggestedFilename}_v${versionContext.versionNumber}`
    : suggestedFilename;

  // ── Doc props builders ──
  const tableDocProps: SchedulePdfProps = {
    entries,
    title:
      (isMaster
        ? 'CoE-NNECT Master Timetable'
        : `CoE-NNECT Timetable — ${scopeLabel}`) + versionSuffix,
    subtitle: versionSubtitle
      ? versionSubtitle
      : isMaster
      ? 'College-wide schedule'
      : `View: ${scopeLabel}`,
    termLabel,
    scopeLabel: isMaster ? undefined : scopeLabel,
  };

  const gridDocProps: ScheduleGridPdfProps = {
    entries,
    title:
      (isMaster
        ? 'CoE-NNECT Master Schedule'
        : `Room Schedule — ${gridScopeLabel}`) + versionSuffix,
    subtitle: versionSubtitle
      ? versionSubtitle
      : isMaster
      ? 'College-wide master schedule'
      : gridScopeLabel,
    termLabel,
  };

  const agendaDocProps: ScheduleAgendaPdfProps = {
    entries,
    title:
      (isMaster
        ? 'CoE-NNECT Master Schedule'
        : `CoE-NNECT Schedule — ${scopeLabel}`) + versionSuffix,
    subtitle: versionSubtitle
      ? versionSubtitle
      : isMaster
      ? 'College-wide schedule'
      : `View: ${scopeLabel}`,
    termLabel,
    scopeLabel: isMaster ? undefined : scopeLabel,
  };

  const runExportPdf = async (filename: string) => {
    setError(null);
    setBusy('pdf');
    try {
      if (format === 'grid' && gridAvailable) {
        await exportScheduleGridPdf(gridDocProps, filename);
      } else if (format === 'agenda') {
        await exportScheduleAgendaPdf(agendaDocProps, filename);
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

  const runPrint = async () => {
    setError(null);
    const filename = effectiveFilename.endsWith('.pdf')
      ? effectiveFilename
      : `${effectiveFilename}.pdf`;
    setBusy('print');
    try {
      if (format === 'grid' && gridAvailable) {
        await printScheduleGridPdf(gridDocProps, filename);
      } else if (format === 'agenda') {
        await printScheduleAgendaPdf(agendaDocProps, filename);
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

  const runShare = async () => {
    if (!canShare) return;
    setError(null);
    setBusy('share');
    try {
      let file: File;
      const filename = effectiveFilename.endsWith('.pdf')
        ? effectiveFilename
        : `${effectiveFilename}.pdf`;

      if (format === 'grid' && gridAvailable) {
        file = await generateScheduleGridPdfFile(gridDocProps, filename);
      } else if (format === 'agenda') {
        file = await generateScheduleAgendaPdfFile(agendaDocProps, filename);
      } else {
        file = await generateSchedulePdfFile(tableDocProps, filename);
      }

      await navigator.share({
        files: [file],
        title: file.name,
        text: `${scopeLabel} — ${termLabel}${
          versionContext ? ` (v${versionContext.versionNumber})` : ''
        }`,
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[Share] Failed:', err);
        setError(err?.message ?? 'Failed to share PDF.');
      }
    } finally {
      setBusy(null);
    }
  };

  const runExportExcel = (filename: string) => {
    setError(null);
    setBusy('excel');
    try {
      const stem = filename.replace(/\.xlsx$/i, '');
      exportScheduleExcel({
        entries,
        title: stem,
        termLabel: versionSubtitle
          ? `${termLabel} — ${versionSubtitle}`
          : termLabel,
        scopeLabel: isMaster ? undefined : scopeLabel,
        sheetName: isMaster
          ? 'Master'
          : scopeLabel.slice(0, 31),
      });
    } catch (err: any) {
      console.error('[Excel export] Failed:', err);
      setError(err?.message ?? 'Failed to generate Excel file.');
    } finally {
      setBusy(null);
    }
  };

  const handleExportPdf = () => {
    setFilenameModal({
      ext: 'pdf',
      pending: (filename) => runExportPdf(filename),
    });
  };

  const handleExportExcel = () => {
    setFilenameModal({
      ext: 'xlsx',
      pending: (filename) => runExportExcel(filename),
    });
  };

  const disabled = busy !== null || entries.length === 0;

  if (isMobile) {
    return (
      <>
        {error && (
          <div className="w-full text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-2">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={disabled}
          className="flex items-center gap-2 px-3.5 py-2 border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="download" size={16} />
          Export
        </button>

        <ExportSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          format={format}
          onFormatChange={setFormat}
          availableFormats={availableFormats}
          scopeLine={`${scopeLabel} · ${entries.length} ${
            entries.length === 1 ? 'entry' : 'entries'
          }`}
          onExportPdf={() => {
            setSheetOpen(false);
            handleExportPdf();
          }}
          onExportExcel={() => {
            setSheetOpen(false);
            handleExportExcel();
          }}
          onShare={() => {
            setSheetOpen(false);
            runShare();
          }}
          canShare={canShare}
          busy={busy}
          disabled={disabled}
        />

        {filenameModal && (
          <ExportFilenameModal
            open={true}
            onClose={() => setFilenameModal(null)}
            defaultStem={effectiveFilename}
            extension={filenameModal.ext}
            onConfirm={(filename) => filenameModal.pending(filename)}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <div className="w-full text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2">
          {error}
        </div>
      )}

      {availableFormats.length > 1 && (
        <div className="flex items-center border border-surface-variant overflow-hidden">
          {availableFormats.map((f, idx) => {
            const active = f === format;
            const label =
              f === 'agenda' ? 'Agenda' : f === 'grid' ? 'Grid' : 'Table';
            const icon =
              f === 'agenda'
                ? 'view_list'
                : f === 'grid'
                ? 'grid_on'
                : 'table_view';
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition ${
                  idx > 0 ? 'border-l border-surface-variant' : ''
                } ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                }`}
                title={`${label} format`}
              >
                <Icon name={icon} size={14} />
                {label}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={handleExportPdf}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
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
        className="flex items-center gap-2 px-3 py-2 border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Icon
          name={busy === 'excel' ? 'hourglass_top' : 'table_view'}
          size={16}
        />
        {busy === 'excel' ? 'Generating…' : 'Export Excel'}
      </button>

      <button
        type="button"
        onClick={runPrint}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
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