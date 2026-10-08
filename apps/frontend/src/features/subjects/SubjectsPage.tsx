import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchSubjects,
  createSubject,
  updateSubject,
  toggleSubjectActive,
  deleteSubject,
  type SubjectRecord,
  type CreateSubjectInput,
} from '../../api/subjects.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { ActiveBadge } from '../../components/ui/StatusBadge';
import RestrictionsPanel from './components/RestrictionsPanel';
import { Link } from 'react-router-dom';

const ROOM_TYPES = [
  { value: '', label: '— any —' },
  { value: 'lecture_room', label: 'Lecture Room' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'computer_lab', label: 'Computer Lab' },
  { value: 'drafting_room', label: 'Drafting Room' },
  { value: 'other', label: 'Other' },
];

type Mode = 'create' | 'edit';
type RoomTypeFilter = '' | 'lecture_room' | 'laboratory' | 'computer_lab' | 'drafting_room' | 'other' | 'none';
type ComponentFilter = 'all' | 'lecture_only' | 'lab_only' | 'mixed';
type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'code' | 'title' | 'units' | 'dept' | 'roomType';
type SortDir = 'asc' | 'desc';

// Debounce hook — keeps the search input snappy
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function SubjectsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [restrictionsOpen, setRestrictionsOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<SubjectRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubjectRecord | null>(null);

  // ── Filters (URL-synced) ──
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get('q') ?? '',
  );
  const debouncedSearch = useDebouncedValue(searchInput, 200);

  const deptFilter = searchParams.get('dept') ?? '';
  const roomFilter = (searchParams.get('room') ?? '') as RoomTypeFilter;
  const compFilter = (searchParams.get('comp') ?? 'all') as ComponentFilter;
  const statusFilter = (searchParams.get('status') ?? 'all') as StatusFilter;
  const sortKey = (searchParams.get('sort') ?? 'code') as SortKey;
  const sortDir = (searchParams.get('dir') ?? 'asc') as SortDir;

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === 'all' || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Sync debounced search into URL
  useEffect(() => {
    if (debouncedSearch !== (searchParams.get('q') ?? '')) {
      setFilter('q', debouncedSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setFilter('dir', sortDir === 'asc' ? 'desc' : 'asc');
      } else {
        const next = new URLSearchParams(searchParams);
        next.set('sort', key);
        next.set('dir', 'asc');
        setSearchParams(next, { replace: true });
      }
    },
    [sortKey, sortDir, searchParams, setSearchParams, setFilter],
  );

  const clearAll = useCallback(() => {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const hasAnyFilter =
    !!searchInput ||
    !!deptFilter ||
    !!roomFilter ||
    compFilter !== 'all' ||
    statusFilter !== 'all';

  // ── Data ──
  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects', { includeInactive: true }],
    queryFn: () => fetchSubjects(true),
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  // ── Dept counts (for filter dropdown labels) ──
  const deptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of subjects) {
      const id = String(s.deptId ?? '');
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [subjects]);

  // ── Filtering + sorting ──
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    let rows = subjects.filter((s) => {
      // Search
      if (q) {
        const code = (s.subjectCode ?? '').toLowerCase();
        const title = (s.title ?? '').toLowerCase();
        if (!code.includes(q) && !title.includes(q)) return false;
      }

      // Dept
      if (deptFilter && String(s.deptId ?? '') !== deptFilter) return false;

      // Room type
      if (roomFilter === 'none') {
        if (s.requiredRoomType) return false;
      } else if (roomFilter) {
        if (s.requiredRoomType !== roomFilter) return false;
      }

      // Component
      const lec = Number(s.lectureUnits ?? 0);
      const lab = Number(s.labUnits ?? 0);
      if (compFilter === 'lecture_only' && (lec === 0 || lab > 0)) return false;
      if (compFilter === 'lab_only' && (lab === 0 || lec > 0)) return false;
      if (compFilter === 'mixed' && (lec === 0 || lab === 0)) return false;

      // Status
      if (statusFilter === 'active' && !s.isActive) return false;
      if (statusFilter === 'inactive' && s.isActive) return false;

      return true;
    });

    // Sort
    const deptCodeFor = (id: string | null) => {
      if (!id) return '';
      const d = departments.find((x) => String(x.deptId) === String(id));
      return d?.deptCode ?? '';
    };

    const dir = sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      let av = '';
      let bv = '';
      switch (sortKey) {
        case 'code':
          av = a.subjectCode ?? '';
          bv = b.subjectCode ?? '';
          break;
        case 'title':
          av = a.title ?? '';
          bv = b.title ?? '';
          break;
        case 'units':
          av = String(Number(a.totalUnits ?? 0)).padStart(6, '0');
          bv = String(Number(b.totalUnits ?? 0)).padStart(6, '0');
          break;
        case 'dept':
          av = deptCodeFor(a.deptId);
          bv = deptCodeFor(b.deptId);
          break;
        case 'roomType':
          av = a.requiredRoomType ?? '';
          bv = b.requiredRoomType ?? '';
          break;
      }
      return av.localeCompare(bv) * dir;
    });

    return rows;
  }, [
    subjects,
    debouncedSearch,
    deptFilter,
    roomFilter,
    compFilter,
    statusFilter,
    sortKey,
    sortDir,
    departments,
  ]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: createSubject,
    onSuccess: (s) => {
      setSuccess(`Subject "${s.subjectCode}" created.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateSubjectInput> }) =>
      updateSubject(id, input),
    onSuccess: (s) => {
      setSuccess(`Subject "${s.subjectCode}" updated.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to update'),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleSubjectActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubject,
    onSuccess: () => {
      setSuccess('Subject deleted.');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  // ── Form state ──
  const [form, setForm] = useState({
    subjectCode: '',
    title: '',
    lectureUnits: '',
    labUnits: '',
    requiredRoomType: '',
    deptId: '',
  });

  const closeForm = () => {
    setMode(null);
    setEditing(null);
    setForm({
      subjectCode: '',
      title: '',
      lectureUnits: '',
      labUnits: '',
      requiredRoomType: '',
      deptId: '',
    });
    setError(null);
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm({
      subjectCode: '',
      title: '',
      lectureUnits: '',
      labUnits: '',
      requiredRoomType: '',
      deptId: '',
    });
    setError(null);
    setSuccess(null);
  };

  const openEdit = (s: SubjectRecord) => {
    setMode('edit');
    setEditing(s);
    setForm({
      subjectCode: s.subjectCode,
      title: s.title,
      lectureUnits: String(s.lectureUnits ?? 0),
      labUnits: String(s.labUnits ?? 0),
      requiredRoomType: s.requiredRoomType ?? '',
      deptId: s.deptId ?? '',
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

    const lecture = Number(form.lectureUnits || 0);
    const lab = Number(form.labUnits || 0);
    const total = lecture + lab;

    if (total <= 0) {
      setError('Subject must have at least one unit.');
      return;
    }

    const payload: CreateSubjectInput = {
      subjectCode: form.subjectCode.trim(),
      title: form.title.trim(),
      totalUnits: total,
      lectureUnits: lecture,
      labUnits: lab,
      requiredRoomType: form.requiredRoomType || null,
      deptId: form.deptId,
    };

    if (mode === 'create') {
      createMutation.mutate(payload);
    } else if (mode === 'edit' && editing) {
      updateMutation.mutate({ id: editing.subjectId, input: payload });
    }
  };

  const deptName = (id: string | null) => {
    if (!id) return '—';
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? d.deptCode : `#${id}`;
  };

  // ── Sortable header helper ──
  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return 'unfold_more';
    return sortDir === 'asc' ? 'expand_less' : 'expand_more';
  };

  const SortHeader = ({
    label,
    sortKeyName,
    align = 'left',
  }: {
    label: string;
    sortKeyName: SortKey;
    align?: 'left' | 'right';
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortKeyName)}
      className={`inline-flex items-center gap-1 hover:text-primary transition ${
        align === 'right' ? 'ml-auto' : ''
      }`}
      title={`Sort by ${label}`}
    >
      {label}
      <Icon name={sortIcon(sortKeyName)} size={14} />
    </button>
  );

  // ── Columns ──
  const columns: Column<SubjectRecord>[] = [
    {
      key: 'code',
      header: <SortHeader label="Code" sortKeyName="code" />,
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (s) => s.subjectCode,
    },
    {
      key: 'title',
      header: <SortHeader label="Title" sortKeyName="title" />,
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface',
      render: (s) => s.title,
    },
    {
      key: 'units',
      header: <SortHeader label="Units" sortKeyName="units" />,
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (s) =>
        `${Number(s.lectureUnits)}L + ${Number(s.labUnits)}Lab = ${Number(s.totalUnits)}`,
    },
    {
      key: 'dept',
      header: <SortHeader label="Dept" sortKeyName="dept" />,
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs font-mono',
      render: (s) => deptName(s.deptId),
    },
    {
      key: 'roomType',
      header: <SortHeader label="Room Type" sortKeyName="roomType" />,
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (s) =>
        s.requiredRoomType ? s.requiredRoomType.replace('_', ' ') : '—',
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

  const getActions = (s: SubjectRecord): RowAction[] => [
    { label: 'Edit', icon: 'edit', onClick: () => openEdit(s) },
    {
      label: s.isActive ? 'Deactivate' : 'Activate',
      icon: s.isActive ? 'toggle_off' : 'toggle_on',
      onClick: () => toggleMutation.mutate(s.subjectId),
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Subjects</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {subjects.length} subject(s) registered
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setRestrictionsOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-surface-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low transition"
          >
            <Icon name="rule" size={18} />
            Manage Restrictions
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="add" size={18} />
            New Subject
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3 text-sm">
        <Icon name="info" size={18} className="text-blue-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-blue-900 font-medium">
            Subjects are step 2 of 3 in the Academic Structure flow.
          </p>
          <p className="text-blue-800 text-xs mt-0.5">
            Add your department's subjects here first, then map them to programs in
            the Prospectus.
          </p>
        </div>
        <Link
          to="/prospectus"
          className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap flex items-center gap-1"
        >
          Go to Prospectus
          <Icon name="arrow_forward" size={14} />
        </Link>
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

      {/* ── Filter panel ── */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[240px]">
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
                placeholder="Subject code or title…"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                  aria-label="Clear search"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Department */}
          <div className="min-w-[180px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Department
            </label>
            <select
              value={deptFilter}
              onChange={(e) => setFilter('dept', e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">All departments</option>
              {departments
                .filter((d) => d.isActive)
                .map((d) => {
                  const count = deptCounts.get(String(d.deptId)) ?? 0;
                  return (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName} ({count})
                    </option>
                  );
                })}
            </select>
          </div>

          {/* Room type */}
          <div className="min-w-[150px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Room Type
            </label>
            <select
              value={roomFilter}
              onChange={(e) => setFilter('room', e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Any room type</option>
              <option value="none">No specific room</option>
              <option value="lecture_room">Lecture Room</option>
              <option value="laboratory">Laboratory</option>
              <option value="computer_lab">Computer Lab</option>
              <option value="drafting_room">Drafting Room</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Component */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Component
            </label>
            <select
              value={compFilter}
              onChange={(e) => setFilter('comp', e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">Any</option>
              <option value="lecture_only">Lecture only</option>
              <option value="lab_only">Lab only</option>
              <option value="mixed">Mixed (Lec + Lab)</option>
            </select>
          </div>

          {/* Status */}
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

          {/* Clear */}
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
            Showing <strong className="text-on-surface">{filtered.length}</strong>{' '}
            of {subjects.length}
          </div>
        </div>
      </div>

      {/* Table */}
      <ResponsiveTable
        columns={columns}
        rows={filtered}
        rowKey={(s) => s.subjectId}
        rowTitle={(s) => s.subjectCode}
        rowSubtitle={(s) => s.title}
        isLoading={isLoading}
        hasSourceRows={subjects.length > 0}
        emptyMessage="No subjects yet."
        noMatchMessage="No subjects match your filters."
        getActions={getActions}
      />

      {/* Create/Edit modal */}
      <Modal
        open={!!mode}
        onClose={closeForm}
        title={
          mode === 'create'
            ? 'Create Subject'
            : `Edit Subject — ${editing?.subjectCode}`
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Subject Code *
              </label>
              <input
                type="text"
                name="subjectCode"
                required
                value={form.subjectCode}
                onChange={handleChange}
                placeholder="e.g. CPE 101"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Department *
              </label>
              <select
                name="deptId"
                required
                value={form.deptId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select a department…</option>
                {departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName}
                    </option>
                  ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Title *
              </label>
              <input
                type="text"
                name="title"
                required
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Programming Logic & Design"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Lecture Units *
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                name="lectureUnits"
                required
                value={form.lectureUnits}
                onChange={handleChange}
                placeholder="0"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Lab Units *
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                name="labUnits"
                required
                value={form.labUnits}
                onChange={handleChange}
                placeholder="0"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-on-surface-variant">
                Total units:{' '}
                <strong className="text-on-surface">
                  {Number(form.lectureUnits || 0) + Number(form.labUnits || 0)}
                </strong>
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Required Room Type
              </label>
              <select
                name="requiredRoomType"
                value={form.requiredRoomType}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                {ROOM_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-on-surface-variant mt-1">
                Leave as "any" if the subject can be scheduled in any room.
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
                : mode === 'create'
                ? 'Create Subject'
                : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete subject?"
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
                deleteTarget && deleteMutation.mutate(deleteTarget.subjectId)
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
          Delete subject <strong>"{deleteTarget?.subjectCode}"</strong>? This
          action cannot be undone.
        </p>
      </Modal>

      <RestrictionsPanel
        open={restrictionsOpen}
        onClose={() => setRestrictionsOpen(false)}
        subjects={subjects}
      />
    </div>
  );
}