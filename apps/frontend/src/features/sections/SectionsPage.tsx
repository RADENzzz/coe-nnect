import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchSections,
  createSection,
  toggleSectionActive,
  deleteSection,
  type Section,
} from '../../api/sections.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { ActiveBadge } from '../../components/ui/StatusBadge';

export default function SectionsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    sectionCode: '',
    yearLevel: '',
    studentCount: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['sections'],
    queryFn: fetchSections,
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: createSection,
    onSuccess: (section) => {
      setSuccess(`Section "${section.sectionCode}" created.`);
      setForm({ sectionCode: '', yearLevel: '', studentCount: '' });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['sections'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleSectionActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sections'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSection,
    onSuccess: () => {
      setSuccess('Section deleted.');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['sections'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    createMutation.mutate({
      sectionCode: form.sectionCode.trim(),
      yearLevel: form.yearLevel ? Number(form.yearLevel) : undefined,
      studentCount: form.studentCount ? Number(form.studentCount) : undefined,
    });
  };

  const columns: Column<Section>[] = [
    {
      key: 'code',
      header: 'Section Code',
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (s) => s.sectionCode,
    },
    {
      key: 'yearLevel',
      header: 'Year Level',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant',
      render: (s) => (s.yearLevel != null ? String(s.yearLevel) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (s) => <ActiveBadge isActive={s.isActive} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (s: Section): RowAction[] => [
    {
      label: s.isActive ? 'Deactivate' : 'Activate',
      icon: s.isActive ? 'toggle_off' : 'toggle_on',
      onClick: () => toggleMutation.mutate(s.sectionId),
      disabled: toggleMutation.isPending,
    },
    {
      label: 'Delete',
      icon: 'delete',
      danger: true,
      onClick: () => setDeleteTarget(s),
      disabled: deleteMutation.isPending,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Sections</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {sections.length} section(s) registered
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setError(null);
            setSuccess(null);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="add" size={18} />
          New Section
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-100 border border-green-300 text-green-700 text-sm">
          {success}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Create Section"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Section Code *
              </label>
              <input
                type="text"
                name="sectionCode"
                required
                value={form.sectionCode}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. CpE-1A"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Year Level
              </label>
              <select
                name="yearLevel"
                value={form.yearLevel}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— none —</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Students (advisory)
              </label>
              <input
                type="number"
                name="studentCount"
                min="0"
                value={form.studentCount}
                onChange={handleChange}
                placeholder="e.g. 40"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">
                Rough count only — used by S-8 as a soft signal. Not enforced.
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-surface-variant mt-6">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Section'}
            </button>
          </div>
        </form>
      </Modal>

      <ResponsiveTable
        columns={columns}
        rows={sections}
        rowKey={(s) => s.sectionId}
        rowTitle={(s) => s.sectionCode}
        isLoading={isLoading}
        hasSourceRows={sections.length > 0}
        emptyMessage="No sections yet."
        noMatchMessage="No sections match your filters."
        getActions={getActions}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete section?"
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
                deleteTarget && deleteMutation.mutate(deleteTarget.sectionId)
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
          Delete <strong>"{deleteTarget?.sectionCode}"</strong>? This action
          cannot be undone.
        </p>
      </Modal>
    </div>
  );
}