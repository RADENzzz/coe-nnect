import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import ResponsiveTable, { type Column } from '@/components/ui/ResponsiveTable';
import type { RowAction } from '@/components/ui/RowActionMenu';
import {
  fetchProspectusPdfs,
  uploadProspectusPdf,
  deleteProspectusPdf,
} from '@/api/prospectus-pdfs.api';
import type { ProspectusPdf } from './types';
import UploadDropzone from './components/UploadDropzone';

const MAX_TABLES = 12;

export default function ProspectusPdfListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProspectusPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const departmentId = profile?.dept_id ? String(profile.dept_id) : undefined;

  const { data: pdfs = [], isLoading } = useQuery({
    queryKey: ['prospectus-pdfs', { departmentId }],
    queryFn: () => fetchProspectusPdfs(departmentId),
    enabled: !!profile,
  });

  // Sort newest first
  const sortedPdfs = useMemo(
    () =>
      [...pdfs].sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() -
          new Date(a.uploadedAt).getTime(),
      ),
    [pdfs],
  );

  // Filter by search
  const filteredPdfs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedPdfs;
    return sortedPdfs.filter((p) =>
      p.originalFilename.toLowerCase().includes(q),
    );
  }, [sortedPdfs, search]);

  const uploadMutation = useMutation({
    mutationFn: uploadProspectusPdf,
    onSuccess: (pdf) => {
      qc.invalidateQueries({ queryKey: ['prospectus-pdfs'] });
      setUploadOpen(false);
      navigate(`/import/${pdf.pdfId}`);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Upload failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProspectusPdf,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospectus-pdfs'] });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Delete failed');
    },
  });

  const columns: Column<ProspectusPdf>[] = [
    {
      key: 'filename',
      header: 'File',
      cardVariant: 'title',
      cellClassName: 'font-semibold text-on-surface',
      render: (p) => (
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            name="picture_as_pdf"
            size={16}
            className="text-rose-600 shrink-0"
          />
          <span className="truncate" title={p.originalFilename}>
            {p.originalFilename}
          </span>
        </div>
      ),
    },
    {
      key: 'pages',
      header: 'Pages',
      cardVariant: 'mono',
      cellClassName: 'font-mono text-xs text-on-surface-variant',
      render: (p) => String(p.pageCount),
    },
    {
      key: 'tables',
      header: 'Tables',
      cardVariant: 'badge',
      render: (p) => {
        const count = p.tables?.length ?? 0;
        const pct = Math.min(100, (count / MAX_TABLES) * 100);
        const tone =
          count === 0
            ? 'bg-slate-100 text-slate-600'
            : count >= MAX_TABLES
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-primary/10 text-primary';
        return (
          <div className="flex items-center gap-2 min-w-[100px]">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${tone}`}
            >
              {count}/{MAX_TABLES}
            </span>
            <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  count >= MAX_TABLES ? 'bg-emerald-500' : 'bg-primary'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'uploaded',
      header: 'Uploaded',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface-variant',
      render: (p) => {
        const d = new Date(p.uploadedAt);
        const now = Date.now();
        const diff = now - d.getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        const rel =
          mins < 1
            ? 'just now'
            : mins < 60
            ? `${mins}m ago`
            : hours < 24
            ? `${hours}h ago`
            : days < 7
            ? `${days}d ago`
            : d.toLocaleDateString('en-PH', {
                month: 'short',
                day: 'numeric',
              });
        return (
          <span title={d.toLocaleString('en-PH')}>{rel}</span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: () => null,
    },
  ];

  const getActions = (p: ProspectusPdf): RowAction[] => [
    {
      label: 'Open',
      icon: 'edit',
      onClick: () => navigate(`/import/${p.pdfId}`),
    },
    { divider: true },
    {
      label: 'Delete',
      icon: 'delete',
      danger: true,
      loading:
        deleteMutation.isPending &&
        deleteMutation.variables === p.pdfId,
      onClick: () => setDeleteTarget(p),
    },
  ];

  const canUpload =
    profile?.role === 'department_head' ||
    profile?.role === 'administrator' ||
    profile?.role === 'college_dean';

  const hasAnyFilter = !!search;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap" data-tour="import-header">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            Import Prospectus
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Upload a prospectus PDF, map its tables, and import subjects
            automatically.
          </p>
        </div>
        {canUpload && (
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition shadow-sm"
          >
            <Icon name="upload_file" size={18} />
            Upload PDF
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2"
        >
          <Icon name="error" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Search bar */}
      {pdfs.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Icon
              name="search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by filename…"
              className="w-full pl-9 pr-9 py-2 text-sm border border-surface-variant rounded-lg bg-surface-container-low focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                aria-label="Clear search"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          {hasAnyFilter && (
            <span className="text-xs text-on-surface-variant">
              Showing{' '}
              <strong className="text-on-surface">
                {filteredPdfs.length}
              </strong>{' '}
              of {pdfs.length}
            </span>
          )}
        </div>
      )}

      {/* Table / empty states */}
      <div data-tour="import-list">
        {pdfs.length === 0 && !isLoading && canUpload ? (
        <div className="rounded-xl border border-dashed border-surface-variant bg-surface-container-lowest py-16 text-center">
          <div className="w-16 h-16 bg-primary/5 border border-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon
              name="picture_as_pdf"
              size={32}
              className="text-primary"
            />
          </div>
          <p className="text-base font-semibold text-on-surface">
            No prospectus PDFs yet
          </p>
          <p className="text-sm text-on-surface-variant mt-1 mb-5 max-w-md mx-auto">
            Upload a PDF prospectus to map its tables and import subjects
            automatically.
          </p>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="upload_file" size={16} />
            Upload your first PDF
          </button>
        </div>
      ) : (
        <ResponsiveTable
          columns={columns}
          rows={filteredPdfs}
          rowKey={(p) => p.pdfId}
          rowTitle={(p) => p.originalFilename}
          rowSubtitle={(p) => `${p.pageCount} pages`}
          isLoading={isLoading}
          hasSourceRows={pdfs.length > 0}
          emptyMessage="No prospectus PDFs uploaded yet."
          noMatchMessage="No PDFs match your search."
          getActions={getActions}
          onRowClick={(p) => navigate(`/import/${p.pdfId}`)}
        />
        )}
      </div>

      {/* Upload modal */}
      <Modal
        open={uploadOpen}
        onClose={() => !uploadMutation.isPending && setUploadOpen(false)}
        title="Upload Prospectus PDF"
        description="PDF only, up to 20 MB."
        size="md"
      >
        {!departmentId ? (
          <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-sm flex items-start gap-2">
            <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
            <span>
              Your account is not associated with a department. Contact the
              administrator.
            </span>
          </div>
        ) : (
          <UploadDropzone
            onFile={(file) => uploadMutation.mutate({ file, departmentId })}
            disabled={uploadMutation.isPending}
            hint="After upload, you'll be taken to the mapping editor."
          />
        )}
      </Modal>

      {/* Delete modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this prospectus PDF?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.pdfId)
              }
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {deleteMutation.isPending && (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              )}
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Delete{' '}
            <strong>"{deleteTarget?.originalFilename}"</strong>?
          </p>
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
            <span>
              This removes the PDF, all{' '}
              <strong>{deleteTarget?.tables?.length ?? 0}</strong> mapped
              table{(deleteTarget?.tables?.length ?? 0) === 1 ? '' : 's'}, and
              any subjects imported from it. Subjects already added to the
              prospectus will be orphaned. This cannot be undone.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}