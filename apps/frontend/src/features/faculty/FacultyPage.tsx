import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchFaculty,
  createFaculty,
  updateFaculty,
  toggleFacultyActive,
  deleteFaculty,
  fetchFacultyStatusSummary,
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
import UnavailabilityModal from './components/UnavailabilityModal';

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

type ChipKey =
  | 'hasQualifications'
  | 'hasPreferences'
  | 'hasUnavailability'
  | 'inactive';

interface ChipState {
  key: ChipKey;
  active: boolean;
  inverse: boolean;
}

const INITIAL_CHIPS: ChipState[] = [
  { key: 'hasQualifications', active: false, inverse: false },
  { key: 'hasPreferences', active: false, inverse: false },
  { key: 'hasUnavailability', active: false, inverse: false },
  { key: 'inactive', active: false, inverse: false },
];

const CHIP_LABEL: Record<ChipKey, string> = {
  hasQualifications: 'Has Qualifications',
  hasPreferences: 'Has Preferences',
  hasUnavailability: 'Has Unavailability',
  inactive: 'Inactive',
};

const CHIP_INVERSE_LABEL: Record<ChipKey, string> = {
  hasQualifications: 'Missing Qualifications',
  hasPreferences: 'Missing Preferences',
  hasUnavailability: 'No Blocks',
  inactive: 'Active Only',
};

const CHIP_ICON: Record<ChipKey, string> = {
  hasQualifications: 'school',
  hasPreferences: 'event_available',
  hasUnavailability: 'block',
  inactive: 'toggle_off',
};

export default function FacultyPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

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
  const [unavailOpen, setUnavailOpen] = useState(false);
  const [unavailFaculty, setUnavailFaculty] = useState<FacultyRecord | null>(null);
  const [qualOpen, setQualOpen] = useState(false);
  const [qualFaculty, setQualFaculty] = useState<FacultyRecord | null>(null);

  // ── Filters ──
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [designationFilter, setDesignationFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [chips, setChips] = useState<ChipState[]>(INITIAL_CHIPS);

  const [deleteTarget, setDeleteTarget] = useState<FacultyRecord | null>(null);

  // ── Auth-derived flags ──
  const isAdminOrDean =
    profile?.role === 'administrator' || profile?.role === 'college_dean';
  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  const isForeign = (f: FacultyRecord): boolean => {
    if (!isDH) return false;
    return String(f.deptId ?? '') !== myDeptId;
  };

  // ── Queries ──
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

  // FR 3.1.3 — Bulk status summary, scoped for DHs
  const summaryDeptId = isDH && myDeptId ? myDeptId : undefined;
  const { data: statusSummary = [] } = useQuery({
    queryKey: ['faculty-status-summary', summaryDeptId ?? 'all'],
    queryFn: () => fetchFacultyStatusSummary(summaryDeptId),
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const statusByFacultyId = useMemo(() => {
    const m = new Map<string, (typeof statusSummary)[number]>();
    for (const row of statusSummary) m.set(row.facultyId, row);
    return m;
  }, [statusSummary]);

  // ── Filtered list ──
  const filteredFaculty = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return faculty.filter((f) => {
      if (deptFilter !== 'all' && String(f.deptId ?? '') !== deptFilter) {
        return false;
      }

      // FR 3.1.3 — Designation filter
      if (designationFilter !== 'all') {
        if (designationFilter === 'none') {
          if (f.designationId) return false;
        } else if (String(f.designationId ?? '') !== designationFilter) {
          return false;
        }
      }

      if (
        classificationFilter !== 'all' &&
        f.classification !== classificationFilter
      ) {
        return false;
      }

      // Chip filters
      const status = statusByFacultyId.get(f.facultyId);
      for (const chip of chips) {
        if (!chip.active) continue;
        let matches = true;
        switch (chip.key) {
          case 'hasQualifications':
            matches = !!status?.hasQualifications;
            break;
          case 'hasPreferences':
            matches = !!status?.hasPreferences;
            break;
          case 'hasUnavailability':
            matches = !!status?.hasUnavailability;
            break;
          case 'inactive':
            matches = f.isActive === false;
            break;
        }
        if (chip.inverse) matches = !matches;
        if (!matches) return false;
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
  }, [
    faculty,
    searchQuery,
    deptFilter,
    designationFilter,
    classificationFilter,
    chips,
    statusByFacultyId,
  ]);

  // ── Missing Qualifications count (scope-aware, active faculty only) ──
  const missingQualsCount = useMemo(() => {
    const scoped = isDH && myDeptId
      ? faculty.filter((f) => String(f.deptId ?? '') === myDeptId)
      : faculty;
    return scoped.filter(
      (f) =>
        f.isActive &&
        !statusByFacultyId.get(f.facultyId)?.hasQualifications,
    ).length;
  }, [faculty, statusByFacultyId, isDH, myDeptId]);

  const applyMissingQualsPreset = () => {
    setSearchQuery('');
    setDesignationFilter('all');
    setClassificationFilter('all');
    if (isAdminOrDean) setDeptFilter('all');
    setChips([
      { key: 'hasQualifications', active: true, inverse: true },
      { key: 'hasPreferences', active: false, inverse: false },
      { key: 'hasUnavailability', active: false, inverse: false },
      { key: 'inactive', active: false, inverse: false },
    ]);
  };

  const toggleChip = (key: ChipKey) => {
    setChips((prev) =>
      prev.map((c) => (c.key === key ? { ...c, active: !c.active } : c)),
    );
  };

  const invertChip = (key: ChipKey) => {
    setChips((prev) =>
      prev.map((c) => (c.key === key ? { ...c, inverse: !c.inverse } : c)),
    );
  };

  const activeChipCount = chips.filter((c) => c.active).length;

  const clearAllFilters = () => {
    setSearchQuery('');
    setDeptFilter('all');
    setDesignationFilter('all');
    setClassificationFilter('all');
    setChips(INITIAL_CHIPS.map((c) => ({ ...c })));
  };

  const hasAnyFilter =
    !!searchQuery ||
    deptFilter !== 'all' ||
    designationFilter !== 'all' ||
    classificationFilter !== 'all' ||
    activeChipCount > 0;

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: createFaculty,
    onSuccess: (f) => {
      setSuccess(`Faculty "${f.lastName}, ${f.firstName}" created.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['faculty'] });
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
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
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to update'),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleFacultyActive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faculty'] });
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFaculty,
    onSuccess: () => {
      setSuccess('Faculty deleted.');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['faculty'] });
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
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
      deptId: isDH && myDeptId ? myDeptId : '',
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
      render: (f) => {
        const foreign = isForeign(f);
        return (
          <span className="inline-flex items-center gap-1.5">
            {foreign && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"
                title="Other department — read only"
              />
            )}
            <span className={foreign ? 'text-slate-500' : ''}>
              {deptName(f.deptId)}
            </span>
          </span>
        );
      },
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
      key: 'status-flags',
      header: 'Status',
      cardVariant: 'meta',
      cellClassName: 'text-xs',
      render: (f) => {
        const s = statusByFacultyId.get(f.facultyId);
        const hasQ = !!s?.hasQualifications;
        const hasP = !!s?.hasPreferences;
        const hasU = !!s?.hasUnavailability;
        return (
          <div className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                hasQ
                  ? 'bg-green-100 text-green-800'
                  : 'bg-slate-100 text-slate-500'
              }`}
              title={
                hasQ
                  ? `${s?.qualificationCount ?? 0} qualification(s) on file`
                  : 'No qualifications on file'
              }
            >
              <Icon name="school" size={10} />
              {hasQ ? s?.qualificationCount : '—'}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                hasP
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-slate-100 text-slate-500'
              }`}
              title={
                hasP
                  ? `${s?.preferenceCount ?? 0} preference(s)`
                  : 'No preferences'
              }
            >
              <Icon name="event_available" size={10} />
              {hasP ? s?.preferenceCount : '—'}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                hasU
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-100 text-slate-500'
              }`}
              title={
                hasU
                  ? `${s?.unavailabilityCount ?? 0} block(s)`
                  : 'No unavailability blocks'
              }
            >
              <Icon name="block" size={10} />
              {hasU ? s?.unavailabilityCount : '—'}
            </span>
          </div>
        );
      },
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
      header: 'Active',
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

  const getActions = (f: FacultyRecord): RowAction[] => {
    if (isForeign(f)) {
      return [];
    }
    return [
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
        label: 'Unavailability',
        icon: 'block',
        onClick: () => {
          setUnavailFaculty(f);
          setUnavailOpen(true);
        },
      },
      {
        label: f.isActive ? 'Deactivate' : 'Activate',
        icon: f.isActive ? 'toggle_off' : 'toggle_on',
        onClick: () => toggleMutation.mutate(f.facultyId),
        disabled: toggleMutation.isPending,
      },
      ...(isAdminOrDean
        ? [
            {
              label: 'Delete',
              icon: 'delete',
              danger: true,
              onClick: () => setDeleteTarget(f),
              disabled: deleteMutation.isPending,
            } as RowAction,
          ]
        : []),
    ];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Faculty</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {faculty.length} faculty member(s) registered
            {isDH && myDeptId ? ' in your department' : ''}
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

      {/* ── Filter panel ── */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-4">
        {/* Row 1: Search */}
        <div>
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
              placeholder="Name, email, employee ID, or WMSU ID…"
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Dropdown filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    
            <div>
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
    
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Designation
            </label>
            <select
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All designations</option>
              <option value="none">— None —</option>
              {designations.map((d) => (
                <option key={d.designationId} value={d.designationId}>
                  {d.designationName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Classification
            </label>
            <select
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All classifications</option>
              {CLASSIFICATIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Quick-filter chips */}
        <div className="pt-3 border-t border-surface-variant">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
              Quick filters
            </span>
            <span className="text-[10px] text-on-surface-variant italic">
              Right-click a chip to invert (show the ones that{' '}
              <em>don't</em> have it)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => {
              const isActive = chip.active;
              const isInverse = chip.inverse;
              const label = isInverse
                ? CHIP_INVERSE_LABEL[chip.key]
                : CHIP_LABEL[chip.key];
              const base =
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition select-none';
              const style = isActive
                ? isInverse
                  ? 'bg-amber-100 text-amber-900 border-amber-400'
                  : 'bg-green-100 text-green-900 border-green-400'
                : 'bg-white text-on-surface-variant border-surface-variant hover:border-primary/50 hover:text-on-surface';
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => toggleChip(chip.key)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    invertChip(chip.key);
                  }}
                  title="Left-click to toggle. Right-click to invert."
                  className={`${base} ${style}`}
                >
                  <Icon name={CHIP_ICON[chip.key]} size={12} />
                  {label}
                </button>
              );
            })}

            {/* Missing Quals preset */}
            <button
              type="button"
              onClick={applyMissingQualsPreset}
              disabled={missingQualsCount === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                missingQualsCount === 0
                  ? 'Every active faculty member has at least one qualification'
                  : `Show ${missingQualsCount} active faculty without qualifications`
              }
            >
              <Icon name="warning" size={12} />
              Missing Qualifications ({missingQualsCount})
            </button>

            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="ml-auto text-xs px-3 py-1.5 rounded-full border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Row 4: Result count */}
        <div className="flex items-center justify-between pt-2 border-t border-surface-variant text-xs text-on-surface-variant">
          <span>
            Showing{' '}
            <strong className="text-on-surface">{filteredFaculty.length}</strong>{' '}
            of {faculty.length}
          </span>
          {activeChipCount > 0 && (
            <span className="italic">
              {activeChipCount} quick filter
              {activeChipCount === 1 ? '' : 's'} active
            </span>
          )}
        </div>
      </div>

      {isDH && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            Faculty marked with an{' '}
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />{' '}
            amber dot belong to another department and are read-only.
            Contact the owning department head or an administrator to change them.
          </span>
        </div>
      )}

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
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                First Name *
              </label>
              <input
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                required
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Last Name *
              </label>
              <input
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                required
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Contact
              </label>
              <input
                type="text"
                name="contact"
                value={form.contact}
                onChange={handleChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                WMSU ID
              </label>
              <input
                type="text"
                name="wmsuId"
                value={form.wmsuId}
                onChange={handleChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Employee ID
              </label>
              <input
                type="text"
                name="employeeId"
                value={form.employeeId}
                onChange={handleChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Department
              </label>
              <select
                name="deptId"
                value={form.deptId}
                onChange={handleChange}
                disabled={isDH}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">— None —</option>
                {departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName}
                    </option>
                  ))}
              </select>
              {isDH && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Locked to your department.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Designation
              </label>
              <select
                name="designationId"
                value={form.designationId}
                onChange={handleChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— None —</option>
                {designations.map((d) => (
                  <option key={d.designationId} value={d.designationId}>
                    {d.designationName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Classification
              </label>
              <select
                name="classification"
                value={form.classification}
                onChange={handleChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                {CLASSIFICATIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Required Hours
              </label>
              <input
                type="number"
                name="requiredHours"
                value={form.requiredHours}
                onChange={handleChange}
                min={0}
                step={0.5}
                placeholder="18"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Leave blank to use the 18h default.
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-slate-200 mt-6">
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
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
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.facultyId)
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
          Delete{' '}
          <strong>
            "{deleteTarget?.lastName}, {deleteTarget?.firstName}"
          </strong>
          ? This action cannot be undone.
        </p>
      </Modal>

      <QualificationsModal
        open={qualOpen}
        onClose={() => {
          setQualOpen(false);
          setQualFaculty(null);
        }}
        faculty={qualFaculty}
      />

      <PreferencesModal
        open={prefsOpen}
        onClose={() => {
          setPrefsOpen(false);
          setPrefsFaculty(null);
        }}
        faculty={prefsFaculty}
      />

      <UnavailabilityModal
        open={unavailOpen}
        onClose={() => {
          setUnavailOpen(false);
          setUnavailFaculty(null);
        }}
        faculty={unavailFaculty}
      />
    </div>
  );
}