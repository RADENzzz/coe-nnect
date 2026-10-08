import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchSections,
  createSection,
  updateSection,
  toggleSectionActive,
  deleteSection,
  type Section,
} from '../../api/sections.api';
import { fetchPrograms } from '../../api/programs.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { ActiveBadge } from '../../components/ui/StatusBadge';

type StatusFilter = 'all' | 'active' | 'inactive';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useState(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  });
  return debounced;
}

export default function SectionsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id ? String(profile.dept_id) : '';

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);

  const [form, setForm] = useState({
    sectionCode: '',
    programId: '',
    yearLevel: '',
    studentCount: '',
  });

  // ── Filters (URL-synced) ──
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get('q') ?? '',
  );

  // Simple debounce with useEffect
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);
  useState(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 200);
    return () => clearTimeout(t);
  });

  const programFilter = searchParams.get('program') ?? '';
  const yearFilter = searchParams.get('year') ?? '';
  const statusFilter = (searchParams.get('status') ?? 'all') as StatusFilter;

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === 'all') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clearAll = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  // ── Data ──
  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['sections'],
    queryFn: fetchSections,
    enabled: !!user,
  });

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: fetchPrograms,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // ── Filtered list ──
  const filteredSections = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return sections.filter((s) => {
      if (q && !s.sectionCode.toLowerCase().includes(q)) return false;
      if (programFilter && String(s.programId ?? '') !== programFilter) {
        return false;
      }
      if (yearFilter && String(s.yearLevel ?? '') !== yearFilter) return false;
      if (statusFilter === 'active' && !s.isActive) return false;
      if (statusFilter === 'inactive' && s.isActive) return false;
      return true;
    });
  }, [sections, debouncedSearch, programFilter, yearFilter, statusFilter]);

  const hasAnyFilter =
    !!searchInput ||
    !!programFilter ||
    !!yearFilter ||
    statusFilter !== 'all';

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: createSection,
    onSuccess: (section) => {
      setSuccess(`Section "${section.sectionCode}" created.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['sections'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: any }) =>
      updateSection(id, input),
    onSuccess: (section) => {
      setSuccess(`Section "${section.sectionCode}" updated.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['sections'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to update'),
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

  // ── Form helpers ──
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm({
      sectionCode: '',
      programId: '',
      yearLevel: '',
      studentCount: '',
    });
    setError(null);
  };

  const openCreate = () => {
    setShowForm(true);
    setEditing(null);
    setForm({
      sectionCode: '',
      programId: '',
      yearLevel: '',
      studentCount: '',
    });
    setError(null);
    setSuccess(null);
  };

  const openEdit = (s: Section) => {
    setShowForm(true);
    setEditing(s);
    setForm({
      sectionCode: s.sectionCode,
      programId: s.programId ?? '',
      yearLevel: s.yearLevel != null ? String(s.yearLevel) : '',
      studentCount: s.studentCount != null ? String(s.studentCount) : '',
    });
    setError(null);
    setSuccess(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = {
      sectionCode: form.sectionCode.trim(),
      programId: form.programId || undefined,
      yearLevel: form.yearLevel ? Number(form.yearLevel) : undefined,
      studentCount: form.studentCount ? Number(form.studentCount) : undefined,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.sectionId, input: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // ── Program helper ──
  const programLabel = (id: string | null) => {
    if (!id) return '—';
    const p = programs.find((x) => String(x.programId) === String(id));
    return p ? p.programCode : `#${id}`;
  };

  // ── Columns ──
  const columns: Column<Section>[] = [
    {
      key: 'code',
      header: 'Section Code',
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (s) => s.sectionCode,
    },
    {
      key: 'program',
      header: 'Program',
      cardVariant: 'meta',
      cellClassName: 'text-xs font-mono text-on-surface-variant',
      render: (s) => programLabel(s.programId),
    },
    {
      key: 'yearLevel',
      header: 'Year',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant',
      render: (s) => (s.yearLevel != null ? String(s.yearLevel) : '—'),
    },
    {
      key: 'students',
      header: 'Students',
      cardVariant: 'mono',
      cellClassName: 'text-xs text-on-surface-variant',
      render: (s) =>
        s.studentCount != null ? String(s.studentCount) : '—',
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
    { label: 'Edit', icon: 'edit', onClick: () => openEdit(s) },
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
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Sections</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {sections.length} section(s) registered
          </p>
        </div>
        <button
          onClick={openCreate}
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

      {/* Filter panel */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Search
            </label>
            <div className="relative">
              <Icon
                name="search"
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
              />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Section code…"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="min-w-[180px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Program
            </label>
            <select
              value={programFilter}
              onChange={(e) => setFilter('program', e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">All programs</option>
              {programs
                .filter((p) => p.isActive)
                .map((p) => (
                  <option key={p.programId} value={p.programId}>
                    [{p.programCode}] {p.programName}
                  </option>
                ))}
            </select>
          </div>

          <div className="min-w-[120px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Year
            </label>
            <select
              value={yearFilter}
              onChange={(e) => setFilter('year', e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Any</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </div>

          <div className="min-w-[120px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setFilter('status', e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition flex items-center gap-1.5"
            >
              <Icon name="close" size={14} />
              Clear all
            </button>
          )}

          <div className="ml-auto text-xs text-on-surface-variant whitespace-nowrap">
            Showing{' '}
            <strong className="text-on-surface">{filteredSections.length}</strong>{' '}
            of {sections.length}
          </div>
        </div>
      </div>

      <ResponsiveTable
        columns={columns}
        rows={filteredSections}
        rowKey={(s) => s.sectionId}
        rowTitle={(s) => s.sectionCode}
        isLoading={isLoading}
        hasSourceRows={sections.length > 0}
        emptyMessage="No sections yet."
        noMatchMessage="No sections match your filters."
        getActions={getActions}
      />

      {/* Create / Edit modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editing ? `Edit Section — ${editing.sectionCode}` : 'Create Section'}
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
                Program *
              </label>
              <select
                name="programId"
                required
                value={form.programId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select program…</option>
                {programs
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.programId} value={p.programId}>
                      [{p.programCode}] {p.programName}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Year Level *
              </label>
              <select
                name="yearLevel"
                required
                value={form.yearLevel}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— select —</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>

            <div className="md:col-span-2">
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
              onClick={closeForm}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editing
                ? 'Save Changes'
                : 'Create Section'}
            </button>
          </div>
        </form>
      </Modal>

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