import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchRooms,
  createRoom,
  updateRoom,
  toggleRoomActive,
  deleteRoom,
  fetchAllRoomPreferences,
  type RoomRecord,
  type RoomType,
  type CreateRoomInput,
} from '../../api/rooms.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import StatusBadge, { ActiveBadge } from '../../components/ui/StatusBadge';
import RoomPreferencesModal from './components/RoomPreferencesModal';

const ROOM_TYPES: { value: RoomType; label: string; icon: string }[] = [
  { value: 'lecture_room', label: 'Lecture Room', icon: 'meeting_room' },
  { value: 'laboratory', label: 'Laboratory', icon: 'science' },
  { value: 'computer_lab', label: 'Computer Lab', icon: 'computer' },
  { value: 'drafting_room', label: 'Drafting Room', icon: 'draw' },
  { value: 'other', label: 'Other', icon: 'category' },
];

type Mode = 'create' | 'edit';
type QuickFilter = 'all' | 'mine' | 'shared' | 'other' | 'preferred';

const TYPE_TONE: Record<
  RoomType,
  'info' | 'warning' | 'purple' | 'success' | 'neutral'
> = {
  lecture_room: 'info',
  laboratory: 'warning',
  computer_lab: 'purple',
  drafting_room: 'success',
  other: 'neutral',
};

interface FormState {
  roomNumber: string;
  building: string;
  roomType: RoomType;
  capacity: string;
  deptId: string;
  isShared: boolean;
}

const EMPTY_FORM: FormState = {
  roomNumber: '',
  building: '',
  roomType: 'lecture_room',
  capacity: '',
  deptId: '',
  isShared: false,
};

export default function RoomsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const [searchParams] = useSearchParams();

  const isAdminOrDean =
    profile?.role === 'administrator' || profile?.role === 'college_dean';
  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;
  const canCreate = isDH || isAdminOrDean;

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<RoomRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [confirmClose, setConfirmClose] = useState(false);

  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q') ?? '',
  );
  const [typeFilter, setTypeFilter] = useState<'all' | RoomType>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<RoomRecord | null>(null);

  // Global search links here with ?q=... so the matching room is visible
  // immediately, including when the page is already mounted.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [searchParams]);

  const [preferencesTarget, setPreferencesTarget] = useState<RoomRecord | null>(
    null,
  );

  const searchRef = useRef<HTMLInputElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // ── Queries ──
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['rooms', { includeInactive: true }],
    queryFn: () => fetchRooms(true),
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  const { data: allPreferences = [] } = useQuery({
    queryKey: ['room-preferences', 'all'],
    queryFn: fetchAllRoomPreferences,
    enabled: !!user && (isDH || isAdminOrDean),
    staleTime: 30_000,
  });

  // ── Derived sets ──
  const preferredRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPreferences) set.add(String(p.roomId));
    return set;
  }, [allPreferences]);

  /** How many departments prefer each room. */
  const prefCountByRoom = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allPreferences) {
      const key = String(p.roomId);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [allPreferences]);

  const isPreferred = useCallback(
    (r: RoomRecord) => preferredRoomIds.has(String(r.roomId)),
    [preferredRoomIds],
  );

  const isForeign = useCallback(
    (r: RoomRecord): boolean => {
      if (!isDH) return false;
      if (!r.deptId) return false;
      return String(r.deptId) !== myDeptId;
    },
    [isDH, myDeptId],
  );

  // ── Auto-dismiss success ──
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Keyboard shortcut: "/" focuses search ──
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
      } else if (e.key === 'Escape' && !inInput && !mode) {
        if (searchQuery) setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, searchQuery]);

  // ── Counts ──
  const counts = useMemo(() => {
    let mine = 0;
    let shared = 0;
    let other = 0;
    let preferred = 0;
    let inactive = 0;

    for (const r of rooms) {
      if (!r.isActive) inactive++;
      if (!r.deptId) shared++;
      else if (isDH && myDeptId && String(r.deptId) === myDeptId) mine++;
      else other++;
      if (isPreferred(r)) preferred++;
    }
    return { all: rooms.length, mine, shared, other, preferred, inactive };
  }, [rooms, isDH, myDeptId, isPreferred]);

  // ── Filtering ──
  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return rooms.filter((r) => {
      switch (quickFilter) {
        case 'mine':
          if (!isDH || !myDeptId) return false;
          if (!r.deptId || String(r.deptId) !== myDeptId) return false;
          break;
        case 'shared':
          if (r.deptId) return false;
          break;
        case 'other':
          if (isDH) {
            if (!r.deptId) return false;
            if (String(r.deptId) === myDeptId) return false;
          } else {
            if (!r.deptId) return false;
          }
          break;
        case 'preferred':
          if (!isPreferred(r)) return false;
          break;
        case 'all':
        default:
          break;
      }
      if (typeFilter !== 'all' && r.roomType !== typeFilter) return false;
      if (!q) return true;
      return (
        r.roomNumber.toLowerCase().includes(q) ||
        r.building.toLowerCase().includes(q)
      );
    });
  }, [
    rooms,
    quickFilter,
    typeFilter,
    searchQuery,
    isDH,
    myDeptId,
    isPreferred,
  ]);

  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (quickFilter !== 'all' ? 1 : 0);

  const hasAnyFilter = activeFilterCount > 0;

  const clearAllFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setQuickFilter('all');
  };

  const filterPills = useMemo(() => {
    const pills: { label: string; onRemove: () => void; tone?: 'default' | 'accent' }[] = [];
    if (searchQuery) {
      pills.push({
        label: `Search: "${searchQuery}"`,
        onRemove: () => setSearchQuery(''),
      });
    }
    if (typeFilter !== 'all') {
      const rt = ROOM_TYPES.find((x) => x.value === typeFilter);
      pills.push({
        label: `Type: ${rt?.label ?? typeFilter}`,
        onRemove: () => setTypeFilter('all'),
      });
    }
    if (quickFilter !== 'all') {
      const labels: Record<QuickFilter, string> = {
        all: 'All',
        mine: 'My department',
        shared: 'Shared',
        other: isDH ? 'Other departments' : 'Owned',
        preferred: 'Preferred',
      };
      pills.push({
        label: labels[quickFilter],
        onRemove: () => setQuickFilter('all'),
        tone: 'accent',
      });
    }
    return pills;
  }, [searchQuery, typeFilter, quickFilter, isDH]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: createRoom,
    onSuccess: (r) => {
      setSuccess(`Room ${r.roomNumber} created.`);
      closeForm(true);
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateRoomInput> }) =>
      updateRoom(id, input),
    onSuccess: (r) => {
      setSuccess(`Room ${r.roomNumber} updated.`);
      closeForm(true);
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to update'),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleRoomActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRoom,
    onSuccess: () => {
      setSuccess('Room deleted.');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  // ── Form helpers ──
  const closeForm = (force = false) => {
    if (!force) {
      const dirty =
        form.roomNumber ||
        form.building ||
        form.capacity ||
        (mode === 'create' && form.isShared) ||
        (mode === 'edit' &&
          (form.roomNumber !== (editing?.roomNumber ?? '') ||
            form.building !== (editing?.building ?? '') ||
            form.capacity !==
              (editing?.capacity != null ? String(editing.capacity) : '')));
      if (dirty) {
        setConfirmClose(true);
        return;
      }
    }
    setConfirmClose(false);
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

  const openEdit = (r: RoomRecord) => {
    if (isForeign(r)) return;
    setMode('edit');
    setEditing(r);
    setForm({
      roomNumber: r.roomNumber,
      building: r.building,
      roomType: r.roomType,
      capacity: r.capacity != null ? String(r.capacity) : '',
      deptId: r.deptId ?? '',
      isShared: r.deptId == null,
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

  const setShared = (isShared: boolean) => {
    setForm((prev) => ({
      ...prev,
      isShared,
      deptId: isShared
        ? ''
        : prev.deptId || (isDH && myDeptId ? myDeptId : ''),
    }));
  };

  const validateForm = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.roomNumber.trim()) errs.roomNumber = 'Room number is required';
    if (!form.building.trim()) errs.building = 'Building is required';
    if (form.capacity) {
      const n = Number(form.capacity);
      if (isNaN(n) || n < 0 || n > 1000) {
        errs.capacity = 'Capacity must be between 0 and 1000';
      }
    }
    if (!form.isShared && !form.deptId) {
      errs.deptId = 'Select a department or mark this room as shared';
    }

    // Duplicate room number + building combination check
    const dupKey = `${form.building.trim().toLowerCase()}::${form.roomNumber
      .trim()
      .toLowerCase()}`;
    const dup = rooms.find(
      (r) =>
        r.roomId !== editing?.roomId &&
        `${r.building.trim().toLowerCase()}::${r.roomNumber
          .trim()
          .toLowerCase()}` === dupKey,
    );
    if (dup) {
      errs.roomNumber = `Room ${form.roomNumber} already exists in ${form.building}`;
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validateForm()) return;

    const payload: CreateRoomInput = {
      roomNumber: form.roomNumber.trim(),
      building: form.building.trim(),
      roomType: form.roomType,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      deptId: form.isShared ? null : form.deptId || undefined,
    };

    if (mode === 'create') createMutation.mutate(payload);
    else if (mode === 'edit' && editing)
      updateMutation.mutate({ id: editing.roomId, input: payload });
  };

  const deptName = (id: string | null) => {
    if (!id) return null;
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? d.deptCode : `#${id}`;
  };

  const formBusy = createMutation.isPending || updateMutation.isPending;

  // ── Live preview for form ──
  const formPreview = useMemo(() => {
    const parts: string[] = [];
    if (form.building && form.roomNumber) {
      parts.push(`${form.building.toUpperCase()}-${form.roomNumber}`);
    }
    const rt = ROOM_TYPES.find((x) => x.value === form.roomType);
    if (rt) parts.push(rt.label);
    if (form.capacity) parts.push(`${form.capacity} seats`);
    if (form.isShared) parts.push('Shared');
    else if (form.deptId) {
      const d = departments.find((x) => String(x.deptId) === form.deptId);
      if (d) parts.push(`Owned by ${d.deptCode}`);
    }
    return parts.join(' · ');
  }, [form, departments]);

  // ── Columns ──
  const columns: Column<RoomRecord>[] = [
    {
      key: 'roomNumber',
      header: 'Room',
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (r) => {
        const prefCount = prefCountByRoom.get(String(r.roomId)) ?? 0;
        return (
          <span className="inline-flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-xs font-bold">
              {r.roomNumber}
            </span>
            {prefCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"
                title={`${prefCount} department${
                  prefCount === 1 ? '' : 's'
                } prefer this room`}
              >
                <Icon name="star" size={10} />
                {prefCount}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'building',
      header: 'Building',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface',
      render: (r) => r.building,
    },
    {
      key: 'type',
      header: 'Type',
      cardVariant: 'badge',
      render: (r) => (
        <StatusBadge tone={TYPE_TONE[r.roomType]}>
          {r.roomType.replace('_', ' ')}
        </StatusBadge>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (r) =>
        r.capacity != null ? `${r.capacity} seats` : '—',
    },
    {
      key: 'owner',
      header: 'Ownership',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (r) => {
        const foreign = isForeign(r);
        const shared = !r.deptId;
        return (
          <span className="inline-flex items-center gap-1.5">
            {foreign && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"
                title="Another department's room — read only"
              />
            )}
            {shared ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                <Icon name="groups" size={10} />
                Shared
              </span>
            ) : (
              <span className={`font-mono ${foreign ? 'text-slate-500' : ''}`}>
                {deptName(r.deptId)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (r) => <ActiveBadge isActive={r.isActive} />,
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

  const getActions = (r: RoomRecord): RowAction[] => {
    if (isForeign(r)) {
      return [
        {
          label: 'Read only',
          icon: 'lock',
          onClick: () => {},
          disabled: true,
        },
      ];
    }

    const actions: RowAction[] = [];

    if (!r.deptId && (isDH || isAdminOrDean)) {
      actions.push({
        label: 'Preferences',
        icon: 'star',
        onClick: () => setPreferencesTarget(r),
      });
    }

    actions.push(
      { label: 'Edit', icon: 'edit', onClick: () => openEdit(r) },
      { divider: true },
      {
        label: r.isActive ? 'Deactivate' : 'Activate',
        icon: r.isActive ? 'toggle_off' : 'toggle_on',
        loading:
          toggleMutation.isPending &&
          toggleMutation.variables === r.roomId,
        onClick: () => toggleMutation.mutate(r.roomId),
      },
    );

    if (isAdminOrDean || isDH) {
      actions.push({ divider: true });
      actions.push({
        label: 'Delete',
        icon: 'delete',
        danger: true,
        loading:
          deleteMutation.isPending &&
          deleteMutation.variables === r.roomId,
        onClick: () => setDeleteTarget(r),
      });
    }

    return actions;
  };

  const emptyMessage = (() => {
    if (rooms.length === 0) return 'No rooms yet.';
    switch (quickFilter) {
      case 'preferred':
        return 'No shared rooms have been preferred by any department yet.';
      case 'shared':
        return 'No shared rooms.';
      case 'mine':
        return 'Your department owns no rooms yet.';
      case 'other':
        return 'No rooms owned by other departments.';
      default:
        return 'No rooms match your filters.';
    }
  })();

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Rooms</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Manage classrooms, labs, and shared facilities used by the scheduler.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition shadow-sm"
          >
            <Icon name="add" size={18} />
            New Room
          </button>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Rooms"
          value={counts.all}
          icon="meeting_room"
          tone="neutral"
        />
        <StatCard
          label="Shared"
          value={counts.shared}
          icon="groups"
          tone="blue"
        />
        <StatCard
          label="Preferred"
          value={counts.preferred}
          icon="star"
          tone="amber"
        />
        <StatCard
          label="Inactive"
          value={counts.inactive}
          icon="toggle_off"
          tone={counts.inactive > 0 ? 'rose' : 'neutral'}
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

      {/* ── Quick tiles (filter shortcuts) ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            Quick views
          </h2>
          {quickFilter !== 'all' && (
            <button
              onClick={() => setQuickFilter('all')}
              className="text-[11px] text-primary hover:underline font-semibold"
            >
              Clear quick view
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <QuickTile
            label="All rooms"
            count={counts.all}
            icon="meeting_room"
            active={quickFilter === 'all'}
            onClick={() => setQuickFilter('all')}
          />
          {isDH && (
            <QuickTile
              label="My department"
              count={counts.mine}
              icon="apartment"
              active={quickFilter === 'mine'}
              onClick={() => setQuickFilter('mine')}
              disabled={counts.mine === 0}
            />
          )}
          <QuickTile
            label="Shared"
            count={counts.shared}
            icon="groups"
            active={quickFilter === 'shared'}
            onClick={() => setQuickFilter('shared')}
            disabled={counts.shared === 0}
          />
          <QuickTile
            label={isDH ? 'Other departments' : 'Owned'}
            count={counts.other}
            icon={isDH ? 'domain' : 'business'}
            active={quickFilter === 'other'}
            onClick={() => setQuickFilter('other')}
            disabled={counts.other === 0}
          />
          <QuickTile
            label="Preferred"
            count={counts.preferred}
            icon="star"
            accent
            active={quickFilter === 'preferred'}
            onClick={() => setQuickFilter('preferred')}
            disabled={counts.preferred === 0}
          />
        </div>
        <p className="text-[11px] text-on-surface-variant mt-2 flex items-center gap-1">
          <Icon name="star" size={11} className="text-amber-500" />
          <strong>Preferred</strong> = shared rooms at least one department has
          asked the auto-generator to favor.
        </p>
      </div>

      {isDH && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            You can manage shared rooms and rooms owned by your department.
            Rooms marked with an{' '}
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />{' '}
            amber dot belong to another department and are read-only. Use{' '}
            <strong>Preferences</strong> on shared rooms to tell the solver
            which ones your department prefers.
          </span>
        </div>
      )}

      {/* ── Filter panel (collapsible) ── */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
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
              <strong className="text-on-surface">{filteredRooms.length}</strong>{' '}
              of {rooms.length}
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

        {/* Filter pills */}
        {filterPills.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-surface-variant pt-3">
            {filterPills.map((pill, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
                  pill.tone === 'accent'
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

        {filtersExpanded && (
          <div className="border-t border-surface-variant p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    placeholder="Room number or building…"
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
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Room Type
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) =>
                    setTypeFilter(e.target.value as 'all' | RoomType)
                  }
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="all">All types</option>
                  {ROOM_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {filteredRooms.length === 0 && hasAnyFilter && !isLoading ? (
        <div className="rounded-xl border border-dashed border-surface-variant bg-surface-container-lowest py-16 text-center">
          <Icon
            name="search_off"
            size={48}
            className="text-slate-300 mx-auto mb-3"
          />
          <p className="text-base font-semibold text-on-surface">
            No rooms match your filters
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
          rows={filteredRooms}
          rowKey={(r) => r.roomId}
          rowTitle={(r) => `Room ${r.roomNumber}`}
          rowSubtitle={(r) => r.building}
          isLoading={isLoading}
          hasSourceRows={rooms.length > 0}
          emptyMessage={emptyMessage}
          noMatchMessage="No rooms match your filters."
          getActions={getActions}
          onRowClick={(r) => !isForeign(r) && openEdit(r)}
          emptyIcon="meeting_room"
          emptyAction={
            canCreate ? (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
              >
                <Icon name="add" size={16} />
                Add first room
              </button>
            ) : undefined
          }
        />
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal
        open={!!mode}
        onClose={() => closeForm()}
        title={
          mode === 'create'
            ? 'Create Room'
            : `Edit Room — ${editing?.roomNumber}`
        }
        description={
          mode === 'create'
            ? 'Register a new room in the system.'
            : 'Update this room\'s details.'
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Live preview chip */}
          {formPreview && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
              <Icon name="preview" size={14} />
              <span className="font-semibold">Preview:</span>
              <span className="font-mono">{formPreview}</span>
            </div>
          )}

          {/* Identification */}
          <FormSection title="Identification" icon="badge">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Room Number"
                required
                error={fieldErrors.roomNumber}
              >
                <input
                  ref={firstFieldRef}
                  type="text"
                  name="roomNumber"
                  value={form.roomNumber}
                  onChange={handleChange}
                  placeholder="e.g. 206"
                  className={inputClass(!!fieldErrors.roomNumber)}
                />
              </FormField>
              <FormField
                label="Building"
                required
                error={fieldErrors.building}
              >
                <input
                  type="text"
                  name="building"
                  value={form.building}
                  onChange={handleChange}
                  placeholder="e.g. CE"
                  className={inputClass(!!fieldErrors.building)}
                />
              </FormField>
            </div>
          </FormSection>

          {/* Capacity & type */}
          <FormSection title="Capacity & Type" icon="tune">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Room Type" required>
                <select
                  name="roomType"
                  value={form.roomType}
                  onChange={handleChange}
                  className={inputClass(false)}
                >
                  {ROOM_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Capacity"
                error={fieldErrors.capacity}
                hint="Used by S-8 (cohort overflow warning)."
              >
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    name="capacity"
                    value={form.capacity}
                    onChange={handleChange}
                    placeholder="e.g. 40"
                    className={inputClass(!!fieldErrors.capacity)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    seats
                  </span>
                </div>
              </FormField>
            </div>
          </FormSection>

          {/* Ownership */}
          <FormSection title="Ownership" icon="apartment">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <OwnershipOption
                selected={form.isShared}
                onSelect={() => setShared(true)}
                icon="groups"
                title="Shared room"
                description="Available to all departments. Any DH can manage it."
              />
              <OwnershipOption
                selected={!form.isShared}
                onSelect={() => setShared(false)}
                icon="business"
                title="Department-owned"
                description="Belongs to a specific department."
              />
            </div>

            {!form.isShared && (
              <div className="mt-4">
                <FormField
                  label="Owned by"
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
                    <option value="">— select department —</option>
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
                ? 'Create Room'
                : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Unsaved changes confirmation ── */}
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard changes?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
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
        title="Delete room?"
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
                deleteTarget && deleteMutation.mutate(deleteTarget.roomId)
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
            Delete{' '}
            <strong>
              Room {deleteTarget?.roomNumber} ({deleteTarget?.building})
            </strong>
            ?
          </p>
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
            <span>
              This will remove any saved room preferences and prevent the
              scheduler from assigning classes here. This action cannot be
              undone.
            </span>
          </div>
        </div>
      </Modal>

      {/* F3: room preferences modal */}
      <RoomPreferencesModal
        open={!!preferencesTarget}
        onClose={() => setPreferencesTarget(null)}
        room={preferencesTarget}
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
}: {
  label: string;
  value: number;
  icon: string;
  tone: 'neutral' | 'blue' | 'amber' | 'rose';
}) {
  const tones = {
    neutral: 'bg-surface-container-lowest border-surface-variant',
    blue: 'bg-blue-50 border-blue-200',
    amber: 'bg-amber-50 border-amber-200',
    rose: 'bg-rose-50 border-rose-200',
  } as const;
  const iconTones = {
    neutral: 'text-slate-500',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
  } as const;
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        <Icon name={icon} size={16} className={iconTones[tone]} />
      </div>
      <p className="text-2xl font-bold text-on-surface mt-1">{value}</p>
    </div>
  );
}

interface QuickTileProps {
  label: string;
  count: number;
  icon: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}

function QuickTile({
  label,
  count,
  icon,
  active,
  onClick,
  disabled,
  accent,
}: QuickTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        'text-left rounded-xl border px-3.5 py-3 transition',
        'flex flex-col gap-1 min-h-[76px]',
        active
          ? 'bg-primary text-on-primary border-primary shadow-sm'
          : 'bg-surface-container-lowest border-surface-variant hover:border-primary',
        disabled
          ? 'opacity-50 cursor-not-allowed hover:border-surface-variant'
          : 'cursor-pointer',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          name={icon}
          size={14}
          className={
            active
              ? 'text-on-primary'
              : accent
              ? 'text-amber-500'
              : 'text-on-surface-variant'
          }
        />
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${
            active ? 'text-on-primary/80' : 'text-on-surface-variant'
          }`}
        >
          {label}
        </span>
      </div>
      <div
        className={`text-2xl font-bold leading-none ${
          active ? 'text-on-primary' : 'text-on-surface'
        }`}
      >
        {count}
      </div>
    </button>
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

function OwnershipOption({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left p-3 rounded-lg border transition ${
        selected
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-slate-200 hover:border-primary/50'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-2">
        <Icon
          name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
          size={16}
          className={selected ? 'text-primary mt-0.5' : 'text-slate-400 mt-0.5'}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon name={icon} size={14} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">
              {title}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full bg-surface-container-low border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
      : 'border-surface-variant focus:border-primary focus:ring-primary/10'
  }`;
}