import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';

import {
  changeRequestLabel,
  changeRequesterName,
  fetchScheduleChangeRequest,
  respondToChangeRequest,
  type ScheduleChangeRequest,
} from '../../../api/schedule-change-request.api';
import {
  fetchSchedulePublishRequest,
  publishRequestLabel,
  publishRequesterName,
  respondToPublishRequest,
  type SchedulePublishRequest,
} from '../../../api/schedule-publish-request.api';
import {
  fetchPendingUnfinalizeRequest,
  respondToUnfinalizeRequest,
  unfinalizeRequestLabel,
  unfinalizeRequesterName,
  type ScheduleUnfinalizeRequest,
} from '../../../api/schedule-unfinalize.api';
import { updateScheduleStatus } from '../../../api/schedule.api';
import Icon from '../../../components/ui/Icon';
import { useFeedback } from '../../../components/ui/FeedbackToast';
import StatusBadge from '../../../components/ui/StatusBadge';
import { extractApiError } from '../../../lib/api-error';
import { lockBodyScroll } from '../../../lib/body-scroll-lock';
import type { ScheduleEntry } from '../../timetable/types';
import { formatTime } from '../../timetable/utils/time.util';

export type ApprovalDrawerTarget =
  | { kind: 'publish'; request: SchedulePublishRequest }
  | { kind: 'unfinalize'; request: ScheduleUnfinalizeRequest }
  | { kind: 'change'; request: ScheduleChangeRequest }
  | { kind: 'schedule'; schedule: ScheduleEntry };

export interface ApprovalDetailDrawerProps {
  target: ApprovalDrawerTarget | null;
  onClose: () => void;
  onDecided?: () => void;
}

type RequestTarget = Exclude<ApprovalDrawerTarget, { kind: 'schedule' }>;
type DecisionAction = 'approve' | 'reject';
type ScheduleAction = 'finalize' | 'return-to-draft' | 'unfinalize-published';
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface NamedUser {
  username?: string | null;
  email?: string | null;
  faculty?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

const REQUEST_KIND_LABELS: Record<RequestTarget['kind'], string> = {
  publish: 'Publish request',
  unfinalize: 'Unfinalize request',
  change: 'Change request',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  draft: 'Draft',
  review: 'In Review',
  finalized: 'Finalized',
  published: 'Published',
};

const STATUS_TONES: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  draft: 'neutral',
  review: 'warning',
  finalized: 'success',
  published: 'info',
};

function statusLabel(status: string | undefined): string {
  return STATUS_LABELS[status ?? ''] ?? status ?? '—';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function personName(user: NamedUser | null | undefined, fallback: string) {
  if (!user) return fallback;
  const full = [user.faculty?.firstName, user.faculty?.lastName]
    .filter(Boolean)
    .join(' ');
  return full || user.username || user.email || fallback;
}

function requestLabel(target: RequestTarget): string {
  if (target.kind === 'publish') return publishRequestLabel(target.request);
  if (target.kind === 'unfinalize') {
    return unfinalizeRequestLabel(target.request);
  }
  return changeRequestLabel(target.request);
}

function requesterName(target: RequestTarget): string {
  if (target.kind === 'publish') return publishRequesterName(target.request);
  if (target.kind === 'unfinalize') {
    return unfinalizeRequesterName(target.request);
  }
  return changeRequesterName(target.request);
}

function requestDetail(target: RequestTarget): string {
  if (target.kind === 'publish') {
    return target.request.note ?? 'No note provided.';
  }
  return target.request.reason || 'No reason provided.';
}

function decisionEffect(target: RequestTarget, action: DecisionAction): string {
  if (action === 'reject') {
    if (target.kind === 'unfinalize') return 'The entry stays Published.';
    if (target.kind === 'change') return 'The entry keeps its current status.';
    return 'The entry was returned to Draft.';
  }
  if (target.kind === 'publish') {
    return 'The entry is published. Send to IDP remains a separate manual step.';
  }
  return 'The entry is back in Draft and editable.';
}

function scheduleEffect(action: ScheduleAction): string {
  if (action === 'finalize') return 'Schedule moved to Finalized.';
  if (action === 'return-to-draft') return 'Schedule returned to Draft.';
  return 'Published schedule returned to Draft and removed from the public planner.';
}

export default function ApprovalDetailDrawer({
  target,
  onClose,
  onDecided,
}: ApprovalDetailDrawerProps) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [remarks, setRemarks] = useState('');

  const schedule = target?.kind === 'schedule' ? target.schedule : null;
  const requestTarget = target && target.kind !== 'schedule' ? target : null;
  const scheduleId = schedule?.id ?? requestTarget?.request.scheduleId ?? null;
  const targetKey = requestTarget
    ? `${requestTarget.kind}:${requestTarget.request.requestId}`
    : schedule
    ? `schedule:${schedule.id}`
    : null;

  useEffect(() => {
    setRemarks('');
  }, [targetKey]);

  useEffect(() => {
    if (!targetKey) return;
    return lockBodyScroll();
  }, [targetKey]);

  useEffect(() => {
    if (!targetKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [targetKey, onClose]);

  // Related request state in schedule mode. Each query shares the same key a
  // decision mutation invalidates, so the drawer never shows a stale status.
  const relatedPublish = useQuery({
    queryKey: ['schedule-publish-request', scheduleId],
    queryFn: () => fetchSchedulePublishRequest(scheduleId!),
    enabled: !!schedule,
    staleTime: 15_000,
  });
  const relatedUnfinalize = useQuery({
    queryKey: ['schedule-unfinalize-request', scheduleId],
    queryFn: () => fetchPendingUnfinalizeRequest(scheduleId!),
    enabled: !!schedule,
    staleTime: 15_000,
  });
  const relatedChange = useQuery({
    queryKey: ['schedule-change-request', scheduleId],
    queryFn: () => fetchScheduleChangeRequest(scheduleId!),
    enabled: !!schedule,
    staleTime: 15_000,
  });

  const invalidateDecisionQueries = (changedScheduleId: string) => {
    queryClient.invalidateQueries({ queryKey: ['schedule-publish-requests'] });
    queryClient.invalidateQueries({
      queryKey: ['schedule-publish-request', changedScheduleId],
    });
    queryClient.invalidateQueries({
      queryKey: ['schedule-unfinalize-requests'],
    });
    queryClient.invalidateQueries({
      queryKey: ['schedule-unfinalize-request', changedScheduleId],
    });
    queryClient.invalidateQueries({ queryKey: ['schedule-change-requests'] });
    queryClient.invalidateQueries({
      queryKey: ['schedule-change-request', changedScheduleId],
    });
    queryClient.invalidateQueries({ queryKey: ['schedules'] });
    queryClient.invalidateQueries({ queryKey: ['coverage'] });
    queryClient.invalidateQueries({ queryKey: ['flagged'] });
  };

  const decisionMutation = useMutation<
    SchedulePublishRequest | ScheduleUnfinalizeRequest | ScheduleChangeRequest,
    Error,
    { target: RequestTarget; action: DecisionAction; remarks: string }
  >({
    mutationFn: ({ target: decisionTarget, action, remarks: decisionRemarks }) => {
      if (decisionTarget.kind === 'publish') {
        return respondToPublishRequest(
          decisionTarget.request.requestId,
          action,
          decisionRemarks,
        );
      }
      if (decisionTarget.kind === 'unfinalize') {
        return respondToUnfinalizeRequest(
          decisionTarget.request.requestId,
          action,
          decisionRemarks,
        );
      }
      return respondToChangeRequest(
        decisionTarget.request.requestId,
        action,
        decisionRemarks,
      );
    },
    onSuccess: (_saved, variables) => {
      invalidateDecisionQueries(variables.target.request.scheduleId);
      feedback.success(
        `${
          variables.action === 'approve' ? 'Approved' : 'Rejected'
        } — ${requestLabel(variables.target)}. ${decisionEffect(
          variables.target,
          variables.action,
        )}`,
      );
      onDecided?.();
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Request decision failed'));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      scheduleId: id,
      action,
    }: {
      scheduleId: string;
      action: ScheduleAction;
    }) =>
      updateScheduleStatus(
        id,
        action === 'finalize' ? 'finalized' : 'draft',
      ),
    onSuccess: (_saved, variables) => {
      invalidateDecisionQueries(variables.scheduleId);
      feedback.success(scheduleEffect(variables.action));
      onDecided?.();
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Schedule action failed'));
    },
  });

  const decide = (action: DecisionAction) => {
    if (!requestTarget) return;
    if (action === 'reject') {
      if (!remarks.trim()) {
        feedback.error('Rejection remarks are required.');
        return;
      }
    }
    decisionMutation.mutate({
      target: requestTarget,
      action,
      remarks: remarks.trim(),
    });
  };

  if (!target) return null;

  const reqSchedule = requestTarget?.request.schedule ?? null;

  return createPortal(
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
        aria-label="Approval details"
      >
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <span className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        <header className="flex items-center justify-between px-5 py-4 border-b border-surface-variant">
          <div>
            <h2 className="text-lg font-bold text-primary">Approval details</h2>
            <p className="text-xs text-on-surface-variant">
              {requestTarget
                ? 'Review the request and record your decision'
                : 'Schedule overview and available actions'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-target hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant -mr-2"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 overscroll-contain">
          {requestTarget ? (
            <>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {REQUEST_KIND_LABELS[requestTarget.kind]}
                  </span>
                  <StatusBadge
                    tone={STATUS_TONES[requestTarget.request.status] ?? 'neutral'}
                  >
                    {statusLabel(requestTarget.request.status)}
                  </StatusBadge>
                </div>
                <h3 className="text-base font-semibold text-on-surface">
                  {requestLabel(requestTarget)}
                </h3>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  {reqSchedule?.subject?.title || 'Schedule entry'}
                </p>
              </div>

              <div className="space-y-3 border-t border-surface-variant pt-3 text-sm">
                <DetailRow
                  icon="groups"
                  label="Section"
                  value={
                    reqSchedule?.sectionRef?.sectionCode ??
                    reqSchedule?.section
                  }
                />
                <DetailRow
                  icon="person"
                  label="Requested by"
                  value={requesterName(requestTarget)}
                />
                <DetailRow
                  icon="calendar_today"
                  label="Filed"
                  value={formatDate(requestTarget.request.createdAt)}
                />
                <DetailRow
                  icon="school"
                  label="Term"
                  value={
                    reqSchedule?.term
                      ? [
                          reqSchedule.term.termName,
                          reqSchedule.term.schoolYear,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : null
                  }
                />
                <DetailRow
                  icon="person"
                  label="Faculty"
                  value={
                    reqSchedule?.faculty
                      ? `${reqSchedule.faculty.firstName} ${reqSchedule.faculty.lastName}`
                      : reqSchedule?.externalFacultyName
                  }
                />
                <DetailRow
                  icon="meeting_room"
                  label="Room"
                  value={
                    reqSchedule?.room
                      ? `${reqSchedule.room.roomNumber}${
                          reqSchedule.room.building
                            ? ` · ${reqSchedule.room.building}`
                            : ''
                        }`
                      : reqSchedule?.externalRoomName
                  }
                />
                <DetailRow icon="calendar_today" label="Day" value={reqSchedule?.dayOfWeek} />
                <DetailRow
                  icon="schedule"
                  label="Time"
                  value={
                    reqSchedule?.startTime && reqSchedule.endTime
                      ? `${formatTime(reqSchedule.startTime)} – ${formatTime(
                          reqSchedule.endTime,
                        )}`
                      : null
                  }
                />
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  {requestTarget.kind === 'publish' ? 'Note' : 'Reason'}
                </p>
                <p className="break-words text-sm text-on-surface">
                  {requestDetail(requestTarget)}
                </p>
              </div>

              {requestTarget.request.status === 'pending' ? (
                <div className="border-t border-surface-variant pt-4">
                  <p className="text-sm font-semibold text-on-surface">Decision</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Approve remarks are optional. Rejecting requires remarks;
                    all decisions are recorded for the requester.
                  </p>
                  <label
                    htmlFor="approval-decision-remarks"
                    className="mb-1.5 mt-3 block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    Remarks (required to reject)
                  </label>
                  <textarea
                    id="approval-decision-remarks"
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    placeholder="Optional when approving; required when rejecting"
                    rows={4}
                    maxLength={500}
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">
                    {remarks.length}/500
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => decide('approve')}
                      disabled={decisionMutation.isPending}
                      className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => decide('reject')}
                      disabled={decisionMutation.isPending}
                      className="flex-1 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                  {decisionMutation.isPending && (
                    <p className="mt-2 text-xs text-primary animate-pulse">
                      Saving decision…
                    </p>
                  )}
                </div>
              ) : (
                <div className="border-t border-surface-variant pt-4">
                  <p className="text-sm font-semibold text-on-surface">
                    Decision history
                  </p>
                  <div className="mt-2 space-y-2 text-xs text-on-surface-variant">
                    <DetailRow
                      icon="task_alt"
                      label="Decision"
                      value={statusLabel(requestTarget.request.status)}
                    />
                    <DetailRow
                      icon="person"
                      label="Responded by"
                      value={personName(
                        requestTarget.request.respondedByUser,
                        requestTarget.request.respondedBy ?? 'Dean',
                      )}
                    />
                    <DetailRow
                      icon="calendar_today"
                      label="Responded at"
                      value={formatDate(requestTarget.request.respondedAt)}
                    />
                  </div>
                  <p className="mt-3 break-words text-sm text-on-surface">
                    {requestTarget.request.responseRemarks || 'No remarks recorded.'}
                  </p>
                </div>
              )}
            </>
          ) : schedule ? (
            <>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Class details
                  </span>
                  <StatusBadge
                    tone={STATUS_TONES[schedule.status ?? 'draft'] ?? 'neutral'}
                  >
                    {statusLabel(schedule.status)}
                  </StatusBadge>
                </div>
                <h3 className="text-base font-semibold text-on-surface">
                  {schedule.subjectCode}
                </h3>
              </div>

              <div className="space-y-3 border-t border-surface-variant pt-3 text-sm">
                <DetailRow icon="title" label="Title" value={schedule.subjectTitle} />
                <DetailRow icon="groups" label="Section" value={schedule.sectionCode} />
                <DetailRow
                  icon="person"
                  label="Faculty"
                  value={schedule.externalFacultyName ?? schedule.facultyName}
                />
                <DetailRow
                  icon="meeting_room"
                  label="Room"
                  value={
                    schedule.externalRoomName
                      ? `${schedule.externalRoomName}${
                          schedule.roomNumber && schedule.roomNumber !== '—'
                            ? ` · ${schedule.roomNumber}`
                            : ''
                        }`
                      : schedule.roomNumber
                  }
                />
                <DetailRow icon="calendar_today" label="Day" value={schedule.day} />
                <DetailRow
                  icon="schedule"
                  label="Time"
                  value={`${formatTime(schedule.startTime)} – ${formatTime(
                    schedule.endTime,
                  )}`}
                />
              </div>

              <div className="border-t border-surface-variant pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Flag and remarks
                </p>
                {schedule.flagged ? (
                  <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                    <p className="font-semibold">Flagged for review</p>
                    <p className="break-words">{schedule.flagReason || 'No reason given.'}</p>
                    <p className="text-[10px] text-rose-700">
                      {formatDate(schedule.flaggedAt)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant">No active flag.</p>
                )}
                <p className="mt-2 break-words text-sm text-on-surface">
                  {schedule.remarks || 'No remarks recorded.'}
                </p>
              </div>

              <div className="border-t border-surface-variant pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Related requests
                </p>
                <div className="space-y-2">
                  <RelatedRequestRow
                    label="Publish request"
                    status={relatedPublish.data?.status}
                    filedAt={relatedPublish.data?.createdAt}
                    detail={relatedPublish.data?.note}
                  />
                  <RelatedRequestRow
                    label="Unfinalize request"
                    status={relatedUnfinalize.data?.status}
                    filedAt={relatedUnfinalize.data?.createdAt}
                    detail={relatedUnfinalize.data?.reason}
                  />
                  <RelatedRequestRow
                    label="Change request"
                    status={relatedChange.data?.status}
                    filedAt={relatedChange.data?.createdAt}
                    detail={relatedChange.data?.reason}
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>

        <footer className="border-t border-surface-variant bg-surface-container-low p-4 pb-safe">
          <div className="flex flex-wrap items-center gap-2">
            {schedule?.status === 'review' && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    statusMutation.mutate({
                      scheduleId: schedule.id,
                      action: 'finalize',
                    })
                  }
                  disabled={statusMutation.isPending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Finalize
                </button>
                <button
                  type="button"
                  onClick={() =>
                    statusMutation.mutate({
                      scheduleId: schedule.id,
                      action: 'return-to-draft',
                    })
                  }
                  disabled={statusMutation.isPending}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Return to Draft
                </button>
              </>
            )}
            {schedule?.status === 'published' && (
              <button
                type="button"
                onClick={() =>
                  statusMutation.mutate({
                    scheduleId: schedule.id,
                    action: 'unfinalize-published',
                  })
                }
                disabled={statusMutation.isPending}
                className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Unfinalize
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:bg-tertiary"
            >
              Close
            </button>
          </div>
          {statusMutation.isPending && (
            <p className="mt-2 text-xs text-primary animate-pulse">Updating schedule…</p>
          )}
        </footer>
      </aside>
    </div>,
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
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon
        name={icon}
        size={18}
        className="mt-0.5 shrink-0 text-on-surface-variant"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </p>
        <p className="truncate text-sm text-on-surface">{value?.trim() || '—'}</p>
      </div>
    </div>
  );
}

function RelatedRequestRow({
  label,
  status,
  filedAt,
  detail,
}: {
  label: string;
  status?: string | null;
  filedAt?: string | null;
  detail?: string | null;
}) {
  return (
    <div className="rounded-lg border border-surface-variant px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-on-surface">{label}</span>
        {status ? (
          <StatusBadge tone={STATUS_TONES[status] ?? 'neutral'}>
            {statusLabel(status)}
          </StatusBadge>
        ) : (
          <span className="text-[11px] text-on-surface-variant">None filed</span>
        )}
      </div>
      {status && (
        <>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            Filed {formatDate(filedAt)}
          </p>
          {detail && <p className="mt-1 break-words text-xs text-on-surface">{detail}</p>}
        </>
      )}
    </div>
  );
}
