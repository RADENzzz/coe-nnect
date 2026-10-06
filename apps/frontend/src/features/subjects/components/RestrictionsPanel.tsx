import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSubjectRestrictions,
  createSubjectRestriction,
  updateSubjectRestriction,
  deleteSubjectRestriction,
  type SubjectRecord,
} from '../../../api/subjects.api';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../../components/ui/ResponsiveTable';
import type { RowAction } from '../../../components/ui/RowActionMenu';
import { ActiveBadge } from '../../../components/ui/StatusBadge';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: SubjectRecord[];
}

interface RestrictionRow {
  restrictionId: string;
  subjectId1: string;
  subjectId2: string;
  warningMessage?: string | null;
  isActive: boolean;
}

export default function RestrictionsPanel({ open, onClose, subjects }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RestrictionRow | null>(null);
  const [form, setForm] = useState({
    subjectId1: '',
    subjectId2: '',
    warningMessage: '',
  });

  const { data: restrictions = [], isLoading } = useQuery({
    queryKey: ['subject-restrictions'],
    queryFn: () => fetchSubjectRestrictions(),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: createSubjectRestriction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subject-restrictions'] });
      setForm({ subjectId1: '', subjectId2: '', warningMessage: '' });
      setError(null);
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { warningMessage?: string; isActive?: boolean };
    }) => updateSubjectRestriction(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subject-restrictions'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubjectRestriction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subject-restrictions'] });
      setDeleteTarget(null);
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  const subjectLabel = (id: string) => {
    const s = subjects.find((x) => String(x.subjectId) === String(id));
    return s ? `[${s.subjectCode}] ${s.title}` : `#${id}`;
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.subjectId1 || !form.subjectId2) return;
    if (form.subjectId1 === form.subjectId2) {
      setError('Pick two different subjects.');
      return;
    }
    createMutation.mutate({
      subjectId1: form.subjectId1,
      subjectId2: form.subjectId2,
      warningMessage: form.warningMessage.trim() || undefined,
    });
  };

  const columns: Column<RestrictionRow>[] = [
    {
      key: 'subjectA',
      header: 'Subject A',
      cardVariant: 'title',
      cellClassName: 'font-mono text-xs text-primary',
      render: (r) => subjectLabel(r.subjectId1),
    },
    {
      key: 'subjectB',
      header: 'Subject B',
      cardVariant: 'subtitle',
      cellClassName: 'font-mono text-xs text-primary',
      render: (r) => subjectLabel(r.subjectId2),
    },
    {
      key: 'warning',
      header: 'Warning',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface-variant',
      render: (r) => r.warningMessage || '—',
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (r) => <ActiveBadge isActive={r.isActive} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (r: RestrictionRow): RowAction[] => [
    {
      label: r.isActive ? 'Disable' : 'Enable',
      icon: r.isActive ? 'toggle_off' : 'toggle_on',
      onClick: () =>
        updateMutation.mutate({
          id: r.restrictionId,
          input: { isActive: !r.isActive },
        }),
      disabled: updateMutation.isPending,
    },
    {
      label: 'Delete',
      icon: 'delete',
      danger: true,
      onClick: () => setDeleteTarget(r),
      disabled: deleteMutation.isPending,
    },
  ];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Subject Restrictions (S-11)"
        description="Warn when two subjects are scheduled in the same slot for the same section."
        size="lg"
        footer={
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Close
          </button>
        }
      >
        <div className="space-y-5">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Add new restriction */}
          <form
            onSubmit={handleAdd}
            className="rounded-lg border border-slate-200 p-4 bg-slate-50 space-y-3"
          >
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Add Restriction
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={form.subjectId1}
                onChange={(e) =>
                  setForm((p) => ({ ...p, subjectId1: e.target.value }))
                }
                required
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Subject A…</option>
                {subjects
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.subjectId} value={s.subjectId}>
                      [{s.subjectCode}] {s.title}
                    </option>
                  ))}
              </select>
              <select
                value={form.subjectId2}
                onChange={(e) =>
                  setForm((p) => ({ ...p, subjectId2: e.target.value }))
                }
                required
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Subject B…</option>
                {subjects
                  .filter((s) => s.isActive && s.subjectId !== form.subjectId1)
                  .map((s) => (
                    <option key={s.subjectId} value={s.subjectId}>
                      [{s.subjectCode}] {s.title}
                    </option>
                  ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="Warning message (optional)"
              value={form.warningMessage}
              onChange={(e) =>
                setForm((p) => ({ ...p, warningMessage: e.target.value }))
              }
              maxLength={500}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition flex items-center gap-2"
              >
                <Icon name="add" size={16} />
                {createMutation.isPending ? 'Adding…' : 'Add Restriction'}
              </button>
            </div>
          </form>

          {/* List */}
          <ResponsiveTable
            columns={columns}
            rows={restrictions as RestrictionRow[]}
            rowKey={(r) => r.restrictionId}
            rowTitle={(r) => subjectLabel(r.subjectId1)}
            rowSubtitle={(r) => `restricted against ${subjectLabel(r.subjectId2)}`}
            isLoading={isLoading}
            hasSourceRows={restrictions.length > 0}
            emptyMessage="No restrictions configured."
            noMatchMessage="No restrictions match your filters."
            getActions={getActions}
          />
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete restriction?"
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
                deleteTarget && deleteMutation.mutate(deleteTarget.restrictionId)
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
          Delete this restriction? This cannot be undone.
        </p>
      </Modal>
    </>
  );
}