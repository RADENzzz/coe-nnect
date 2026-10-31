import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
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
type SortKey = 'code' | 'program' | 'year' | 'students';
type SortDir = 'asc' | 'desc';

interface FormState {
  sectionCode: string;
  programId: string;
  yearLevel: string;
  studentCount: string;
}

const EMPTY_FORM: FormState = {
  sectionCode: '',
  programId: '',
  yearLevel: '',
  studentCount: '',
};

const YEAR_LEVELS = [1, 2, 3, 4, 5];

export default function SectionsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const isAdmin = profile?.role === 'administrator';
  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;
  const canManage = isDH || isAdmin;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);
  const [confirmCloseForm, setConfirmCloseForm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const searchRef = useRef<HTMLInputElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // ── URL state ──
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get('q') ?? '',
  );

  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

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

  const activeFilterCount =
    (searchInput ? 1 : 0) +
    (programFilter ? 1 : 0) +
    (yearFilter ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0);

  const hasAnyFilter = activeFilterCount > 0;

  // ── Queries ──
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

  // ── Auto-dismiss success ──
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Keyboard: / focuses search ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;
      if (e.key === '/' && !inInput && !showForm) {
        e.preventDefault();
        setFiltersExpanded(true);
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && !inInput && !showForm && searchInput) {
        setSearchInput('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showForm, searchInput]);

  // ── Program maps ──
  const programById = useMemo(() => {
    const m = new Map<
      string,
      { programCode: string; programName: string; deptId: string }
    >();
    for (const p of programs) {
      m.set(String(p.programId), {
        programCode: p.programCode,
        programName: p.programName,
        deptId: String(p.deptId ?? ''),
      });
    }
    return m;
  }, [programs]);

  // ── Foreign detection ──
  const isForeign = useCallback(
    (s: Section): boolean => {
      if (!isDH) return false;
      if (!s.programId) return true; // orphaned → read-only for DHs
      const program = programById.get(String(s.programId));
      if (!program) return true;
      return program.deptId !== myDeptId;
    },
    [isDH, myDeptId, programById],
  );

  // ── Stats (scoped) ──
  const scopedSections = useMemo(() => {
    if (isDH && myDeptId) {
      return sections.filter((s) => {
        if (!s.programId) return false;
        const p = programById.get(String(s.programId));
        return p?.deptId === myDeptId;
      });
    }
    return sections;
  }, [sections, isDH, myDeptId, programById]);

  const stats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let withStudents = 0;
    let orphaned = 0;
    const yearCounts: Record<number, number> = {};
    for (const s of scopedSections) {
      if (s.isActive) active++;
      else inactive++;
      if (s.studentCount != null && s.studentCount > 0) withStudents++;
      if (!s.programId) orphaned++;
      if (s.yearLevel != null) {
        yearCounts[s.yearLevel] = (yearCounts[s.yearLevel] ?? 0) + 1;
      }
    }
    return {
      total: scopedSections.length,
      active,
      inactive,
      withStudents,
      orphaned,
      yearCounts,
    };
  }, [scopedSections]);

  // ── Available years (only those present in data) ──
  const availableYears = useMemo(
    () => Object.keys(stats.yearCounts).map(Number).sort(),
    [stats.yearCounts],
  );

  // ── Filter + sort ──
  const sortKey = (searchParams.get('sort') ?? 'code') as SortKey;
  const sortDir = (searchParams.get('dir') ?? 'asc') as SortDir;

  const filteredSections = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let rows = sections.filter((s) => {
      if (q) {
        const code = (s.sectionCode ?? '').toLowerCase();
        const program = programById.get(String(s.programId ?? ''));
        const programCode = (program?.programCode ?? '').toLowerCase();
        const programName = (program?.programName ?? '').toLowerCase();
        if (
          !code.includes(q) &&
          !programCode.includes(q) &&
          !programName.includes(q)
        )
          return false;
      }
      if (programFilter && String(s.programId ?? '') !== programFilter) {
        return false;
      }
      if (yearFilter && String(s.yearLevel ?? '') !== yearFilter) return false;
      if (statusFilter === 'active' && !s.isActive) return false;
      if (statusFilter === 'inactive' && s.isActive) return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      let av = '';
      let bv = '';
      switch (sortKey) {
        case 'code':
          av = a.sectionCode ?? '';
          bv = b.sectionCode ?? '';
          break;
        case 'program':
          av = programById.get(String(a.programId ?? ''))?.programCode ?? '';
          bv = programById.get(String(b.programId ?? ''))?.programCode ?? '';
          break;
        case 'year':
          av = String(a.yearLevel ?? 0).padStart(2, '0');
          bv = String(b.yearLevel ?? 0).padStart(2, '0');
          break;
        case 'students':
          av = String(a.studentCount ?? 0).padStart(6, '0');
          bv = String(b.studentCount ?? 0).padStart(6, '0');
          break;
      }
      return av.localeCompare(bv) * dir;
    });
    return rows;
  }, [
    sections,
    debouncedSearch,
    programFilter,
    yearFilter,
    statusFilter,
    sortKey,
    sortDir,
    programById,
  ]);

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

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: createSection,
    onSuccess: (section) => {
      setSuccess(`Section "${section.sectionCode}" created.`);
      closeForm(true);
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
      closeForm(true);
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

  // ── Form ──
  const closeForm = (force = false) => {
    if (!force) {
      const dirty =
        form.sectionCode ||
        form.programId ||
        form.yearLevel ||
        form.studentCount;
      if (dirty) {
        setConfirmCloseForm(true);
        return;
      }
    }
    setConfirmCloseForm(false);
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFieldErrors({});
  };

  /** Suggest the next available section code given a program + year.
   *  Example: existing CpE-1A, CpE-1B → suggests CpE-1C */
  const suggestSectionCode = useCallback(
    (programId: string, yearLevel: string): string => {
      if (!programId || !yearLevel) return '';
      const prog = programById.get(String(programId));
      if (!prog) return '';
      const prefix = prog.programCode;
      const prefixRegex = new RegExp(
        `^${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}-${yearLevel}([A-Z])$`,
      );
      const used = new Set<string>();
      for (const s of sections) {
        if (
          String(s.programId) === String(programId) &&
          String(s.yearLevel) === String(yearLevel)
        ) {
          const m = s.sectionCode.match(prefixRegex);
          if (m) used.add(m[1]);
        }
      }
      for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i); // A..Z
        if (!used.has(letter)) return `${prefix}-${yearLevel}${letter}`;
      }
      return '';
    },
    [sections, programById],
  );

  const openCreate = () => {
    setShowForm(true);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  };

  const openEdit = (s: Section) => {
    if (isForeign(s)) return;
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
    setFieldErrors({});
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      // Auto-suggest section code when program or year changes AND the
      // code hasn't been touched yet (create mode only).
      if (
        !editing &&
        (name === 'programId' || name === 'yearLevel') &&
        !prev.sectionCode
      ) {
        const suggestion = suggestSectionCode(next.programId, next.yearLevel);
        if (suggestion) next.sectionCode = suggestion;
      }
      return next;
    });
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validateForm = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.sectionCode.trim()) errs.sectionCode = 'Section code is required';
    if (!form.programId) errs.programId = 'Program is required';
    if (!form.yearLevel) errs.yearLevel = 'Year level is required';
    if (form.yearLevel && !YEAR_LEVELS.includes(Number(form.yearLevel))) {
      errs.yearLevel = 'Year must be between 1 and 5';
    }
    if (form.studentCount) {
      const n = Number(form.studentCount);
      if (isNaN(n) || n < 0 || n > 500) {
        errs.studentCount = 'Student count must be between 0 and 500';
      }
    }
    // Duplicate check: same code in the same program
    const code = form.sectionCode.trim().toLowerCase();
    const dup = sections.find(
      (s) =>
        s.sectionId !== editing?.sectionId &&
        (s.sectionCode ?? '').trim().toLowerCase() === code &&
        String(s.programId) === String(form.programId),
    );
    if (dup) {
      errs.sectionCode = `"${form.sectionCode}" already exists in this program`;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validateForm()) return;

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

  // ── Program helpers ──
  const programLabel = (id: string | null) => {
    if (!id) return null;
    const p = programById.get(String(id));
    return p?.programCode ?? null;
  };

  const selectablePrograms = useMemo(() => {
    const active = programs.filter((p) => p.isActive);
    if (!isDH) return active;
    return active.filter((p) => String(p.deptId) === myDeptId);
  }, [programs, isDH, myDeptId]);

  // Group programs by department for the filter dropdown
  const programOptions = useMemo(() => {
    const opts: { id: string; label: string; deptId: string }[] = [];
    for (const p of programs) {
      if (!p.isActive) continue;
      opts.push({
        id: String(p.programId),
        label: `[${p.programCode}] ${p.programName}`,
        deptId: String(p.deptId ?? ''),
      });
    }
    return opts;
  }, [programs]);

  const formBusy = createMutation.isPending || updateMutation.isPending;

  // ── Filter pills ──
  const filterPills = useMemo(() => {
    const pills: { label: string; onRemove: () => void }[] = [];
    if (searchInput) {
      pills.push({
        label: `Search: "${searchInput}"`,
        onRemove: () => setSearchInput(''),
      });
    }
    if (programFilter) {
      const p = programById.get(programFilter);
      pills.push({
        label: `Program: ${p ? `[${p.programCode}]` : programFilter}`,
        onRemove: () => setFilter('program', ''),
      });
    }
    if (yearFilter) {
      pills.push({
        label: `Year ${yearFilter}`,
        onRemove: () => setFilter('year', ''),
      });
    }
    if (statusFilter !== 'all') {
      pills.push({
        label: `Status: ${statusFilter === 'active' ? 'Active' : 'Inactive'}`,
        onRemove: () => setFilter('status', 'all'),
      });
    }
    return pills;
  }, [searchInput, programFilter, yearFilter, statusFilter, programById, setFilter]);

  // ── Live form preview ──
  const formPreview = useMemo(() => {
    const parts: string[] = [];
    if (form.sectionCode) parts.push(form.sectionCode);
    const prog = programById.get(form.programId);
    if (prog) parts.push(`[${prog.programCode}] ${prog.programName}`);
    if (form.yearLevel) parts.push(`Year ${form.yearLevel}`);
    if (form.studentCount) parts.push(`${form.studentCount} students`);
    return parts.join(' · ');
  }, [form, programById]);

  // ── Sort header helper ──
  const SortHeader = ({
    label,
    sortKeyName,
  }: {
    label: string;
    sortKeyName: SortKey;
  }) => {
    const isActive = sortKey === sortKeyName;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKeyName)}
        className={`inline-flex items-center gap-1 hover:text-primary transition ${
          isActive ? 'text-primary' : ''
        }`}
      >
        {label}
        <Icon
          name={
            !isActive
              ? 'unfold_more'
              : sortDir === 'asc'
              ? 'arrow_upward'
              : 'arrow_downward'
          }
          size={12}
        />
      </button>
    );
  };

  // ── Columns ──
  const columns: Column<Section>[] = [
    {
      key: 'code',
      header: <SortHeader label="Section" sortKeyName="code" />,
      cardVariant: 'title',
      cellClassName: '',
      render: (s) => {
        const prog = programById.get(String(s.programId ?? ''));
        const foreign = isForeign(s);
        const orphan = !s.programId;
        return (
          <div className="flex items-center gap-2">
            {prog && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                {prog.programCode}
              </span>
            )}
            <span
              className={`font-mono font-bold ${
                foreign ? 'text-slate-500' : 'text-primary'
              }`}
            >
              {s.sectionCode}
            </span>
            {s.yearLevel != null && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                Y{s.yearLevel}
              </span>
            )}
            {orphan && (
              <span
                className="inline-flex items-center text-amber-500"
                title="No program assigned — assign one to enable DH editing"
              >
                <Icon name="warning" size={12} />
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'program',
      header: <SortHeader label="Program" sortKeyName="program" />,
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface-variant',
      render: (s) => {
        const p = programById.get(String(s.programId ?? ''));
        if (!p) return <span className="text-slate-400">—</span>;
        return <span>{p.programName}</span>;
      },
    },
    {
      key: 'yearLevel',
      header: <SortHeader label="Year" sortKeyName="year" />,
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant',
      render: (s) => (s.yearLevel != null ? String(s.yearLevel) : '—'),
    },
    {
      key: 'students',
      header: <SortHeader label="Students" sortKeyName="students" />,
      cardVariant: 'mono',
      cellClassName: 'text-xs',
      render: (s) => {
        if (s.studentCount == null) {
          return <span className="text-slate-400">—</span>;
        }
        const n = s.studentCount;
        const tone =
          n > 60
            ? 'text-rose-700 bg-rose-50'
            : n > 40
            ? 'text-amber-700 bg-amber-50'
            : 'text-emerald-700 bg-emerald-50';
        return (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold ${tone}`}
            title={
              n > 60
                ? 'Large section — may exceed room capacity'
                : 'Advisory count'
            }
          >
            <Icon name="group" size={11} />
            {n}
          </span>
        );
      },
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
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: () => null,
    },
  ];

  const getActions = (s: Section): RowAction[] => {
    if (isForeign(s)) {
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
      { label: 'Edit', icon: 'edit', onClick: () => openEdit(s) },
      { divider: true },
      {
        label: s.isActive ? 'Deactivate' : 'Activate',
        icon: s.isActive ? 'toggle_off' : 'toggle_on',
        loading:
          toggleMutation.isPending &&
          toggleMutation.variables === s.sectionId,
        onClick: () => toggleMutation.mutate(s.sectionId),
      },
      { divider: true },
      {
        label: 'Delete',
        icon: 'delete',
        danger: true,
        loading:
          deleteMutation.isPending &&
          deleteMutation.variables === s.sectionId,
        onClick: () => setDeleteTarget(s),
      },
    ];
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3" data-tour="sections-header">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Sections</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Manage student sections used by the scheduler for cohort sizing.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition shadow-sm"
          >
            <Icon name="add" size={18} />
            New Section
          </button>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total"
          value={stats.total}
          icon="groups"
          tone="neutral"
          onClick={hasAnyFilter ? clearAll : undefined}
        />
        <StatCard
          label="Active"
          value={stats.active}
          icon="check_circle"
          tone="emerald"
          onClick={() =>
            setFilter('status', statusFilter === 'active' ? 'all' : 'active')
          }
        />
        <StatCard
          label="With Students"
          value={stats.withStudents}
          icon="school"
          tone="blue"
        />
        <StatCard
          label="Inactive"
          value={stats.inactive}
          icon="toggle_off"
          tone={stats.inactive > 0 ? 'rose' : 'neutral'}
          onClick={() =>
            setFilter(
              'status',
              statusFilter === 'inactive' ? 'all' : 'inactive',
            )
          }
        />
      </div>

      {/* ── Year breakdown ── */}
      {availableYears.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            By year
          </span>
          {availableYears.map((y) => {
            const count = stats.yearCounts[y] ?? 0;
            const active = yearFilter === String(y);
            return (
              <button
                key={y}
                type="button"
                onClick={() =>
                  setFilter('year', active ? '' : String(y))
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  active
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                }`}
              >
                Year {y}
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Banners ── */}
      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2">
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

      {isDH && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            Sections marked with an{' '}
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />{' '}
            amber dot belong to programs outside your department and are
            read-only. Orphaned sections (no program) can only be fixed by an
            administrator.
          </span>
        </div>
      )}

      {/* ── Filter panel ── */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden" data-tour="sections-filters">
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
                {filteredSections.length}
              </strong>{' '}
              of {sections.length}
            </span>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs px-3 py-1.5 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Filter pills */}
        {filterPills.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-surface-variant pt-3">
            {filterPills.map((pill, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border bg-primary/5 text-primary border-primary/30"
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

        {filtersExpanded && (
          <div className="border-t border-surface-variant p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2 lg:col-span-1">
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
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Code or program…"
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
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

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Program
                </label>
                <select
                  value={programFilter}
                  onChange={(e) => setFilter('program', e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All programs</option>
                  {programOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Year
                </label>
                <select
                  value={yearFilter}
                  onChange={(e) => setFilter('year', e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">Any</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      Year {y} ({stats.yearCounts[y]})
                    </option>
                  ))}
                </select>
              </div>

              <div>
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
            </div>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {filteredSections.length === 0 && hasAnyFilter && !isLoading ? (
        <div className="rounded-xl border border-dashed border-surface-variant bg-surface-container-lowest py-16 text-center">
          <Icon
            name="search_off"
            size={48}
            className="text-slate-300 mx-auto mb-3"
          />
          <p className="text-base font-semibold text-on-surface">
            No sections match your filters
          </p>
          <p className="text-sm text-on-surface-variant mt-1 mb-4">
            Try adjusting your search or clearing some filters.
          </p>
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="filter_alt_off" size={16} />
            Clear all filters
          </button>
        </div>
      ) : (
        <div data-tour="sections-table">
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
          onRowClick={(s) => !isForeign(s) && openEdit(s)}
          emptyIcon="groups"
          emptyAction={
            canManage ? (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
              >
                <Icon name="add" size={16} />
                Add first section
              </button>
            ) : undefined
          }
          />
        </div>
      )}

      {/* ── Create / Edit modal ── */}
      <Modal
        open={showForm}
        onClose={() => closeForm()}
        title={
          editing
            ? `Edit Section — ${editing.sectionCode}`
            : 'Create Section'
        }
        description={
          editing
            ? 'Update this section\'s details.'
            : 'Add a new section for a program and year level.'
        }
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Live preview */}
          {formPreview && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
              <Icon name="preview" size={14} className="mt-0.5 shrink-0" />
              <span className="font-mono">{formPreview}</span>
            </div>
          )}

          {/* Identification */}
          <FormSection title="Identification" icon="badge">
            <FormField
              label="Section Code"
              required
              error={fieldErrors.sectionCode}
              hint={
                !editing &&
                form.programId &&
                form.yearLevel &&
                form.sectionCode
                  ? 'Auto-suggested based on program and year. You can edit it.'
                  : undefined
              }
            >
              <input
                ref={firstFieldRef}
                type="text"
                name="sectionCode"
                value={form.sectionCode}
                onChange={handleChange}
                placeholder="e.g. CpE-1A"
                className={inputClass(!!fieldErrors.sectionCode)}
              />
            </FormField>
          </FormSection>

          {/* Program & year */}
          <FormSection title="Program & Year" icon="school">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Program"
                required
                error={fieldErrors.programId}
                hint={
                  isDH
                    ? 'Only your department\'s programs are listed.'
                    : undefined
                }
              >
                <select
                  name="programId"
                  value={form.programId}
                  onChange={handleChange}
                  className={inputClass(!!fieldErrors.programId)}
                >
                  <option value="">Select program…</option>
                  {selectablePrograms.map((p) => (
                    <option key={p.programId} value={p.programId}>
                      [{p.programCode}] {p.programName}
                    </option>
                  ))}
                </select>
                {selectablePrograms.length === 0 && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] flex items-start gap-2">
                    <Icon name="warning" size={13} className="shrink-0 mt-0.5" />
                    <span>
                      No active programs in your department. Add one on the{' '}
                      <Link
                        to="/programs"
                        className="font-semibold underline hover:text-amber-950"
                      >
                        Programs page
                      </Link>{' '}
                      first — every section must belong to a program.
                    </span>
                  </div>
                )}
              </FormField>

              <FormField
                label="Year Level"
                required
                error={fieldErrors.yearLevel}
              >
                <select
                  name="yearLevel"
                  value={form.yearLevel}
                  onChange={handleChange}
                  className={inputClass(!!fieldErrors.yearLevel)}
                >
                  <option value="">— select —</option>
                  {YEAR_LEVELS.map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </FormSection>

          {/* Advisory */}
          <FormSection title="Advisory" icon="group">
            <FormField
              label="Students (advisory)"
              error={fieldErrors.studentCount}
              hint="Rough count only — used by S-8 as a soft signal. Not enforced."
            >
              <div className="relative">
                <input
                  type="number"
                  name="studentCount"
                  min={0}
                  max={500}
                  value={form.studentCount}
                  onChange={handleChange}
                  placeholder="e.g. 40"
                  className={inputClass(!!fieldErrors.studentCount)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                  students
                </span>
              </div>
            </FormField>
          </FormSection>

          <div className="flex gap-3 justify-end pt-4 border-t border-surface-variant">
            <button
              type="button"
              onClick={() => closeForm()}
              disabled={formBusy}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formBusy}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
            >
              {formBusy && (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              )}
              {formBusy
                ? 'Saving…'
                : editing
                ? 'Save Changes'
                : 'Create Section'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Unsaved changes ── */}
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
        title="Delete section?"
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
                deleteTarget && deleteMutation.mutate(deleteTarget.sectionId)
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
            Delete section <strong>"{deleteTarget?.sectionCode}"</strong>?
          </p>
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
            <span>
              Any timetable entries and coverage records referencing this
              section will become invalid. This action cannot be undone.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ────────────────────────────────────────────
// Presentational helpers
// ────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  icon: string;
  tone: 'neutral' | 'emerald' | 'blue' | 'rose';
  onClick?: () => void;
}) {
  const tones = {
    neutral: 'bg-surface-container-lowest border-surface-variant',
    emerald: 'bg-emerald-50 border-emerald-200',
    blue: 'bg-blue-50 border-blue-200',
    rose: 'bg-rose-50 border-rose-200',
  } as const;
  const iconTones = {
    neutral: 'text-slate-500',
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    rose: 'text-rose-600',
  } as const;
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
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
  return `w-full bg-surface-container-low border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
      : 'border-surface-variant focus:border-primary focus:ring-primary/10'
  }`;
}