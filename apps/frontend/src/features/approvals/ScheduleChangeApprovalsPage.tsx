import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';

import {
  decideScheduleChangeRequest,
  fetchScheduleChangeRequests,
  type ScheduleChangeConflictState,
  type ScheduleChangeRequest,
} from '../../api/idp.api';
import { useAuthStore } from '../../store/auth.store';
import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { useFeedback } from '../../components/ui/FeedbackToast';

type StatusFilter = 'pending' | 'acknowledged' | 'rejected' | 'all';

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'acknowledged', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const CONFLICT_META: Record<
  ScheduleChangeConflictState,
  {
    label: string;
    tone: 'success' | 'warning' | 'danger' | 'neutral';
    icon: string;
    dot: string;
    text: string;
  }
> = {
  ok: {
    label: 'No conflict',
    tone: 'success',
    icon: 'check_circle',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    label: 'Advisory',
    tone: 'warning',
    icon: 'warning',
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
  },
  conflict: {
    label: 'Conflicted',
    tone: 'danger',
    icon: 'error',
    dot: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-300',
  },
  unknown: {
    label: 'Not checked',
    tone: 'neutral',
    icon: 'help',
    dot: 'bg-slate-400',
    text: 'text-on-surface-variant',
  },
};

const TYPE_LABELS: Record<string, string> = {
  schedule_override: 'Schedule change',
  unavailability_change: 'Unavailability',
};

const TYPE_ICONS: Record<string, string> = {
  schedule_override: 'edit_calendar',
  unavailability_change: 'event_busy',
};

const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

function fmtTime(value: string | null): string {
  if (!value) return '—';
  const [rawHour, rawMinute] = value.split(':').map(Number);
  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) return value;
  const hour = rawHour % 12 || 12;
  const suffix = rawHour >= 12 ? 'PM' : 'AM';
  return `${hour}:${String(rawMinute).padStart(2, '0')} ${suffix}`;
}

function dayLabel(value: string | null): string {
  if (!value) return '—';
  return DAY_SHORT[value] ?? value.slice(0, 3);
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} wk ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} mo ago`;
  return `${Math.floor(day / 365)} yr ago`;
}

function statusTone(status: string) {
  if (status === 'pending') return 'warning' as const;
  if (status === 'rejected') return 'danger' as const;
  return 'success' as const;
}

function statusLabel(status: string) {
  if (status === 'pending') return 'Pending';
  if (status === 'rejected') return 'Rejected';
  return 'Approved';
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'danger'
          ? 'text-rose-700 dark:text-rose-300'
          : 'text-on-surface';
  return (
    <div className="border-t-2 border-t-primary/60 bg-surface px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <p
        className={clsx('mt-0.5 text-2xl font-black tabular-nums', valueClass)}
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-outline-variant/50 py-2 last:border-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </span>
      <span
        className={clsx(
          'text-right text-xs font-medium text-on-surface',
          mono && 'font-mono text-[11px]',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function ScheduleChangeApprovalsPage() {
  const qc = useQueryClient();
  const feedback = useFeedback();
  const profile = useAuthStore((s) => s.profile);
  const isDepartmentHead = profile?.role === 'department_head';

  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [ackConflicts, setAckConflicts] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['schedule-change-requests', status],
    queryFn: () =>
      fetchScheduleChangeRequests(status === 'all' ? {} : { status }),
    refetchInterval: 60_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = data?.counts;

  const selected = useMemo(() => {
    if (selectedId) {
      const match = items.find((item) => item.idpRequestId === selectedId);
      if (match) return match;
    }
    return items[0] ?? null;
  }, [items, selectedId]);

  // Reset the composer whenever the selected request changes.
  useEffect(() => {
    setNotes('');
    setAckConflicts(false);
  }, [selected?.idpRequestId]);

  // Deep link: /approvals/schedule-changes?request=<idp id>
  useEffect(() => {
    const requestId = searchParams.get('request');
    if (!requestId) return;
    setSelectedId(requestId);
    const next = new URLSearchParams(searchParams);
    next.delete('request');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const decision = useMutation({
    mutationFn: (input: { action: 'accepted' | 'rejected' }) =>
      decideScheduleChangeRequest(selected?.idpRequestId ?? '', {
        action: input.action,
        notes: notes.trim() || undefined,
        acknowledgeConflicts:
          input.action === 'accepted' && ackConflicts ? true : undefined,
      }),
    onSuccess: (result, input) => {
      void qc.invalidateQueries({ queryKey: ['schedule-change-requests'] });
      void qc.invalidateQueries({ queryKey: ['faculty-requests'] });
      void qc.invalidateQueries({ queryKey: ['schedules'] });
      void qc.invalidateQueries({ queryKey: ['unfinalize-requests'] });
      setNotes('');
      setAckConflicts(false);

      if (input.action === 'rejected') {
        feedback.success('Request rejected. The decision is queued for IDP.');
        return;
      }
      if (result.unfinalize.filed) {
        feedback.success(
          'Request approved. A Dean unfinalize request was filed for the published block.',
        );
        return;
      }
      if (result.unfinalize.message) {
        feedback.error(
          `Request approved, but the unfinalize request could not be filed: ${result.unfinalize.message}`,
        );
        return;
      }
      feedback.success('Request approved. The decision is queued for IDP.');
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ??
        (error as Error)?.message ??
        'The decision could not be saved.';
      feedback.error(message);
    },
  });

  const countsForTabs = counts ?? {
    pending: 0,
    ready: 0,
    conflicted: 0,
    warning: 0,
    unknown: 0,
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
              <Icon name="rule" size={18} />
            </span>
            <h1 className="text-lg font-black tracking-tight text-on-surface">
              Schedule change requests
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-on-surface-variant">
            Faculty and IDP requests that move a plotted class or block faculty
            availability. Each request is checked against the live schedule
            before you decide.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 border border-outline-variant px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-low disabled:opacity-50"
        >
          <Icon
            name="refresh"
            size={15}
            className={isFetching ? 'animate-spin' : undefined}
          />
          Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 gap-px overflow-hidden border border-outline-variant bg-outline-variant/50 md:grid-cols-4">
        <CountTile
          label="Pending"
          value={countsForTabs.pending}
          tone="warning"
        />
        <CountTile label="Ready" value={countsForTabs.ready} tone="success" />
        <CountTile
          label="Conflicted"
          value={countsForTabs.conflicted}
          tone="danger"
        />
        <CountTile
          label="Advisory"
          value={countsForTabs.warning}
          tone="neutral"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-outline-variant">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value);
              setSelectedId(null);
            }}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-xs font-bold transition',
              status === tab.value
                ? 'border-b-primary text-primary'
                : 'border-b-transparent text-on-surface-variant hover:text-on-surface',
            )}
          >
            {tab.label}
            {tab.value === 'pending' && countsForTabs.pending > 0 && (
              <span className="ml-1.5 inline-flex min-w-5 items-center justify-center bg-primary/10 px-1 text-[10px] font-bold text-primary">
                {countsForTabs.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ── Request list ── */}
        <section className="overflow-hidden border border-outline-variant bg-surface">
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low/60 px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Requests
            </span>
            <span className="text-[11px] text-on-surface-variant">
              {items.length}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((key) => (
                <div
                  key={key}
                  className="h-16 animate-pulse bg-surface-container-low"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <Icon
                name="task_alt"
                size={28}
                className="text-on-surface-variant"
              />
              <p className="text-sm font-semibold text-on-surface">
                Nothing waiting
              </p>
              <p className="max-w-[16rem] text-xs text-on-surface-variant">
                {status === 'pending'
                  ? 'No pending schedule changes for your department.'
                  : 'No requests in this view.'}
              </p>
            </div>
          ) : (
            <ul className="max-h-[calc(100vh-20rem)] divide-y divide-outline-variant/60 overflow-y-auto">
              {items.map((item) => {
                const meta = CONFLICT_META[item.conflict.state];
                const active = selected?.idpRequestId === item.idpRequestId;
                return (
                  <li key={item.idpRequestId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.idpRequestId)}
                      className={clsx(
                        'flex w-full items-start gap-3 px-3 py-3 text-left transition',
                        active
                          ? 'bg-primary/5 shadow-[inset_2px_0_0_0_var(--primary)]'
                          : 'hover:bg-surface-container-low/70',
                      )}
                    >
                      <span
                        className={clsx(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border',
                          item.conflict.state === 'conflict'
                            ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
                            : 'border-outline-variant bg-surface-container-low text-on-surface-variant',
                        )}
                      >
                        <Icon
                          name={TYPE_ICONS[item.type] ?? 'event_note'}
                          size={16}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-bold text-on-surface">
                            {item.faculty?.name ??
                              item.subject?.subjectCode ??
                              'Department request'}
                          </span>
                          <span className="shrink-0 text-[10px] text-on-surface-variant">
                            {relativeTime(item.requestedAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-on-surface-variant">
                          {TYPE_LABELS[item.type] ?? item.type}
                          {item.subject ? ` · ${item.subject.subjectCode}` : ''}
                          {item.schedule?.section
                            ? ` · ${item.schedule.section}`
                            : ''}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1 text-[10px] font-semibold',
                              meta.text,
                            )}
                          >
                            <span
                              className={clsx('h-1.5 w-1.5', meta.dot)}
                              aria-hidden="true"
                            />
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-on-surface-variant">
                            {dayLabel(item.proposed.dayOfWeek)}{' '}
                            {fmtTime(item.proposed.startTime)}–
                            {fmtTime(item.proposed.endTime)}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Detail ── */}
        <section className="min-w-0 border border-outline-variant bg-surface">
          {!selected ? (
            <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 p-8 text-center">
              <Icon
                name="fact_check"
                size={32}
                className="text-on-surface-variant"
              />
              <p className="text-sm font-semibold text-on-surface">
                Select a request
              </p>
              <p className="max-w-sm text-xs text-on-surface-variant">
                Pick a request on the left to see the current block, the
                proposed change, and whether it conflicts with the live
                schedule.
              </p>
            </div>
          ) : (
            <ScheduleChangeDetail
              request={selected}
              notes={notes}
              onNotes={setNotes}
              ackConflicts={ackConflicts}
              onAckConflicts={setAckConflicts}
              isDepartmentHead={isDepartmentHead}
              submitting={decision.isPending}
              onDecide={(action) => decision.mutate({ action })}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ScheduleChangeDetail({
  request,
  notes,
  onNotes,
  ackConflicts,
  onAckConflicts,
  isDepartmentHead,
  submitting,
  onDecide,
}: {
  request: ScheduleChangeRequest;
  notes: string;
  onNotes: (value: string) => void;
  ackConflicts: boolean;
  onAckConflicts: (value: boolean) => void;
  isDepartmentHead: boolean;
  submitting: boolean;
  onDecide: (action: 'accepted' | 'rejected') => void;
}) {
  const meta = CONFLICT_META[request.conflict.state];
  const isPending = request.status === 'pending';
  const hasBlocking = request.conflict.state === 'conflict';
  const needsAck = hasBlocking && isPending && !ackConflicts;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-outline-variant px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-black text-on-surface">
                {TYPE_LABELS[request.type] ?? request.type}
              </h2>
              <StatusBadge tone={statusTone(request.status)}>
                {statusLabel(request.status)}
              </StatusBadge>
              <span
                className={clsx(
                  'inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  request.conflict.state === 'ok' &&
                    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
                  request.conflict.state === 'warning' &&
                    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
                  request.conflict.state === 'conflict' &&
                    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
                  request.conflict.state === 'unknown' &&
                    'border-outline-variant bg-surface-container-low text-on-surface-variant',
                )}
              >
                <Icon name={meta.icon} size={12} />
                {meta.label}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-on-surface-variant">
              {request.idpRequestId} · received{' '}
              {relativeTime(request.receivedAt)}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Conflict banner */}
        <div
          className={clsx(
            'border-l-4 px-3 py-2.5',
            request.conflict.state === 'ok' &&
              'border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-500/10',
            request.conflict.state === 'warning' &&
              'border-l-amber-500 bg-amber-50/70 dark:bg-amber-500/10',
            request.conflict.state === 'conflict' &&
              'border-l-rose-500 bg-rose-50/70 dark:bg-rose-500/10',
            request.conflict.state === 'unknown' &&
              'border-l-slate-400 bg-surface-container-low',
          )}
        >
          <p className={clsx('text-xs font-bold', meta.text)}>
            {request.conflict.summary}
          </p>
          {request.conflict.items.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {request.conflict.items.map((item, index) => (
                <li
                  key={`${item.ruleId}-${index}`}
                  className="flex items-start gap-2 text-[11px]"
                >
                  <span
                    className={clsx(
                      'mt-0.5 shrink-0',
                      item.severity === 'hard'
                        ? 'text-rose-600 dark:text-rose-300'
                        : item.severity === 'soft'
                          ? 'text-amber-600 dark:text-amber-300'
                          : 'text-sky-600 dark:text-sky-300',
                    )}
                  >
                    <Icon
                      name={
                        item.severity === 'hard'
                          ? 'error'
                          : item.severity === 'soft'
                            ? 'warning'
                            : 'info'
                      }
                      size={13}
                    />
                  </span>
                  <span className="min-w-0 text-on-surface">
                    <span className="font-semibold">{item.ruleName}:</span>{' '}
                    <span className="text-on-surface-variant">
                      {item.reason}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {request.requiresDeanUnfinalize && (
          <div className="flex items-start gap-2 border border-primary/25 bg-primary/5 px-3 py-2.5">
            <Icon name="gavel" size={16} className="mt-0.5 text-primary" />
            <p className="text-[11px] leading-relaxed text-on-surface">
              This block is <strong>published</strong>.{' '}
              {isDepartmentHead
                ? 'Approving the request also files a Dean unfinalize request; the block can only be edited after the Dean approves it.'
                : 'The block must be unfinalized before the change can be applied.'}
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Request facts */}
          <div className="border border-outline-variant/70 bg-surface-container-low/30 px-3 py-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Request
            </p>
            <DetailRow
              label="Faculty"
              value={request.faculty?.name ?? 'Not specified'}
            />
            <DetailRow
              label="Department"
              value={
                request.faculty?.deptName ?? request.faculty?.deptCode ?? '—'
              }
            />
            <DetailRow
              label="Subject"
              value={
                request.subject
                  ? `${request.subject.subjectCode} · ${request.subject.title}`
                  : '—'
              }
            />
            <DetailRow label="Term" value={request.term?.label ?? '—'} />
            <DetailRow
              label="Section"
              value={
                request.proposed.sectionCode ?? request.schedule?.section ?? '—'
              }
            />
            <DetailRow label="Load" value={request.proposed.loadType ?? '—'} />
            <DetailRow label="Room" value={request.schedule?.room ?? '—'} />
          </div>

          {/* Current vs proposed */}
          <div className="border border-outline-variant/70 bg-surface-container-low/30 px-3 py-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Schedule
            </p>
            <div className="grid grid-cols-2 gap-2 py-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                  Current
                </p>
                <p className="mt-0.5 text-xs font-bold text-on-surface">
                  {request.schedule
                    ? `${dayLabel(request.schedule.dayOfWeek)} ${fmtTime(request.schedule.startTime)}–${fmtTime(request.schedule.endTime)}`
                    : 'Not plotted'}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  {request.schedule?.facultyName ?? '—'}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                  <span className="h-1.5 w-1.5 bg-slate-400" />
                  {request.schedule?.status ?? '—'}
                </p>
              </div>
              <div className="border-l border-outline-variant/60 pl-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Proposed
                </p>
                <p className="mt-0.5 text-xs font-bold text-on-surface">
                  {dayLabel(request.proposed.dayOfWeek)}{' '}
                  {fmtTime(request.proposed.startTime)}–
                  {fmtTime(request.proposed.endTime)}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  {request.proposed.sectionCode ??
                    request.schedule?.section ??
                    '—'}
                </p>
              </div>
            </div>
            {request.proposed.affectedDates.length > 0 && (
              <div className="mt-2 border-t border-outline-variant/60 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                  Affected dates
                </p>
                <p className="mt-0.5 text-[11px] text-on-surface">
                  {request.proposed.affectedDates.join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>

        {request.proposed.reason && (
          <div className="border border-outline-variant/70 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Reason from faculty / IDP
            </p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface">
              {request.proposed.reason}
            </p>
          </div>
        )}

        {request.ack && (
          <div className="border border-outline-variant/70 bg-surface-container-low/30 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Decision
            </p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              {request.ack.action === 'rejected' ? 'Rejected' : 'Approved'} ·{' '}
              {relativeTime(request.ack.acknowledgedAt)}
            </p>
            {request.ack.notes && (
              <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">
                {request.ack.notes}
              </p>
            )}
          </div>
        )}

        {isPending && (
          <div className="space-y-2 border-t border-outline-variant pt-3">
            <label
              htmlFor="schedule-change-notes"
              className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant"
            >
              Reviewer note (optional)
            </label>
            <textarea
              id="schedule-change-notes"
              value={notes}
              onChange={(event) => onNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Explain the decision or the change you will apply…"
              className="w-full resize-y border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/30"
            />

            {hasBlocking && (
              <label className="flex cursor-pointer items-start gap-2 border border-rose-200 bg-rose-50/60 px-3 py-2 text-[11px] text-on-surface dark:border-rose-500/30 dark:bg-rose-500/10">
                <input
                  type="checkbox"
                  checked={ackConflicts}
                  onChange={(event) => onAckConflicts(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-rose-600"
                />
                <span>
                  I reviewed the blocking conflicts and still want to approve
                  this change.
                </span>
              </label>
            )}
          </div>
        )}
      </div>

      {isPending && (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant bg-surface-container-low/40 px-4 py-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onDecide('rejected')}
            className="inline-flex items-center gap-2 border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
          >
            <Icon name="close" size={15} />
            Reject
          </button>
          <button
            type="button"
            disabled={submitting || needsAck}
            onClick={() => onDecide('accepted')}
            className="inline-flex items-center gap-2 bg-primary px-3 py-2 text-xs font-bold text-on-primary transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="check" size={15} />
            {submitting ? 'Saving…' : 'Approve change'}
          </button>
        </footer>
      )}
    </div>
  );
}
