import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteSchedule,
  updateScheduleStatus,
  updateRemarks,
  flagSchedule,
  unflagSchedule,
} from '../../../api/schedule.api';
import {
  createUnfinalizeRequest,
  fetchPendingUnfinalizeRequest,
} from '../../../api/schedule-unfinalize.api';
import {
  createPublishRequest,
  fetchSchedulePublishRequest,
} from '../../../api/schedule-publish-request.api';
import { fetchScheduleChangeRequest } from '../../../api/schedule-change-request.api';
import type { ScheduleEntry } from '../types';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import clsx from 'clsx';
import { formatTime } from '../utils/time.util';
import MoveScheduleSheet from './MoveScheduleSheet';
import RequestChangeModal from './RequestChangeModal';
import { useAuthStore } from '../../../store/auth.store';
import { lockBodyScroll } from '../../../lib/body-scroll-lock';
import { useFeedback } from '../../../components/ui/FeedbackToast';
import { extractApiError } from '../../../lib/api-error';

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

const STATUS_OPTIONS = ['draft', 'review', 'finalized'] as const;

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
  const feedback = useFeedback();
  const [remarks, setRemarks] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unfinalizeOpen, setUnfinalizeOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNote, setPublishNote] = useState('');
  const [changeOpen, setChangeOpen] = useState(false);

  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  useEffect(() => {
    setRemarks(entry?.remarks ?? '');
    setMoveOpen(false);
    setDeleteOpen(false);
    setUnfinalizeOpen(false);
    setRequestOpen(false);
    setRequestReason('');
    setPublishOpen(false);
    setPublishNote('');
    setChangeOpen(false);
    setFlagOpen(false);
    setFlagReason('');
  }, [entry?.id, entry?.remarks]);

  // One shared lock for the drawer; the inner modals add their own lock and
  // release it independently. Keeping this effect off the modal state stops
  // the interleaved save/restore that left the page unscrollable.
  useEffect(() => {
    if (!entry) return;
    return lockBodyScroll();
    // Intentionally keyed on the id: a refetch that returns an equal entry
    // must not release and re-take the lock mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !moveOpen &&
        !deleteOpen &&
        !unfinalizeOpen &&
        !requestOpen &&
        !publishOpen &&
        !changeOpen &&
        !flagOpen
      )
        onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [
    entry,
    onClose,
    moveOpen,
    deleteOpen,
    unfinalizeOpen,
    requestOpen,
    publishOpen,
    changeOpen,
    flagOpen,
  ]);

  // ─────────────────────────────────────────────────────────────
  // F4.1 — Cross-page invalidation.
  // ─────────────────────────────────────────────────────────────
  const invalidateAfterMutation = () => {
    queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
    queryClient.invalidateQueries({ queryKey: ['faculty-requests'] });
    queryClient.invalidateQueries({ queryKey: ['flagged'] });
    queryClient.invalidateQueries({ queryKey: ['unplotted-minors'] });
    queryClient.invalidateQueries({ queryKey: ['schedule-versions'] });
    queryClient.invalidateQueries({ queryKey: ['coverage'] });
    queryClient.invalidateQueries({ queryKey: ['schedule-unfinalize-requests'] });
    queryClient.invalidateQueries({ queryKey: ['schedule-publish-requests'] });
    queryClient.invalidateQueries({ queryKey: ['schedule-change-requests'] });
    queryClient.invalidateQueries({
      queryKey: ['schedule-change-request', entry?.id],
    });
    queryClient.invalidateQueries({
      queryKey: ['schedule-publish-request', entry?.id],
    });
  };

  const isDH = profile?.role === 'department_head';
  const isDean = profile?.role === 'college_dean';
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;
  const ownsEntry = !entry?.deptId || String(entry.deptId) === myDeptId;

  const { data: publishRequest } = useQuery({
    queryKey: ['schedule-publish-request', entry?.id],
    queryFn: () => fetchSchedulePublishRequest(entry!.id),
    enabled:
      !!entry &&
      isDH &&
      ownsEntry &&
      (entry.status === 'finalized' || entry.status === 'draft'),
    staleTime: 15_000,
  });
  const publishPending = publishRequest?.status === 'pending';

  const { data: changeRequest } = useQuery({
    queryKey: ['schedule-change-request', entry?.id],
    queryFn: () => fetchScheduleChangeRequest(entry!.id),
    enabled:
      !!entry &&
      isDH &&
      ownsEntry &&
      !readOnly &&
      (entry.status === 'review' || entry.status === 'finalized'),
    staleTime: 15_000,
  });
  const changePending = changeRequest?.status === 'pending';

  const { data: pendingRequest } = useQuery({
    queryKey: ['schedule-unfinalize-request', entry?.id],
    queryFn: () => fetchPendingUnfinalizeRequest(entry!.id),
    enabled:
      !!entry && entry.status === 'published' && (isDH || isDean),
    staleTime: 15_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSchedule(entry!.id),
    onSuccess: () => {
      invalidateAfterMutation();
      onClose();
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Delete failed'));
      setDeleteOpen(false);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'draft' | 'review' | 'finalized' | 'published') =>
      updateScheduleStatus(entry!.id, status),
    onSuccess: () => {
      invalidateAfterMutation();
      setUnfinalizeOpen(false);
      queryClient.invalidateQueries({
        queryKey: ['schedule-unfinalize-request', entry!.id],
      });
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Status update failed'));
      setUnfinalizeOpen(false);
    },
  });

  const remarksMutation = useMutation({
    mutationFn: (text: string) => updateRemarks(entry!.id, text),
    onSuccess: () => {
      invalidateAfterMutation();
      feedback.success('Remarks saved.');
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Save failed'));
    },
  });

  const flagMutation = useMutation({
    mutationFn: (reason: string) => flagSchedule(entry!.id, reason),
    onSuccess: () => {
      invalidateAfterMutation();
      setFlagOpen(false);
      setFlagReason('');
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Flag failed'));
      setFlagOpen(false);
    },
  });

  const unflagMutation = useMutation({
    mutationFn: () => unflagSchedule(entry!.id),
    onSuccess: () => {
      invalidateAfterMutation();
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Unflag failed'));
    },
  });

  const requestMutation = useMutation({
    mutationFn: (reason: string) => createUnfinalizeRequest(entry!.id, reason),
    onSuccess: () => {
      invalidateAfterMutation();
      queryClient.invalidateQueries({
        queryKey: ['schedule-unfinalize-request', entry!.id],
      });
      setRequestOpen(false);
      setRequestReason('');
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Request failed'));
    },
  });

  const publishMutation = useMutation({
    mutationFn: (note?: string) => createPublishRequest(entry!.id, note),
    onSuccess: () => {
      invalidateAfterMutation();
      setPublishOpen(false);
      setPublishNote('');
      feedback.success('Publish request sent to the Dean.');
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Publish request failed'));
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
      if (entry.status === 'published' && isDH) {
        // A published entry is public; the DH asks the Dean instead of
        // changing the status directly.
        if (!pendingRequest) {
          setRequestOpen(true);
        }
        return;
      }
      if (entry.status === 'finalized' && isDH && !publishPending) {
        // A finalized entry goes public only through a Dean-approved request.
        setPublishOpen(true);
        return;
      }
      setUnfinalizeOpen(true);
    } else {
      statusMutation.mutate('finalized');
    }
  };

  if (!entry) return null;

  const isForeignEntry = isDH && !ownsEntry;

  const locked = isLocked(entry.status);
  const writable = !readOnly && !isForeignEntry;
  const canFlag = !readOnly;
  const canRequestChange =
    isDH &&
    writable &&
    (entry.status === 'review' || entry.status === 'finalized');
  const requestPending =
    entry.status === 'published' && isDH && Boolean(pendingRequest);
  const toggleLabel = locked
    ? entry.status === 'published' && isDH
      ? requestPending
        ? 'Request pending'
        : 'Request unfinalize'
      : entry.status === 'finalized' && isDH
      ? publishPending
        ? 'Publish approval pending'
        : 'Request publish approval'
      : 'Unfinalize'
    : 'Finalize';

  // Prefer external room display when set (matches grid block behavior)
  const isExternalRoom = !!entry.externalRoomName;
  const hasInternalRoom = !!(entry.roomNumber && entry.roomNumber !== '—');

  // Portal out of the route wrapper: its retained page-roll transform would
  // otherwise anchor `position: fixed` to the scrolled page instead of the
  // viewport, pushing the drawer out of view.
  return createPortal(
    <>
      <div className="fixed inset-0 z-50">
        <div
          className="absolute inset-0 bg-black/30 overlay-backdrop-blur-xs animate-backdrop-in"
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

          {isForeignEntry && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900">
              <Icon name="lock" size={16} className="shrink-0" />
              <span>
                This class belongs to another department. Contact the owning
                department head or an administrator to make changes.
              </span>
            </div>
          )}

          {locked && writable && entry.status !== 'published' && (
            <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center gap-2 text-xs text-blue-900">
              <Icon name="lock" size={16} className="shrink-0" />
              <span>
                {entry.status === 'finalized' && isDH ? (
                  <>
                    This entry is finalized. Click{' '}
                    <strong>Request publish approval</strong> to send it to the
                    Dean.
                  </>
                ) : (
                  <>
                    This entry is locked. Click <strong>Unfinalize</strong> to
                    make edits.
                  </>
                )}
              </span>
            </div>
          )}

          {entry.status === 'published' && writable && (
            pendingRequest ? (
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs text-amber-900">
                <Icon
                  name="hourglass_top"
                  filled
                  size={16}
                  className="shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">
                    Unfinalize request waiting for the Dean
                  </p>
                  <p className="mt-0.5 break-words">
                    Reason: {pendingRequest.reason}
                  </p>
                  <p className="mt-1 text-[10px] text-amber-700">
                    Submitted {new Date(pendingRequest.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-200 flex items-start gap-2 text-xs text-blue-900">
                <Icon name="lock" size={16} className="shrink-0 mt-0.5" />
                <span>
                  {isDH ? (
                    <>
                      Published entries can only be unfinalized by the Dean.
                      Click <strong>Request unfinalize</strong> to send the
                      reason for review.
                    </>
                  ) : (
                    <>
                      This entry is on the public planner and the IDP feed.
                      Unfinalizing removes it from both and returns it to Draft.
                    </>
                  )}
                </span>
              </div>
            )
          )}

          {publishRequest?.status === 'pending' && isDH && writable && (
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs text-amber-900">
              <Icon
                name="hourglass_top"
                filled
                size={16}
                className="shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Publish approval pending</p>
                {publishRequest.note && (
                  <p className="mt-0.5 break-words">
                    Note: {publishRequest.note}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-amber-700">
                  Submitted {new Date(publishRequest.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {publishRequest?.status === 'rejected' &&
            entry.status === 'draft' &&
            isDH &&
            writable && (
              <div className="px-5 py-3 bg-rose-50 border-b border-rose-200 flex items-start gap-2 text-xs text-rose-900">
                <Icon
                  name="feedback"
                  filled
                  size={16}
                  className="shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">Dean note</p>
                  {publishRequest.responseRemarks && (
                    <p className="mt-0.5 break-words">
                      {publishRequest.responseRemarks}
                    </p>
                  )}
                  {publishRequest.respondedAt && (
                    <p className="mt-1 text-[10px] text-rose-700">
                      {new Date(publishRequest.respondedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )}

          {changeRequest?.status === 'pending' && canRequestChange && (
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs text-amber-900">
              <Icon
                name="hourglass_top"
                filled
                size={16}
                className="shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Request change pending</p>
                <p className="mt-0.5 break-words">
                  Reason: {changeRequest.reason}
                </p>
                <p className="mt-1 text-[10px] text-amber-700">
                  Submitted {new Date(changeRequest.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {changeRequest?.status === 'approved' &&
            isDH &&
            writable &&
            entry.status !== 'published' && (
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 flex items-start gap-2 text-xs text-blue-900">
              <Icon
                name="check_circle"
                size={16}
                className="shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">
                  Dean approved the change request
                </p>
                {changeRequest.responseRemarks && (
                  <p className="mt-0.5 break-words">
                    {changeRequest.responseRemarks}
                  </p>
                )}
                {changeRequest.respondedAt && (
                  <p className="mt-1 text-[10px] text-blue-700">
                    {new Date(changeRequest.respondedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {changeRequest?.status === 'rejected' &&
            isDH &&
            writable &&
            entry.status !== 'published' && (
            <div className="px-5 py-3 bg-rose-50 border-b border-rose-200 flex items-start gap-2 text-xs text-rose-900">
              <Icon
                name="feedback"
                filled
                size={16}
                className="shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Dean note</p>
                {changeRequest.responseRemarks && (
                  <p className="mt-0.5 break-words">
                    {changeRequest.responseRemarks}
                  </p>
                )}
                {changeRequest.respondedAt && (
                  <p className="mt-1 text-[10px] text-rose-700">
                    {new Date(changeRequest.respondedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {entry.pendingFacultyRequestId && (
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs text-amber-900">
              <Icon
                name="hourglass_top"
                filled
                size={16}
                className="shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">
                  Pending cross-department approval
                </p>
                <p className="mt-0.5">
                  This entry uses a faculty member from another department.
                  Finalization is blocked until the request is approved.
                </p>
              </div>
            </div>
          )}

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
                {entry.externalFacultyName && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase bg-amber-100 text-amber-800">
                    Ext. Faculty
                  </span>
                )}
                {isExternalRoom && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase bg-amber-100 text-amber-800">
                    Ext. Room
                  </span>
                )}
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
              {entry.externalFacultyName ? (
                <div className="flex items-start gap-3">
                  <Icon
                    name="person"
                    size={18}
                    className="text-amber-600 mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                        Faculty
                      </p>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase tracking-wider">
                        <Icon name="badge" size={10} />
                        External
                      </span>
                    </div>
                    <p className="text-sm text-amber-900 italic break-words">
                      {entry.facultyName}
                    </p>
                  </div>
                </div>
              ) : (
                <DetailRow
                  icon="person"
                  label="Faculty"
                  value={entry.facultyName}
                />
              )}

              {/* ── Room row — external takes priority ── */}
              {isExternalRoom ? (
                <div className="flex items-start gap-3">
                  <Icon
                    name="home_work"
                    size={18}
                    className="text-amber-600 mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                        Room
                      </p>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase tracking-wider">
                        <Icon name="home_work" size={10} />
                        External
                      </span>
                    </div>
                    <p className="text-sm text-amber-900 italic break-words">
                      {entry.externalRoomName}
                    </p>
                    {hasInternalRoom && (
                      <p className="text-[10px] text-on-surface-variant mt-0.5">
                        Also uses Room {entry.roomNumber}
                        {entry.building ? ` · ${entry.building}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <DetailRow
                  icon="meeting_room"
                  label="Room"
                  value={
                    entry.roomNumber && entry.roomNumber !== '—'
                      ? `${entry.roomNumber}${entry.building ? ` · ${entry.building}` : ''}`
                      : '—'
                  }
                />
              )}

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
                {entry.status !== 'published' && (
                  <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
                    Status
                  </label>
                )}
                <div className="flex items-center gap-2">
                  {entry.status !== 'published' && (
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
                  )}
                  <button
                    onClick={handleToggleLock}
                    disabled={
                      statusMutation.isPending ||
                      requestMutation.isPending ||
                      publishMutation.isPending ||
                      requestPending ||
                      publishPending
                    }
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition whitespace-nowrap',
                      locked
                        ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                        : 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    <Icon name={locked ? 'lock_open' : 'lock'} size={16} />
                    {statusMutation.isPending ||
                    requestMutation.isPending ||
                    publishMutation.isPending
                      ? '…'
                      : toggleLabel}
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

            {canRequestChange && (
              <button
                onClick={() => setChangeOpen(true)}
                disabled={changePending}
                title={
                  changePending
                    ? 'A change request is waiting for the Dean'
                    : 'Ask the Dean to return this entry to Draft'
                }
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-50"
              >
                <Icon name="feedback" size={16} />
                {changePending ? 'Change request pending' : 'Request change'}
              </button>
            )}

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

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => !deleteMutation.isPending && setDeleteOpen(false)}
        title="Delete entry?"
        description={
          <>
            Delete the <strong>{entry.subjectCode}</strong> (
            {entry.sectionCode || 'no section'}) schedule entry, which removes
            it and cannot be undone?
          </>
        }
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete entry'}
        tone="danger"
        busy={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={unfinalizeOpen}
        onClose={() => !statusMutation.isPending && setUnfinalizeOpen(false)}
        title={
          entry.status === 'published'
            ? 'Unfinalize published entry?'
            : 'Unfinalize entry?'
        }
        description={
          <>
            {entry.status === 'published' ? (
              <>
                Unfinalize <strong>{entry.subjectCode}</strong>, which removes
                it from the public planner and IDP feed and returns it to{' '}
                <strong>Draft</strong>?
              </>
            ) : (
              <>
                Unfinalize <strong>{entry.subjectCode}</strong>, which makes it
                editable again and returns it to <strong>Draft</strong>?
              </>
            )}
          </>
        }
        confirmLabel={statusMutation.isPending ? 'Unfinalizing…' : 'Unfinalize'}
        tone="danger"
        busy={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate('draft')}
      />

      <RequestChangeModal
        open={changeOpen}
        entry={entry}
        onClose={() => setChangeOpen(false)}
      />

      <Modal
        open={requestOpen}
        onClose={() => {
          setRequestOpen(false);
          setRequestReason('');
        }}
        title="Request unfinalize from the Dean"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setRequestOpen(false);
                setRequestReason('');
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => requestMutation.mutate(requestReason.trim())}
              disabled={
                requestMutation.isPending || requestReason.trim().length < 5
              }
              className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50"
            >
              {requestMutation.isPending ? 'Sending…' : 'Send request'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-3">
          <strong>"{entry.subjectCode}"</strong> is published, so only the Dean
          can unfinalize it. Explain why it needs to go back to Draft; the Dean
          will approve or reject the request.
        </p>
        <textarea
          value={requestReason}
          onChange={(e) => setRequestReason(e.target.value)}
          placeholder="e.g. Room reassignment approved after publication"
          rows={4}
          maxLength={500}
          autoFocus
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none"
        />
        <p className="text-xs text-slate-400 mt-1 text-right">
          {requestReason.length}/500
        </p>
      </Modal>

      <Modal
        open={publishOpen}
        onClose={() => {
          setPublishOpen(false);
          setPublishNote('');
        }}
        title="Request publish approval"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setPublishOpen(false);
                setPublishNote('');
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                publishMutation.mutate(publishNote.trim() || undefined)
              }
              disabled={publishMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50"
            >
              {publishMutation.isPending ? 'Sending…' : 'Send request'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-3">
          <strong>"{entry.subjectCode}"</strong> is finalized. Send it to the
          Dean for publication approval; the entry stays finalized until the
          Dean decides.
        </p>
        <textarea
          value={publishNote}
          onChange={(e) => setPublishNote(e.target.value)}
          placeholder="Optional note for the Dean"
          rows={4}
          maxLength={1000}
          autoFocus
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none"
        />
        <p className="text-xs text-slate-400 mt-1 text-right">
          {publishNote.length}/1000
        </p>
      </Modal>

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
    </>,
    document.body,
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