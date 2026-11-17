import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSchedules,
  fetchActiveTerm,
  updateScheduleStatus,
  type RawSchedule,
} from '../../api/schedule.api';
import { publishIdpSchedule } from '../../api/idp.api';
import {
  fetchUnfinalizeRequests,
  respondToUnfinalizeRequest,
  unfinalizeRequestLabel,
  unfinalizeRequesterName,
  type ScheduleUnfinalizeRequest,
} from '../../api/schedule-unfinalize.api';
import { fetchSections } from '../../api/sections.api';
import { fetchFaculty } from '../../api/faculty.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import StatusBadge from '../../components/ui/StatusBadge';
import { useNavigate } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';

const STATUS_LABELS: Record<
  string,
  { label: string; tone: 'neutral' | 'warning' | 'success' | 'info' }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  review: { label: 'In Review', tone: 'warning' },
  finalized: { label: 'Finalized', tone: 'success' },
  published: { label: 'Published', tone: 'info' },
};

type TabFilter = 'review' | 'finalized' | 'all';
type StatusFilter = 'all' | 'draft' | 'review' | 'finalized' | 'published';
type BatchAction = 'finalize' | 'publish' | 'unfinalize-published';

const STATUS_VALUES: StatusFilter[] = [
  'all',
  'draft',
  'review',
  'finalized',
  'published',
];

interface PendingConfirmation {
  action: BatchAction | 'return-to-draft';
  ids: string[];
  /** Short human label for the modal title, e.g. "3 schedules". */
  itemCount: number;
}

interface RequestDecision {
  request: ScheduleUnfinalizeRequest;
  action: 'approve' | 'reject';
}

export default function DeanApprovalsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStatusParam = searchParams.get('status');
  const initialStatusFilter: StatusFilter = STATUS_VALUES.includes(
    initialStatusParam as StatusFilter,
  )
    ? (initialStatusParam as StatusFilter)
    : 'all';
  const initialTab: TabFilter =
    initialStatusFilter === 'finalized' || initialStatusFilter === 'published'
      ? 'finalized'
      : 'review';

  const [tab, setTab] = useState<TabFilter>(initialTab);
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>(initialStatusFilter);
  const initialDeptFilter = searchParams.get('deptFilter') ?? '';
  const [deptFilter, setDeptFilter] = useState(initialDeptFilter);

  // Sync URL when dept filter changes (for shareable links + back button)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (deptFilter) {
      next.set('deptFilter', deptFilter);
    } else {
      next.delete('deptFilter');
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptFilter]);
  const [sectionFilter, setSectionFilter] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [idpPublishPending, setIdpPublishPending] = useState(false);

  // ── Published-unfinalize requests ──
  const [requestDecision, setRequestDecision] =
    useState<RequestDecision | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const deepLinkHandledRef = useRef<string | null>(null);
  const deepLinkRequestId = searchParams.get('request');

  const closeRequestDecision = useCallback(() => {
    setRequestDecision(null);
    setDecisionRemarks('');
    setDecisionError(null);
    if (searchParams.get('request')) {
      const next = new URLSearchParams(searchParams);
      next.delete('request');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Keep `?status=` in the URL so shared links and bell deep links land on the
  // same filtered view.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (statusFilter !== 'all') {
      next.set('status', statusFilter);
    } else {
      next.delete('status');
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Follow status changes that arrive from the URL (notification deep links).
  const statusParam = searchParams.get('status');
  useEffect(() => {
    if (!statusParam) return;
    if (!STATUS_VALUES.includes(statusParam as StatusFilter)) return;
    const nextStatus = statusParam as StatusFilter;
    setStatusFilter(nextStatus);
    if (nextStatus === 'finalized' || nextStatus === 'published') {
      setTab('finalized');
    }
  }, [statusParam]);

  // ── Batch selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingConfirmation | null>(null);

  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
  });

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!activeTerm?.termId,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: fetchSections,
    enabled: !!activeTerm?.termId,
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ['faculty'],
    queryFn: () => fetchFaculty(false),
    enabled: !!activeTerm?.termId,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
    enabled: !!activeTerm?.termId,
  });

  // Deliberately not scoped to the active term: the Dean's inbox must surface
  // requests for any term, and bell deep links do not carry a term id.
  const {
    data: unfinalizeRequests = [],
    isLoading: requestsLoading,
  } = useQuery({
    queryKey: ['schedule-unfinalize-requests'],
    queryFn: () => fetchUnfinalizeRequests(),
    staleTime: 15_000,
  });

  const pendingRequests = useMemo(
    () => unfinalizeRequests.filter((r) => r.status === 'pending'),
    [unfinalizeRequests],
  );

  // `?request=<id>` from the bell opens the decision dialog for that request.
  useEffect(() => {
    if (!deepLinkRequestId) {
      deepLinkHandledRef.current = null;
      return;
    }
    if (deepLinkHandledRef.current === deepLinkRequestId) return;
    const match = unfinalizeRequests.find(
      (r) => String(r.requestId) === deepLinkRequestId,
    );
    if (!match) return;
    deepLinkHandledRef.current = deepLinkRequestId;
    if (match.status === 'pending') {
      setRequestDecision({ request: match, action: 'approve' });
      setDecisionRemarks('');
      setDecisionError(null);
    } else {
      setActionError(`That unfinalize request is already ${match.status}.`);
    }
  }, [deepLinkRequestId, unfinalizeRequests]);

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'draft' | 'review' | 'finalized' | 'published';
    }) => updateScheduleStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      qc.invalidateQueries({ queryKey: ['schedule-unfinalize-requests'] });
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(
        err?.response?.data?.message ?? 'Action failed. Please try again.',
      );
    },
  });

  const requestDecisionMutation = useMutation({
    mutationFn: ({
      request,
      action,
      remarks,
    }: {
      request: ScheduleUnfinalizeRequest;
      action: 'approve' | 'reject';
      remarks: string;
    }) => respondToUnfinalizeRequest(request.requestId, action, remarks),
    onSuccess: (saved, variables) => {
      const label = unfinalizeRequestLabel(saved);
      qc.invalidateQueries({ queryKey: ['schedules'] });
      qc.invalidateQueries({ queryKey: ['schedule-unfinalize-requests'] });
      qc.invalidateQueries({
        queryKey: ['schedule-unfinalize-request', saved.scheduleId],
      });
      qc.invalidateQueries({ queryKey: ['flagged'] });
      qc.invalidateQueries({ queryKey: ['coverage'] });
      setActionError(null);
      setActionSuccess(
        variables.action === 'approve'
          ? `Approved — ${label} is back in Draft and removed from the public schedule.`
          : `Rejected — ${label} stays Published.`,
      );
      closeRequestDecision();
    },
    onError: (err: any) => {
      setDecisionError(
        err?.response?.data?.message ??
          err?.message ??
          'The decision could not be saved.',
      );
    },
  });

  // ── Clear success message after 3s ──
  useEffect(() => {
    if (!actionSuccess) return;
    const t = setTimeout(() => setActionSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [actionSuccess]);

  // ── Dept lookup (subject → dept) ──
  const deptById = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const d of departments) {
      m.set(String(d.deptId), { code: d.deptCode, name: d.deptName });
    }
    return m;
  }, [departments]);

  const getDeptOfSchedule = (s: RawSchedule) =>
    s.subject?.deptId ? deptById.get(String(s.subject.deptId)) : null;

  // ── Tab filtering ──
  const tabFiltered = useMemo(() => {
    if (tab === 'review') return schedules.filter((s) => s.status === 'review');
    if (tab === 'finalized')
      return schedules.filter(
        (s) => s.status === 'finalized' || s.status === 'published',
      );
    return schedules;
  }, [schedules, tab]);

  // ── Secondary filters ──
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tabFiltered.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (deptFilter && String(s.subject?.deptId ?? '') !== deptFilter) {
        return false;
      }
      if (sectionFilter && (s.section ?? '') !== sectionFilter) return false;
      if (facultyFilter && String(s.facultyId ?? '') !== facultyFilter) {
        return false;
      }
      if (q) {
        const subjCode = (s.subject?.subjectCode ?? '').toLowerCase();
        const subjTitle = (s.subject?.title ?? '').toLowerCase();
        if (!subjCode.includes(q) && !subjTitle.includes(q)) return false;
      }
      return true;
    });
  }, [
    tabFiltered,
    statusFilter,
    deptFilter,
    sectionFilter,
    facultyFilter,
    searchQuery,
  ]);

  // ── Selection ──
  // Clear selection when tab changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  // Only keep selected ids that are still visible in `filtered`.
  const effectiveSelectedIds = useMemo(() => {
    const visibleIds = new Set(filtered.map((s) => s.scheduleId));
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visibleIds.has(id)) next.add(id);
    }
    return next;
  }, [filtered, selectedIds]);

  // ── Selected rows breakdown ──
  const selectedRows = useMemo(
    () => filtered.filter((s) => effectiveSelectedIds.has(s.scheduleId)),
    [filtered, effectiveSelectedIds],
  );

  const selectedPendingCount = selectedRows.filter(
    (s) => s.status === 'review',
  ).length;
  const selectedFinalizedCount = selectedRows.filter(
    (s) => s.status === 'finalized',
  ).length;
  const selectedPublishedCount = selectedRows.filter(
    (s) => s.status === 'published',
  ).length;

  const reviewCount = schedules.filter((s) => s.status === 'review').length;
  const finalizedCount = schedules.filter(
    (s) => s.status === 'finalized' || s.status === 'published',
  ).length;

  const hasAnyFilter =
    !!searchQuery ||
    statusFilter !== 'all' ||
    !!deptFilter ||
    !!sectionFilter ||
    !!facultyFilter;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDeptFilter('');
    setSectionFilter('');
    setFacultyFilter('');
  };

  const sendActiveTermToIdp = async () => {
    if (!activeTerm?.semester) {
      setActionError(
        'The active term has no semester configured, so the IDP schedule could not be queued.',
      );
      return;
    }

    setIdpPublishPending(true);
    setActionError(null);
    try {
      const result = await publishIdpSchedule(
        `${activeTerm.schoolYear}-${activeTerm.semester}`,
      );
      setActionSuccess(
        `Term schedule queued for IDP (${result.entryCount} entries).`,
      );
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message ??
          err?.message ??
          'The IDP schedule could not be queued.',
      );
    } finally {
      setIdpPublishPending(false);
    }
  };

  // ── Batch / single action handlers ──
  const openConfirm = (action: BatchAction | 'return-to-draft', ids: string[]) => {
    if (ids.length === 0) return;
    setPendingConfirm({
      action,
      ids,
      itemCount: ids.length,
    });
  };

  const closeConfirm = () => setPendingConfirm(null);

  const performAction = useCallback(
    async (action: BatchAction | 'return-to-draft', ids: string[]) => {
      if (ids.length === 0) return;
      const nextStatus: 'draft' | 'finalized' | 'published' =
        action === 'finalize'
          ? 'finalized'
          : action === 'publish'
          ? 'published'
          : 'draft';

      // Run all updates, collecting successes and failures.
      const results = await Promise.allSettled(
        ids.map((id) =>
          updateScheduleStatus(id, nextStatus).then(() => id),
        ),
      );

      const succeeded = results
        .filter(
          (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled',
        )
        .map((r) => r.value);

      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      qc.invalidateQueries({ queryKey: ['schedules'] });
      qc.invalidateQueries({ queryKey: ['schedule-unfinalize-requests'] });
      qc.invalidateQueries({ queryKey: ['flagged'] });
      qc.invalidateQueries({ queryKey: ['coverage'] });

      let idpPublishResult:
        | Awaited<ReturnType<typeof publishIdpSchedule>>
        | undefined;
      let idpPublishError: string | undefined;
      if (action === 'publish' && succeeded.length > 0) {
        if (!activeTerm?.semester) {
          idpPublishError =
            'The active term has no semester configured, so the IDP schedule could not be queued.';
        } else {
          try {
            idpPublishResult = await publishIdpSchedule(
              `${activeTerm.schoolYear}-${activeTerm.semester}`,
            );
          } catch (err: any) {
            idpPublishError =
              err?.response?.data?.message ??
              err?.message ??
              'The IDP schedule could not be queued.';
          }
        }
      }

      // Clear the successful ones from the selection.
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of succeeded) next.delete(id);
        return next;
      });

      if (failures.length === 0) {
        const verb =
          action === 'finalize'
            ? 'Finalized'
            : action === 'publish'
            ? 'Published'
            : action === 'unfinalize-published'
            ? 'Unfinalized'
            : 'Returned to draft';
        setActionSuccess(
          `${verb} ${succeeded.length} schedule${
            succeeded.length === 1 ? '' : 's'
          }.${
            idpPublishResult?.queued
              ? ` Term schedule queued for IDP (${idpPublishResult.entryCount} entries).`
              : ''
          }`,
        );
        setActionError(
          idpPublishError
            ? `Schedules were published in CoE-NNECT, but IDP queueing failed: ${idpPublishError}`
            : null,
        );
      } else {
        setActionError(
          `${succeeded.length} succeeded, ${failures.length} failed. ${
            failures[0].reason?.response?.data?.message ??
            failures[0].reason?.message ??
            ''
          }${
            idpPublishError ? ` IDP queueing failed: ${idpPublishError}` : ''
          }`.trim(),
        );
      }
    },
    [qc, activeTerm],
  );

  const handleConfirm = useCallback(async () => {
    if (!pendingConfirm) return;
    const { action, ids } = pendingConfirm;
    closeConfirm();
    await performAction(action, ids);
  }, [pendingConfirm, performAction]);

  const handleBatch = (action: BatchAction | 'return-to-draft') => {
    openConfirm(action, Array.from(effectiveSelectedIds));
  };

  // ── Columns ──
  const columns: Column<RawSchedule>[] = [
    {
      key: 'subject',
      header: 'Subject',
      cardVariant: 'title',
      cellClassName: 'font-semibold text-slate-900',
      render: (s) => s.subject?.subjectCode ?? 'Unknown',
    },
    {
      key: 'dept',
      header: 'Dept',
      cardVariant: 'badge',
      render: (s) => {
        const dept = getDeptOfSchedule(s);
        if (!dept) {
          return <span className="text-xs text-slate-400 italic">—</span>;
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 font-mono">
            {dept.code}
          </span>
        );
      },
    },
    {
      key: 'title',
      header: 'Title',
      cardVariant: 'subtitle',
      hideOnMobile: true,
      cellClassName: 'text-xs text-slate-400 truncate max-w-[160px]',
      render: (s) => s.subject?.title ?? '—',
    },
    {
      key: 'section',
      header: 'Section',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-slate-600 font-mono',
      render: (s) => s.section ?? '—',
    },
    {
      key: 'faculty',
      header: 'Faculty',
      cardVariant: 'meta',
      cellClassName: 'text-slate-700 text-xs',
      render: (s) =>
        s.faculty
          ? `${s.faculty.firstName} ${s.faculty.lastName}`
          : 'Unassigned',
    },
    {
      key: 'schedule',
      header: 'Schedule',
      cardVariant: 'mono',
      cellClassName: 'text-xs text-slate-600',
      render: (s) => {
        const day = s.timeSlot?.dayOfWeek ?? s.dayOfWeek ?? '—';
        const start = s.timeSlot?.startTime ?? s.startTime ?? '';
        const end = s.timeSlot?.endTime ?? s.endTime ?? '';
        return `${day} ${start}${end ? ` – ${end}` : ''}`;
      },
    },
    {
      key: 'room',
      header: 'Room',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-slate-600',
      render: (s) =>
        s.room ? `${s.room.building} ${s.room.roomNumber}` : 'No room',
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (s) => {
        const st = STATUS_LABELS[s.status] ?? STATUS_LABELS.draft;
        return <StatusBadge tone={st.tone}>{st.label}</StatusBadge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (s: RawSchedule): RowAction[] => {
    const isPending = statusMutation.isPending;
    if (s.status === 'review') {
      return [
        {
          label: 'Finalize',
          icon: 'check_circle',
          onClick: () =>
            statusMutation.mutate({ id: s.scheduleId, status: 'finalized' }),
          disabled: isPending,
        },
        {
          label: 'Return to Draft',
          icon: 'undo',
          // Wrap in confirmation — this is destructive and irreversible.
          onClick: () => openConfirm('return-to-draft', [s.scheduleId]),
          disabled: isPending,
        },
      ];
    }
    if (s.status === 'finalized') {
      return [
        {
          label: 'Publish',
          icon: 'publish',
          // Wrap in confirmation — cannot be un-published.
          onClick: () => openConfirm('publish', [s.scheduleId]),
          disabled: isPending,
        },
      ];
    }
    if (s.status === 'published') {
      return [
        {
          label: 'Unfinalize',
          icon: 'lock_open',
          // A published entry is public; the Dean is the only role that can
          // pull it back to Draft directly.
          onClick: () => openConfirm('unfinalize-published', [s.scheduleId]),
          disabled: isPending,
        },
      ];
    }
    return [];
  };

  // ── Confirmation copy per action ──
  const getConfirmCopy = (action: BatchAction | 'return-to-draft', count: number) => {
    const noun = count === 1 ? 'schedule' : 'schedules';
    switch (action) {
      case 'finalize':
        return {
          title: `Finalize ${count} ${noun}?`,
          body: `This will move ${count} ${noun} to Finalized status. They'll be locked from further edits until unfinalized.`,
          confirmLabel: count === 1 ? 'Finalize' : `Finalize ${count}`,
          tone: 'primary' as const,
        };
      case 'publish':
        return {
          title: `Publish ${count} ${noun}?`,
          body: `This will publish ${count} ${noun} for all departments and queue the term's finalized schedule for IDP. Publishing cannot be undone.`,
          confirmLabel: count === 1 ? 'Publish' : `Publish ${count}`,
          tone: 'primary' as const,
        };
      case 'return-to-draft':
        return {
          title: `Return ${count} ${noun} to draft?`,
          body: `This will remove ${count} ${noun} from review and set them back to Draft. Any pending approvals will be cancelled.`,
          confirmLabel:
            count === 1 ? 'Return to Draft' : `Return ${count} to Draft`,
          tone: 'danger' as const,
        };
      case 'unfinalize-published':
        return {
          title: `Unfinalize ${count} published ${noun}?`,
          body: `This removes ${count} published ${noun} from the public planner and the IDP feed and sets them back to Draft. Any pending unfinalize request for them is closed.`,
          confirmLabel:
            count === 1 ? 'Unfinalize' : `Unfinalize ${count}`,
          tone: 'danger' as const,
        };
    }
  };

  const confirmCopy = pendingConfirm
    ? getConfirmCopy(pendingConfirm.action, pendingConfirm.itemCount)
    : null;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5 flex items-start justify-between gap-3 flex-wrap" data-tour="dean-approvals-header">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Schedule Approvals
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review and finalize department schedules.
            {activeTerm && ` · ${activeTerm.termName} ${activeTerm.schoolYear}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reviewCount > 0 && (
            <span className="text-sm font-bold px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200">
              {reviewCount} pending
            </span>
          )}
          {activeTerm && (
            <button
              type="button"
              onClick={sendActiveTermToIdp}
              disabled={idpPublishPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 text-xs font-semibold"
            >
              <Icon name="publish" size={14} />
              {idpPublishPending ? 'Sending to IDP…' : 'Send to IDP'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-800"
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-2">
          <Icon name="check_circle" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{actionSuccess}</span>
        </div>
      )}

      {/* ── Published unfinalize requests ── */}
      {(requestsLoading || pendingRequests.length > 0) && (
        <section
          className="border border-amber-200 bg-amber-50/50"
          aria-label="Published unfinalize requests"
        >
          <div className="border-b border-amber-200 px-4 py-3">
            <div className="flex items-start gap-2">
              <Icon
                name="pending_actions"
                size={18}
                className="mt-0.5 shrink-0 text-amber-700"
              />
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold text-amber-900">
                  Published unfinalize requests
                  {pendingRequests.length > 0 && (
                    <span className="inline-flex min-w-[20px] items-center justify-center bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                      {pendingRequests.length}
                    </span>
                  )}
                </h2>
                <p className="mt-0.5 text-xs text-amber-800">
                  Approving returns the entry to Draft and removes it from the
                  public planner and the IDP feed.
                </p>
              </div>
            </div>
          </div>

          {requestsLoading ? (
            <p className="px-4 py-4 text-xs text-amber-800">
              Loading requests…
            </p>
          ) : (
            <ul className="divide-y divide-amber-200">
              {pendingRequests.map((request) => {
                const dept = request.schedule?.deptId
                  ? deptById.get(String(request.schedule.deptId))
                  : null;
                return (
                  <li
                    key={request.requestId}
                    className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {unfinalizeRequestLabel(request)}
                        </span>
                        {dept && (
                          <span className="inline-flex items-center border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-900">
                            {dept.code}
                          </span>
                        )}
                        {request.schedule?.term?.termName && (
                          <span className="text-[11px] font-medium text-amber-900">
                            {request.schedule.term.termName}
                          </span>
                        )}
                        <span className="text-[11px] text-amber-800">
                          {new Date(request.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Requested by{' '}
                        <strong className="text-slate-800">
                          {unfinalizeRequesterName(request)}
                        </strong>
                      </p>
                      <p className="mt-1 break-words text-xs italic text-slate-700">
                        “{request.reason}”
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRequestDecision({
                            request,
                            action: 'approve',
                          });
                          setDecisionRemarks('');
                          setDecisionError(null);
                        }}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                      >
                        <Icon name="check_circle" size={14} />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRequestDecision({
                            request,
                            action: 'reject',
                          });
                          setDecisionRemarks('');
                          setDecisionError(null);
                        }}
                        className="inline-flex items-center gap-1.5 border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                      >
                        <Icon name="cancel" size={14} />
                        Reject
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200" data-tour="dean-approvals-tabs">
        {(
          [
            { id: 'review', label: `Pending Review (${reviewCount})` },
            { id: 'finalized', label: `Finalized (${finalizedCount})` },
            { id: 'all', label: `All (${schedules.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      {activeTerm && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-3" data-tour="dean-approvals-filters">
          <div className="flex flex-wrap items-end gap-3">
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
                  placeholder="Subject code or title…"
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="min-w-[180px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Department
              </label>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">All departments</option>
                {departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName}
                    </option>
                  ))}
              </select>
            </div>

            <div className="min-w-[140px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="review">In Review</option>
                <option value="finalized">Finalized</option>
                <option value="published">Published</option>
              </select>
            </div>

            <div className="min-w-[150px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Section
              </label>
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">All sections</option>
                {sections
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.sectionId} value={s.sectionCode}>
                      {s.sectionCode}
                    </option>
                  ))}
              </select>
            </div>

            <div className="min-w-[180px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Faculty
              </label>
              <select
                value={facultyFilter}
                onChange={(e) => setFacultyFilter(e.target.value)}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">All faculty</option>
                {faculty
                  .filter((f) => f.isActive)
                  .map((f) => (
                    <option key={f.facultyId} value={f.facultyId}>
                      {f.lastName}, {f.firstName}
                    </option>
                  ))}
              </select>
            </div>

            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition flex items-center gap-1.5"
              >
                <Icon name="close" size={14} />
                Clear all
              </button>
            )}

            <div className="ml-auto text-xs text-on-surface-variant whitespace-nowrap">
              Showing{' '}
              <strong className="text-on-surface">{filtered.length}</strong> of{' '}
              {tabFiltered.length}
            </div>
          </div>
        </div>
      )}

      {!activeTerm ? (
        <div className="bg-white border border-slate-200 p-10 text-center">
          <Icon name="event_busy" className="text-slate-300 text-4xl mb-3" />
          <p className="text-sm font-semibold text-slate-600">No active term</p>
          <p className="text-xs text-slate-400 mt-1">
            Schedules can only be reviewed during an active term.
          </p>
        </div>
      ) : (
        <div data-tour="dean-approvals-table">
          <ResponsiveTable
            columns={columns}
            rows={filtered}
            rowKey={(s) => s.scheduleId}
            rowTitle={(s) => s.subject?.subjectCode ?? 'Schedule'}
            rowSubtitle={(s) => {
              const dept = getDeptOfSchedule(s);
              const fac = s.faculty
                ? `${s.faculty.firstName} ${s.faculty.lastName}`
                : 'Unassigned';
              return dept ? `[${dept.code}] ${fac}` : fac;
            }}
            isLoading={isLoading}
            hasSourceRows={schedules.length > 0}
            emptyMessage={
              tab === 'review'
                ? 'No pending approvals — all schedules are up to date.'
                : 'No schedules yet.'
            }
            noMatchMessage="No schedules match your filters."
            getActions={getActions}
            selectable
            selectedKeys={effectiveSelectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={(s) =>
              navigate(`/dean/timetable?focus=${s.scheduleId}`)
            }
          />
        </div>
      )}

      {/* ── Floating BulkActionBar ── */}
      {effectiveSelectedIds.size > 0 && (
        <div className="fixed above-bottom-nav left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4">
          <div className="bg-slate-900 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 font-bold text-sm tabular-nums">
                {effectiveSelectedIds.size}
              </span>
              <span className="text-sm font-semibold whitespace-nowrap">
                selected
              </span>
            </div>

            <div className="flex-1 flex items-center gap-2 ml-2 flex-wrap">
              {selectedPendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleBatch('finalize')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                >
                  <Icon name="check_circle" size={14} />
                  Finalize {selectedPendingCount}
                </button>
              )}
              {selectedFinalizedCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleBatch('publish')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                >
                  <Icon name="publish" size={14} />
                  Publish {selectedFinalizedCount}
                </button>
              )}
              {selectedPublishedCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleBatch('unfinalize-published')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition"
                >
                  <Icon name="lock_open" size={14} />
                  Unfinalize {selectedPublishedCount}
                </button>
              )}
              {selectedPendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleBatch('return-to-draft')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                >
                  <Icon name="undo" size={14} />
                  Return to Draft
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition shrink-0"
              aria-label="Clear selection"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal ── */}
      <Modal
        open={!!pendingConfirm}
        onClose={closeConfirm}
        title={confirmCopy?.title ?? ''}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={closeConfirm}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition ${
                confirmCopy?.tone === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-primary hover:opacity-90'
              }`}
            >
              {confirmCopy?.confirmLabel}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{confirmCopy?.body}</p>
      </Modal>

      {/* ── Unfinalize request decision modal ── */}
      <Modal
        open={!!requestDecision}
        onClose={closeRequestDecision}
        title={
          requestDecision?.action === 'approve'
            ? 'Approve unfinalize request?'
            : 'Reject unfinalize request?'
        }
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={closeRequestDecision}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                requestDecision &&
                requestDecisionMutation.mutate({
                  request: requestDecision.request,
                  action: requestDecision.action,
                  remarks: decisionRemarks.trim(),
                })
              }
              disabled={requestDecisionMutation.isPending}
              className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50 ${
                requestDecision?.action === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {requestDecisionMutation.isPending
                ? 'Saving…'
                : requestDecision?.action === 'approve'
                ? 'Approve & unfinalize'
                : 'Reject request'}
            </button>
          </>
        }
      >
        {requestDecision && (
          <div className="space-y-3">
            <div className="border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">
                {unfinalizeRequestLabel(requestDecision.request)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Requested by{' '}
                {unfinalizeRequesterName(requestDecision.request)} ·{' '}
                {new Date(
                  requestDecision.request.createdAt,
                ).toLocaleString()}
                {requestDecision.request.schedule?.term?.termName
                  ? ` · ${requestDecision.request.schedule.term.termName}`
                  : ''}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Reason
              </p>
              <p className="mt-1 break-words text-sm text-slate-700">
                {requestDecision.request.reason}
              </p>
            </div>

            <p className="text-sm text-slate-600">
              {requestDecision.action === 'approve'
                ? 'Approving sets the entry back to Draft and removes it from the public planner and the IDP feed.'
                : 'Rejecting keeps the entry Published. The requester is notified with your remarks.'}
            </p>

            {decisionError && (
              <div className="flex items-start gap-2 border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                <Icon name="error" size={14} className="mt-0.5 shrink-0" />
                <span className="flex-1">{decisionError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="unfinalize-decision-remarks"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"
              >
                Remarks{' '}
                {requestDecision.action === 'approve'
                  ? '(optional)'
                  : '(recommended)'}
              </label>
              <textarea
                id="unfinalize-decision-remarks"
                value={decisionRemarks}
                onChange={(e) => setDecisionRemarks(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={
                  requestDecision.action === 'approve'
                    ? 'e.g. Room reassignment confirmed with the registrar'
                    : 'e.g. Keep published until the affected classes are moved'
                }
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {decisionRemarks.length}/500
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}