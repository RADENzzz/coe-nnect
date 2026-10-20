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
import FacultyInfoModal from './components/FacultyInfoModal';

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

const CHIP_ACTIVE_COLOR: Record<ChipKey, string> = {
  hasQualifications: 'bg-emerald-100 text-emerald-900 border-emerald-400',
  hasPreferences: 'bg-blue-100 text-blue-900 border-blue-400',
  hasUnavailability: 'bg-rose-100 text-rose-900 border-rose-400',
  inactive: 'bg-slate-200 text-slate-800 border-slate-400',
};

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
  const [infoFaculty, setInfoFaculty] = useState<FacultyRecord | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsFaculty, setPrefsFaculty] = useState<FacultyRecord | null>(null);
  const [unavailOpen, setUnavailOpen] = useState(false);
  const [unavailFaculty, setUnavailFaculty] = useState<FacultyRecord | null>(null);
  const [qualOpen, setQualOpen] = useState(false);
  const [qualFaculty, setQualFaculty] = useState<FacultyRecord | null>(null);

  // ── Filters ──
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q') ?? '',
  );
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [designationFilter, setDesignationFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [chips, setChips] = useState<ChipState[]>(INITIAL_CHIPS);

  // Global search links here with ?q=... so the matching faculty row is
  // visible immediately, including when the page is already mounted.
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
    queryFn: fetchDepartments,
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
      } else if (e.key === 'n' && !inInput && !mode && e.ctrlKey === false) {
        // Only plain 'n', not Ctrl+N
        if (!e.metaKey && !e.altKey) {
          e.preventDefault();
          openCreate();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, searchQuery]);

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
    return { total: scopedFaculty.length, active, withQuals, missingQuals };
  }, [scopedFaculty, statusByFacultyId]);

  // Chip counts (computed on scoped faculty, ignoring the chip filters)
  const chipCounts = useMemo(() => {
    const base = scopedFaculty.filter((f) => {
      if (deptFilter !== 'all' && String(f.deptId ?? '') !== deptFilter) return false;
      if (designationFilter !== 'all') {
        if (designationFilter === 'none') {
          if (f.designationId) return false;
        } else if (String(f.designationId ?? '') !== designationFilter) {
          return false;
        }
      }
      if (classificationFilter !== 'all' && f.classification !== classificationFilter) {
        return false;
      }
      return true;
    });
    return {
      hasQualifications: base.filter(
        (f) => statusByFacultyId.get(f.facultyId)?.hasQualifications,
      ).length,
      hasPreferences: base.filter(
        (f) => statusByFacultyId.get(f.facultyId)?.hasPreferences,
      ).length,
      hasUnavailability: base.filter(
        (f) => statusByFacultyId.get(f.facultyId)?.hasUnavailability,
      ).length,
      inactive: base.filter((f) => f.isActive === false).length,
    };
  }, [
    scopedFaculty,
    statusByFacultyId,
    deptFilter,
    designationFilter,
    classificationFilter,
  ]);

  const missingQualsCount = stats.missingQuals;

  const applyMissingQualsPreset = () => {
    setSearchQuery('');
    setDesignationFilter('all');
    setClassificationFilter('all');
    setDeptFilter('all');
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

  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    (deptFilter !== 'all' ? 1 : 0) +
    (designationFilter !== 'all' ? 1 : 0) +
    (classificationFilter !== 'all' ? 1 : 0) +
    activeChipCount;

  const hasAnyFilter = activeFilterCount > 0;

  // Removable filter pills
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
    for (const chip of chips) {
      if (!chip.active) continue;
      const label = chip.inverse
        ? CHIP_INVERSE_LABEL[chip.key]
        : CHIP_LABEL[chip.key];
      pills.push({
        label,
        onRemove: () => toggleChip(chip.key),
        tone: chip.inverse ? 'amber' : 'default',
      });
    }
    return pills;
  }, [
    searchQuery,
    deptFilter,
    designationFilter,
    classificationFilter,
    chips,
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
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create'),
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
    setTimeout(() => firstNameRef.current?.focus(), 50);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validateForm = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Enter a valid email address';
    }
    if (form.requiredHours) {
      const n = Number(form.requiredHours);
      if (isNaN(n) || n < 0 || n > 60) {
        errs.requiredHours = 'Hours must be between 0 and 60';
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

  // ── Open the relevant management modal ──
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
      header: 'Records',
      cardVariant: 'meta',
      cellClassName: 'text-xs',
      render: (f) => {
        const s = statusByFacultyId.get(f.facultyId);
        const hasQ = !!s?.hasQualifications;
        const hasP = !!s?.hasPreferences;
        const hasU = !!s?.hasUnavailability;
        const foreign = isForeign(f);
        return (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !foreign && openQuals(f)}
              disabled={foreign}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold transition ${
                hasQ
                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              } disabled:cursor-not-allowed disabled:opacity-60`}
              title={
                hasQ
                  ? `${s?.qualificationCount ?? 0} qualification(s) on file`
                  : 'No qualifications on file — click to add'
              }
            >
              <Icon name="school" size={10} />
              {hasQ ? s?.qualificationCount : '—'}
            </button>
            <button
              type="button"
              onClick={() => !foreign && openPrefs(f)}
              disabled={foreign}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold transition ${
                hasP
                  ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              } disabled:cursor-not-allowed disabled:opacity-60`}
              title={
                hasP
                  ? `${s?.preferenceCount ?? 0} preference(s)`
                  : 'No preferences — click to add'
              }
            >
              <Icon name="event_available" size={10} />
              {hasP ? s?.preferenceCount : '—'}
            </button>
            <button
              type="button"
              onClick={() => !foreign && openUnavail(f)}
              disabled={foreign}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold transition ${
                hasU
                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              } disabled:cursor-not-allowed disabled:opacity-60`}
              title={
                hasU
                  ? `${s?.unavailabilityCount ?? 0} block(s)`
                  : 'No unavailability blocks — click to add'
              }
            >
              <Icon name="block" size={10} />
              {hasU ? s?.unavailabilityCount : '—'}
            </button>
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
      { label: 'Qualifications', icon: 'school', onClick: () => openQuals(f) },
      { label: 'Preferences', icon: 'event_available', onClick: () => openPrefs(f) },
      { label: 'Unavailability', icon: 'block', onClick: () => openUnavail(f) },
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

  return (
    <div className="space-y-6">
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

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total"
          value={stats.total}
          icon="groups"
          tone="neutral"
        />
        <StatCard
          label="Active"
          value={stats.active}
          icon="check_circle"
          tone="emerald"
        />
        <StatCard
          label="With Qualifications"
          value={stats.withQuals}
          icon="school"
          tone="blue"
        />
        <StatCard
          label="Missing Qualifications"
          value={stats.missingQuals}
          icon="warning"
          tone={stats.missingQuals > 0 ? 'rose' : 'neutral'}
          onClick={
            stats.missingQuals > 0 ? applyMissingQualsPreset : undefined
          }
          hint={
            stats.missingQuals > 0
              ? 'Click to filter'
              : 'All active faculty have qualifications'
          }
        />
      </div>

      {/* ── Banners ── */}
      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
            aria-label="Dismiss error"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm flex items-start gap-2">
          <Icon name="check_circle" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900"
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* ── Filter panel ── */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        {/* Panel header — always visible */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setFiltersExpanded((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-on-surface hover:text-primary transition"
          >
            <Icon
              name={filtersExpanded ? 'expand_less' : 'expand_more'}
              size={18}
            />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant hidden sm:inline">
              Showing{' '}
              <strong className="text-on-surface">
                {filteredFaculty.length}
              </strong>{' '}
              of {faculty.length}
            </span>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs px-3 py-1.5 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Removable filter pills */}
        {filterPills.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-surface-variant pt-3">
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
          </div>
        )}

        {/* Expanded content */}
        {filtersExpanded && (
          <div className="border-t border-surface-variant p-4 space-y-4 bg-surface-container-lowest">
            {/* Search */}
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Search
                <kbd className="ml-2 px-1.5 py-0.5 text-[9px] font-mono bg-surface-container-low border border-surface-variant rounded">
                  /
                </kbd>
              </label>
              <div className="relative">
                <Icon
                  name="search"
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name, email, employee ID, or WMSU ID…"
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
            </div>

            {/* Dropdowns */}
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

            {/* Quick filter chips */}
            <div className="pt-3 border-t border-surface-variant">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Quick filters
                </span>
                <span className="text-[10px] text-on-surface-variant italic">
                  Click to filter • click the ↻ icon to show the{' '}
                  <em>opposite</em>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {chips.map((chip) => {
                  const isActive = chip.active;
                  const isInverse = chip.inverse;
                  const label = isInverse
                    ? CHIP_INVERSE_LABEL[chip.key]
                    : CHIP_LABEL[chip.key];
                  const count = chipCounts[chip.key];
                  const disabled = count === 0;
                  const base =
                    'inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 text-xs font-semibold rounded-full border transition select-none';
                  const style = isActive
                    ? CHIP_ACTIVE_COLOR[chip.key]
                    : 'bg-white text-on-surface-variant border-surface-variant hover:border-primary/50 hover:text-on-surface';
                  return (
                    <div
                      key={chip.key}
                      className={`${base} ${style} ${
                        disabled ? 'opacity-50' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => !disabled && toggleChip(chip.key)}
                        disabled={disabled}
                        className="inline-flex items-center gap-1.5 disabled:cursor-not-allowed"
                        title={
                          disabled
                            ? 'No faculty match this filter'
                            : isActive
                            ? 'Click to remove filter'
                            : 'Click to filter'
                        }
                      >
                        <Icon name={CHIP_ICON[chip.key]} size={12} />
                        {label}
                        <span className="text-[10px] font-normal opacity-70">
                          ({count})
                        </span>
                      </button>
                      {!disabled && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            invertChip(chip.key);
                          }}
                          className={`ml-0.5 p-0.5 rounded-full transition ${
                            isInverse
                              ? 'bg-amber-500 text-white'
                              : 'hover:bg-black/10 text-current'
                          }`}
                          title="Invert this filter"
                          aria-label={`Invert ${label}`}
                        >
                          <Icon name="swap_horiz" size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {missingQualsCount > 0 && (
                  <button
                    type="button"
                    onClick={applyMissingQualsPreset}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 transition"
                    title={`Show ${missingQualsCount} active faculty without qualifications`}
                  >
                    <Icon name="warning" size={12} />
                    Missing Qualifications ({missingQualsCount})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
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
          <Icon
            name="search_off"
            size={48}
            className="text-slate-300 mx-auto mb-3"
          />
          <p className="text-base font-semibold text-on-surface">
            No faculty match your filters
          </p>
          <p className="text-sm text-on-surface-variant mt-1 mb-4">
            Try adjusting your search or clearing some filters.
          </p>
          <button
            onClick={clearAllFilters}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="filter_alt_off" size={16} />
            Clear all filters
          </button>
        </div>
      ) : (
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
  onRowClick={(f) => setInfoFaculty(f)}
/>
      )}

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
          {/* Identity section */}
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
              <FormField label="Email" error={fieldErrors.email}>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className={inputClass(!!fieldErrors.email)}
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

          {/* Employment section */}
          <FormSection title="Employment" icon="work">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="WMSU ID">
                <input
                  type="text"
                  name="wmsuId"
                  value={form.wmsuId}
                  onChange={handleChange}
                  className={inputClass(false)}
                  placeholder="e.g. 2020-12345"
                />
              </FormField>
              <FormField label="Employee ID">
                <input
                  type="text"
                  name="employeeId"
                  value={form.employeeId}
                  onChange={handleChange}
                  className={inputClass(false)}
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

          {/* Assignment section */}
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

      <QualificationsModal
        open={qualOpen}
        onClose={() => {
          setQualOpen(false);
          setQualFaculty(null);
        }}
        faculty={qualFaculty}
      />

      <FacultyInfoModal
  open={!!infoFaculty}
  onClose={() => setInfoFaculty(null)}
  faculty={infoFaculty}
  departmentLabel={deptName}
  designationLabel={designationName}
  status={
    infoFaculty
      ? (() => {
          const s = statusByFacultyId.get(infoFaculty.facultyId);
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
  isForeign={infoFaculty ? isForeign(infoFaculty) : false}
  onEdit={() => infoFaculty && openEdit(infoFaculty)}
  onOpenQualifications={() => infoFaculty && openQuals(infoFaculty)}
  onOpenPreferences={() => infoFaculty && openPrefs(infoFaculty)}
  onOpenUnavailability={() => infoFaculty && openUnavail(infoFaculty)}
  onToggleActive={() =>
    infoFaculty && toggleMutation.mutate(infoFaculty.facultyId)
  }
  togglePending={toggleMutation.isPending}
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

// ── Small presentational helpers ──

function StatCard({
  label,
  value,
  icon,
  tone,
  onClick,
  hint,
}: {
  label: string;
  value: number;
  icon: string;
  tone: 'neutral' | 'emerald' | 'blue' | 'rose';
  onClick?: () => void;
  hint?: string;
}) {
  const tones: Record<typeof tone, string> = {
    neutral: 'bg-surface-container-lowest border-surface-variant',
    emerald: 'bg-emerald-50 border-emerald-200',
    blue: 'bg-blue-50 border-blue-200',
    rose: 'bg-rose-50 border-rose-200',
  };
  const iconTones: Record<typeof tone, string> = {
    neutral: 'text-slate-500',
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    rose: 'text-rose-600',
  };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      title={hint}
      className={`text-left rounded-xl border p-3 transition ${tones[tone]} ${
        onClick ? 'hover:shadow-md cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        <Icon name={icon} size={16} className={iconTones[tone]} />
      </div>
      <p className="text-2xl font-bold text-on-surface mt-1">{value}</p>
      {hint && (
        <p className="text-[10px] text-on-surface-variant mt-0.5">{hint}</p>
      )}
    </Comp>
  );
}

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