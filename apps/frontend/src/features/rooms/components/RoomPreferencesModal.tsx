import { useEffect, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
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
}

/**
 * Manage preferences for a single SHARED room.
 *
 * - DH sees all preferences but can only add/edit/remove their own
 *   department's row. The backend enforces this; the UI shows what's
 *   available.
 * - Dean sees all and can remove any.
 * - Owned rooms can't be opened with this modal — the caller
 *   (RoomsPage) only shows the action for shared rooms.
 */
export default function RoomPreferencesModal({
  open,
  onClose,
  room,
}: Props) {
  const qc = useQueryClient();
  const profile = useAuthStore((s) => s.profile);

  const isDH = profile?.role === 'department_head';
  const isDean =
    profile?.role === 'college_dean' ||
    profile?.role === 'administrator';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState(1);
  const [deleteTarget, setDeleteTarget] =
    useState<RoomPreferenceRecord | null>(null);

  const {
    data: preferences = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['room-preferences', room?.roomId],
    queryFn: () => fetchRoomPreferences(room!.roomId),
    enabled: open && !!room?.roomId,
    staleTime: 30_000,
  });

  // Reset local state when the modal opens or the room changes
  useEffect(() => {
    if (!open) {
      setPriority(1);
      setError(null);
      setDeleteTarget(null);
    }
  }, [open]);

  // Which row belongs to the current DH (if any)
  const myRow = useMemo(
    () => preferences.find((p) => String(p.deptId) === myDeptId) ?? null,
    [preferences, myDeptId],
  );

  // Initialize priority from the DH's existing row (if any)
  useEffect(() => {
    if (myRow) setPriority(myRow.priority);
    else setPriority(1);
  }, [myRow?.preferenceId, myRow?.priority]);

  const upsertMutation = useMutation({
    mutationFn: () =>
      upsertRoomPreference({
        roomId: room!.roomId,
        deptId: myDeptId!,
        priority,
      }),
    onSuccess: async () => {
      setError(null);
      await refetch();
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to save',
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRoomPreference(id),
    onSuccess: async () => {
      setError(null);
      setDeleteTarget(null);
      await refetch();
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to remove',
      ),
  });

  if (!room) return null;

  const isOwned = room.deptId !== null;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Room preferences — Room ${room.roomNumber}`}
        size="lg"
        footer={
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition"
          >
            Close
          </button>
        }
      >
        <div className="space-y-5">
          {/* Header hint */}
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

          {/* Owned room warning (shouldn't happen; caller filters) */}
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

          {/* Current preferences list */}
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
                          <span className="font-mono">
                            Priority {p.priority}
                          </span>
                          <span>·</span>
                          <span>
                            {priorityLabel(p.priority)}
                          </span>
                        </div>
                      </div>
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          disabled={deleteMutation.isPending}
                          className="text-[11px] font-semibold text-red-700 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50 transition disabled:opacity-50"
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

          {/* DH's own row editor */}
          {isDH && !isOwned && myDeptId && (
            <div className="rounded-lg border border-surface-variant bg-surface-container-low p-4">
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
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

              <div className="space-y-2">
                <label className="block text-xs text-on-surface-variant mb-1">
                  Priority
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPriority(n)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                        priority === n
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-white text-on-surface-variant border-surface-variant hover:border-primary'
                      }`}
                    >
                      {n} — {priorityLabel(n)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={() => upsertMutation.mutate()}
                  disabled={upsertMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
                >
                  <Icon
                    name={upsertMutation.isPending ? 'progress_activity' : 'save'}
                    size={16}
                    className={upsertMutation.isPending ? 'animate-spin' : ''}
                  />
                  {upsertMutation.isPending
                    ? 'Saving…'
                    : myRow
                    ? 'Update preference'
                    : 'Add preference'}
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

      {/* Delete confirmation */}
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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate(deleteTarget.preferenceId)
              }
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Removing…' : 'Remove'}
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

function priorityLabel(n: number): string {
  if (n === 3) return 'reserved if possible';
  if (n === 2) return 'strongly preferred';
  return 'preferred';
}