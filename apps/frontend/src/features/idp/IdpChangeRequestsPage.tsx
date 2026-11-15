import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';

import {
  acknowledgeIdpChangeRequest,
  fetchIdpChangeRequest,
  fetchIdpChangeRequests,
  fetchIdpHealth,
  IDP_CHANGE_REQUEST_TYPES,
  type IdpChangeRequest,
  type IdpChangeRequestAckAction,
  type IdpChangeRequestAckResult,
  type IdpChangeRequestStatus,
  type IdpChangeRequestType,
} from '../../api/idp.api';
import { fetchFaculty } from '../../api/faculty.api';
import { useAuthStore } from '../../store/auth.store';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, {
  type Column,
} from '../../components/ui/ResponsiveTable';
import StatusBadge from '../../components/ui/StatusBadge';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { useFeedback } from '../../components/ui/FeedbackToast';

type StatusFilter = 'all' | IdpChangeRequestStatus;
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TYPE_LABELS: Record<string, string> = {
  faculty_create: 'Faculty create',
  faculty_update: 'Faculty update',
  faculty_deactivate: 'Faculty deactivate',
  faculty_transfer: 'Faculty transfer',
  qualification_add: 'Qualification add',
  qualification_remove: 'Qualification remove',
  unavailability_change: 'Unavailability change',
  schedule_override: 'Schedule override',
};

const STATUS_TONE: Record<IdpChangeRequestStatus, Tone> = {
  pending: 'warning',
  acknowledged: 'success',
  rejected: 'danger',
};

const SEVERITY_TONE: Record<string, Tone> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

const ACK_TONE: Record<IdpChangeRequestAckAction, Tone> = {
  accepted: 'success',
  modified: 'info',
  rejected: 'danger',
};

const ACK_LABELS: Record<IdpChangeRequestAckAction, string> = {
  accepted: 'Accepted',
  modified: 'Modified',
  rejected: 'Rejected',
};

const ACK_OPTIONS: Array<{
  value: IdpChangeRequestAckAction;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: 'accepted',
    label: 'Accept',
    description: 'Approve the request as submitted.',
    icon: 'check_circle',
  },
  {
    value: 'modified',
    label: 'Accept with changes',
    description: 'Approve the intent and note the changes you applied.',
    icon: 'edit_note',
  },
  {
    value: 'rejected',
    label: 'Reject',
    description: 'Decline the request and explain why.',
    icon: 'cancel',
  },
];

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'rejected', label: 'Rejected' },
];

const LIMIT_OPTIONS = [50, 100, 200, 500];

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

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const value = err as {
    response?: { data?: { message?: unknown } };
    message?: unknown;
  };
  const message = value?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  if (typeof message === 'string' && message.trim()) return message;
  if (typeof value?.message === 'string' && value.message.trim()) {
    return value.message;
  }
  return fallback;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function prettyKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeRequest(request: IdpChangeRequest): string {
  const details = request.details ?? {};

  switch (request.type) {
    case 'faculty_create': {
      const name = [text(details.first_name), text(details.last_name)]
        .filter(Boolean)
        .join(' ');
      const department = text(details.department_code);
      return `Create ${name || 'faculty record'}${
        department ? ` in ${department}` : ''
      }`;
    }
    case 'faculty_update': {
      const fields = Object.keys(details);
      return fields.length
        ? `Update ${fields.map(prettyKey).join(', ')}`
        : 'Update faculty record';
    }
    case 'faculty_deactivate':
      return `Deactivate faculty${
        details.reason ? ` · ${text(details.reason)}` : ''
      }`;
    case 'faculty_transfer':
      return `Transfer ${text(details.from_department_code) || '?'} → ${
        text(details.to_department_code) || '?'
      }`;
    case 'qualification_add':
      return `Add qualification · ${
        text(details.subject_code) || 'subject'
      }`;
    case 'qualification_remove':
      return `Remove qualification · ${
        text(details.subject_code) || 'subject'
      }`;
    case 'unavailability_change': {
      const window = [
        text(details.day_of_week),
        [text(details.start_time), text(details.end_time)]
          .filter(Boolean)
          .join('–'),
      ]
        .filter(Boolean)
        .join(' ');
      return `Unavailability${window ? ` · ${window}` : ''}${
        details.term_code ? ` · ${text(details.term_code)}` : ''
      }`;
    }
    case 'schedule_override': {
      const subject = [text(details.subject_code), text(details.section_code)]
        .filter(Boolean)
        .join(' ');
      const window = [
        text(details.day_of_week),
        [text(details.start_time), text(details.end_time)]
          .filter(Boolean)
          .join('–'),
      ]
        .filter(Boolean)
        .join(' ');
      return `Schedule override${subject ? ` · ${subject}` : ''}${
        window ? ` · ${window}` : ''
      }`;
    }
    default:
      return TYPE_LABELS[request.type] ?? request.type;
  }
}

function DetailValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-on-surface-variant">—</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-on-surface-variant">—</span>;
    }
    return (
      <span className="break-words">
        {value
          .map((item) =>
            item !== null && typeof item === 'object'
              ? JSON.stringify(item)
              : String(item),
          )
          .join(', ')}
      </span>
    );
  }

  if (typeof value === 'object') {
    return (
      <pre className="max-h-56 overflow-auto rounded-lg bg-surface-container-low p-2 text-[11px] leading-relaxed text-on-surface">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  if (typeof value === 'boolean') {
    return <span>{value ? 'Yes' : 'No'}</span>;
  }

  return <span className="break-words">{String(value)}</span>;
}

function IntegrationStatus({
  inboundReady,
  outboundReady,
  failed,
}: {
  inboundReady: boolean;
  outboundReady: boolean;
  failed?: boolean;
}) {
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        IDP status unavailable
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={clsx(
            'h-1.5 w-1.5 rounded-full',
            inboundReady ? 'bg-emerald-500' : 'bg-amber-500',
          )}
        />
        Pattern C {inboundReady ? 'ready' : 'not configured'}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className={clsx(
            'h-1.5 w-1.5 rounded-full',
            outboundReady ? 'bg-emerald-500' : 'bg-slate-400',
          )}
        />
        Pattern A {outboundReady ? 'ready' : 'off'}
      </span>
    </div>
  );
}

export default function IdpChangeRequestsPage() {
  const feedback = useFeedback();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [typeFilter, setTypeFilter] = useState<'' | IdpChangeRequestType>('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(200);
  const [detailTarget, setDetailTarget] = useState<IdpChangeRequest | null>(
    null,
  );
  const [ackTarget, setAckTarget] = useState<IdpChangeRequest | null>(null);
  const [ackAction, setAckAction] =
    useState<IdpChangeRequestAckAction>('accepted');
  const [ackNotes, setAckNotes] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const requestsQuery = useQuery({
    queryKey: ['idp-change-requests', limit],
    queryFn: () => fetchIdpChangeRequests({ limit }),
    enabled: !!user,
  });
  const requests = useMemo(
    () => requestsQuery.data ?? [],
    [requestsQuery.data],
  );

  const healthQuery = useQuery({
    queryKey: ['idp-health'],
    queryFn: fetchIdpHealth,
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ['faculty'],
    queryFn: () => fetchFaculty(false),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const facultyById = useMemo(() => {
    const map = new Map<
      string,
      { firstName: string; lastName: string; wmsuId: string | null }
    >();
    for (const member of faculty) {
      map.set(String(member.facultyId), {
        firstName: member.firstName,
        lastName: member.lastName,
        wmsuId: member.wmsuId,
      });
    }
    return map;
  }, [faculty]);

  const facultyLabel = useCallback(
    (request: IdpChangeRequest): string => {
      if (request.faculty_id) {
        const member = facultyById.get(String(request.faculty_id));
        if (member) return `${member.lastName}, ${member.firstName}`;
      }
      if (request.faculty_wmsu_id) {
        return `WMSU ${request.faculty_wmsu_id}`;
      }
      if (request.faculty_employee_id) {
        return `Employee ${request.faculty_employee_id}`;
      }
      return '—';
    },
    [facultyById],
  );

  const facultyKey = useCallback((request: IdpChangeRequest): string => {
    if (request.faculty_wmsu_id) return `WMSU ${request.faculty_wmsu_id}`;
    if (request.faculty_employee_id) {
      return `Employee ${request.faculty_employee_id}`;
    }
    if (request.faculty_id) return `Faculty #${request.faculty_id}`;
    return '';
  }, []);

  // Notification deep link: /dean/idp/change-requests?request=<id>
  const deepLinkId = searchParams.get('request');
  const deepLinkQuery = useQuery({
    queryKey: ['idp-change-request', deepLinkId],
    queryFn: () => fetchIdpChangeRequest(deepLinkId as string),
    enabled: !!deepLinkId,
    retry: false,
  });

  const clearDeepLink = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('request');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!deepLinkId) return;

    const match = requests.find(
      (request) => request.idp_request_id === deepLinkId,
    );
    if (match) {
      setDetailTarget(match);
      clearDeepLink();
      return;
    }

    if (deepLinkQuery.data) {
      setDetailTarget(deepLinkQuery.data);
      clearDeepLink();
      return;
    }

    if (deepLinkQuery.isError) {
      feedback.error(
        apiErrorMessage(
          deepLinkQuery.error,
          `Change request ${deepLinkId} was not found.`,
        ),
      );
      clearDeepLink();
    }
  }, [
    clearDeepLink,
    deepLinkId,
    deepLinkQuery.data,
    deepLinkQuery.error,
    deepLinkQuery.isError,
    feedback,
    requests,
  ]);

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((request) => request.status === 'pending').length,
      acknowledged: requests.filter(
        (request) => request.status === 'acknowledged',
      ).length,
      rejected: requests.filter((request) => request.status === 'rejected')
        .length,
    }),
    [requests],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (statusFilter !== 'all' && request.status !== statusFilter) {
        return false;
      }
      if (typeFilter && request.type !== typeFilter) return false;
      if (!query) return true;

      const haystack = [
        request.idp_request_id,
        request.type,
        TYPE_LABELS[request.type] ?? '',
        request.status,
        request.severity,
        facultyLabel(request),
        request.faculty_wmsu_id ?? '',
        request.faculty_employee_id ?? '',
        ...(request.affected_dates ?? []),
        JSON.stringify(request.details ?? {}),
        request.ack?.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [facultyLabel, requests, search, statusFilter, typeFilter]);

  const ackMutation = useMutation({
    mutationFn: ({
      request,
      action,
      notes,
    }: {
      request: IdpChangeRequest;
      action: IdpChangeRequestAckAction;
      notes: string;
    }) =>
      acknowledgeIdpChangeRequest(request.idp_request_id, {
        action,
        notes: notes.trim() || null,
      }),
    onSuccess: (result: IdpChangeRequestAckResult) => {
      qc.invalidateQueries({ queryKey: ['idp-change-requests'] });
      qc.invalidateQueries({
        queryKey: ['idp-change-request', result.idp_request_id],
      });

      const delivery = result.delivered
        ? 'Delivered to IDP.'
        : result.queued
          ? 'Queued for the IDP desktop to poll.'
          : 'Saved locally.';
      const duplicate = result.duplicate
        ? ' This decision was already recorded.'
        : '';

      feedback.success(
        `${result.idp_request_id}: ${ACK_LABELS[result.action]}. ${delivery}${duplicate}`,
        {
          title: result.delivered
            ? 'Change request reviewed'
            : 'Decision recorded',
          durationMs: result.delivered ? undefined : 6500,
        },
      );

      if (result.error) {
        feedback.error(
          `IDP delivery failed: ${result.error}. The acknowledgement remains queued.`,
          { title: 'IDP delivery pending' },
        );
      }

      setAckTarget(null);
      setDetailTarget(null);
      setAckAction('accepted');
      setAckNotes('');
    },
    onError: (err: unknown) => {
      feedback.error(
        apiErrorMessage(err, 'Could not record the change-request decision.'),
      );
    },
  });

  const openAck = (request: IdpChangeRequest) => {
    setAckTarget(request);
    setAckAction('accepted');
    setAckNotes('');
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      window.setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1500,
      );
    } catch {
      /* Clipboard may be blocked. */
    }
  };

  const columns: Column<IdpChangeRequest>[] = [
    {
      key: 'request',
      header: 'Request',
      cardVariant: 'title',
      cellClassName: 'text-on-surface',
      render: (request) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-xs font-bold text-primary">
            {request.idp_request_id}
          </span>
          <span className="text-xs font-semibold">
            {TYPE_LABELS[request.type] ?? request.type}
          </span>
          <span
            className="text-[11px] text-on-surface-variant"
            title={formatDateTime(request.received_at)}
          >
            {relativeTime(request.received_at)}
          </span>
        </div>
      ),
    },
    {
      key: 'faculty',
      header: 'Faculty',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface',
      render: (request) => {
        const key = facultyKey(request);
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate">{facultyLabel(request)}</span>
            {key && key !== facultyLabel(request) && (
              <span className="font-mono text-[10px] text-on-surface-variant">
                {key}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'change',
      header: 'Change',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface-variant max-w-md',
      render: (request) => (
        <p className="line-clamp-2 text-xs">{summarizeRequest(request)}</p>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      cardVariant: 'badge',
      render: (request) => (
        <StatusBadge tone={SEVERITY_TONE[request.severity] ?? 'neutral'}>
          <span className="capitalize">{request.severity}</span>
        </StatusBadge>
      ),
    },
    {
      key: 'dates',
      header: 'Affected dates',
      hideOnMobile: true,
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface-variant whitespace-nowrap',
      render: (request) => {
        const dates = request.affected_dates ?? [];
        if (dates.length === 0) return '—';
        const shown = dates.slice(0, 2).join(', ');
        return dates.length > 2 ? `${shown} +${dates.length - 2}` : shown;
      },
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (request) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={STATUS_TONE[request.status]}>
            <span className="capitalize">{request.status}</span>
          </StatusBadge>
          {!request.requires_ack && (
            <span className="text-[10px] text-on-surface-variant">
              no ack required
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (request: IdpChangeRequest): RowAction[] => {
    const actions: RowAction[] = [
      {
        label:
          request.status === 'pending' ? 'Review request' : 'View decision',
        icon: request.status === 'pending' ? 'fact_check' : 'visibility',
        onClick: () => setDetailTarget(request),
      },
      {
        label: 'Copy request ID',
        icon: 'content_copy',
        onClick: () => void copyId(request.idp_request_id),
      },
    ];
    if (request.status === 'pending') {
      actions.push({
        label: 'Record decision',
        icon: 'gavel',
        onClick: () => openAck(request),
      });
    }
    return actions;
  };

  const detailEntries = detailTarget
    ? Object.entries(detailTarget.details ?? {}).sort(([a], [b]) =>
        a.localeCompare(b),
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            IDP Change Requests
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Review schedule and faculty changes raised by the Institutional
            Data Platform.
          </p>
          <div className="mt-2">
            {healthQuery.data ? (
              <IntegrationStatus
                inboundReady={healthQuery.data.inboundReady}
                outboundReady={healthQuery.data.outboundReady}
              />
            ) : healthQuery.isError ? (
              <IntegrationStatus
                inboundReady={false}
                outboundReady={false}
                failed
              />
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => requestsQuery.refetch()}
          disabled={requestsQuery.isFetching}
          aria-label="Refresh change requests"
          title="Refresh"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-variant bg-surface-container-lowest text-on-surface-variant transition hover:border-primary/40 hover:text-on-surface disabled:opacity-50"
        >
          <Icon
            name="refresh"
            size={18}
            className={requestsQuery.isFetching ? 'animate-spin' : ''}
          />
        </button>
      </div>

      {requestsQuery.isError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          <Icon name="error" size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1">
            {apiErrorMessage(
              requestsQuery.error,
              'Could not load IDP change requests.',
            )}
          </span>
          <button
            type="button"
            onClick={() => requestsQuery.refetch()}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-4">
        <div className="flex gap-2 overflow-x-auto border-b border-surface-variant">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={clsx(
                '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition',
                statusFilter === tab.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface',
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-60">
                ({counts[tab.value]})
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Request ID, faculty, subject, details, or notes…"
              className="w-full rounded-lg border border-surface-variant bg-surface-container-low py-2 pl-9 pr-9 text-sm focus:border-primary focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="idp-change-type"
              className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
            >
              Type
            </label>
            <select
              id="idp-change-type"
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as '' | IdpChangeRequestType)
              }
              className="rounded-lg border border-surface-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">All types</option>
              {IDP_CHANGE_REQUEST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="idp-change-limit"
              className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
            >
              Rows
            </label>
            <select
              id="idp-change-limit"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="rounded-lg border border-surface-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {LIMIT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto whitespace-nowrap text-xs text-on-surface-variant">
            Showing{' '}
            <strong className="text-on-surface">{filtered.length}</strong> of{' '}
            {requests.length} loaded
          </div>
        </div>
      </div>

      <ResponsiveTable
        columns={columns}
        rows={filtered}
        rowKey={(request) => request.idp_request_id}
        rowTitle={(request) => request.idp_request_id}
        rowSubtitle={summarizeRequest}
        isLoading={requestsQuery.isLoading}
        hasSourceRows={requests.length > 0}
        emptyMessage="No change requests have been received from IDP yet."
        noMatchMessage="No change requests match your filters."
        emptyIcon="cloud_sync"
        emptyAction={
          <button
            type="button"
            onClick={() => requestsQuery.refetch()}
            className="rounded-lg border border-surface-variant px-4 py-2 text-sm font-semibold text-on-surface transition hover:bg-surface-container-low"
          >
            Check again
          </button>
        }
        getActions={getActions}
        onRowClick={(request) => setDetailTarget(request)}
      />

      <div className="flex gap-2 rounded-xl border border-surface-variant bg-surface-container-low p-3 text-xs text-on-surface-variant">
        <Icon name="info" size={16} className="mt-0.5 shrink-0" />
        <p>
          Acknowledging records the reviewer decision for IDP. Apply the
          underlying schedule or faculty change in the relevant CoE-NNECT
          screen; an IDP request never mutates live data automatically.
        </p>
      </div>

      {/* ── Detail modal ── */}
      <Modal
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.idp_request_id ?? 'Change request'}
        description={
          detailTarget
            ? `${TYPE_LABELS[detailTarget.type] ?? detailTarget.type} · received ${formatDateTime(
                detailTarget.received_at,
              )}`
            : undefined
        }
        size="lg"
        footer={
          detailTarget && (
            <>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
              {detailTarget.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => openAck(detailTarget)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
                >
                  <Icon name="gavel" size={16} />
                  Record decision
                </button>
              )}
            </>
          )
        }
      >
        {detailTarget && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={STATUS_TONE[detailTarget.status]}>
                  <span className="capitalize">{detailTarget.status}</span>
                </StatusBadge>
                <StatusBadge
                  tone={SEVERITY_TONE[detailTarget.severity] ?? 'neutral'}
                >
                  <span className="capitalize">{detailTarget.severity}</span>
                </StatusBadge>
                <StatusBadge
                  tone={detailTarget.requires_ack ? 'info' : 'neutral'}
                >
                  {detailTarget.requires_ack
                    ? 'Ack required'
                    : 'No ack required'}
                </StatusBadge>
              </div>
              <button
                type="button"
                onClick={() => void copyId(detailTarget.idp_request_id)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
                aria-label="Copy request ID"
                title="Copy request ID"
              >
                <Icon
                  name={
                    copiedId === detailTarget.idp_request_id
                      ? 'check'
                      : 'content_copy'
                  }
                  size={12}
                />
                Copy ID
              </button>
            </div>

            <div className="rounded-xl border border-surface-variant bg-gradient-to-r from-primary/[0.04] via-transparent to-primary/[0.04] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Requested change
              </p>
              <p className="mt-1 text-sm font-semibold text-on-surface">
                {summarizeRequest(detailTarget)}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-surface-variant p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Faculty
                </p>
                <p className="mt-1 text-sm text-on-surface">
                  {facultyLabel(detailTarget)}
                </p>
                {facultyKey(detailTarget) && (
                  <p className="mt-0.5 font-mono text-[11px] text-on-surface-variant">
                    {facultyKey(detailTarget)}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-surface-variant p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Created by IDP
                </p>
                <p
                  className="mt-1 text-sm text-on-surface"
                  title={formatDateTime(detailTarget.created_at)}
                >
                  {relativeTime(detailTarget.created_at)}
                </p>
                <p className="mt-0.5 text-[11px] text-on-surface-variant">
                  {formatDateTime(detailTarget.created_at)}
                </p>
              </div>

              {detailTarget.affected_dates.length > 0 && (
                <div className="rounded-lg border border-surface-variant p-3 sm:col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Affected dates
                  </p>
                  <p className="mt-1 text-sm text-on-surface">
                    {detailTarget.affected_dates.join(', ')}
                  </p>
                </div>
              )}
            </div>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Details
              </h3>
              {detailEntries.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  No additional details were provided.
                </p>
              ) : (
                <dl className="divide-y divide-surface-variant rounded-lg border border-surface-variant">
                  {detailEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[180px_1fr] sm:gap-3"
                    >
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        {prettyKey(key)}
                      </dt>
                      <dd className="min-w-0 text-sm text-on-surface">
                        <DetailValue value={value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            {detailTarget.ack && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Decision
                </h3>
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-surface-variant p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Action
                    </p>
                    <div className="mt-1">
                      <StatusBadge tone={ACK_TONE[detailTarget.ack.action]}>
                        {ACK_LABELS[detailTarget.ack.action]}
                      </StatusBadge>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Acknowledged
                    </p>
                    <p className="mt-1 text-sm text-on-surface">
                      {formatDateTime(detailTarget.ack.acknowledged_at)}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-on-surface">
                      {detailTarget.ack.notes || '—'}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-[11px] text-on-surface-variant">
                      {detailTarget.ack.acknowledged_by
                        ? 'Recorded by a CoE-NNECT reviewer and queued for IDP.'
                        : 'Auto-accepted under contract 4.5. No reviewer was required and no live data was changed.'}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </Modal>

      {/* ── Decision modal ── */}
      <Modal
        open={!!ackTarget}
        onClose={() => {
          if (!ackMutation.isPending) setAckTarget(null);
        }}
        title="Record decision"
        description={ackTarget?.idp_request_id}
        size="md"
        busy={ackMutation.isPending}
        footer={
          <>
            <button
              type="button"
              onClick={() => setAckTarget(null)}
              disabled={ackMutation.isPending}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!ackTarget) return;
                ackMutation.mutate({
                  request: ackTarget,
                  action: ackAction,
                  notes: ackNotes,
                });
              }}
              disabled={!ackTarget || ackMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                name={
                  ackMutation.isPending ? 'progress_activity' : 'gavel'
                }
                size={16}
                className={ackMutation.isPending ? 'animate-spin' : ''}
              />
              {ackMutation.isPending ? 'Recording…' : 'Record decision'}
            </button>
          </>
        }
      >
        {ackTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-surface-variant bg-surface-container-low p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                {TYPE_LABELS[ackTarget.type] ?? ackTarget.type}
              </p>
              <p className="mt-1 text-sm font-semibold text-on-surface">
                {summarizeRequest(ackTarget)}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {facultyLabel(ackTarget)}
                {facultyKey(ackTarget) && ` · ${facultyKey(ackTarget)}`}
              </p>
            </div>

            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
              <p>
                This records a decision for IDP. Apply the underlying change
                in the relevant CoE-NNECT screen separately.
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Decision
              </legend>
              {ACK_OPTIONS.map((option) => {
                const active = ackAction === option.value;
                return (
                  <label
                    key={option.value}
                    className={clsx(
                      'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
                      active
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-surface-variant hover:border-primary/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="idp-ack-action"
                      value={option.value}
                      checked={active}
                      onChange={() => setAckAction(option.value)}
                      className="mt-1 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
                        <Icon
                          name={option.icon}
                          size={16}
                          className="text-primary"
                        />
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-on-surface-variant">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="idp-ack-notes"
                  className="text-xs font-bold uppercase tracking-wider text-on-surface-variant"
                >
                  Notes for IDP
                </label>
                <span className="text-[11px] text-on-surface-variant">
                  {ackNotes.length}/2000
                </span>
              </div>
              <textarea
                id="idp-ack-notes"
                value={ackNotes}
                onChange={(event) =>
                  setAckNotes(event.target.value.slice(0, 2000))
                }
                rows={4}
                placeholder="Optional context echoed to IDP with the decision."
                className="w-full resize-y rounded-lg border border-surface-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
