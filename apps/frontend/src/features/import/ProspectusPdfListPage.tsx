import { useState } from 'react';
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

export default function ProspectusPdfListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProspectusPdf | null>(null);
  const [error, setError] = useState<string | null>(null);

  const departmentId = profile?.dept_id ? String(profile.dept_id) : undefined;

  const { data: pdfs = [], isLoading } = useQuery({
    queryKey: ['prospectus-pdfs', { departmentId }],
    queryFn: () => fetchProspectusPdfs(departmentId),
    enabled: !!profile,
  });

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
      render: (p) => p.originalFilename,
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
      render: (p) => (
        <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-xs">
          {p.tables?.length ?? 0} / 12
        </span>
      ),
    },
    {
      key: 'uploaded',
      header: 'Uploaded',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface-variant',
      render: (p) => new Date(p.uploadedAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (p: ProspectusPdf): RowAction[] => [
    {
      label: 'Open',
      icon: 'edit',
      onClick: () => navigate(`/import/${p.pdfId}`),
    },
    {
      label: 'Delete',
      icon: 'delete',
      danger: true,
      onClick: () => setDeleteTarget(p),
    },
  ];

  const canUpload =
    profile?.role === 'department_head' ||
    profile?.role === 'administrator' ||
    profile?.role === 'college_dean';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="upload_file" size={18} />
            Upload PDF
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          {error}
        </div>
      )}

      <ResponsiveTable
        columns={columns}
        rows={pdfs}
        rowKey={(p) => p.pdfId}
        rowTitle={(p) => p.originalFilename}
        rowSubtitle={(p) => `${p.pageCount} pages`}
        isLoading={isLoading}
        hasSourceRows={pdfs.length > 0}
        emptyMessage="No prospectus PDFs uploaded yet. Upload one to get started."
        noMatchMessage="No PDFs match your filters."
        getActions={getActions}
      />

      <Modal
        open={uploadOpen}
        onClose={() => !uploadMutation.isPending && setUploadOpen(false)}
        title="Upload Prospectus PDF"
        size="md"
      >
        {!departmentId ? (
          <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-sm">
            Your account is not associated with a department. Contact the
            administrator.
          </div>
        ) : (
          <UploadDropzone
            onFile={(file) => uploadMutation.mutate({ file, departmentId })}
            disabled={uploadMutation.isPending}
          />
        )}
      </Modal>

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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.pdfId)
              }
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <strong>"{deleteTarget?.originalFilename}"</strong> and all
          its table mappings? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}