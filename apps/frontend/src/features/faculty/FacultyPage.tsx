import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchFaculty,
  createFaculty,
  updateFaculty,
  toggleFacultyActive,
  deleteFaculty,
  type FacultyRecord,
  type FacultyClass,
  type CreateFacultyInput,
} from '../../api/faculty.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import StatusBadge, { ActiveBadge } from '../../components/ui/StatusBadge';
import QualificationsModal from './components/QualificationsModal';
import { fetchDesignations } from '@/api/system-config.api';
import PreferencesModal from './components/PreferencesModal';

const CLASSIFICATIONS: { value: FacultyClass; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'part_time', label: 'Part-Time' },
  { value: 'visiting_lecturer', label: 'Visiting Lecturer' },
  { value: 'other', label: 'Other' },
];

type Mode = 'create' | 'edit';

const CLASS_TONE: Record<FacultyClass, 'info' | 'warning' | 'purple' | 'neutral'> = {
  regular: 'info',
  part_time: 'warning',
  visiting_lecturer: 'purple',
  other: 'neutral',
};

export default function FacultyPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<FacultyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    contact: '',
    wmsuId: '',
    employeeId: '',
    deptId: '',
    designationId: '',
    classification: 'regular' as FacultyClass,
    requiredHours: '',
  });
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsFaculty, setPrefsFaculty] = useState<FacultyRecord | null>(null);
  const [qualOpen, setQualOpen] = useState(false);
  const [qualFaculty, setQualFaculty] = useState<FacultyRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<FacultyRecord | null>(null);

  const { data: faculty = [], isLoading } = useQuery({
    queryKey: ['faculty', { includeInactive: true }],
    queryFn: () => fetchFaculty(true),
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  const { data: designations = [] } = useQuery({
    queryKey: ['designations'],
    queryFn: fetchDesignations,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const filteredFaculty = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return faculty.filter((f) => {
      if (deptFilter !== 'all' && String(f.deptId ?? '') !== deptFilter) {
        return false;
      }
      if (!q) return true;
      return (
        f.firstName.toLowerCase().includes(q) ||
        f.lastName.toLowerCase().includes(q) ||
        (f.email ?? '').toLowerCase().includes(q) ||
        (f.employeeId ?? '').toLowerCase().includes(q) ||
        (f.wmsuId ?? '').toLowerCase().includes(q)
      );
    });
  }, [faculty, searchQuery, deptFilter]);

  const createMutation = useMutation({
    mutationFn: createFaculty,
    onSuccess: (f) => {
      setSuccess(`Faculty "${f.lastName}, ${f.firstName}" created.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['faculty'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateFacultyInput> }) =>
      updateFaculty(id, input),
    onSuccess: (f) => {
      setSuccess(`Faculty "${f.lastName}, ${f.firstName}" updated.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['faculty'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to update'),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleFacultyActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['faculty'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFaculty,
    onSuccess: () => {
      setSuccess('Faculty deleted.');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['faculty'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  const closeForm = () => {
    setMode(null);
    setEditing(null);
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      contact: '',
      wmsuId: '',
      employeeId: '',
      deptId: '',
      designationId: '',
      classification: 'regular',
      requiredHours: '',
    });
    setError(null);
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      contact: '',
      wmsuId: '',
      employeeId: '',
      deptId: '',
      designationId: '',
      classification: 'regular',
      requiredHours: '',
    });
    setError(null);
    setSuccess(null);
  };

  const openEdit = (f: FacultyRecord) => {
    setMode('edit');
    setEditing(f);
    setForm({
      firstName: f.firstName,
      lastName: f.lastName,
      email: f.email ?? '',
      contact: f.contact ?? '',
      wmsuId: f.wmsuId ?? '',
      employeeId: f.employeeId ?? '',
      deptId: f.deptId ?? '',
      designationId: f.designationId ?? '',
      classification: f.classification,
      requiredHours: f.requiredHours != null ? String(f.requiredHours) : '',
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

    const payload: CreateFacultyInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || undefined,
      contact: form.contact.trim() || undefined,
      wmsuId: form.wmsuId.trim() || undefined,
      employeeId: form.employeeId.trim() || undefined,
      deptId: form.deptId || undefined,
      designationId: form.designationId || undefined,
      classification: form.classification,
      requiredHours: form.requiredHours ? Number(form.requiredHours) : undefined,
    };

    if (mode === 'create') {
      createMutation.mutate(payload);
    } else if (mode === 'edit' && editing) {
      updateMutation.mutate({ id: editing.facultyId, input: payload });
    }
  };

  const deptName = (id: string | null) => {
    if (!id) return '—';
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? `[${d.deptCode}] ${d.deptName}` : `Dept #${id}`;
  };

  const designationName = (id: string | null) => {
    if (!id) return '—';
    const d = designations.find(
      (x) => String(x.designationId) === String(id),
    );
    return d?.designationName ?? '—';
  };

  // ── Column definitions ──
  const columns: Column<FacultyRecord>[] = [
    {
      key: 'name',
      header: 'Name',
      cardVariant: 'title',
      cellClassName: 'text-on-surface font-medium',
      render: (f) => `${f.lastName}, ${f.firstName}`,
    },
    {
      key: 'email',
      header: 'Email',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (f) => f.email ?? '—',
    },
    {
      key: 'dept',
      header: 'Dept',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (f) => deptName(f.deptId),
    },
    {
      key: 'classification',
      header: 'Classification',
      cardVariant: 'badge',
      render: (f) => (
        <StatusBadge tone={CLASS_TONE[f.classification]}>
          {f.classification.replace('_', ' ')}
        </StatusBadge>
      ),
    },
    {
      key: 'designation',
      header: 'Designation',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (f) => designationName(f.designationId),
    },
    {
      key: 'hours',
      header: 'Hours',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (f) =>
        f.requiredHours != null ? `${f.requiredHours}h` : '18h (default)',
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (f) => <ActiveBadge isActive={f.isActive} />,
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

  const getActions = (f: FacultyRecord): RowAction[] => [
    {
      label: 'Edit',
      icon: 'edit',
      onClick: () => openEdit(f),
    },
    {
      label: 'Qualifications',
      icon: 'school',
      onClick: () => {
        setQualFaculty(f);
        setQualOpen(true);
      },
    },
    {
      label: 'Preferences',
      icon: 'event_available',
      onClick: () => {
        setPrefsFaculty(f);
        setPrefsOpen(true);
      },
    },
    {
      label: f.isActive ? 'Deactivate' : 'Activate',
      icon: f.isActive ? 'toggle_off' : 'toggle_on',
      onClick: () => toggleMutation.mutate(f.facultyId),
      disabled: toggleMutation.isPending,
    },
    {
      label: 'Delete',
      icon: 'delete',
      danger: true,
      onClick: () => setDeleteTarget(f),
      disabled: deleteMutation.isPending,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Faculty</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {faculty.length} faculty member(s) registered
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="add" size={18} />
          New Faculty
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

      {/* Search & filter */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name, email, or ID…"
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Department
          </label>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All departments</option>
            {departments
              .filter((d) => d.isActive)
              .map((d) => (
                <option key={d.deptId} value={d.deptId}>
                  [{d.deptCode}] {d.deptName}
                </option>
              ))}
          </select>
        </div>
        {(searchQuery || deptFilter !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setDeptFilter('all');
            }}
            className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
          >
            Clear
          </button>
        )}
        <div className="ml-auto text-xs text-on-surface-variant">
          Showing{' '}
          <strong className="text-on-surface">{filteredFaculty.length}</strong>{' '}
          of {faculty.length}
        </div>
      </div>

      {/* Table / Cards */}
      <ResponsiveTable
        columns={columns}
        rows={filteredFaculty}
        rowKey={(f) => f.facultyId}
        rowTitle={(f) => `${f.lastName}, ${f.firstName}`}
        rowSubtitle={(f) => f.email ?? ''}
        isLoading={isLoading}
        hasSourceRows={faculty.length > 0}
        emptyMessage="No faculty yet."
        noMatchMessage="No faculty match your filters."
        getActions={getActions}
      />

      {/* Create / Edit modal */}
      <Modal
        open={!!mode}
        onClose={closeForm}
        title={
          mode === 'create'
            ? 'Create Faculty'
            : `Edit Faculty — ${editing?.lastName}, ${editing?.firstName}`
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                First Name *
              </label>
              <input
                type="text"
                name="firstName"
                required
                value={form.firstName}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Last Name *
              </label>
              <input
                type="text"
                name="lastName"
                required
                value={form.lastName}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Contact
              </label>
              <input
                type="text"
                name="contact"
                value={form.contact}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                WMSU ID
              </label>
              <input
                type="text"
                name="wmsuId"
                value={form.wmsuId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Employee ID
              </label>
              <input
                type="text"
                name="employeeId"
                value={form.employeeId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Department
              </label>
              <select
                name="deptId"
                value={form.deptId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— none —</option>
                {departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Designation
              </label>
              <select
                name="designationId"
                value={form.designationId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— none (standard load) —</option>
                {designations.map((d) => (
                  <option key={d.designationId} value={d.designationId}>
                    {d.designationName} ({Number(d.releaseHours)}h release)
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-on-surface-variant mt-1">
                Assigning a designation reduces the required weekly load.
              </p>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Classification *
              </label>
              <select
                name="classification"
                required
                value={form.classification}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                {CLASSIFICATIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Required Hours
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                name="requiredHours"
                value={form.requiredHours}
                onChange={handleChange}
                placeholder="Leave blank for 18 (default)"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">
                Standard workload is 18 hours/week. Blank uses the default.
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
                ? 'Create Faculty'
                : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete faculty?"
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
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.facultyId)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete{' '}
          <strong>
            "{deleteTarget?.lastName}, {deleteTarget?.firstName}"
          </strong>
          ? This action cannot be undone.
        </p>
      </Modal>

      {/* Qualifications */}
      <QualificationsModal
        open={qualOpen}
        onClose={() => {
          setQualOpen(false);
          setQualFaculty(null);
        }}
        faculty={qualFaculty}
      />

      {/* Preferences */}
      <PreferencesModal
        open={prefsOpen}
        onClose={() => {
          setPrefsOpen(false);
          setPrefsFaculty(null);
        }}
        faculty={prefsFaculty}
      />
    </div>
  );
}