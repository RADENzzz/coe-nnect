import { useState } from 'react';
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

export default function ApprovalsExportToolbar({
  rows,
  deptCode,
  deptName,
  termLabel,
}: Props) {
  const [filenameOpen, setFilenameOpen] = useState<'pdf' | 'xlsx' | null>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<'pdf' | 'excel' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggested = `CoE-NNECT_approvals_${new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '')}`;

  const openFilename = (ext: 'pdf' | 'xlsx') => {
    setError(null);
    setFilename(suggested);
    setFilenameOpen(ext);
  };

  const handleExportPdf = async () => {
    if (!filenameOpen || !filename.trim()) return;
    const finalName = `${filename.trim().replace(/\.pdf$/i, '')}.pdf`;
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
    const finalName = `${filename.trim().replace(/\.xlsx$/i, '')}.xlsx`;
    setBusy('excel');
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
    try {
      // Same as export but opens in a new tab
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {error && (
          <div className="w-full text-xs text-red-700 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => openFilename('pdf')}
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
          onClick={() => openFilename('xlsx')}
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
          onClick={handlePrint}
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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={
                filenameOpen === 'pdf' ? handleExportPdf : handleExportExcel
              }
              disabled={!filename.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:bg-tertiary transition disabled:opacity-50"
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
          <div className="flex items-stretch border border-slate-300 focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-[#5c1219]">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  filenameOpen === 'pdf' ? handleExportPdf() : handleExportExcel();
                }
              }}
              autoFocus
              className="flex-1 px-3 py-2 text-sm outline-none bg-white"
            />
            <span className="flex items-center px-3 text-sm text-slate-500 bg-slate-50 border-l border-slate-200 tabular-nums">
              .{filenameOpen}
            </span>
          </div>
        </label>
      </Modal>
    </>
  );
}