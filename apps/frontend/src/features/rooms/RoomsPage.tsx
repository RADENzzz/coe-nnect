import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchRooms,
  createRoom,
  updateRoom,
  toggleRoomActive,
  deleteRoom,
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

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'lecture_room', label: 'Lecture Room' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'computer_lab', label: 'Computer Lab' },
  { value: 'drafting_room', label: 'Drafting Room' },
  { value: 'other', label: 'Other' },
];

type Mode = 'create' | 'edit';

const TYPE_TONE: Record<RoomType, 'info' | 'warning' | 'purple' | 'success' | 'neutral'> = {
  lecture_room: 'info',
  laboratory: 'warning',
  computer_lab: 'purple',
  drafting_room: 'success',
  other: 'neutral',
};

export default function RoomsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

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
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | RoomType>('all');
  const [deleteTarget, setDeleteTarget] = useState<RoomRecord | null>(null);

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

  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rooms.filter((r) => {
      if (typeFilter !== 'all' && r.roomType !== typeFilter) return false;
      if (!q) return true;
      return (
        r.roomNumber.toLowerCase().includes(q) ||
        r.building.toLowerCase().includes(q)
      );
    });
  }, [rooms, searchQuery, typeFilter]);

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
      deptId: '',
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

    const payload: CreateRoomInput = {
      roomNumber: form.roomNumber.trim(),
      building: form.building.trim(),
      roomType: form.roomType,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      deptId: form.deptId || undefined,
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
      render: (r) => r.roomNumber,
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
      render: (r) => deptName(r.deptId),
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

  const getActions = (r: RoomRecord): RowAction[] => [
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
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Rooms</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {rooms.length} room(s) registered
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="add" size={18} />
          New Room
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
        {(searchQuery || typeFilter !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setTypeFilter('all');
            }}
            className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
          >
            Clear
          </button>
        )}
        <div className="ml-auto text-xs text-on-surface-variant">
          Showing <strong className="text-on-surface">{filteredRooms.length}</strong> of{' '}
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
        emptyMessage="No rooms yet."
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
            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Department
              </label>
              <select
                name="deptId"
                value={form.deptId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— shared (any department) —</option>
                {departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName}
                    </option>
                  ))}
              </select>
              <p className="text-[10px] text-on-surface-variant mt-1">
                Used by S-10 (room ownership warning).
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
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.roomId)}
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
    </div>
  );
}