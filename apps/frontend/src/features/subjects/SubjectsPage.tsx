import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchSubjects,
  createSubject,
  updateSubject,
  toggleSubjectActive,
  deleteSubject,
  type SubjectRecord,
  type CreateSubjectInput,
  type SubjectRoomType,
} from '../../api/subjects.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { ActiveBadge } from '../../components/ui/StatusBadge';
import RestrictionsPanel from './components/RestrictionsPanel';
import SubjectFiltersPanel, {
  type Preset,
  type PresetKey,
} from './components/SubjectFiltersPanel';

const ROOM_TYPES: Array<{ value: '' | SubjectRoomType; label: string; icon: string }> = [
  { value: '', label: '— none —', icon: 'block' },
  { value: 'any', label: 'Any (mixed lec + lab)', icon: 'swap_horiz' },
  { value: 'lecture_room', label: 'Lecture Room', icon: 'meeting_room' },
  { value: 'laboratory', label: 'Laboratory', icon: 'science' },
  { value: 'computer_lab', label: 'Computer Lab', icon: 'computer' },
  { value: 'drafting_room', label: 'Drafting Room', icon: 'draw' },
  { value: 'other', label: 'Other', icon: 'category' },
];

const ROOM_TYPE_ICON: Record<SubjectRoomType, string> = {
  any: 'swap_horiz',
  lecture_room: 'meeting_room',
  laboratory: 'science',
  computer_lab: 'computer',
  drafting_room: 'draw',
  other: 'category',
};

type Mode = 'create' | 'edit';
type RoomTypeFilter = '' | SubjectRoomType | 'none';
type MinorFilter = 'all' | 'minor' | 'regular';
type ComponentFilter = 'all' | 'lecture_only' | 'lab_only' | 'mixed';
type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'code' | 'title' | 'units' | 'dept' | 'roomType';
type SortDir = 'asc' | 'desc';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

interface FormState {
  subjectCode: string;
  title: string;
  lectureUnits: string;
  labUnits: string;
  requiredRoomType: '' | SubjectRoomType;
  deptId: string;
  isMinor: boolean;
}

const EMPTY_FORM: FormState = {
  subjectCode: '',
  title: '',
  lectureUnits: '',
  labUnits: '',
  requiredRoomType: '',
  deptId: '',
  isMinor: false,
};

/**
 * Extract a useful error message from a failed mutation.
 * NestJS returns `{ message: string | string[], error, statusCode }`.
 * Returns the server's message if present, else falls back to err.message.
 */
function extractErrorMessage(err: any, fallback: string): string {
  const raw = err?.response?.data?.message;
  if (Array.isArray(raw)) return raw[0] ?? fallback;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return err?.message ?? fallback;
}

export default function SubjectsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const isAdminOrDean =
    profile?.role === 'administrator' || profile?.role === 'college_dean';
  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;
  const canManage = isDH || isAdminOrDean;

  const [restrictionsOpen, setRestrictionsOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<SubjectRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubjectRecord | null>(null);
  const [confirmCloseForm, setConfirmCloseForm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // ── NEW: dedicated delete-error state ──
  const [deleteError, setDeleteError] = useState<{
    subjectCode: string;
    message: string;
  } | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const searchRef = useRef<HTMLInputElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // ── URL state ──
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get('q') ?? '',
  );
  const debouncedSearch = useDebouncedValue(searchInput, 200);

  const deptFilter = searchParams.get('dept') ?? '';
  const roomFilter = (searchParams.get('room') ?? '') as RoomTypeFilter;
  const minorFilter = (searchParams.get('minor') ?? 'all') as MinorFilter;
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
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.delete('dept');
    next.delete('room');
    next.delete('minor');
    next.delete('comp');
    next.delete('status');
    next.delete('sort');
    next.delete('dir');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const hasAnyFilter =
    !!searchInput ||
    !!deptFilter ||
    !!roomFilter ||
    minorFilter !== 'all' ||
    compFilter !== 'all' ||
    statusFilter !== 'all';

  const activeFilterCount =
    (searchInput ? 1 : 0) +
    (deptFilter ? 1 : 0) +
    (roomFilter ? 1 : 0) +
    (minorFilter !== 'all' ? 1 : 0) +
    (compFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0);

  // ── Queries ──
  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects', { includeInactive: true }],
    queryFn: () => fetchSubjects(true),
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
    enabled: !!user,
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
      if (e.key === '/' && !inInput && !mode) {
        e.preventDefault();
        setFiltersExpanded(true);
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && !inInput && !mode && searchInput) {
        setSearchInput('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, searchInput]);

  const deptCodeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(String(d.deptId), d.deptCode ?? '');
    return m;
  }, [departments]);

  const deptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of subjects) {
      const id = String(s.deptId ?? '');
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [subjects]);

  const isForeign = useCallback(
    (s: SubjectRecord): boolean => {
      if (!isDH) return false;
      return String(s.deptId ?? '') !== myDeptId;
    },
    [isDH, myDeptId],
  );

  // ── Stats (scoped) ──
  const scopedSubjects = useMemo(() => {
    if (isDH && myDeptId) {
      return subjects.filter((s) => String(s.deptId ?? '') === myDeptId);
    }
    return subjects;
  }, [subjects, isDH, myDeptId]);

  const stats = useMemo(() => {
    let lectureOnly = 0;
    let labOnly = 0;
    let mixed = 0;
    let minor = 0;
    let inactive = 0;
    for (const s of scopedSubjects) {
      const lec = Number(s.lectureUnits ?? 0);
      const lab = Number(s.labUnits ?? 0);
      if (lec > 0 && lab > 0) mixed++;
      else if (lec > 0) lectureOnly++;
      else if (lab > 0) labOnly++;
      if (s.isMinor) minor++;
      if (!s.isActive) inactive++;
    }
    return {
      total: scopedSubjects.length,
      lectureOnly,
      labOnly,
      mixed,
      minor,
      inactive,
    };
  }, [scopedSubjects]);

  // ── Filtered + sorted ──
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    let rows = subjects.filter((s) => {
      if (q) {
        const code = (s.subjectCode ?? '').toLowerCase();
        const title = (s.title ?? '').toLowerCase();
        const deptCode = (
          deptCodeById.get(String(s.deptId ?? '')) ?? ''
        ).toLowerCase();
        if (
          !code.includes(q) &&
          !title.includes(q) &&
          !deptCode.includes(q)
        )
          return false;
      }

      if (deptFilter && String(s.deptId ?? '') !== deptFilter) return false;

      if (roomFilter === 'none') {
        if (s.requiredRoomType) return false;
      } else if (roomFilter) {
        if (s.requiredRoomType !== roomFilter) return false;
      }

      if (minorFilter === 'minor' && !s.isMinor) return false;
      if (minorFilter === 'regular' && s.isMinor) return false;

      const lec = Number(s.lectureUnits ?? 0);
      const lab = Number(s.labUnits ?? 0);
      if (compFilter === 'lecture_only' && (lec === 0 || lab > 0)) return false;
      if (compFilter === 'lab_only' && (lab === 0 || lec > 0)) return false;
      if (compFilter === 'mixed' && (lec === 0 || lab === 0)) return false;

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
          av = deptCodeById.get(String(a.deptId ?? '')) ?? '';
          bv = deptCodeById.get(String(b.deptId ?? '')) ?? '';
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
    minorFilter,
    compFilter,
    statusFilter,
    sortKey,
    sortDir,
    deptCodeById,
  ]);

  // ── Shared invalidation helper ──
  const invalidateAfterSubjectChange = () => {
    qc.invalidateQueries({ queryKey: ['subjects'] });
    qc.invalidateQueries({ queryKey: ['coverage'] });
    qc.invalidateQueries({ queryKey: ['unplotted-minors'] });
  };

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: createSubject,
    onSuccess: (s) => {
      setSuccess(`Subject "${s.subjectCode}" created.`);
      closeForm(true);
      invalidateAfterSubjectChange();
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, 'Failed to create')),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CreateSubjectInput>;
    }) => updateSubject(id, input),
    onSuccess: (s) => {
      setSuccess(`Subject "${s.subjectCode}" updated.`);
      closeForm(true);
      invalidateAfterSubjectChange();
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, 'Failed to update')),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleSubjectActive,
    onSuccess: () => invalidateAfterSubjectChange(),
    onError: (err: any) =>
      setError(extractErrorMessage(err, 'Toggle failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubject,
    onSuccess: () => {
      setSuccess('Subject deleted.');
      setDeleteTarget(null);
      invalidateAfterSubjectChange();
    },
    onError: (err: any) => {
      // Close the confirm modal, show the dedicated error modal
      const target = deleteTarget;
      setDeleteTarget(null);
      setDeleteError({
        subjectCode: target?.subjectCode ?? 'this subject',
        message: extractErrorMessage(err, 'Delete failed'),
      });
    },
  });

  // ── Form ──
  const closeForm = (force = false) => {
    if (!force) {
      const dirty =
        form.subjectCode ||
        form.title ||
        form.lectureUnits ||
        form.labUnits ||
        form.requiredRoomType ||
        form.isMinor ||
        (mode === 'edit' && form.deptId !== (editing?.deptId ?? ''));
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
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  };

  const openEdit = (s: SubjectRecord) => {
    if (isForeign(s)) return;
    setMode('edit');
    setEditing(s);
    setForm({
      subjectCode: s.subjectCode,
      title: s.title,
      lectureUnits: String(s.lectureUnits ?? 0),
      labUnits: String(s.labUnits ?? 0),
      requiredRoomType: (s.requiredRoomType ?? '') as '' | SubjectRoomType,
      deptId: s.deptId ?? '',
      isMinor: s.isMinor ?? false,
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
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const lectureUnitsNum = Number(form.lectureUnits || 0);
  const labUnitsNum = Number(form.labUnits || 0);
  const totalUnits = lectureUnitsNum + labUnitsNum;
  const isMixed = lectureUnitsNum > 0 && labUnitsNum > 0;
  const isLectureOnly = lectureUnitsNum > 0 && labUnitsNum === 0;
  const isLabOnly = labUnitsNum > 0 && lectureUnitsNum === 0;

  const validateForm = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.subjectCode.trim()) errs.subjectCode = 'Subject code is required';
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.deptId) errs.deptId = 'Department is required';
    if (!form.lectureUnits && !form.labUnits) {
      errs.lectureUnits = 'Enter at least one unit';
    }
    if (lectureUnitsNum < 0 || labUnitsNum < 0) {
      errs.labUnits = 'Units cannot be negative';
    }
    if (lectureUnitsNum > 12 || labUnitsNum > 12) {
      errs.labUnits = 'Units cannot exceed 12 per component';
    }
    // Duplicate subject code within department
    const code = form.subjectCode.trim().toLowerCase();
    const deptKey = form.deptId;
    const dup = subjects.find(
      (s) =>
        s.subjectId !== editing?.subjectId &&
        String(s.deptId) === deptKey &&
        (s.subjectCode ?? '').trim().toLowerCase() === code,
    );
    if (dup) {
      errs.subjectCode = `"${form.subjectCode}" already exists in this department`;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validateForm()) return;

    const lecture = lectureUnitsNum;
    const lab = labUnitsNum;
    const total = lecture + lab;

    let requiredRoomType: SubjectRoomType | null =
      form.requiredRoomType === '' ? null : form.requiredRoomType;
    if (lecture > 0 && lab > 0) {
      requiredRoomType = 'any';
    }

    const payload: CreateSubjectInput = {
      subjectCode: form.subjectCode.trim(),
      title: form.title.trim(),
      totalUnits: total,
      lectureUnits: lecture,
      labUnits: lab,
      requiredRoomType,
      isMinor: form.isMinor,
      deptId: form.deptId,
    };

    if (mode === 'create') createMutation.mutate(payload);
    else if (mode === 'edit' && editing)
      updateMutation.mutate({ id: editing.subjectId, input: payload });
  };

  const deptName = (id: string | null) => {
    if (!id) return '—';
    return deptCodeById.get(String(id)) ?? `#${id}`;
  };

  // ── Presets ──
  const PRESETS: Preset[] = useMemo(
    () => [
      {
        key: 'mixed',
        label: 'Mixed (Lec + Lab)',
        icon: 'merge_type',
        apply: (setF) => {
          setF('comp', 'mixed');
          setF('minor', 'all');
          setF('room', '');
        },
      },
      {
        key: 'minors',
        label: 'Minors',
        icon: 'school',
        apply: (setF) => {
          setF('minor', 'minor');
          setF('comp', 'all');
          setF('room', '');
        },
      },
      {
        key: 'no_room',
        label: 'No room type',
        icon: 'block',
        apply: (setF) => {
          setF('room', 'none');
          setF('comp', 'all');
          setF('minor', 'all');
        },
      },
      {
        key: 'lecture_only',
        label: 'Lecture only',
        icon: 'meeting_room',
        apply: (setF) => {
          setF('comp', 'lecture_only');
          setF('minor', 'all');
          setF('room', '');
        },
      },
      {
        key: 'lab_only',
        label: 'Lab only',
        icon: 'science',
        apply: (setF) => {
          setF('comp', 'lab_only');
          setF('minor', 'all');
          setF('room', '');
        },
      },
    ],
    [],
  );

  const applyPreset = (preset: Preset) => {
    const next = new URLSearchParams(searchParams);
    ['comp', 'minor', 'room'].forEach((k) => next.delete(k));
    const setF = (k: string, v: string) => {
      if (!v || v === 'all') next.delete(k);
      else next.set(k, v);
    };
    preset.apply(setF);
    setSearchParams(next, { replace: true });
  };

  const isPresetActive = (key: PresetKey): boolean => {
    switch (key) {
      case 'mixed':
        return compFilter === 'mixed';
      case 'minors':
        return minorFilter === 'minor';
      case 'no_room':
        return roomFilter === 'none';
      case 'lecture_only':
        return compFilter === 'lecture_only';
      case 'lab_only':
        return compFilter === 'lab_only';
    }
  };

  // ── Filter pills ──
  const filterPills = useMemo(() => {
    const pills: { label: string; onRemove: () => void; tone?: 'accent' }[] = [];
    if (searchInput) {
      pills.push({
        label: `Search: "${searchInput}"`,
        onRemove: () => setSearchInput(''),
      });
    }
    if (deptFilter) {
      const d = departments.find((x) => String(x.deptId) === deptFilter);
      pills.push({
        label: `Dept: ${d ? `[${d.deptCode}] ${d.deptName}` : deptFilter}`,
        onRemove: () => setFilter('dept', ''),
      });
    }
    if (roomFilter) {
      const label =
        roomFilter === 'none'
          ? 'No room type'
          : ROOM_TYPES.find((r) => r.value === roomFilter)?.label ?? roomFilter;
      pills.push({
        label: `Room: ${label}`,
        onRemove: () => setFilter('room', ''),
      });
    }
    if (minorFilter !== 'all') {
      pills.push({
        label: `Type: ${minorFilter === 'minor' ? 'Minor only' : 'Regular only'}`,
        onRemove: () => setFilter('minor', 'all'),
      });
    }
    if (compFilter !== 'all') {
      const labels: Record<ComponentFilter, string> = {
        all: 'Any',
        lecture_only: 'Lecture only',
        lab_only: 'Lab only',
        mixed: 'Mixed',
      };
      pills.push({
        label: `Component: ${labels[compFilter]}`,
        onRemove: () => setFilter('comp', 'all'),
      });
    }
    if (statusFilter !== 'all') {
      pills.push({
        label: `Status: ${statusFilter === 'active' ? 'Active' : 'Inactive'}`,
        onRemove: () => setFilter('status', 'all'),
      });
    }
    return pills;
  }, [
    searchInput,
    deptFilter,
    roomFilter,
    minorFilter,
    compFilter,
    statusFilter,
    departments,
    setFilter,
  ]);

  // ── Sorting header helper ──
  const SortHeader = ({
    label,
    sortKeyName,
    align = 'left',
  }: {
    label: string;
    sortKeyName: SortKey;
    align?: 'left' | 'right';
  }) => {
    const isActive = sortKey === sortKeyName;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKeyName)}
        className={`inline-flex items-center gap-1 hover:text-primary transition ${
          isActive ? 'text-primary' : ''
        } ${align === 'right' ? 'ml-auto' : ''}`}
        title={`Sort by ${label}`}
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

  const renderRoomType = (s: SubjectRecord) => {
    if (!s.requiredRoomType) return <span className="text-slate-400">—</span>;
    const icon = ROOM_TYPE_ICON[s.requiredRoomType];
    return (
      <span className="inline-flex items-center gap-1">
        <Icon name={icon} size={12} className="text-slate-500" />
        <span className="capitalize">
          {s.requiredRoomType === 'any'
            ? 'Any'
            : s.requiredRoomType.replace('_', ' ')}
        </span>
      </span>
    );
  };

  const renderUnits = (s: SubjectRecord) => {
    const lec = Number(s.lectureUnits ?? 0);
    const lab = Number(s.labUnits ?? 0);
    const total = Number(s.totalUnits ?? 0);
    return (
      <div className="inline-flex items-center gap-1 text-xs font-mono">
        {lec > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
            {lec}L
          </span>
        )}
        {lab > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
            {lab}Lab
          </span>
        )}
        {lec > 0 && lab > 0 && (
          <span className="text-slate-400">=</span>
        )}
        {lec > 0 && lab > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
            {total}
          </span>
        )}
      </div>
    );
  };

  // ── Columns ──
  const columns: Column<SubjectRecord>[] = [
    {
      key: 'code',
      header: <SortHeader label="Code" sortKeyName="code" />,
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (s) => (
        <span className="inline-flex items-center gap-1.5">
          {s.isMinor && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800"
              title="Minor subject — taught by another department or college"
            >
              <Icon name="school" size={9} />
              Minor
            </span>
          )}
          {s.subjectCode}
        </span>
      ),
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
      cellClassName: '',
      render: renderUnits,
    },
    {
      key: 'dept',
      header: <SortHeader label="Dept" sortKeyName="dept" />,
      cardVariant: 'meta',
      cellClassName: 'text-xs',
      render: (s) => {
        const foreign = isForeign(s);
        const code = deptName(s.deptId);  // already returns "—" for null
        const tone = deptTone(code === '—' ? null : code);
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold text-[11px] border ${tone.bg} ${tone.fg} ${tone.border}`}
            title={foreign ? `Owned by ${code} — read only` : `Owned by ${code}`}
          >
            {foreign && <Icon name="lock" size={9} />}
            {code}
          </span>
        );
      },
    },
    {
      key: 'roomType',
      header: <SortHeader label="Room Type" sortKeyName="roomType" />,
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: renderRoomType,
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

  const getActions = (s: SubjectRecord): RowAction[] => {
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
          toggleMutation.variables === s.subjectId,
        onClick: () => toggleMutation.mutate(s.subjectId),
      },
      { divider: true },
      {
        label: 'Delete',
        icon: 'delete',
        danger: true,
        loading:
          deleteMutation.isPending &&
          deleteMutation.variables === s.subjectId,
        onClick: () => setDeleteTarget(s),
      },
    ];
  };

  const formBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3" data-tour="subjects-header">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Subjects</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Manage the subject catalog used by the scheduler.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManage && (
            <button
              onClick={() => setRestrictionsOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-surface-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low transition"
            >
              <Icon name="rule" size={18} />
              Restrictions
            </button>
          )}
          {canManage && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition shadow-sm"
            >
              <Icon name="add" size={18} />
              New Subject
            </button>
          )}
        </div>
      </div>

      {/* ── Workflow hint ── */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3 text-sm">
        <Icon name="info" size={18} className="text-blue-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-blue-900 font-medium">
            Step 2 of 3 Academic Structure
          </p>
          <p className="text-blue-800 text-xs mt-0.5">
            Add your department's subjects here first, then map them to programs
            in the Prospectus. Mark subjects taught by another department as{' '}
            <strong>minor</strong>.
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

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Total"
          value={stats.total}
          icon="menu_book"
          tone="neutral"
          onClick={hasAnyFilter ? clearAll : undefined}
        />
        <StatCard
          label="Lecture only"
          value={stats.lectureOnly}
          icon="meeting_room"
          tone="blue"
          onClick={() => applyPreset(PRESETS[3])}
        />
        <StatCard
          label="Lab only"
          value={stats.labOnly}
          icon="science"
          tone="amber"
          onClick={() => applyPreset(PRESETS[4])}
        />
        <StatCard
          label="Mixed"
          value={stats.mixed}
          icon="merge_type"
          tone="purple"
          onClick={() => applyPreset(PRESETS[0])}
        />
        <StatCard
          label="Minor"
          value={stats.minor}
          icon="school"
          tone="purple"
          onClick={() => applyPreset(PRESETS[1])}
        />
        <StatCard
          label="Inactive"
          value={stats.inactive}
          icon="toggle_off"
          tone={stats.inactive > 0 ? 'rose' : 'neutral'}
          onClick={() =>
            setFilter('status', statusFilter === 'inactive' ? 'all' : 'inactive')
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

      {isDH && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            Each row shows its <strong>owning department</strong> in a colored
            badge. Rows with a <Icon name="lock" size={11} className="inline -mb-0.5" />{' '}
            lock icon belong to another department and are read-only. Use the{' '}
            <strong>Department filter</strong> to narrow the list.
          </span>
        </div>
      )}

      {/* ── Filter panel ── */}
      <div data-tour="subjects-filters">
        <SubjectFiltersPanel
        activeFilterCount={activeFilterCount}
        filtersExpanded={filtersExpanded}
        setFiltersExpanded={setFiltersExpanded}
        filteredCount={filtered.length}
        totalCount={subjects.length}
        hasAnyFilter={hasAnyFilter}
        clearAll={clearAll}
        PRESETS={PRESETS}
        isPresetActive={isPresetActive}
        applyPreset={applyPreset}
        filterPills={filterPills}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        searchRef={searchRef}
        deptFilter={deptFilter}
        roomFilter={roomFilter}
        minorFilter={minorFilter}
        compFilter={compFilter}
        statusFilter={statusFilter}
        setFilter={setFilter}
        departments={departments}
        deptCounts={deptCounts}
        ROOM_TYPES={ROOM_TYPES}
      />
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 && hasAnyFilter && !isLoading ? (
        <div className="rounded-xl border border-dashed border-surface-variant bg-surface-container-lowest py-16 text-center">
          <Icon
            name="search_off"
            size={48}
            className="text-slate-300 mx-auto mb-3"
          />
          <p className="text-base font-semibold text-on-surface">
            No subjects match your filters
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
        <div data-tour="subjects-table">
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
            onRowClick={(s) => !isForeign(s) && openEdit(s)}
            emptyIcon="menu_book"
          emptyAction={
            canManage ? (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
              >
                <Icon name="add" size={16} />
                Add first subject
              </button>
            ) : undefined
          }
          />
        </div>
      )}

      {/* ── Create / Edit modal ── */}
      <Modal
        open={!!mode}
        onClose={() => closeForm()}
        title={
          mode === 'create'
            ? 'Create Subject'
            : `Edit Subject — ${editing?.subjectCode}`
        }
        description={
          mode === 'create'
            ? 'Add a new subject to your department catalog.'
            : 'Update this subject\'s details.'
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Live preview */}
          {form.subjectCode && form.title && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs">
              <Icon name="preview" size={14} className="text-primary" />
              <span className="font-mono font-bold text-primary">
                {form.subjectCode}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-700">{form.title}</span>
              {totalUnits > 0 && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="font-semibold text-slate-800">
                    {totalUnits} unit{totalUnits === 1 ? '' : 's'}
                  </span>
                </>
              )}
              {isMixed && (
                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold uppercase">
                  Mixed
                </span>
              )}
              {form.isMinor && (
                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold uppercase">
                  Minor
                </span>
              )}
            </div>
          )}

          {/* Identification */}
          <FormSection title="Identification" icon="badge">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Subject Code"
                required
                error={fieldErrors.subjectCode}
              >
                <input
                  ref={firstFieldRef}
                  type="text"
                  name="subjectCode"
                  value={form.subjectCode}
                  onChange={handleChange}
                  placeholder="e.g. CPE 101"
                  className={inputClass(!!fieldErrors.subjectCode)}
                />
              </FormField>
              <FormField
                label="Department"
                required
                error={fieldErrors.deptId}
                hint={isDH ? 'Locked to your department.' : undefined}
              >
                <select
                  name="deptId"
                  value={form.deptId}
                  onChange={handleChange}
                  disabled={isDH}
                  className={`${inputClass(!!fieldErrors.deptId)} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <option value="">Select a department…</option>
                  {departments
                    .filter((d) => d.isActive)
                    .filter((d) => !isDH || String(d.deptId) === myDeptId)
                    .map((d) => (
                      <option key={d.deptId} value={d.deptId}>
                        [{d.deptCode}] {d.deptName}
                      </option>
                    ))}
                </select>
              </FormField>
              <div className="md:col-span-2">
                <FormField
                  label="Title"
                  required
                  error={fieldErrors.title}
                >
                  <input
                    type="text"
                    name="title"
                    value={form.title}
                    onChange={handleChange}
                    placeholder="e.g. Programming Logic & Design"
                    className={inputClass(!!fieldErrors.title)}
                  />
                </FormField>
              </div>
            </div>
          </FormSection>

          {/* Units */}
          <FormSection title="Units" icon="calculate">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Lecture Units"
                required
                error={fieldErrors.lectureUnits}
              >
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="12"
                  name="lectureUnits"
                  value={form.lectureUnits}
                  onChange={handleChange}
                  placeholder="0"
                  className={inputClass(!!fieldErrors.lectureUnits)}
                />
              </FormField>
              <FormField
                label="Lab Units"
                required
                error={fieldErrors.labUnits}
              >
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="12"
                  name="labUnits"
                  value={form.labUnits}
                  onChange={handleChange}
                  placeholder="0"
                  className={inputClass(!!fieldErrors.labUnits)}
                />
              </FormField>
            </div>

            {/* Unit breakdown chip */}
            {totalUnits > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <span className="font-semibold text-slate-600">
                  Breakdown:
                </span>
                {lectureUnitsNum > 0 && (
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono font-semibold">
                    {lectureUnitsNum} Lecture
                  </span>
                )}
                {labUnitsNum > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-mono font-semibold">
                    {labUnitsNum} Lab
                  </span>
                )}
                <span className="text-slate-400">=</span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono font-bold">
                  {totalUnits} Total
                </span>
              </div>
            )}

            {isMixed && (
              <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-blue-50 text-blue-900 border border-blue-200 mt-3">
                <Icon name="info" size={14} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Mixed subject detected</p>
                  <p className="mt-0.5">
                    Room type will be set to <strong>Any</strong> on save —
                    lecture blocks go in lecture rooms, lab blocks go in labs.
                  </p>
                </div>
              </div>
            )}
          </FormSection>

          {/* Room & classification */}
          <FormSection title="Room & Classification" icon="tune">
            <FormField
              label="Required Room Type"
              hint={
                isMixed
                  ? 'Auto-set to "Any" because this subject has both lecture and lab units.'
                  : isLectureOnly
                  ? 'Suggested: Lecture Room (no lab units).'
                  : isLabOnly
                  ? 'Suggested: Laboratory (no lecture units).'
                  : 'Leave as "— none —" if the subject can be scheduled anywhere.'
              }
            >
              <select
                name="requiredRoomType"
                value={form.requiredRoomType}
                onChange={handleChange}
                disabled={isMixed}
                className={`${inputClass(false)} disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {ROOM_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
            </FormField>

            <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-surface-variant bg-surface-container-low p-3 hover:bg-surface-container transition mt-4">
              <input
                type="checkbox"
                checked={form.isMinor}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    isMinor: e.target.checked,
                  }))
                }
                className="accent-[#5c1219] w-4 h-4 mt-0.5"
              />
              <div className="flex-1">
                <span className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <Icon name="school" size={14} className="text-purple-600" />
                  Minor subject
                </span>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Taught by another department or college. Minor subjects are
                  plotted manually <strong>before</strong> running
                  auto-generate. Examples: Math, GenEd, PE, EPIC, NSTP.
                </p>
              </div>
            </label>

            {form.isMinor && (
              <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-purple-50 text-purple-900 border border-purple-200 mt-3">
                <Icon name="info" size={14} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Minor subject</p>
                  <p className="mt-0.5">
                    Will show a purple "Minor" badge in the table and appear in
                    the "unplotted minors" indicator on the Timetable page.
                  </p>
                </div>
              </div>
            )}
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
                : mode === 'create'
                ? 'Create Subject'
                : 'Save Changes'}
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
        title="Delete subject?"
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
                deleteTarget && deleteMutation.mutate(deleteTarget.subjectId)
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
            Delete subject{' '}
            <strong>
              "{deleteTarget?.subjectCode} — {deleteTarget?.title}"
            </strong>
            ?
          </p>
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
            <span>
              This will remove the subject from all prospectuses and any
              program mappings. Existing timetables that reference this
              subject may become invalid. This action cannot be undone.
            </span>
          </div>
        </div>
      </Modal>

      {/* ── NEW: Delete blocked — dedicated error modal ── */}
      <Modal
        open={!!deleteError}
        onClose={() => setDeleteError(null)}
        title="Cannot delete subject"
        size="md"
        footer={
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="px-5 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg"
          >
            Got it
          </button>
        }
      >
        {deleteError && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200">
              <Icon
                name="block"
                filled
                size={22}
                className="text-rose-600 shrink-0 mt-0.5"
              />
              <div className="text-sm text-rose-900 min-w-0">
                <p className="font-semibold">
                  "{deleteError.subjectCode}" is still in use
                </p>
                <p className="mt-1.5 text-rose-800 break-words leading-relaxed">
                  {deleteError.message}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon name="lightbulb" size={14} className="text-blue-700" />
                <span className="font-semibold">What you can do</span>
              </div>
              <ul className="space-y-1 list-disc list-inside text-blue-800">
                <li>
                  <strong>Deactivate</strong> the subject instead — it becomes
                  unplottable but its history is preserved.
                </li>
                <li>
                  Remove it from all <strong>prospectus entries</strong> first,
                  then try again.
                </li>
                <li>
                  Delete or reassign the <strong>schedule entries</strong> that
                  use it.
                </li>
                <li>
                  If a <strong>restriction</strong> references it, remove the
                  restriction first.
                </li>
              </ul>
            </div>
          </div>
        )}
      </Modal>

      <RestrictionsPanel
        open={restrictionsOpen}
        onClose={() => setRestrictionsOpen(false)}
        subjects={subjects}
      />
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
  tone: 'neutral' | 'blue' | 'amber' | 'purple' | 'rose';
  onClick?: () => void;
}) {
  const tones = {
    neutral: 'bg-surface-container-lowest border-surface-variant',
    blue: 'bg-blue-50 border-blue-200',
    amber: 'bg-amber-50 border-amber-200',
    purple: 'bg-purple-50 border-purple-200',
    rose: 'bg-rose-50 border-rose-200',
  } as const;
  const iconTones = {
    neutral: 'text-slate-500',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    purple: 'text-purple-600',
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

// Deterministic dept color — works for any dept that exists,
// including ones created after this file was written.
// Uses the dept code (stable) rather than the ID (may reorder on reset).

const DEPT_PALETTE = [
  { bg: 'bg-rose-50',    fg: 'text-rose-800',    border: 'border-rose-300' },
  { bg: 'bg-blue-50',    fg: 'text-blue-800',    border: 'border-blue-300' },
  { bg: 'bg-emerald-50', fg: 'text-emerald-800', border: 'border-emerald-300' },
  { bg: 'bg-amber-50',   fg: 'text-amber-800',   border: 'border-amber-300' },
  { bg: 'bg-violet-50',  fg: 'text-violet-800',  border: 'border-violet-300' },
  { bg: 'bg-cyan-50',    fg: 'text-cyan-800',    border: 'border-cyan-300' },
  { bg: 'bg-lime-50',    fg: 'text-lime-800',    border: 'border-lime-300' },
  { bg: 'bg-fuchsia-50', fg: 'text-fuchsia-800', border: 'border-fuchsia-300' },
  { bg: 'bg-sky-50',     fg: 'text-sky-800',     border: 'border-sky-300' },
  { bg: 'bg-orange-50',  fg: 'text-orange-800',  border: 'border-orange-300' },
];



/**
 * Stable color for a department. Hashes the dept code (not the ID,
 * since IDs may be reset). Falls back to a neutral tone for unknown
 * or null codes, which only happens for orphaned subjects (Dean-only).
 */
function deptTone(code: string | null | undefined): {
  bg: string;
  fg: string;
  border: string;
} {
  if (!code || code.trim() === '' || code === '—') {
    return {
      bg: 'bg-slate-100',
      fg: 'text-slate-600',
      border: 'border-slate-300',
    };
  }
  const normalized = code.trim().toUpperCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return DEPT_PALETTE[hash % DEPT_PALETTE.length];
}

function inputClass(hasError: boolean): string {
  return `w-full bg-surface-container-low border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
      : 'border-surface-variant focus:border-primary focus:ring-primary/10'
  }`;
}
