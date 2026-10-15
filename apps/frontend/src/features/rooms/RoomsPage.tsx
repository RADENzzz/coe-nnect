import { useMemo, useState, useCallback } from 'react';
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

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'lecture_room', label: 'Lecture Room' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'computer_lab', label: 'Computer Lab' },
  { value: 'drafting_room', label: 'Drafting Room' },
  { value: 'other', label: 'Other' },
];

type Mode = 'create' | 'edit';

/**
 * Quick-filter tiles.
 *
 *   all       → no quick filter
 *   mine      → DH only: rooms owned by the DH's department
 *   shared    → dept_id IS NULL
 *   other     → DH only: rooms owned by other departments
 *   preferred → shared rooms with at least one room_preference row
 */
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

export default function RoomsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const isAdminOrDean =
    profile?.role === 'administrator' || profile?.role === 'college_dean';
  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<RoomRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    roomNumber: '',
    building: '',
    roomType: 'lecture_room' as RoomType,
    capacity: '',
    deptId: '',
    isShared: false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | RoomType>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [deleteTarget, setDeleteTarget] = useState<RoomRecord | null>(null);

  // ── F3: preferences modal ──
  const [preferencesTarget, setPreferencesTarget] = useState<RoomRecord | null>(
    null,
  );

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

  // ── Bulk preferences: one call, drives "Preferred" tile + row flag ──
  const { data: allPreferences = [] } = useQuery({
    queryKey: ['room-preferences', 'all'],
    queryFn: fetchAllRoomPreferences,
    enabled: !!user && (isDH || isAdminOrDean),
    staleTime: 30_000,
  });

  const preferredRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPreferences) set.add(String(p.roomId));
    return set;
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

  // ── Tile counts (always computed over the FULL roster) ──
  const counts = useMemo(() => {
    let mine = 0;
    let shared = 0;
    let other = 0;
    let preferred = 0;

    for (const r of rooms) {
      if (!r.deptId) shared++;
      else if (isDH && myDeptId && String(r.deptId) === myDeptId) mine++;
      else if (isDH) other++;
      else other++; // Dean/Admin: any owned room counts toward "other/owned"

      if (isPreferred(r)) preferred++;
    }

    return {
      all: rooms.length,
      mine,
      shared,
      other,
      preferred,
    };
  }, [rooms, isDH, myDeptId, isPreferred]);

  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return rooms.filter((r) => {
      // Quick filter
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
            // Dean/Admin: "other" means any owned room
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

      // Type filter
      if (typeFilter !== 'all' && r.roomType !== typeFilter) return false;

      // Search
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

  const createMutation = useMutation({
    mutationFn: createRoom,
    onSuccess: (r) => {
      setSuccess(`Room ${r.roomNumber} created.`);
      closeForm();
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
      closeForm();
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

  const closeForm = () => {
    setMode(null);
    setEditing(null);
    setForm({
      roomNumber: '',
      building: '',
      roomType: 'lecture_room',
      capacity: '',
      deptId: '',
      isShared: false,
    });
    setError(null);
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm({
      roomNumber: '',
      building: '',
      roomType: 'lecture_room',
      capacity: '',
      deptId: isDH && myDeptId ? myDeptId : '',
      isShared: false,
    });
    setError(null);
    setSuccess(null);
  };

  const openEdit = (r: RoomRecord) => {
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
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSharedToggle = (checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      isShared: checked,
      deptId: checked
        ? ''
        : prev.deptId || (isDH && myDeptId ? myDeptId : ''),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload: CreateRoomInput = {
      roomNumber: form.roomNumber.trim(),
      building: form.building.trim(),
      roomType: form.roomType,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      deptId: form.isShared ? null : form.deptId || undefined,
    };

    if (mode === 'create') {
      createMutation.mutate(payload);
    } else if (mode === 'edit' && editing) {
      updateMutation.mutate({ id: editing.roomId, input: payload });
    }
  };

  const deptName = (id: string | null) => {
    if (!id) return '— shared —';
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? d.deptCode : `#${id}`;
  };

  const columns: Column<RoomRecord>[] = [
    {
      key: 'roomNumber',
      header: 'Room',
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.roomNumber}
          {isPreferred(r) && (
            <span title="At least one department prefers this room">
              <Icon name="star" size={12} className="text-amber-500" />
            </span>
          )}
        </span>
      ),
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
      render: (r) => (r.capacity != null ? String(r.capacity) : '—'),
    },
    {
      key: 'owner',
      header: 'Owner',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant text-xs font-mono',
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
            {shared && (
              <span
                className="inline-flex items-center gap-1 text-primary"
                title="Shared room"
              >
                <Icon name="groups" size={12} />
              </span>
            )}
            <span className={foreign ? 'text-slate-500' : ''}>
              {deptName(r.deptId)}
            </span>
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
      render: () => null,
    },
  ];

  const getActions = (r: RoomRecord): RowAction[] => {
    if (isForeign(r)) return [];

    const actions: RowAction[] = [];

    // F3: preferences are only meaningful for shared rooms
    if (!r.deptId && (isDH || isAdminOrDean)) {actions.push({
        label: 'Preferences',
        icon: 'star',
        onClick: () => setPreferencesTarget(r),
      });
    }

    actions.push(
      { label: 'Edit', icon: 'edit', onClick: () => openEdit(r) },
      {
        label: r.isActive ? 'Deactivate' : 'Activate',
        icon: r.isActive ? 'toggle_off' : 'toggle_on',
        onClick: () => toggleMutation.mutate(r.roomId),
        disabled: toggleMutation.isPending,
      },
      {
        label: 'Delete',
        icon: 'delete',
        danger: true,
        onClick: () => setDeleteTarget(r),
        disabled: deleteMutation.isPending,
      },
    );

    return actions;
  };

  // ── Empty-state message adapts to quick filter ──
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Rooms</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {rooms.length} room(s) registered
          </p>
        </div>
        {isDH || isAdminOrDean ? (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="add" size={18} />
            New Room
          </button>
        ) : null}
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

      {/* ════════════════════════════════════════════
          Quick-filter tiles (KPI row that filters)
          ════════════════════════════════════════════ */}
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

      <p className="text-[11px] text-on-surface-variant -mt-1">
        <Icon name="star" size={11} className="inline align-middle text-amber-500 mr-1" />
        <strong>Preferred</strong> = shared rooms at least one department has asked
        the auto-generator to favor.
      </p>

      {isDH && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            You can manage shared rooms and rooms owned by your department.
            Rooms marked with an{' '}
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />{' '}
            amber dot belong to another department and are read-only. Shared
            rooms show a{' '}
            <Icon name="groups" size={12} className="inline align-middle" />{' '}
            icon — use <strong>Preferences</strong> to tell the solver which
            shared rooms your department prefers.
          </span>
        </div>
      )}

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
              placeholder="Room number or building…"
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="min-w-[180px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Room Type
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | RoomType)}
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
        {(searchQuery ||
          typeFilter !== 'all' ||
          quickFilter !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setTypeFilter('all');
              setQuickFilter('all');
            }}
            className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
          >
            Clear all
          </button>
        )}
        <div className="ml-auto text-xs text-on-surface-variant">
          Showing{' '}
          <strong className="text-on-surface">{filteredRooms.length}</strong> of{' '}
          {rooms.length}
        </div>
      </div>

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
      />

      <Modal
        open={!!mode}
        onClose={closeForm}
        title={
          mode === 'create'
            ? 'Create Room'
            : `Edit Room — ${editing?.roomNumber}`
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Room Number *
              </label>
              <input
                type="text"
                name="roomNumber"
                required
                value={form.roomNumber}
                onChange={handleChange}
                placeholder="e.g. 206"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Building *
              </label>
              <input
                type="text"
                name="building"
                required
                value={form.building}
                onChange={handleChange}
                placeholder="e.g. CE"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Room Type *
              </label>
              <select
                name="roomType"
                required
                value={form.roomType}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                {ROOM_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Capacity
              </label>
              <input
                type="number"
                min="0"
                name="capacity"
                value={form.capacity}
                onChange={handleChange}
                placeholder="e.g. 40"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">
                Used by S-8 (cohort overflow warning).
              </p>
            </div>
            <div className="md:col-span-2 border-t border-surface-variant pt-4 mt-1">
              <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
                Ownership
              </label>

              <label className="flex items-start gap-2 cursor-pointer select-none mb-3">
                <input
                  type="checkbox"
                  checked={form.isShared}
                  onChange={(e) => handleSharedToggle(e.target.checked)}
                  className="mt-0.5 accent-[#5c1219]"
                />
                <div>
                  <span className="text-sm font-medium text-on-surface">
                    Shared room
                  </span>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Available to all departments. Any DH can manage it.
                  </p>
                </div>
              </label>

              {!form.isShared && (
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Owned by
                  </label>
                  <select
                    name="deptId"
                    value={form.deptId}
                    onChange={handleChange}
                    disabled={isDH}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {!isDH && <option value="">— select department —</option>}
                    {departments
                      .filter((d) => d.isActive)
                      .filter((d) => !isDH || String(d.deptId) === myDeptId)
                      .map((d) => (
                        <option key={d.deptId} value={d.deptId}>
                          [{d.deptCode}] {d.deptName}
                        </option>
                      ))}
                  </select>
                  {isDH && (
                    <p className="text-[10px] text-on-surface-variant mt-1">
                      Locked to your department.
                    </p>
                  )}
                </div>
              )}
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
                ? 'Create Room'
                : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.roomId)
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
          Delete <strong>Room {deleteTarget?.roomNumber}</strong> (
          {deleteTarget?.building})? This action cannot be undone.
        </p>
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
// Quick-filter tile (inline — small, no need for its own file)
// ────────────────────────────────────────────

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