import { useState } from 'react';
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

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'lecture_room', label: 'Lecture Room' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'computer_lab', label: 'Computer Lab' },
  { value: 'drafting_room', label: 'Drafting Room' },
  { value: 'other', label: 'Other' },
];

type Mode = 'create' | 'edit';

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

  const createMutation = useMutation({
    mutationFn: createRoom,
    onSuccess: (r) => {
      setSuccess(`Room ${r.roomNumber} created.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to create',
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CreateRoomInput>;
    }) => updateRoom(id, input),
    onSuccess: (r) => {
      setSuccess(`Room ${r.roomNumber} updated.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to update',
      ),
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

  const handleDelete = (r: RoomRecord) => {
    if (
      !window.confirm(
        `Delete Room ${r.roomNumber} (${r.building})? This cannot be undone.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(r.roomId);
  };

  const deptName = (id: string | null) => {
    if (!id) return '— shared —';
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? d.deptCode : `#${id}`;
  };

  const typeBadge = (t: RoomType) => {
    const map: Record<RoomType, string> = {
      lecture_room: 'bg-blue-100 text-blue-700',
      laboratory: 'bg-amber-100 text-amber-700',
      computer_lab: 'bg-purple-100 text-purple-700',
      drafting_room: 'bg-emerald-100 text-emerald-700',
      other: 'bg-slate-100 text-slate-600',
    };
    return map[t] ?? 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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

      {/* Create / Edit Modal */}
      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-on-surface mb-4">
              {mode === 'create'
                ? 'Create Room'
                : `Edit Room — ${editing?.roomNumber}`}
            </h2>
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
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">Room</th>
              <th className="text-left px-5 py-3">Building</th>
              <th className="text-left px-5 py-3">Type</th>
              <th className="text-left px-5 py-3">Capacity</th>
              <th className="text-left px-5 py-3">Owner</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-on-surface-variant">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : rooms.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-on-surface-variant">
                  No rooms yet.
                </td>
              </tr>
            ) : (
              rooms.map((r) => (
                <tr key={r.roomId} className="border-b border-white/5 hover:bg-surface-container-low">
                  <td className="px-5 py-3.5 font-bold font-mono text-primary">
                    {r.roomNumber}
                  </td>
                  <td className="px-5 py-3.5 text-on-surface">{r.building}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${typeBadge(r.roomType)}`}
                    >
                      {r.roomType.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant font-mono text-xs">
                    {r.capacity ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant text-xs font-mono">
                    {deptName(r.deptId)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        r.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => openEdit(r)}
                      className="text-xs px-3 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(r.roomId)}
                      disabled={toggleMutation.isPending}
                      className={`text-xs px-3 py-1 rounded-lg border transition ${
                        r.isActive
                          ? 'border-red-300 text-red-700 hover:bg-red-100'
                          : 'border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {r.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      disabled={deleteMutation.isPending}
                      className="text-xs px-3 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}