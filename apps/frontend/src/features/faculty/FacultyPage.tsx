import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import FacultyDetailPanel from './components/FacultyDetailPanel';

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

type QuickFilter = 'all' | 'active' | 'missingRecords' | 'inactive';

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  contact: string;
  wmsuId: string;
  employeeId: string;
  deptId: string;
  designationId: string;
  classification: FacultyClass;
  requiredHours: string;
}

const EMPTY_FORM: FormState = {
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
};

export default function FacultyPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<FacultyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [uniqueErrors, setUniqueErrors] = useState<{
    wmsuId?: string;
    employeeId?: string;
    email?: string;
  }>({});
  const [detailFaculty, setDetailFaculty] = useState<FacultyRecord | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsFaculty, setPrefsFaculty] = useState<FacultyRecord | null>(null);
  const [unavailOpen, setUnavailOpen] = useState(false);
  const [unavailFaculty, setUnavailFaculty] = useState<FacultyRecord | null>(null);
  const [qualOpen, setQualOpen] = useState(false);
  const [qualFaculty, setQualFaculty] = useState<FacultyRecord | null>(null);

  // ── Filters ──
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [designationFilter, setDesignationFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [searchParams]);

  const [deleteTarget, setDeleteTarget] = useState<FacultyRecord | null>(null);
  const [confirmCloseForm, setConfirmCloseForm] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);

  // ── Auth-derived flags ──
  const isAdminOrDean =
    profile?.role === 'administrator' || profile?.role === 'college_dean';
  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  const isForeign = useCallback(
    (f: FacultyRecord): boolean => {
      if (!isDH) return false;
      return String(f.deptId ?? '') !== myDeptId;
    },
    [isDH, myDeptId],
  );

  // ── Queries ──
  const { data: faculty = [], isLoading } = useQuery({
    queryKey: ['faculty', { includeInactive: true }],
    queryFn: () => fetchFaculty(true),
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
    enabled: !!user,
  });

  const { data: designations = [] } = useQuery({
    queryKey: ['designations'],
    queryFn: fetchDesignations,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

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

  // ── Auto-dismiss success ──
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (e.key === '/' && !inInput && !mode) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && !inInput && !mode) {
        if (searchQuery) setSearchQuery('');
        if (detailFaculty) setDetailFaculty(null);
      } else if (e.key === 'n' && !inInput && !mode && e.ctrlKey === false) {
        if (!e.metaKey && !e.altKey) {
          e.preventDefault();
          openCreate();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, searchQuery, detailFaculty]);

  // ── Filtered list ──
  const filteredFaculty = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return faculty.filter((f) => {
      if (deptFilter !== 'all' && String(f.deptId ?? '') !== deptFilter) {
        return false;
      }

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

      const status = statusByFacultyId.get(f.facultyId);
      const hasAllRecords =
        !!status?.hasQualifications &&
        !!status?.hasPreferences &&
        !!status?.hasUnavailability;

      if (quickFilter === 'active' && f.isActive === false) return false;
      if (quickFilter === 'inactive' && f.isActive !== false) return false;
      if (quickFilter === 'missingRecords') {
        if (f.isActive === false) return false;
        if (hasAllRecords) return false;
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
    quickFilter,
    statusByFacultyId,
  ]);

  // ── Scope-aware metrics ──
  const scopedFaculty = useMemo(() => {
    if (isDH && myDeptId) {
      return faculty.filter((f) => String(f.deptId ?? '') === myDeptId);
    }
    return faculty;
  }, [faculty, isDH, myDeptId]);

  const stats = useMemo(() => {
    const active = scopedFaculty.filter((f) => f.isActive).length;
    const withQuals = scopedFaculty.filter(
      (f) => statusByFacultyId.get(f.facultyId)?.hasQualifications,
    ).length;
    const missingQuals = scopedFaculty.filter(
      (f) =>
        f.isActive && !statusByFacultyId.get(f.facultyId)?.hasQualifications,
    ).length;
    const missingRecords = scopedFaculty.filter((f) => {
      if (!f.isActive) return false;
      const s = statusByFacultyId.get(f.facultyId);
      return !s?.hasQualifications || !s?.hasPreferences || !s?.hasUnavailability;
    }).length;
    return { total: scopedFaculty.length, active, withQuals, missingQuals, missingRecords };
  }, [scopedFaculty, statusByFacultyId]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setDeptFilter('all');
    setDesignationFilter('all');
    setClassificationFilter('all');
    setQuickFilter('all');
  };

  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    (deptFilter !== 'all' ? 1 : 0) +
    (designationFilter !== 'all' ? 1 : 0) +
    (classificationFilter !== 'all' ? 1 : 0) +
    (quickFilter !== 'all' ? 1 : 0);

  const hasAnyFilter = activeFilterCount > 0;

  const filterPills = useMemo(() => {
    const pills: { label: string; onRemove: () => void; tone?: string }[] = [];
    if (searchQuery) {
      pills.push({
        label: `Search: "${searchQuery}"`,
        onRemove: () => setSearchQuery(''),
      });
    }
    if (deptFilter !== 'all') {
      const d = departments.find((x) => String(x.deptId) === deptFilter);
      pills.push({
        label: `Dept: ${d ? `[${d.deptCode}] ${d.deptName}` : deptFilter}`,
        onRemove: () => setDeptFilter('all'),
      });
    }
    if (designationFilter !== 'all') {
      const d = designations.find(
        (x) => String(x.designationId) === designationFilter,
      );
      pills.push({
        label: `Designation: ${d?.designationName ?? 'None'}`,
        onRemove: () => setDesignationFilter('all'),
      });
    }
    if (classificationFilter !== 'all') {
      const c = CLASSIFICATIONS.find((x) => x.value === classificationFilter);
      pills.push({
        label: `Class: ${c?.label ?? classificationFilter}`,
        onRemove: () => setClassificationFilter('all'),
      });
    }
    if (quickFilter !== 'all') {
      const label =
        quickFilter === 'active'
          ? 'Active only'
          : quickFilter === 'inactive'
          ? 'Inactive only'
          : 'Missing records';
      pills.push({
        label,
        onRemove: () => setQuickFilter('all'),
        tone: quickFilter === 'missingRecords' ? 'amber' : 'default',
      });
    }
    return pills;
  }, [
    searchQuery,
    deptFilter,
    designationFilter,
    classificationFilter,
    quickFilter,
    departments,
    designations,
  ]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: createFaculty,
    onSuccess: (f) => {
      setSuccess(`Faculty "${f.lastName}, ${f.firstName}" created.`);
      closeForm(true);
      qc.invalidateQueries({ queryKey: ['faculty'] });
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    },
    onError: (err: any) => {
      const res = err?.response?.data;
      const msg = (res?.message ?? '').toLowerCase();
      if (msg.includes('wmsu')) {
        setUniqueErrors({ wmsuId: res.message });
      } else if (msg.includes('employee')) {
        setUniqueErrors({ employeeId: res.message });
      } else if (msg.includes('email')) {
        setUniqueErrors({ email: res.message });
      } else {
        setError(res?.message ?? err.message ?? 'Failed to create');
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateFacultyInput> }) =>
      updateFaculty(id, input),
    onSuccess: (f) => {
      setSuccess(`Faculty "${f.lastName}, ${f.firstName}" updated.`);
      closeForm(true);
      qc.invalidateQueries({ queryKey: ['faculty'] });
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    },
    onError: (err: any) => {
      const res = err?.response?.data;
      if (res?.message?.toLowerCase().includes('wmsu')) {
        setUniqueErrors({ wmsuId: res.message });
      } else if (res?.message?.toLowerCase().includes('employee')) {
        setUniqueErrors({ employeeId: res.message });
      } else {
        setError(res?.message ?? err.message ?? 'Failed to update');
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleFacultyActive,
    onMutate: async (facultyId: string) => {
      await qc.cancelQueries({ queryKey: ['faculty', { includeInactive: true }] });
      const previous = qc.getQueryData<FacultyRecord[]>([
        'faculty',
        { includeInactive: true },
      ]);
      qc.setQueryData<FacultyRecord[]>(
        ['faculty', { includeInactive: true }],
        (old) =>
          old?.map((f) =>
            f.facultyId === facultyId ? { ...f, isActive: !f.isActive } : f,
          ) ?? old,
      );
      return { previous };
    },
    onError: (err: any, _id, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(['faculty', { includeInactive: true }], ctx.previous);
      }
      setError(err?.response?.data?.message ?? 'Toggle failed');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['faculty'] });
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFaculty,
    onSuccess: () => {
      setSuccess('Faculty deleted.');
      setDeleteTarget(null);
      setDetailFaculty(null);
      qc.invalidateQueries({ queryKey: ['faculty'] });
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  const closeForm = (force = false) => {
    if (!force) {
      const dirty =
        form.firstName ||
        form.lastName ||
        form.email ||
        form.contact ||
        form.wmsuId ||
        form.employeeId ||
        form.requiredHours ||
        (mode === 'edit' && form.deptId !== (editing?.deptId ?? '')) ||
        (mode === 'edit' && form.designationId !== (editing?.designationId ?? ''));
      if (dirty) {
        setConfirmCloseForm(true);
        return;
      }
    }
    setConfirmCloseForm(false);
    setMode(null);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFieldErrors({});
    setUniqueErrors({});
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      deptId: isDH && myDeptId ? myDeptId : '',
    });
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    setUniqueErrors({});
    setTimeout(() => firstNameRef.current?.focus(), 50);
  };

  const openEdit = (f: FacultyRecord) => {
    if (isForeign(f)) return;
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
    setFieldErrors({});
    setUniqueErrors({});
    setTimeout(() => firstNameRef.current?.focus(), 50);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    setUniqueErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validateForm = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};

    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';

    if (form.requiredHours) {
      const n = Number(form.requiredHours);
      if (isNaN(n) || n < 0 || n > 60) {
        errs.requiredHours = 'Hours must be between 0 and 60';
      }
    }

    const otherFaculty = faculty.filter(
      (f) => f.facultyId !== editing?.facultyId,
    );

    if (form.email.trim()) {
      const emailTrim = form.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
        errs.email = 'Enter a valid email address';
      } else if (
        otherFaculty.some(
          (f) => f.email?.toLowerCase() === emailTrim.toLowerCase(),
        )
      ) {
        errs.email = 'This email is already in use.';
      }
    }

    if (form.wmsuId.trim()) {
      const idTrim = form.wmsuId.trim().toLowerCase();
      if (otherFaculty.some((f) => f.wmsuId?.toLowerCase() === idTrim)) {
        errs.wmsuId = 'This WMSU ID is already in use.';
      }
    }

    if (form.employeeId.trim()) {
      const idTrim = form.employeeId.trim().toLowerCase();
      if (otherFaculty.some((f) => f.employeeId?.toLowerCase() === idTrim)) {
        errs.employeeId = 'This Employee ID is already in use.';
      }
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) return;

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

  const initials = (f: FacultyRecord) =>
    `${f.firstName[0] ?? ''}${f.lastName[0] ?? ''}`.toUpperCase();

  // ── Option A: nested modals overlay the panel; panel stays mounted. ──
  const openQuals = (f: FacultyRecord) => {
    setQualFaculty(f);
    setQualOpen(true);
  };

  const openPrefs = (f: FacultyRecord) => {
    setPrefsFaculty(f);
    setPrefsOpen(true);
  };

  const openUnavail = (f: FacultyRecord) => {
    setUnavailFaculty(f);
    setUnavailOpen(true);
  };

  // ── Columns ──
  const columns: Column<FacultyRecord>[] = [
    {
      key: 'name',
      header: 'Name',
      cardVariant: 'title',
      cellClassName: 'text-on-surface font-medium',
      render: (f) => {
        const status = statusByFacultyId.get(f.facultyId);
        const missing = !status?.hasQualifications && f.isActive;
        return (
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
              {initials(f)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate">
                  {f.lastName}, {f.firstName}
                </span>
                {missing && (
                  <span
                    className="inline-flex items-center text-amber-500"
                    title="No qualifications on file — rule F-5 not enforced"
                  >
                    <Icon name="warning" size={12} />
                  </span>
                )}
              </div>
              {f.email && (
                <div className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                  <Icon name="mail" size={10} />
                  {f.email}
                </div>
              )}
            </div>
          </div>
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
      key: 'record-health',
      header: 'Records',
      cardVariant: 'meta',
      cellClassName: 'text-xs',
      render: (f) => {
        const s = statusByFacultyId.get(f.facultyId);
        const configured = [
          !!s?.hasQualifications,
          !!s?.hasPreferences,
          !!s?.hasUnavailability,
        ].filter(Boolean).length;
        const isComplete = configured === 3;
        return (
          <div className="flex items-center gap-1.5" title={`${configured} of 3 record types configured`}>
            <div className="flex items-center gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${
                    configured > i ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
              ))}
            </div>
            <span
              className={`text-[10px] font-semibold ${
                isComplete ? 'text-emerald-700' : 'text-amber-600'
              }`}
            >
              {configured}/3
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
      header: '',
      cardVariant: 'actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: () => null,
    },
  ];

  const getActions = (f: FacultyRecord): RowAction[] => {
    if (isForeign(f)) {
      return [
        {
          label: 'Read only',
          icon: 'lock',
          onClick: () => {},
          disabled: true,
        },
      ];
    }
    return [
      { label: 'Edit', icon: 'edit', onClick: () => openEdit(f) },
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

  const formBusy = createMutation.isPending || updateMutation.isPending;

  const quickFilters: { key: QuickFilter; label: string; count: number; tone?: string }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'missingRecords', label: 'Missing records', count: stats.missingRecords, tone: 'amber' },
    { key: 'inactive', label: 'Inactive', count: scopedFaculty.filter((f) => !f.isActive).length },
  ];

  return (
    <div className="space-y-5" data-tour="faculty-header">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Faculty</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Manage faculty records, qualifications, preferences, and unavailability
            {isDH && myDeptId ? ' in your department' : ''}.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition shadow-sm"
        >
          <Icon name="add" size={18} />
          New Faculty
        </button>
      </div>

      {/* ── Banners ── */}
      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800" aria-label="Dismiss error">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm flex items-start gap-2">
          <Icon name="check_circle" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-700 hover:text-emerald-900" aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* ── Command bar: quick filters + search ── */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden" data-tour="faculty-filters">
        <div className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-container-low border border-surface-variant">
              {quickFilters.map((qf) => (
                <button
                  key={qf.key}
                  type="button"
                  onClick={() => setQuickFilter(qf.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    quickFilter === qf.key
                      ? qf.tone === 'amber'
                        ? 'bg-amber-100 text-amber-900 shadow-sm'
                        : 'bg-white text-on-surface shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {qf.label}
                  <span className={`text-[10px] font-normal ${quickFilter === qf.key ? 'opacity-70' : 'opacity-50'}`}>
                    {qf.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[220px]">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, email, employee ID, or WMSU ID…"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                  aria-label="Clear search"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="bg-surface-container-low border border-surface-variant rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-primary"
              >
                <option value="all">All depts</option>
                {departments.filter((d) => d.isActive).map((d) => (
                  <option key={d.deptId} value={d.deptId}>[{d.deptCode}] {d.deptName}</option>
                ))}
              </select>
              <select
                value={designationFilter}
                onChange={(e) => setDesignationFilter(e.target.value)}
                className="bg-surface-container-low border border-surface-variant rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-primary"
              >
                <option value="all">All designations</option>
                <option value="none">— None —</option>
                {designations.map((d) => (
                  <option key={d.designationId} value={d.designationId}>{d.designationName}</option>
                ))}
              </select>
              <select
                value={classificationFilter}
                onChange={(e) => setClassificationFilter(e.target.value)}
                className="bg-surface-container-low border border-surface-variant rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-primary"
              >
                <option value="all">All classes</option>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {filterPills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {filterPills.map((pill, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
                    pill.tone === 'amber'
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-primary/5 text-primary border-primary/30'
                  }`}
                >
                  {pill.label}
                  <button
                    type="button"
                    onClick={pill.onRemove}
                    className="hover:bg-black/5 rounded-full p-0.5"
                    aria-label={`Remove filter: ${pill.label}`}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-[11px] px-2 py-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition"
              >
                Clear all
              </button>
            </div>
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

      {/* ── Table / empty state ── */}
      {filteredFaculty.length === 0 && hasAnyFilter && !isLoading ? (
        <div className="rounded-xl border border-dashed border-surface-variant bg-surface-container-lowest py-16 text-center">
          <Icon name="search_off" size={48} className="text-slate-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-on-surface">No faculty match your filters</p>
          <p className="text-sm text-on-surface-variant mt-1 mb-4">Try adjusting your search or clearing some filters.</p>
          <button
            onClick={clearAllFilters}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="filter_alt_off" size={16} />
            Clear all filters
          </button>
        </div>
      ) : (
        <div data-tour="faculty-table">
          <ResponsiveTable
            columns={columns}
            rows={filteredFaculty}
            rowKey={(f) => f.facultyId}
            rowTitle={(f) => `${f.lastName}, ${f.firstName}`}
            rowSubtitle={(f) => f.email ?? ''}
            isLoading={isLoading}
            hasSourceRows={faculty.length > 0}
            emptyMessage="No faculty yet. Click 'New Faculty' to add the first record."
            noMatchMessage="No faculty match your filters."
            getActions={getActions}
            onRowClick={(f) => setDetailFaculty(f)}
          />
        </div>
      )}

      {/* ── Detail side panel ── */}
      <FacultyDetailPanel
        open={!!detailFaculty}
        onClose={() => setDetailFaculty(null)}
        faculty={
          detailFaculty
            ? faculty.find((f) => f.facultyId === detailFaculty.facultyId) ?? detailFaculty
            : null
        }
        departmentLabel={deptName}
        designationLabel={designationName}
        status={
          detailFaculty
            ? (() => {
                const s = statusByFacultyId.get(detailFaculty.facultyId);
                return {
                  hasQualifications: !!s?.hasQualifications,
                  hasPreferences: !!s?.hasPreferences,
                  hasUnavailability: !!s?.hasUnavailability,
                  qualificationCount: s?.qualificationCount ?? 0,
                  preferenceCount: s?.preferenceCount ?? 0,
                  unavailabilityCount: s?.unavailabilityCount ?? 0,
                };
              })()
            : undefined
        }
        isForeign={
          detailFaculty
            ? isForeign(
                faculty.find((f) => f.facultyId === detailFaculty.facultyId) ??
                  detailFaculty,
              )
            : false
        }
        onEdit={() => {
          if (detailFaculty) {
            openEdit(detailFaculty);
          }
        }}
        onOpenQualifications={() => detailFaculty && openQuals(detailFaculty)}
        onOpenPreferences={() => detailFaculty && openPrefs(detailFaculty)}
        onOpenUnavailability={() => detailFaculty && openUnavail(detailFaculty)}
        onToggleActive={() =>
          detailFaculty && toggleMutation.mutate(detailFaculty.facultyId)
        }
        onDelete={
          isAdminOrDean
            ? () => detailFaculty && setDeleteTarget(detailFaculty)
            : undefined
        }
        togglePending={toggleMutation.isPending}
      />

      {/* ── Create / Edit modal ── */}
      <Modal
        open={!!mode}
        onClose={() => closeForm()}
        title={
          mode === 'create'
            ? 'Create Faculty'
            : `Edit — ${editing?.lastName}, ${editing?.firstName}`
        }
        description={
          mode === 'create'
            ? 'Add a new faculty member to the system.'
            : 'Update this faculty member\'s details.'
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormSection title="Identity" icon="badge">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="First Name" required error={fieldErrors.firstName}>
                <input
                  ref={firstNameRef}
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  className={inputClass(!!fieldErrors.firstName)}
                  placeholder="e.g. Juan"
                />
              </FormField>
              <FormField label="Last Name" required error={fieldErrors.lastName}>
                <input
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  className={inputClass(!!fieldErrors.lastName)}
                  placeholder="e.g. Dela Cruz"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <FormField
                label="Email"
                error={fieldErrors.email || uniqueErrors.email}
              >
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className={inputClass(!!(fieldErrors.email || uniqueErrors.email))}
                  placeholder="juan.delacruz@wmsu.edu.ph"
                />
              </FormField>
              <FormField label="Contact Number">
                <input
                  type="text"
                  name="contact"
                  value={form.contact}
                  onChange={handleChange}
                  className={inputClass(false)}
                  placeholder="+63 9XX XXX XXXX"
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Employment" icon="work">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="WMSU ID"
                error={fieldErrors.wmsuId || uniqueErrors.wmsuId}
              >
                <input
                  type="text"
                  name="wmsuId"
                  value={form.wmsuId}
                  onChange={handleChange}
                  className={inputClass(!!(fieldErrors.wmsuId || uniqueErrors.wmsuId))}
                  placeholder="e.g. 2020-12345"
                />
              </FormField>
              <FormField
                label="Employee ID"
                error={fieldErrors.employeeId || uniqueErrors.employeeId}
              >
                <input
                  type="text"
                  name="employeeId"
                  value={form.employeeId}
                  onChange={handleChange}
                  className={inputClass(!!(fieldErrors.employeeId || uniqueErrors.employeeId))}
                  placeholder="e.g. EMP-00123"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <FormField label="Classification">
                <select
                  name="classification"
                  value={form.classification}
                  onChange={handleChange}
                  className={inputClass(false)}
                >
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Required Hours"
                error={fieldErrors.requiredHours}
                hint="Leave blank to use the 18h default."
              >
                <div className="relative">
                  <input
                    type="number"
                    name="requiredHours"
                    value={form.requiredHours}
                    onChange={handleChange}
                    min={0}
                    max={60}
                    step={0.5}
                    placeholder="18"
                    className={inputClass(!!fieldErrors.requiredHours)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    hours/week
                  </span>
                </div>
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Assignment" icon="assignment_ind">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Department"
                hint={isDH ? 'Locked to your department.' : undefined}
              >
                <select
                  name="deptId"
                  value={form.deptId}
                  onChange={handleChange}
                  disabled={isDH}
                  className={`${inputClass(false)} disabled:opacity-60 disabled:cursor-not-allowed`}
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
              </FormField>
              <FormField label="Designation">
                <select
                  name="designationId"
                  value={form.designationId}
                  onChange={handleChange}
                  className={inputClass(false)}
                >
                  <option value="">— None —</option>
                  {designations.map((d) => (
                    <option key={d.designationId} value={d.designationId}>
                      {d.designationName}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </FormSection>

          <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => closeForm()}
              disabled={formBusy}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formBusy}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
            >
              {formBusy && (
                <Icon name="progress_activity" size={14} className="animate-spin" />
              )}
              {formBusy
                ? 'Saving…'
                : mode === 'create'
                ? 'Create Faculty'
                : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Unsaved changes confirmation ── */}
      <Modal
        open={confirmCloseForm}
        onClose={() => setConfirmCloseForm(false)}
        title="Discard changes?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmCloseForm(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => closeForm(true)}
              className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition rounded-lg"
            >
              Discard
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You have unsaved changes. If you close now, they'll be lost.
        </p>
      </Modal>

      {/* ── Delete confirmation ── */}
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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.facultyId)
              }
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {deleteMutation.isPending && (
                <Icon name="progress_activity" size={14} className="animate-spin" />
              )}
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Delete{' '}
            <strong>
              "{deleteTarget?.lastName}, {deleteTarget?.firstName}"
            </strong>
            ?
          </p>
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
            <span>
              This will also remove all associated qualifications, preferences,
              and unavailability blocks. This action cannot be undone.
            </span>
          </div>
        </div>
      </Modal>

      {/* ── Nested modals — Option A: panel stays mounted underneath ── */}
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

// ── Small presentational helpers (unchanged) ──

function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon} size={16} className="text-primary" />
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {title}
        </h3>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      {children}
    </div>
  );
}

function FormField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1">
          <Icon name="error" size={10} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[10px] text-slate-400 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
      : 'border-slate-200 focus:border-primary focus:ring-primary/10'
  }`;
}