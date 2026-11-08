// RoomPreferencesModal.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import type { Department } from '../../../api/departments.api';
import { useAuthStore } from '../../../store/auth.store';
import {
  fetchRoomPreferences,
  upsertRoomPreference,
  deleteRoomPreference,
  type RoomRecord,
  type RoomPreferenceRecord,
} from '../../../api/rooms.api';

interface Props {
  open: boolean;
  onClose: () => void;
  room: RoomRecord | null;
  departments: Department[];
}

export default function RoomPreferencesModal({
  open,
  onClose,
  room,
  departments,
}: Props) {
  const qc = useQueryClient();
  const profile = useAuthStore((s) => s.profile);

  const isDH = profile?.role === 'department_head';
  const isDean =
    profile?.role === 'college_dean' ||
    profile?.role === 'college_secretary' ||
    profile?.role === 'administrator';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState(1);
  const [deleteTarget, setDeleteTarget] =
    useState<RoomPreferenceRecord | null>(null);

  const prefsKey = ['room-preferences', room?.roomId] as const;

  const {
    data: preferences = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: prefsKey,
    queryFn: () => fetchRoomPreferences(room!.roomId),
    enabled: open && !!room?.roomId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) {
      setPriority(1);
      setError(null);
      setDeleteTarget(null);
    }
  }, [open]);

  const myRow = useMemo(
    () => preferences.find((p) => String(p.deptId) === myDeptId) ?? null,
    [preferences, myDeptId],
  );

  useEffect(() => {
    if (myRow) setPriority(myRow.priority);
    else setPriority(1);
  }, [myRow?.preferenceId, myRow?.priority]);

  // ── Upsert (optimistic) ────────────────────────────────────────
  const upsertMutation = useMutation({
    mutationFn: () =>
      upsertRoomPreference({
        roomId: room!.roomId,
        deptId: myDeptId!,
        priority,
      }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: prefsKey });
      const prev = qc.getQueryData<RoomPreferenceRecord[]>(prefsKey) ?? [];
      const myDept = departments.find((d) => String(d.deptId) === myDeptId);
      if (!myDept) return { prev };

      const existing = prev.find((p) => String(p.deptId) === myDeptId);
      const next = existing
        ? prev.map((p) =>
            String(p.deptId) === myDeptId ? { ...p, priority } : p,
          )
        : [
            ...prev,
            {
              preferenceId: `temp-${Date.now()}`,
              roomId: room!.roomId,
              deptId: myDept.deptId,
              deptCode: myDept.deptCode,
              deptName: myDept.deptName,
              priority,
              createdAt: new Date().toISOString(),
            } as unknown as RoomPreferenceRecord,
          ];
      qc.setQueryData<RoomPreferenceRecord[]>(prefsKey, next);
      return { prev };
    },
    onSuccess: () => {
      setError(null);
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(prefsKey, ctx.prev);
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to save',
      );
    },
    onSettled: async () => {
      await refetch();
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['room-preferences'] });
    },
  });

  // ── Delete (optimistic) ────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRoomPreference(id),
    onMutate: async (id) => {
      // Close the confirm modal the moment the user commits.
      setDeleteTarget(null);
      await qc.cancelQueries({ queryKey: prefsKey });
      const prev = qc.getQueryData<RoomPreferenceRecord[]>(prefsKey);
      if (prev) {
        qc.setQueryData<RoomPreferenceRecord[]>(prefsKey, (old = []) =>
          old.filter((p) => p.preferenceId !== id),
        );
      }
      return { prev };
    },
    onSuccess: () => setError(null),
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(prefsKey, ctx.prev);
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to remove',
      );
    },
    onSettled: async () => {
      await refetch();
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['room-preferences'] });
    },
  });

  if (!room) return null;

  const isOwned = room.deptId !== null;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Room preferences — Room ${room.roomNumber}`}
        description={`${room.building} · shared room`}
        size="lg"
        footer={
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg"
          >
            Close
          </button>
        }
      >
        <div className="space-y-5">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-3 text-xs text-blue-900">
            <Icon name="info" size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Preferred rooms influence auto-generate
              </p>
              <p className="mt-0.5">
                When scheduling for your department, the solver favors
                preferred shared rooms. Higher priority = stronger nudge.
              </p>
            </div>
          </div>

          {isOwned && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-3 text-xs text-amber-900">
              <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  This room is owned, not shared
                </p>
                <p className="mt-0.5">
                  Owned rooms are exclusive to their owning department and
                  cannot be preferred.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Departments that prefer this room
              </span>
              <span className="text-xs text-on-surface-variant">
                {preferences.length}
              </span>
            </div>

            {isLoading && (
              <div className="text-center py-4 text-xs text-on-surface-variant">
                Loading…
              </div>
            )}

            {!isLoading && preferences.length === 0 && (
              <div className="text-center py-6 text-xs text-on-surface-variant border border-dashed border-surface-variant rounded-lg">
                No department prefers this room yet.
              </div>
            )}

            {!isLoading && preferences.length > 0 && (
              <ul className="divide-y divide-surface-variant border border-surface-variant rounded-lg overflow-hidden">
                {preferences.map((p) => {
                  const isMine = String(p.deptId) === myDeptId;
                  const canRemove = isMine || isDean;

                  return (
                    <li
                      key={p.preferenceId}
                      className={`px-3 py-2.5 flex items-center gap-3 ${
                        isMine ? 'bg-amber-50/60' : ''
                      }`}
                    >
                      <span
                        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          isMine ? 'bg-amber-500' : 'bg-slate-300'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-on-surface">
                            [{p.deptCode}] {p.deptName}
                          </span>
                          {isMine && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                              Your department
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-0.5">
                          <StarRating value={p.priority} size={10} />
                          <span>·</span>
                          <span>{priorityLabel(p.priority)}</span>
                        </div>
                      </div>
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          className="text-[11px] font-semibold text-red-700 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50 transition"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {isDH && !isOwned && myDeptId && (
            <div className="rounded-lg border border-surface-variant bg-surface-container-low p-4">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  {myRow ? 'Update your preference' : 'Add your preference'}
                </span>
                {myRow && (
                  <span className="text-[10px] text-on-surface-variant">
                    Previously added{' '}
                    {new Date(myRow.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs text-on-surface-variant">
                  Priority
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((n) => {
                    const selected = priority === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPriority(n)}
                        aria-pressed={selected}
                        className={`p-3 rounded-lg border text-center transition ${
                          selected
                            ? 'bg-primary text-on-primary border-primary shadow-sm'
                            : 'bg-white text-on-surface-variant border-surface-variant hover:border-primary'
                        }`}
                      >
                        <div className="flex justify-center gap-0.5 mb-1.5">
                          {[1, 2, 3].map((i) => (
                            <Icon
                              key={i}
                              name="star"
                              size={14}
                              className={
                                i <= n
                                  ? selected
                                    ? 'text-on-primary'
                                    : 'text-amber-500'
                                  : selected
                                  ? 'text-on-primary/30'
                                  : 'text-slate-200'
                              }
                            />
                          ))}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider">
                          {priorityLabel(n)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={() => upsertMutation.mutate()}
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition flex items-center gap-2"
                >
                  <Icon name="save" size={16} />
                  {myRow ? 'Update preference' : 'Add preference'}
                </button>
              </div>
            </div>
          )}

          {isDean && !isDH && !isOwned && (
            <div className="rounded-lg border border-surface-variant bg-surface-container-low p-3 text-xs text-on-surface-variant flex items-start gap-2">
              <Icon name="info" size={14} className="shrink-0 mt-0.5" />
              <span>
                Deans can remove any department's preference. To add a
                preference, sign in as that department's head.
              </span>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove preference?"
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
                deleteTarget &&
                deleteMutation.mutate(deleteTarget.preferenceId)
              }
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition rounded-lg"
            >
              Remove
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove the preference for{' '}
          <strong>
            [{deleteTarget?.deptCode}] {deleteTarget?.deptName}
          </strong>{' '}
          on this room? Auto-generate will no longer favor this room for that
          department.
        </p>
      </Modal>
    </>
  );
}

function StarRating({ value, size = 10 }: { value: number; size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`Priority ${value} of 3`}
    >
      {[1, 2, 3].map((i) => (
        <Icon
          key={i}
          name="star"
          size={size}
          className={i <= value ? 'text-amber-500' : 'text-slate-200'}
        />
      ))}
    </span>
  );
}

function priorityLabel(n: number): string {
  if (n === 3) return 'reserved if possible';
  if (n === 2) return 'strongly preferred';
  return 'preferred';
}