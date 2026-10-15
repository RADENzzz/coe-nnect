import { useEffect, useRef, useState } from 'react';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import type { FacultyRequest } from '../../../api/faculty-requests.api';
import { exportApprovalsPdf } from './approvalsReportPdf';
import { exportApprovalsExcel } from './approvalsReportExcel';

interface Props {
  rows: FacultyRequest[];
  deptCode: (id: string) => string;
  deptName: (id: string) => string;
  termLabel: string;
}

type ExportKind = 'pdf' | 'xlsx';

const LS_LAST_PREFIX_KEY = 'coe-nnect:approvals-export-prefix';

export default function ApprovalsExportToolbar({
  rows,
  deptCode,
  deptName,
  termLabel,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filenameOpen, setFilenameOpen] = useState<ExportKind | null>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<ExportKind | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Keyboard: Ctrl/Cmd + E opens menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setMenuOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const defaultPrefix = () => {
    try {
      const saved = localStorage.getItem(LS_LAST_PREFIX_KEY);
      if (saved) return saved;
    } catch {
      /* ignore */
    }
    return `CoE-NNECT_approvals_${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')}`;
  };

  const openFilename = (ext: ExportKind) => {
    setError(null);
    setFilename(defaultPrefix());
    setFilenameOpen(ext);
    setMenuOpen(false);
  };

  const savePrefix = (name: string) => {
    try {
      localStorage.setItem(LS_LAST_PREFIX_KEY, name);
    } catch {
      /* ignore */
    }
  };

  const handleExportPdf = async () => {
    if (!filenameOpen || !filename.trim()) return;
    const base = filename.trim().replace(/\.pdf$/i, '');
    const finalName = `${base}.pdf`;
    savePrefix(base);
    setBusy('pdf');
    setFilenameOpen(null);
    try {
      await exportApprovalsPdf(
        { rows, deptCode, deptName, termLabel },
        finalName,
      );
    } catch (err: any) {
      console.error('[Approvals PDF] Failed:', err);
      setError(err?.message ?? 'Failed to generate PDF.');
    } finally {
      setBusy(null);
    }
  };

  const handleExportExcel = () => {
    if (!filenameOpen || !filename.trim()) return;
    const base = filename.trim().replace(/\.xlsx$/i, '');
    const finalName = `${base}.xlsx`;
    savePrefix(base);
    setBusy('excel' as ExportKind);
    setFilenameOpen(null);
    try {
      exportApprovalsExcel(
        { rows, deptCode, deptName, termLabel },
        finalName,
      );
    } catch (err: any) {
      console.error('[Approvals Excel] Failed:', err);
      setError(err?.message ?? 'Failed to generate Excel.');
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = async () => {
    setError(null);
    setBusy('print');
    setMenuOpen(false);
    try {
      await exportApprovalsPdf(
        { rows, deptCode, deptName, termLabel },
        'approvals-print.pdf',
        { print: true },
      );
    } catch (err: any) {
      console.error('[Approvals Print] Failed:', err);
      setError(err?.message ?? 'Failed to open print view.');
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null || rows.length === 0;
  const rowCount = rows.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {error && (
          <div
            role="alert"
            className="w-full text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg flex items-start gap-2"
          >
            <Icon name="error" size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
              aria-label="Dismiss"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        )}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={disabled}
            className="flex items-center gap-2 px-3 py-2 border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
            title={disabled ? 'Nothing to export' : 'Export options (Ctrl/Cmd+E)'}
          >
            <Icon
              name={busy ? 'hourglass_top' : 'download'}
              size={16}
            />
            {busy ? 'Working…' : 'Export'}
            {rowCount > 0 && (
              <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {rowCount}
              </span>
            )}
            <Icon
              name="expand_more"
              size={14}
              className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 shadow-lg rounded-lg z-50 overflow-hidden">
              <button
                type="button"
                onClick={() => openFilename('pdf')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                <Icon name="picture_as_pdf" size={16} className="text-red-600" />
                <span className="flex-1">Export as PDF</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  .pdf
                </span>
              </button>
              <button
                type="button"
                onClick={() => openFilename('xlsx')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition border-t border-slate-100"
              >
                <Icon name="table_view" size={16} className="text-emerald-600" />
                <span className="flex-1">Export as Excel</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  .xlsx
                </span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition border-t border-slate-100"
              >
                <Icon name="print" size={16} className="text-slate-500" />
                <span className="flex-1">Print preview</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={!!filenameOpen}
        onClose={() => setFilenameOpen(null)}
        title="Save export"
        description={`File name for the .${filenameOpen ?? 'pdf'} export`}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFilenameOpen(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={
                filenameOpen === 'pdf' ? handleExportPdf : handleExportExcel
              }
              disabled={!filename.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50 rounded-lg"
            >
              <Icon name="download" size={16} />
              Save
            </button>
          </>
        }
      >
        <label className="block">
          <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            File name
          </span>
          <div className="flex items-stretch border border-slate-300 focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-[#5c1219] rounded-lg overflow-hidden">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (filenameOpen === 'pdf') handleExportPdf();
                  else handleExportExcel();
                }
              }}
              autoFocus
              className="flex-1 px-3 py-2 text-sm outline-none bg-white"
            />
            <span className="flex items-center px-3 text-sm text-slate-500 bg-slate-50 border-l border-slate-200 tabular-nums">
              .{filenameOpen}
            </span>
          </div>
          {rowCount > 0 && (
            <p className="text-[11px] text-slate-500 mt-2">
              Will include <strong>{rowCount}</strong> row
              {rowCount === 1 ? '' : 's'} from the current filtered view.
            </p>
          )}
        </label>
      </Modal>
    </>
  );
}