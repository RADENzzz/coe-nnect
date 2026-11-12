import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchSubjects,
  toggleSubjectActive,
  deleteSubject,
  type SubjectRecord,
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
import SubjectFormModal from './components/SubjectFormModal';
import SubjectDetailPanel from './components/SubjectDetailPanel';

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
type SubjectKindFilter = 'all' | 'regular' | 'minor' | 'elective';
type ComponentFilter = 'all' | 'lecture_only' | 'lab_only' | 'mixed';
type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'code' | 'title' | 'units' | 'dept' | 'roomType';
type SortDir = 'asc' | 'desc';

type Alert = { kind: 'success' | 'error'; message: string } | null;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function extractErrorMessage(err: any, fallback: string): string {
  const raw = err?.response?.data?.message;
  if (Array.isArray(raw)) return raw[0] ?? fallback;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return err?.message ?? fallback;
}

export default function SubjectsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const isCollegeWide =
    profile?.role === 'administrator' ||
    profile?.role === 'college_dean' ||
    profile?.role === 'college_secretary';
  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;
  const canManage = isDH || isCollegeWide;

  const [restrictionsOpen, setRestrictionsOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<SubjectRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubjectRecord | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // ── Multi-select state (mirrors the Prospectus page) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionPending, setBulkActionPending] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  // ── Consolidated alert state (error + success share one slot) ──
  const [alert, setAlert] = useState<Alert>(null);
  const setSuccess = (m: string | null) =>
    setAlert(m ? { kind: 'success', message: m } : null);
  const setError = (m: string | null) =>
    setAlert(m ? { kind: 'error', message: m } : null);

  // ── Detail side panel state ──
  const [detailEntry, setDetailEntry] = useState<SubjectRecord | null>(null);

  // ── Dedicated delete-error state (blocked delete from backend) ──
  const [deleteError, setDeleteError] = useState<{
    subjectCode: string;
    message: string;
  } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── URL state ──
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get('q') ?? '',
  );
  const debouncedSearch = useDebouncedValue(searchInput, 200);

  const deptFilter = searchParams.get('dept') ?? '';
  const roomFilter = (searchParams.get('room') ?? '') as RoomTypeFilter;
  const minorFilter = (searchParams.get('minor') ?? 'all') as MinorFilter;
  const kindFilter = (searchParams.get('kind') ?? 'all') as SubjectKindFilter;
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
    next.delete('kind');
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
    kindFilter !== 'all' ||
    compFilter !== 'all' ||
    statusFilter !== 'all';

  const activeFilterCount =
    (searchInput ? 1 : 0) +
    (deptFilter ? 1 : 0) +
    (roomFilter ? 1 : 0) +
    (minorFilter !== 'all' ? 1 : 0) +
    (kindFilter !== 'all' ? 1 : 0) +
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

  // ── Auto-dismiss success only ──
  useEffect(() => {
    if (!alert || alert.kind !== 'success') return;
    const t = setTimeout(() => setAlert(null), 4000);
    return () => clearTimeout(t);
  }, [alert]);

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

  // ── Detail panel: live view (re-derived from query cache) ──
  const detailLive = useMemo(() => {
    if (!detailEntry) return null;
    return (
      subjects.find((s) => s.subjectId === detailEntry.subjectId) ?? detailEntry
    );
  }, [subjects, detailEntry]);

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
    let elective = 0;
    let totalOnly = 0;
    let inactive = 0;
    for (const s of scopedSubjects) {
      const lec = Number(s.lectureUnits ?? 0);
      const lab = Number(s.labUnits ?? 0);
      if (lec > 0 && lab > 0) mixed++;
      else if (lec > 0) lectureOnly++;
      else if (lab > 0) labOnly++;
      if (s.isMinor) minor++;
      if (s.isElective) elective++;
      if (s.unitsMode === 'total_only') totalOnly++;
      if (!s.isActive) inactive++;
    }
    return {
      total: scopedSubjects.length,
      lectureOnly,
      labOnly,
      mixed,
      minor,
      elective,
      totalOnly,
      inactive,
    };
  }, [scopedSubjects]);

  // Counts for the classification tabs (whole catalog, matching the table).
  const kindCounts = useMemo(() => {
    let regular = 0;
    let minor = 0;
    let elective = 0;
    for (const s of subjects) {
      if (s.isElective) elective++;
      else if (s.isMinor) minor++;
      else regular++;
    }
    return { all: subjects.length, regular, minor, elective };
  }, [subjects]);

  // ── Filtered + sorted ──
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    let rows = subjects.filter((s) => {
      if (q) {
        // Search is intentionally limited to the subject code and title.
        const code = (s.subjectCode ?? '').toLowerCase();
        const title = (s.title ?? '').toLowerCase();
        if (!code.includes(q) && !title.includes(q)) return false;
      }

      if (deptFilter && String(s.deptId ?? '') !== deptFilter) return false;

      if (roomFilter === 'none') {
        if (s.requiredRoomType) return false;
      } else if (roomFilter) {
        if (s.requiredRoomType !== roomFilter) return false;
      }

      if (minorFilter === 'minor' && !s.isMinor) return false;
      if (minorFilter === 'regular' && s.isMinor) return false;

      if (kindFilter === 'elective' && !s.isElective) return false;
      if (kindFilter === 'regular' && (s.isElective || s.isMinor)) return false;
      if (kindFilter === 'minor' && (s.isElective || !s.isMinor)) return false;

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
    kindFilter,
    compFilter,
    statusFilter,
    sortKey,
    sortDir,
    deptCodeById,
  ]);

  // ── Selection-derived values ──
  // Only subjects this user can actually manage (never foreign/read-only rows).
  const selectedSubjects = useMemo(
    () =>
      subjects.filter(
        (s) =>
          selectedIds.has(String(s.subjectId)) && !isForeign(s),
      ),
    [subjects, selectedIds, isForeign],
  );

  // Prune selection when subjects disappear (concurrent deletes, etc.) or
  // stop being manageable (e.g. a department filter changes ownership scope).
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const available = new Set(
      subjects
        .filter((s) => !isForeign(s))
        .map((s) => String(s.subjectId)),
    );
    let needsUpdate = false;
    for (const id of selectedIds) {
      if (!available.has(id)) {
        needsUpdate = true;
        break;
      }
    }
    if (needsUpdate) {
      const next = new Set<string>();
      for (const id of selectedIds) {
        if (available.has(id)) next.add(id);
      }
      setSelectedIds(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, isForeign]);

  // ── Shared invalidation helper ──
  const invalidateAfterSubjectChange = () => {
    qc.invalidateQueries({ queryKey: ['subjects'] });
    qc.invalidateQueries({ queryKey: ['coverage'] });
    qc.invalidateQueries({ queryKey: ['unplotted-minors'] });
    // Toggling a subject also toggles its prospectus mappings (cascade).
    qc.invalidateQueries({ queryKey: ['prospectus'] });
    qc.invalidateQueries({ queryKey: ['prospectus-all'] });
    qc.invalidateQueries({ queryKey: ['prospectus-by-program'] });
  };

  // ── Mutations ──
  const toggleMutation = useMutation({
    mutationFn: toggleSubjectActive,
    onSuccess: () => invalidateAfterSubjectChange(),
    onError: (err: any) => setError(extractErrorMessage(err, 'Toggle failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubject,
    onSuccess: () => {
      setSuccess('Subject deleted.');
      setDeleteTarget(null);
      setDetailEntry(null);
      invalidateAfterSubjectChange();
    },
    onError: (err: any) => {
      const target = deleteTarget;
      setDeleteTarget(null);
      setDeleteError({
        subjectCode: target?.subjectCode ?? 'this subject',
        message: extractErrorMessage(err, 'Delete failed'),
      });
    },
  });

  // ── Multi-select helpers ──
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkSetActive = async (activate: boolean) => {
    const targets = selectedSubjects.filter((s) => s.isActive !== activate);

    if (targets.length === 0) {
      setSuccess(
        `All selected subjects are already ${activate ? 'active' : 'inactive'}.`,
      );
      return;
    }

    setBulkActionPending(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        targets.map((s) => toggleSubjectActive(s.subjectId)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        setError(
          `${failed} of ${targets.length} subject${
            targets.length === 1 ? '' : 's'
          } failed to ${activate ? 'activate' : 'deactivate'}.`,
        );
      } else {
        setSuccess(
          `${activate ? 'Activated' : 'Deactivated'} ${targets.length} subject${
            targets.length === 1 ? '' : 's'
          }.`,
        );
      }
      invalidateAfterSubjectChange();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Bulk action failed'));
    } finally {
      setBulkActionPending(false);
    }
  };

  const handleBulkDelete = async () => {
    const targets = selectedSubjects;
    if (targets.length === 0) return;

    setBulkActionPending(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        targets.map((s) => deleteSubject(s.subjectId)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        setError(
          `${failed} of ${targets.length} subject${
            targets.length === 1 ? '' : 's'
          } could not be deleted. They may still be referenced by prospectus entries or schedules — deactivate them instead.`,
        );
      } else {
        setSuccess(
          `Deleted ${targets.length} subject${
            targets.length === 1 ? '' : 's'
          }.`,
        );
      }
      setBulkDeleteConfirmOpen(false);
      clearSelection();
      if (
        detailLive &&
        targets.some((s) => s.subjectId === detailLive.subjectId)
      ) {
        setDetailEntry(null);
      }
      invalidateAfterSubjectChange();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Bulk delete failed'));
    } finally {
      setBulkActionPending(false);
    }
  };

  // ── Open helpers ──
  const openCreate = () => {
    setEditing(null);
    setMode('create');
    setError(null);
    setSuccess(null);
  };

  const openEdit = (s: SubjectRecord) => {
    if (isForeign(s)) return;
    setDetailEntry(null);
    setEditing(s);
    setMode('edit');
    setError(null);
    setSuccess(null);
  };

  // ── Detail panel handlers ──
  const handleOpenDetail = (s: SubjectRecord) => {
    setDetailEntry(s);
    setError(null);
    setSuccess(null);
  };

  const handleCloseDetail = () => setDetailEntry(null);

  const handleEditFromDetail = () => {
    if (!detailLive) return;
    if (isForeign(detailLive)) return;
    setEditing(detailLive);
    setDetailEntry(null);
    setMode('edit');
    setError(null);
    setSuccess(null);
  };

  const handleToggleFromDetail = () => {
    if (!detailLive) return;
    if (isForeign(detailLive)) return;
    toggleMutation.mutate(detailLive.subjectId);
  };

  const handleDeleteFromDetail = () => {
    if (!detailLive) return;
    if (isForeign(detailLive)) return;
    setDeleteTarget(detailLive);
    setDetailEntry(null);
  };

  const handleOpenSubjectFromRestrictions = (subjectId: string) => {
    const next = subjects.find((s) => String(s.subjectId) === String(subjectId));
    if (next) setDetailEntry(next);
  };

  // ── Deep-link: auto-open edit modal from ?edit=<subjectId> ──
  const editParam = searchParams.get('edit');
  const returnToParam = searchParams.get('returnTo');
  const hasConsumedEditParam = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);

  useEffect(() => {
    if (returnToParam) {
      returnToRef.current = returnToParam;
    }
  }, [returnToParam]);

  useEffect(() => {
    if (!editParam) return;
    if (hasConsumedEditParam.current === editParam) return;
    if (!subjects || subjects.length === 0) return;

    const target = subjects.find((s) => String(s.subjectId) === editParam);
    if (!target) {
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      next.delete('returnTo');
      setSearchParams(next, { replace: true });
      return;
    }

    hasConsumedEditParam.current = editParam;

    if (isForeign(target)) {
      setError(
        `"${target.subjectCode}" belongs to another department and is read-only.`,
      );
    } else {
      setEditing(target);
      setMode('edit');
    }

    const next = new URLSearchParams(searchParams);
    next.delete('edit');
    next.delete('returnTo');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, subjects]);

  // ── Form-modal close (handles returnTo deep-link) ──
  const handleFormClose = () => {
    setMode(null);
    setEditing(null);
    if (returnToRef.current) {
      const target = returnToRef.current;
      returnToRef.current = null;
      navigate(target);
    }
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
    const icon =
      ROOM_TYPE_ICON[s.requiredRoomType as SubjectRoomType] ?? 'category';
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
    if (s.unitsMode === 'total_only' || (lec === 0 && lab === 0 && total > 0)) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-mono">
          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
            {total} Total
          </span>
          <span className="text-[10px] text-slate-500">no split</span>
        </span>
      );
    }
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
        {lec > 0 && lab > 0 && <span className="text-slate-400">=</span>}
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
          {s.isElective && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800"
              title="Elective subject — plotted first, may have no fixed code"
            >
              <Icon name="stars" size={9} />
              Elective
            </span>
          )}
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
        const code = deptName(s.deptId);
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
          label: 'View details',
          icon: 'info',
          onClick: () => handleOpenDetail(s),
        },
      ];
    }
    return [
      { label: 'View details', icon: 'info', onClick: () => handleOpenDetail(s) },
      { divider: true },
      { label: 'Edit', icon: 'edit', onClick: () => openEdit(s) },
      { divider: true },
      {
        label: s.isActive ? 'Deactivate' : 'Activate',
        icon: s.isActive ? 'toggle_off' : 'toggle_on',
        loading:
          toggleMutation.isPending && toggleMutation.variables === s.subjectId,
        onClick: () => toggleMutation.mutate(s.subjectId),
      },
      { divider: true },
      {
        label: 'Delete',
        icon: 'delete',
        danger: true,
        loading:
          deleteMutation.isPending && deleteMutation.variables === s.subjectId,
        onClick: () => setDeleteTarget(s),
      },
    ];
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div
        className="flex flex-wrap items-start justify-between gap-3"
        data-tour="subjects-header"
      >
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

      {/* ── Classification tabs ── */}
      <div className="border-b border-surface-variant" data-tour="subjects-tabs">
        <nav
          className="-mb-px flex gap-4 overflow-x-auto"
          aria-label="Subject classification tabs"
          role="tablist"
        >
          {(
            [
              {
                key: 'all' as const,
                label: 'All Subjects',
                icon: 'menu_book',
                count: kindCounts.all,
              },
              {
                key: 'regular' as const,
                label: 'Regular',
                icon: 'check_circle',
                count: kindCounts.regular,
              },
              {
                key: 'minor' as const,
                label: 'Minor',
                icon: 'school',
                count: kindCounts.minor,
              },
              {
                key: 'elective' as const,
                label: 'Elective Subjects',
                icon: 'stars',
                count: kindCounts.elective,
              },
            ]
          ).map((t) => {
            const isActive = kindFilter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilter('kind', t.key === 'all' ? '' : t.key)}
                className={`flex items-center gap-2 whitespace-nowrap px-1 py-3 text-sm font-semibold border-b-2 transition ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon name={t.icon} size={16} />
                {t.label}
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </nav>
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
          loading={isLoading}
          onClick={hasAnyFilter ? clearAll : undefined}
        />
        <StatCard
          label="Lecture only"
          value={stats.lectureOnly}
          icon="meeting_room"
          tone="blue"
          loading={isLoading}
          active={compFilter === 'lecture_only'}
          onClick={() => applyPreset(PRESETS[3])}
        />
        <StatCard
          label="Lab only"
          value={stats.labOnly}
          icon="science"
          tone="amber"
          loading={isLoading}
          active={compFilter === 'lab_only'}
          onClick={() => applyPreset(PRESETS[4])}
        />
        <StatCard
          label="Mixed"
          value={stats.mixed}
          icon="merge_type"
          tone="purple"
          loading={isLoading}
          active={compFilter === 'mixed'}
          onClick={() => applyPreset(PRESETS[0])}
        />
        <StatCard
          label="Minor"
          value={stats.minor}
          icon="school"
          tone="purple"
          loading={isLoading}
          active={minorFilter === 'minor'}
          onClick={() => applyPreset(PRESETS[1])}
        />
        <StatCard
          label="Inactive"
          value={stats.inactive}
          icon="toggle_off"
          tone={stats.inactive > 0 ? 'rose' : 'neutral'}
          loading={isLoading}
          active={statusFilter === 'inactive'}
          onClick={() =>
            setFilter('status', statusFilter === 'inactive' ? 'all' : 'inactive')
          }
        />
      </div>

      {/* ── Single alert region (error + success share one slot) ── */}
      <div aria-live="polite" aria-atomic="true">
        {alert && (
          <div
            className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${
              alert.kind === 'error'
                ? 'bg-red-100 border-red-300 text-red-700'
                : 'bg-emerald-100 border-emerald-300 text-emerald-800'
            }`}
          >
            <Icon
              name={alert.kind === 'error' ? 'error' : 'check_circle'}
              size={16}
              className="shrink-0 mt-0.5"
            />
            <span className="flex-1">{alert.message}</span>
            <button
              onClick={() => setAlert(null)}
              className="opacity-70 hover:opacity-100"
              aria-label="Dismiss alert"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </div>

      {isDH && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            Each row shows its <strong>owning department</strong> in a colored
            badge. Rows with a{' '}
            <Icon name="lock" size={11} className="inline -mb-0.5" /> lock icon
            belong to another department and are read-only. Use the{' '}
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
            onRowClick={(s) => handleOpenDetail(s)}
            selectable={canManage}
            selectedKeys={selectedIds}
            onSelectionChange={setSelectedIds}
            isRowSelectable={(s) => !isForeign(s)}
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

      {/* ── Floating bulk action bar (auto-appears when any row is checked) ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-xl bg-slate-900 text-white shadow-2xl border border-slate-700 max-w-[calc(100vw-2rem)]">
          <span className="text-xs sm:text-sm font-semibold px-2 whitespace-nowrap">
            {selectedIds.size} selected
          </span>
          <div className="h-6 w-px bg-slate-700 shrink-0" />
          <button
            type="button"
            onClick={() => handleBulkSetActive(true)}
            disabled={bulkActionPending}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-600/30 transition disabled:opacity-50 whitespace-nowrap"
            title="Activate selected"
          >
            <Icon name="toggle_on" size={14} className="text-emerald-400" />
            <span className="hidden sm:inline">Activate</span>
          </button>
          <button
            type="button"
            onClick={() => handleBulkSetActive(false)}
            disabled={bulkActionPending}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-700 transition disabled:opacity-50 whitespace-nowrap"
            title="Deactivate selected"
          >
            <Icon name="toggle_off" size={14} className="text-slate-300" />
            <span className="hidden sm:inline">Deactivate</span>
          </button>
          <button
            type="button"
            onClick={() => setBulkDeleteConfirmOpen(true)}
            disabled={bulkActionPending}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition disabled:opacity-50 whitespace-nowrap"
            title="Delete selected"
          >
            <Icon name="delete" size={14} />
            <span className="hidden sm:inline">Delete</span>
          </button>
          <div className="h-6 w-px bg-slate-700 shrink-0" />
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkActionPending}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition disabled:opacity-50 shrink-0"
            aria-label="Clear selection"
            title="Clear selection"
          >
            <Icon name="close" size={14} />
          </button>
          {bulkActionPending && (
            <Icon
              name="progress_activity"
              size={14}
              className="animate-spin text-primary shrink-0"
            />
          )}
        </div>
      )}

      {/* ── Bulk delete confirmation ── */}
      <Modal
        open={bulkDeleteConfirmOpen}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        title={`Delete ${selectedIds.size} subject${
          selectedIds.size === 1 ? '' : 's'
        }?`}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setBulkDeleteConfirmOpen(false)}
              disabled={bulkActionPending}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkActionPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {bulkActionPending && (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              )}
              {bulkActionPending
                ? 'Deleting…'
                : `Delete ${selectedIds.size}`}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Delete{' '}
            <strong>
              {selectedIds.size} subject
              {selectedIds.size === 1 ? '' : 's'}
            </strong>
            ?
          </p>
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
            <span>
              Subjects still referenced by prospectus entries or schedules
              cannot be deleted. Those will be skipped — deactivate them
              instead. This action cannot be undone.
            </span>
          </div>
        </div>
      </Modal>

      {/* ── Detail side panel ── */}
      {detailLive && (
        <SubjectDetailPanel
          open={!!detailLive}
          onClose={handleCloseDetail}
          subject={detailLive}
          subjects={subjects}
          departmentLabel={deptName}
          isForeign={isForeign(detailLive)}
          togglePending={
            toggleMutation.isPending &&
            toggleMutation.variables === detailLive.subjectId
          }
          onEdit={handleEditFromDetail}
          onToggleActive={handleToggleFromDetail}
          onDelete={handleDeleteFromDetail}
          onOpenSubject={handleOpenSubjectFromRestrictions}
        />
      )}

      {/* ── Create / Edit wizard ── */}
      <SubjectFormModal
        open={!!mode}
        mode={mode}
        subject={editing}
        subjects={subjects}
        departments={departments}
        isDH={isDH}
        myDeptId={myDeptId}
        defaultElective={kindFilter === 'elective'}
        onClose={handleFormClose}
        onSuccess={(message) => setSuccess(message)}
      />

      {/* ── Delete confirmation (with Deactivate escape hatch) ── */}
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
            {deleteTarget?.isActive && (
              <button
                type="button"
                onClick={() => {
                  if (!deleteTarget) return;
                  const target = deleteTarget;
                  toggleMutation.mutate(target.subjectId, {
                    onSuccess: () =>
                      setSuccess(
                        `Subject "${target.subjectCode}" deactivated (not deleted).`,
                      ),
                  });
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 text-sm font-semibold border border-amber-500/40 bg-amber-50 text-amber-800 hover:bg-amber-100 transition rounded-lg flex items-center gap-2"
              >
                <Icon name="toggle_off" size={14} />
                Deactivate instead
              </button>
            )}
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
              This will remove the subject from all prospectuses and any program
              mappings. Existing timetables that reference this subject may
              become invalid. This action cannot be undone.
            </span>
          </div>
        </div>
      </Modal>

      {/* ── Delete blocked — dedicated error modal ── */}
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
  loading,
  active,
}: {
  label: string;
  value: number;
  icon: string;
  tone: 'neutral' | 'blue' | 'amber' | 'purple' | 'rose';
  onClick?: () => void;
  loading?: boolean;
  active?: boolean;
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
      aria-pressed={onClick ? !!active : undefined}
      className={`text-left rounded-xl border p-3 transition relative ${tones[tone]} ${
        onClick ? 'hover:shadow-md cursor-pointer' : ''
      } ${active ? 'ring-2 ring-primary/40' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        <Icon name={icon} size={16} className={iconTones[tone]} />
      </div>
      {loading ? (
        <div className="h-7 mt-1 w-12 rounded bg-slate-200/70 animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-on-surface mt-1 tabular-nums">
          {value}
        </p>
      )}
      {active && (
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
      )}
    </Comp>
  );
}

// Deterministic dept color — stable across renders.
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
