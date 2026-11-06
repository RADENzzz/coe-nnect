// RoomsPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchRooms,
  toggleRoomActive,
  deleteRoom,
  fetchAllRoomPreferences,
  type RoomRecord,
  type RoomType,
} from '../../api/rooms.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import StatusBadge, { ActiveBadge } from '../../components/ui/StatusBadge';
import RoomPreferencesModal from './components/RoomPreferencesModal';
import RoomDetailPanel from './components/RoomDetailPanel';
import RoomFormModal from './components/RoomFormModal';
import { ROOM_TYPES, TYPE_ICON } from './components/RoomFormFields';

type Mode = 'create' | 'edit';
type QuickFilter = 'all' | 'mine' | 'shared' | 'other' | 'preferred' | 'inactive';
type SortKey = 'roomNumber' | 'building' | 'type' | 'capacity';
type SortDir = 'asc' | 'desc';

const ROOMS_KEY = ['rooms', { includeInactive: true }] as const;

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

export default function RoomsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const [searchParams] = useSearchParams();

  const isCollegeWide =
    profile?.role === 'administrator' ||
    profile?.role === 'college_dean' ||
    profile?.role === 'college_secretary';
  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;
  const canCreate = isDH || isCollegeWide;

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<RoomRecord | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q') ?? '',
  );
  const [typeFilter, setTypeFilter] = useState<'all' | RoomType>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('roomNumber');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [deleteTarget, setDeleteTarget] = useState<RoomRecord | null>(null);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [searchParams]);

  const [preferencesTarget, setPreferencesTarget] = useState<RoomRecord | null>(
    null,
  );
  const [detailRoomId, setDetailRoomId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ROOMS_KEY,
    queryFn: () => fetchRooms(true),
    enabled: !!user,
  });

  const detailTarget = useMemo(
    () =>
      detailRoomId
        ? rooms.find((r) => r.roomId === detailRoomId) ?? null
        : null,
    [rooms, detailRoomId],
  );

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
    enabled: !!user,
  });

  const { data: allPreferences = [] } = useQuery({
    queryKey: ['room-preferences', 'all'],
    queryFn: fetchAllRoomPreferences,
    enabled: !!user && (isDH || isCollegeWide),
    staleTime: 30_000,
  });

  const preferredRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPreferences) set.add(String(p.roomId));
    return set;
  }, [allPreferences]);

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

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, searchQuery]);

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
        case 'inactive':
          if (r.isActive) return false;
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

  const displayedRooms = useMemo(() => {
    const sorted = [...filteredRooms].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'roomNumber':
          cmp = a.roomNumber.localeCompare(b.roomNumber, undefined, {
            numeric: true,
          });
          break;
        case 'building':
          cmp = a.building.localeCompare(b.building);
          break;
        case 'type':
          cmp = a.roomType.localeCompare(b.roomType);
          break;
        case 'capacity':
          cmp = (a.capacity ?? -1) - (b.capacity ?? -1);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredRooms, sortBy, sortDir]);

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
    const pills: {
      label: string;
      onRemove: () => void;
      tone?: 'default' | 'accent';
    }[] = [];
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
        inactive: 'Inactive',
      };
      pills.push({
        label: labels[quickFilter],
        onRemove: () => setQuickFilter('all'),
        tone: 'accent',
      });
    }
    return pills;
  }, [searchQuery, typeFilter, quickFilter, isDH]);

  // ── Toggle active (optimistic) ──────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: toggleRoomActive,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ROOMS_KEY });
      const prev = qc.getQueryData<RoomRecord[]>(ROOMS_KEY);
      qc.setQueryData<RoomRecord[]>(ROOMS_KEY, (old = []) =>
        old.map((r) => (r.roomId === id ? { ...r, isActive: !r.isActive } : r)),
      );
      return { prev };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ROOMS_KEY, ctx.prev);
      setError(err?.response?.data?.message ?? 'Toggle failed');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });

  // ── Delete (optimistic) ────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: deleteRoom,
    onMutate: async (id: string) => {
      // Close the confirm modal immediately.
      setDeleteTarget(null);
      await qc.cancelQueries({ queryKey: ROOMS_KEY });
      const prev = qc.getQueryData<RoomRecord[]>(ROOMS_KEY);
      qc.setQueryData<RoomRecord[]>(ROOMS_KEY, (old = []) =>
        old.filter((r) => r.roomId !== id),
      );
      setSuccess('Room deleted.');
      return { prev };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ROOMS_KEY, ctx.prev);
      setSuccess(null);
      setError(err?.response?.data?.message ?? 'Delete failed');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });

  const openCreate = () => {
    setEditing(null);
    setMode('create');
  };

  const openEdit = (r: RoomRecord) => {
    if (isForeign(r)) return;
    setEditing(r);
    setMode('edit');
  };

  const closeForm = () => {
    setMode(null);
    setEditing(null);
  };

  const handleFormSuccess = (message: string) => {
    setSuccess(message);
    setMode(null);
    setEditing(null);
  };

  const deptName = (id: string | null) => {
    if (!id) return null;
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? d.deptCode : `#${id}`;
  };

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
        <span className="inline-flex items-center gap-1.5">
          <Icon
            name={TYPE_ICON[r.roomType]}
            size={13}
            className="text-on-surface-variant"
          />
          <StatusBadge tone={TYPE_TONE[r.roomType]}>
            {r.roomType.replace('_', ' ')}
          </StatusBadge>
        </span>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (r) => (r.capacity != null ? `${r.capacity} seats` : '—'),
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

    if (!r.deptId && (isDH || isCollegeWide)) {
      actions.push({
        label: 'Preferences',
        icon: 'star',
        onClick: () => setPreferencesTarget(r),
      });
    }

    // No `loading` spinner — the row updates optimistically and instantly.
    actions.push(
      { label: 'Edit', icon: 'edit', onClick: () => openEdit(r) },
      { divider: true },
      {
        label: r.isActive ? 'Deactivate' : 'Activate',
        icon: r.isActive ? 'toggle_off' : 'toggle_on',
        loading: false,
        onClick: () => toggleMutation.mutate(r.roomId),
      },
    );

    if (isCollegeWide || isDH) {
      actions.push({ divider: true });
      actions.push({
        label: 'Delete',
        icon: 'delete',
        danger: true,
        loading: false,
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
      case 'inactive':
        return 'All rooms are active.';
      default:
        return 'No rooms match your filters.';
    }
  })();

  return (
    <div className="space-y-5">
      <div
        className="flex flex-wrap items-start justify-between gap-3"
        data-tour="rooms-header"
      >
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Rooms</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Manage classrooms, labs, and shared facilities used by the
            scheduler.
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

      <div className="space-y-3" data-tour="rooms-filters">
        <div className="relative">
          <Icon
            name="search"
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
          />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by room number or building…"
            className="w-full bg-surface-container-lowest border border-surface-variant rounded-xl pl-11 pr-24 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition shadow-sm"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-black/5"
                aria-label="Clear search"
              >
                <Icon name="close" size={15} />
              </button>
            ) : (
              <kbd
                className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-container-high border border-surface-variant rounded"
                aria-hidden="true"
              >
                /
              </kbd>
            )}
          </div>
        </div>

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
          <div
            className={`grid grid-cols-2 sm:grid-cols-3 gap-2.5 ${
              isDH ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
            }`}
          >
            <QuickTile
              label="All rooms"
              count={counts.all}
              icon="meeting_room"
              active={quickFilter === 'all'}
              onClick={() => setQuickFilter('all')}
            />
            {isDH && (
              <QuickTile
                label="My dept"
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
              accentColor="blue"
            />
            <QuickTile
              label={isDH ? 'Other depts' : 'Owned'}
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
              active={quickFilter === 'preferred'}
              onClick={() => setQuickFilter('preferred')}
              disabled={counts.preferred === 0}
              accentColor="amber"
            />
            <QuickTile
              label="Inactive"
              count={counts.inactive}
              icon="toggle_off"
              active={quickFilter === 'inactive'}
              onClick={() => setQuickFilter('inactive')}
              disabled={counts.inactive === 0}
              accentColor="rose"
            />
          </div>
          <p className="text-[11px] text-on-surface-variant mt-2 flex items-center gap-1">
            <Icon name="star" size={11} className="text-amber-500" />
            <strong>Preferred</strong> = shared rooms at least one department
            has asked the auto-generator to favor.
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

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as 'all' | RoomType)
                }
                className="appearance-none bg-surface-container-lowest border border-surface-variant rounded-lg pl-3 pr-8 py-1.5 text-xs font-medium focus:outline-none focus:border-primary"
                aria-label="Filter by room type"
              >
                <option value="all">All types</option>
                {ROOM_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
              <Icon
                name="expand_more"
                size={14}
                className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant"
              />
            </div>

            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">
              <strong className="text-on-surface">
                {displayedRooms.length}
              </strong>{' '}
              of {rooms.length}
            </span>
            <div className="relative">
              <select
                value={`${sortBy}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':') as [SortKey, SortDir];
                  setSortBy(k);
                  setSortDir(d);
                }}
                className="appearance-none bg-surface-container-lowest border border-surface-variant rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium focus:outline-none focus:border-primary"
                aria-label="Sort rooms"
              >
                <option value="roomNumber:asc">Room # · A→Z</option>
                <option value="roomNumber:desc">Room # · Z→A</option>
                <option value="building:asc">Building · A→Z</option>
                <option value="type:asc">Type · A→Z</option>
                <option value="capacity:desc">Capacity · high→low</option>
                <option value="capacity:asc">Capacity · low→high</option>
              </select>
              <Icon
                name="sort"
                size={13}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant"
              />
            </div>
          </div>
        </div>

        {filterPills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
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
      </div>

      {displayedRooms.length === 0 && hasAnyFilter && !isLoading ? (
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
            Try adjusting your search, clearing the quick view, or picking a
            different room type.
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
        <div data-tour="rooms-table">
          <ResponsiveTable
            columns={columns}
            rows={displayedRooms}
            rowKey={(r) => r.roomId}
            rowTitle={(r) => `Room ${r.roomNumber}`}
            rowSubtitle={(r) => r.building}
            isLoading={isLoading}
            hasSourceRows={rooms.length > 0}
            emptyMessage={emptyMessage}
            noMatchMessage="No rooms match your filters."
            getActions={getActions}
            onRowClick={(r) => setDetailRoomId(r.roomId)}
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
        </div>
      )}

      {/* Delete confirmation — closes instantly on confirm */}
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
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition rounded-lg flex items-center gap-2"
            >
              <Icon name="delete" size={14} />
              Delete
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {deleteTarget && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                <Icon
                  name={TYPE_ICON[deleteTarget.roomType]}
                  size={20}
                  className="text-rose-600"
                />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-on-surface">
                  Room {deleteTarget.roomNumber}
                </p>
                <p className="text-xs text-on-surface-variant truncate">
                  {deleteTarget.building} ·{' '}
                  {deleteTarget.roomType.replace('_', ' ')}
                </p>
              </div>
            </div>
          )}
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

      <RoomPreferencesModal
        open={!!preferencesTarget}
        onClose={() => setPreferencesTarget(null)}
        room={preferencesTarget}
        departments={departments}
      />

      <RoomDetailPanel
        open={!!detailTarget}
        onClose={() => setDetailRoomId(null)}
        room={detailTarget}
        departmentLabel={deptName}
        isForeign={detailTarget ? isForeign(detailTarget) : false}
        canManagePreferences={
          (isDH || isCollegeWide) && !detailTarget?.deptId
        }
        onEdit={() => {
          if (detailTarget) openEdit(detailTarget);
        }}
        onOpenPreferences={() => {
          if (detailTarget) setPreferencesTarget(detailTarget);
        }}
        onToggleActive={() => {
          if (detailTarget) toggleMutation.mutate(detailTarget.roomId);
        }}
        onDelete={() => {
          if (detailTarget) setDeleteTarget(detailTarget);
        }}
        togglePending={false}
      />

      <RoomFormModal
        mode={mode}
        room={editing}
        rooms={rooms}
        departments={departments}
        isDH={isDH}
        myDeptId={myDeptId}
        onClose={closeForm}
        onSuccess={handleFormSuccess}
        onError={(msg) => setError(msg)}
      />
    </div>
  );
}

// ────────────────────────────────────────────
// Presentational helpers
// ────────────────────────────────────────────

interface QuickTileProps {
  label: string;
  count: number;
  icon: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  accentColor?: 'blue' | 'amber' | 'rose';
}

function QuickTile({
  label,
  count,
  icon,
  active,
  onClick,
  disabled,
  accentColor,
}: QuickTileProps) {
  const accent = accentColor
    ? {
        blue: 'text-blue-600',
        amber: 'text-amber-500',
        rose: 'text-rose-500',
      }[accentColor]
    : 'text-on-surface-variant';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        'text-left rounded-xl border px-3.5 py-3 transition-all',
        'flex flex-col gap-1.5 min-h-[84px]',
        active
          ? 'bg-primary text-on-primary border-primary shadow-md'
          : 'bg-surface-container-lowest border-surface-variant hover:border-primary hover:shadow-sm',
        disabled
          ? 'opacity-50 cursor-not-allowed hover:border-surface-variant hover:shadow-none'
          : 'cursor-pointer',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          name={icon}
          size={14}
          className={active ? 'text-on-primary' : accent}
        />
        <span
          className={`text-[10px] font-bold uppercase tracking-wider truncate ${
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