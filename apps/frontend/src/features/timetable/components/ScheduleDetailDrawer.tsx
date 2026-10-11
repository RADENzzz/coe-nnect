import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteSchedule,
  updateScheduleStatus,
  updateRemarks,
  flagSchedule,
  unflagSchedule,
} from '../../../api/schedule.api';
import type { ScheduleEntry, Day } from '../types';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import clsx from 'clsx';
import { formatTime } from '../utils/time.util';
import MoveScheduleSheet from './MoveScheduleSheet';
import { useAuthStore } from '../../../store/auth.store';

interface Props {
  entry: ScheduleEntry | null;
  onClose: () => void;
  onEdit?: (entry: ScheduleEntry) => void;
  termId: string;
  onMove?: (
    entryId: string,
    newDay: string,
    newStartTime: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
  movePending: boolean;
  readOnly?: boolean;
}

const STATUS_OPTIONS = ['draft', 'review', 'finalized', 'published'] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  review: 'In Review',
  finalized: 'Finalized',
  published: 'Published',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-surface-container-high text-on-surface-variant',
  review: 'bg-amber-100 text-amber-800',
  finalized: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
};

const isLocked = (status?: string) =>
  status === 'finalized' || status === 'published';

export default function ScheduleDetailDrawer({
  entry,
  onClose,
  onEdit,
  termId,
  onMove,
  movePending,
  readOnly = false,
}: Props) {
  const queryClient = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const [remarks, setRemarks] = useState('');
  const [remarksSaved, setRemarksSaved] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unfinalizeOpen, setUnfinalizeOpen] = useState(false);

  // ── Flag state ──
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  useEffect(() => {
    setRemarks(entry?.remarks ?? '');
    setRemarksSaved(false);
    setError(null);
    setMoveOpen(false);
    setDeleteOpen(false);
    setUnfinalizeOpen(false);
    setFlagOpen(false);
    setFlagReason('');
  }, [entry?.id, entry?.remarks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !moveOpen &&
        !deleteOpen &&
        !unfinalizeOpen &&
        !flagOpen
      )
        onClose();
    };
    if (entry) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [entry, onClose, moveOpen, deleteOpen, unfinalizeOpen, flagOpen]);

  const deleteMutation = useMutation({
    mutationFn: () => deleteSchedule(entry!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      onClose();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? err?.message ?? 'Delete failed');
      setDeleteOpen(false);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'draft' | 'review' | 'finalized' | 'published') =>
      updateScheduleStatus(entry!.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      setError(null);
      setUnfinalizeOpen(false);
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Status update failed',
      );
      setUnfinalizeOpen(false);
    },
  });

  const remarksMutation = useMutation({
    mutationFn: (text: string) => updateRemarks(entry!.id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      setRemarksSaved(true);
      setTimeout(() => setRemarksSaved(false), 1500);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? err?.message ?? 'Save failed');
    },
  });

  // ── Flag mutations ──
  const flagMutation = useMutation({
    mutationFn: (reason: string) => flagSchedule(entry!.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      queryClient.invalidateQueries({ queryKey: ['flagged', termId] });
      setFlagOpen(false);
      setFlagReason('');
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? err?.message ?? 'Flag failed');
      setFlagOpen(false);
    },
  });

  const unflagMutation = useMutation({
    mutationFn: () => unflagSchedule(entry!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      queryClient.invalidateQueries({ queryKey: ['flagged', termId] });
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? err?.message ?? 'Unflag failed');
    },
  });

  const handleDeleteClick = () => {
    if (!entry) return;
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
  };

  const handleStatusChange = (newStatus: string) => {
    statusMutation.mutate(newStatus as any);
  };

  const handleToggleLock = () => {
    if (!entry) return;
    const currentlyLocked = isLocked(entry.status);
    if (currentlyLocked) {
      setUnfinalizeOpen(true);
    } else {
      statusMutation.mutate('finalized');
    }
  };

  if (!entry) return null;

  // ── Foreign-entry detection ──
  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;
  const isForeignEntry =
    isDH && !!entry.deptId && String(entry.deptId) !== myDeptId;

  const locked = isLocked(entry.status);
  const writable = !readOnly && !isForeignEntry;
  const canFlag = !readOnly;   // ← anyone signed-in can flag

  return (
    <>
      <div className="fixed inset-0 z-50">
        <div
          className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-backdrop-in"
          onClick={onClose}
        />

        <aside
          className={clsx(
            'absolute bg-surface-container-lowest shadow-2xl border-surface-variant flex flex-col',
            'left-0 right-0 bottom-0 max-h-[92vh] border-t rounded-t-2xl',
            'animate-[sheetUp_260ms_cubic-bezier(0.2,0.9,0.3,1)]',
            'md:left-auto md:right-0 md:top-0 md:bottom-0 md:w-full md:max-w-md md:max-h-none md:rounded-none md:border-t-0 md:border-l',
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Class details"
        >
          <div className="md:hidden flex justify-center pt-2 pb-1">
            <span className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          <header className="flex items-center justify-between px-5 py-4 border-b border-surface-variant">
            <div>
              <h2 className="text-lg font-bold text-primary">Class Details</h2>
              <p className="text-xs text-on-surface-variant">
                {readOnly
                  ? 'View only'
                  : isForeignEntry
                  ? 'Read-only — belongs to another department'
                  : locked
                  ? 'Locked entry — read-only'
                  : 'View, edit, or delete this entry'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="tap-target hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant -mr-2"
              aria-label="Close"
            >
              <Icon name="close" />
            </button>
          </header>

          {/* Foreign-entry banner */}
          {isForeignEntry && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900">
              <Icon name="lock" size={16} className="shrink-0" />
              <span>
                This class belongs to another department. Contact the owning
                department head or an administrator to make changes.
              </span>
            </div>
          )}

          {locked && writable && (
            <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center gap-2 text-xs text-blue-900">
              <Icon name="lock" size={16} className="shrink-0" />
              <span>
                This entry is locked. Click <strong>Unfinalize</strong> to make
                edits.
              </span>
            </div>
          )}

          {/* ── Flag banner ── */}
          {entry.flagged && (
            <div className="px-5 py-3 bg-rose-50 border-b border-rose-200 flex items-start gap-2 text-xs text-rose-900">
              <Icon name="flag" filled size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Flagged for review</p>
                {entry.flagReason && (
                  <p className="mt-0.5 break-words">{entry.flagReason}</p>
                )}
                {entry.flaggedAt && (
                  <p className="mt-1 text-[10px] text-rose-700">
                    {new Date(entry.flaggedAt).toLocaleString()}
                  </p>
                )}
              </div>
              {writable && (
                <button
                  onClick={() => unflagMutation.mutate()}
                  disabled={unflagMutation.isPending}
                  className="text-[10px] font-semibold px-2 py-1 rounded border border-rose-300 hover:bg-rose-100 disabled:opacity-50 transition whitespace-nowrap"
                >
                  {unflagMutation.isPending ? '…' : 'Clear flag'}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700 whitespace-pre-wrap">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-5 overscroll-contain">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  {entry.subjectCode}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase bg-surface-container-high text-on-surface-variant">
                  {entry.loadType}
                </span>
                <span
                  className={clsx(
                    'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase',
                    STATUS_STYLES[entry.status ?? 'draft'],
                  )}
                >
                  {STATUS_LABELS[entry.status ?? 'draft']}
                </span>
              </div>
              <h3 className="text-base font-semibold text-on-surface">
                {entry.subjectTitle || '—'}
              </h3>
            </div>

            <div className="space-y-3 text-sm pt-3 border-t border-surface-variant">
              <DetailRow
                icon="groups"
                label="Section"
                value={entry.sectionCode || '—'}
              />
              <DetailRow
                icon="person"
                label="Faculty"
                value={entry.facultyName}
              />
              <DetailRow
                icon="meeting_room"
                label="Room"
                value={
                  entry.roomNumber && entry.roomNumber !== '—'
                    ? `${entry.roomNumber}${entry.building ? ` · ${entry.building}` : ''}`
                    : '—'
                }
              />
              <DetailRow icon="calendar_today" label="Day" value={entry.day} />
              <DetailRow
                icon="schedule"
                label="Time"
                value={`${formatTime(entry.startTime)} – ${formatTime(entry.endTime)}`}
              />
            </div>

            {!locked && writable && onMove && (
              <div className="pt-3 border-t border-surface-variant">
                <button
                  type="button"
                  onClick={() => setMoveOpen(true)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      name="swap_horiz"
                      size={20}
                      className="text-primary shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        Move class
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        Change day or start time
                      </p>
                    </div>
                  </div>
                  <Icon
                    name="chevron_right"
                    size={18}
                    className="text-slate-400 shrink-0"
                  />
                </button>
              </div>
            )}

            {writable && (
              <div className="pt-3 border-t border-surface-variant">
                <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
                  Status
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={entry.status ?? 'draft'}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={statusMutation.isPending || locked}
                    className="flex-1 bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleToggleLock}
                    disabled={statusMutation.isPending}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition whitespace-nowrap',
                      locked
                        ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                        : 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100',
                    )}
                  >
                    <Icon name={locked ? 'lock_open' : 'lock'} size={16} />
                    {statusMutation.isPending
                      ? '…'
                      : locked
                      ? 'Unfinalize'
                      : 'Finalize'}
                  </button>
                </div>
                {statusMutation.isPending && (
                  <p className="text-xs text-primary mt-1 animate-pulse">
                    Updating status…
                  </p>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-surface-variant">
              <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
                Remarks{' '}
                {(locked || readOnly || isForeignEntry) && (
                  <span className="text-blue-700">(read-only)</span>
                )}
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Room under maintenance; reschedule pending"
                rows={3}
                maxLength={1000}
                disabled={locked || readOnly || isForeignEntry}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-on-surface-variant">
                  {remarks.length}/1000
                </span>
                <div className="flex items-center gap-2">
                  {remarksSaved && (
                    <span className="text-xs text-green-700 flex items-center gap-1">
                      <Icon name="check" size={14} /> Saved
                    </span>
                  )}
                  {writable && (
                    <button
                      onClick={() => remarksMutation.mutate(remarks)}
                      disabled={
                        locked ||
                        remarksMutation.isPending ||
                        remarks === (entry.remarks ?? '')
                      }
                      className="text-xs font-semibold px-3 py-1.5 bg-primary text-on-primary rounded-md hover:bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {remarksMutation.isPending ? 'Saving…' : 'Save Remarks'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <footer className="border-t border-surface-variant p-4 flex items-center gap-2 bg-surface-container-low pb-safe flex-wrap">
            {/* ── Flag / Unflag — visible to everyone ── */}
            {canFlag && (
              <>
                {!entry.flagged ? (
                  <button
                    onClick={() => setFlagOpen(true)}
                    disabled={flagMutation.isPending}
                    title="Flag for review"
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition disabled:opacity-50"
                  >
                    <Icon name="flag" size={16} />
                    Flag
                  </button>
                ) : (
                  <button
                    onClick={() => unflagMutation.mutate()}
                    disabled={unflagMutation.isPending || isForeignEntry}
                    title={
                      isForeignEntry
                        ? 'Only the owner, Dean, or Admin can clear the flag'
                        : 'Clear flag'
                    }
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon name="flag" filled size={16} />
                    {unflagMutation.isPending ? '…' : 'Unflag'}
                  </button>
                )}
              </>
            )}

            {/* ── Owner-only actions ── */}
            {writable && (
              <>
                <button
                  onClick={handleDeleteClick}
                  disabled={deleteMutation.isPending || locked}
                  title={locked ? 'Unfinalize first to delete' : 'Delete entry'}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-50"
                >
                  <Icon name="delete" size={16} />
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
                {onEdit && (
                  <button
                    onClick={() => onEdit(entry)}
                    disabled={locked}
                    title={locked ? 'Unfinalize first to edit' : 'Edit entry'}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-tertiary transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary"
                  >
                    <Icon name="edit" size={16} />
                    Edit Entry
                  </button>
                )}
              </>
            )}

            {/* ── Close — always present, right-aligned ── */}
            <button
              onClick={onClose}
              className={clsx(
                'px-5 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-tertiary transition',
                !writable && 'ml-auto',
              )}
            >
              Close
            </button>
          </footer>
        </aside>
      </div>

      {onMove && writable && (
        <MoveScheduleSheet
          open={moveOpen}
          entry={entry}
          onClose={() => setMoveOpen(false)}
          onMove={onMove}
          isPending={movePending}
        />
      )}

      {/* Delete confirmation */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete entry?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <strong>"{entry.subjectCode}"</strong> (
          {entry.sectionCode || 'no section'})? This action cannot be undone.
        </p>
      </Modal>

      {/* Unfinalize confirmation */}
      <Modal
        open={unfinalizeOpen}
        onClose={() => setUnfinalizeOpen(false)}
        title="Unfinalize entry?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setUnfinalizeOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => statusMutation.mutate('draft')}
              disabled={statusMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50"
            >
              {statusMutation.isPending ? 'Unfinalizing…' : 'Unfinalize'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Unfinalize this entry? It will be editable again and set back to{' '}
          <strong>Draft</strong>.
        </p>
      </Modal>

      {/* ── Flag modal ── */}
      <Modal
        open={flagOpen}
        onClose={() => setFlagOpen(false)}
        title="Flag for review"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFlagOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => flagMutation.mutate(flagReason)}
              disabled={
                flagMutation.isPending || flagReason.trim().length < 3
              }
              className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition disabled:opacity-50"
            >
              {flagMutation.isPending ? 'Flagging…' : 'Flag'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-3">
          Why are you flagging <strong>"{entry.subjectCode}"</strong>? The
          owning department and admins will see this reason.
        </p>
        <textarea
          value={flagReason}
          onChange={(e) => setFlagReason(e.target.value)}
          placeholder="e.g. Room under maintenance; requires reschedule"
          rows={4}
          maxLength={500}
          autoFocus
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 resize-none"
        />
        <p className="text-xs text-slate-400 mt-1 text-right">
          {flagReason.length}/500
        </p>
      </Modal>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon
        name={icon}
        size={18}
        className="text-on-surface-variant mt-0.5 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm text-on-surface truncate">{value}</p>
      </div>
    </div>
  );
}