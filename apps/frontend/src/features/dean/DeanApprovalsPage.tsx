import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSchedules,
  fetchActiveTerm,
  updateScheduleStatus,
  type EditableScheduleStatus,
  type RawSchedule,
} from '../../api/schedule.api';
import { getScheduleDeptId } from '../../api/schedule-ownership';
import { publishIdpSchedule } from '../../api/idp.api';
import {
  fetchUnfinalizeRequests,
  respondToUnfinalizeRequest,
  unfinalizeRequestLabel,
  unfinalizeRequesterName,
} from '../../api/schedule-unfinalize.api';
import {
  fetchPublishRequests,
  publishRequestLabel,
  publishRequesterName,
  respondToPublishRequest,
} from '../../api/schedule-publish-request.api';
import {
  fetchChangeRequests,
  changeRequestLabel,
  changeRequesterName,
  respondToChangeRequest,
} from '../../api/schedule-change-request.api';
import { fetchSections } from '../../api/sections.api';
import { fetchFaculty } from '../../api/faculty.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import StatusBadge from '../../components/ui/StatusBadge';
import { useSearchParams } from 'react-router-dom';
import { useFeedback } from '../../components/ui/FeedbackToast';
import { extractApiError } from '../../lib/api-error';
import ApprovalDetailDrawer, {
  type ApprovalDrawerTarget,
} from './components/ApprovalDetailDrawer';
import {
  clearRequestDeepLinkParams,
  reviewRowAction,
} from './dean-approval-actions';
import {
  filterRequestRows,
  isPendingRequest,
  REQUEST_KIND_LABELS,
  requestDecisionResultMessage,
  requestKindBreakdown,
  requestSelectionKey,
  type RequestRow,
  type RequestStatusFilter,
} from './dean-request-bulk';
import type { Day, LoadType, ScheduleEntry } from '../timetable/types';

const STATUS_LABELS: Record<
  string,
  { label: string; tone: 'neutral' | 'warning' | 'success' | 'info' }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  review: { label: 'In Review', tone: 'warning' },
  finalized: { label: 'Finalized', tone: 'success' },
  published: { label: 'Published', tone: 'info' },
};

const REQUEST_STATUS_TONES: Record<
  string,
  'neutral' | 'warning' | 'success' | 'danger'
> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

const DAY_MAP: Record<string, Day> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'SUN',
};

type ApprovalTab = 'publish' | 'unfinalize' | 'change' | 'review' | 'finalized' | 'all';
type StatusFilter = 'all' | 'draft' | 'review' | 'finalized' | 'published';
type BatchAction = 'finalize' | 'unfinalize-published';
type RequestDecision = 'approve' | 'reject';
type DeepLinkParam = 'publishRequest' | 'request' | 'changeRequest';

const STATUS_VALUES: StatusFilter[] = [
  'all',
  'draft',
  'review',
  'finalized',
  'published',
];

const REQUEST_STATUS_VALUES: RequestStatusFilter[] = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'all',
];

interface ScheduleConfirmation {
  action: BatchAction | 'return-to-draft';
  ids: string[];
  /** Short human label for the modal title, e.g. "3 schedules". */
  itemCount: number;
}

interface RequestConfirmation {
  action: 'request-decision';
  decision: RequestDecision;
  rows: RequestRow[];
  remarks?: string;
  itemCount: number;
}

type PendingConfirmation = ScheduleConfirmation | RequestConfirmation;

function requestLabel(row: RequestRow): string {
  if (row.kind === 'publish') return publishRequestLabel(row.request);
  if (row.kind === 'unfinalize') return unfinalizeRequestLabel(row.request);
  return changeRequestLabel(row.request);
}

function requestRequester(row: RequestRow): string {
  if (row.kind === 'publish') return publishRequesterName(row.request);
  if (row.kind === 'unfinalize') return unfinalizeRequesterName(row.request);
  return changeRequesterName(row.request);
}

function requestDetail(row: RequestRow): string {
  if (row.kind === 'publish') return row.request.note ?? 'No note provided.';
  return row.request.reason || 'No reason provided.';
}

/** Adapt a RawSchedule row to the shape consumed by ApprovalDetailDrawer. */
function toApprovalScheduleEntry(raw: RawSchedule): ScheduleEntry {
  const day = raw.dayOfWeek ?? raw.timeSlot?.dayOfWeek ?? 'Monday';
  const start = raw.startTime ?? raw.timeSlot?.startTime ?? '07:00:00';
  const end = raw.endTime ?? raw.timeSlot?.endTime ?? '08:00:00';
  return {
    id: raw.scheduleId,
    subjectId: raw.subjectId,
    subjectCode: raw.subject?.subjectCode ?? '—',
    subjectTitle: raw.subject?.title ?? '',
    sectionId: raw.section ?? '',
    sectionCode: raw.section ?? '',
    facultyId: raw.facultyId ?? '',
    facultyName: raw.faculty
      ? `${raw.faculty.firstName} ${raw.faculty.lastName}`
      : raw.externalFacultyName ?? 'Unassigned',
    externalFacultyName: raw.externalFacultyName,
    roomId: raw.roomId ?? '',
    roomNumber: raw.room?.roomNumber ?? '—',
    externalRoomName: raw.externalRoomName,
    pendingFacultyRequestId: raw.pendingFacultyRequestId,
    pendingFacultyDeptId: raw.pendingFacultyDeptId,
    building: raw.room?.building ?? '',
    day: DAY_MAP[day] ?? 'MON',
    startTime: start.slice(0, 5),
    endTime: end.slice(0, 5),
    loadType: (raw.loadType ?? 'lecture') as LoadType,
    deptId: getScheduleDeptId(raw),
    deptColor: '#800000',
    color: '#800000',
    status: raw.status,
    remarks: raw.remarks,
    flagged: raw.flagged,
    flaggedBy: raw.flaggedBy,
    flaggedAt: raw.flaggedAt,
    flagReason: raw.flagReason,
  };
}

export default function DeanApprovalsPage() {
  const qc = useQueryClient();
  const feedback = useFeedback();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStatusParam = searchParams.get('status');
  const initialStatusFilter: StatusFilter = STATUS_VALUES.includes(
    initialStatusParam as StatusFilter,
  )
    ? (initialStatusParam as StatusFilter)
    : 'all';
  const initialTab: ApprovalTab = searchParams.get('changeRequest')
    ? 'change'
    : searchParams.get('publishRequest')
    ? 'publish'
    : searchParams.get('request')
    ? 'unfinalize'
    : initialStatusFilter === 'finalized' || initialStatusFilter === 'published'
    ? 'finalized'
    : 'review';

  const [activeTab, setActiveTab] = useState<ApprovalTab>(initialTab);
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>(initialStatusFilter);
  const [requestStatusFilter, setRequestStatusFilter] =
    useState<RequestStatusFilter>('pending');
  const initialDeptFilter = searchParams.get('deptFilter') ?? '';
  const [deptFilter, setDeptFilter] = useState(initialDeptFilter);
  const [sectionFilter, setSectionFilter] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [idpPublishPending, setIdpPublishPending] = useState(false);
  const [drawerTarget, setDrawerTarget] =
    useState<ApprovalDrawerTarget | null>(null);

  // Each deep link has its own id and its own ref, so a bell link never clears
  // or reopens a different request's drawer.
  const unfinalizeDeepLinkHandledRef = useRef<string | null>(null);
  const publishDeepLinkHandledRef = useRef<string | null>(null);
  const changeDeepLinkHandledRef = useRef<string | null>(null);
  const deepLinkRequestId = searchParams.get('request');
  const deepLinkPublishRequestId = searchParams.get('publishRequest');
  const deepLinkChangeRequestId = searchParams.get('changeRequest');

  // ── Batch selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingConfirmation | null>(null);
  const [requestDecisionPending, setRequestDecisionPending] = useState(false);
  const [requestRemarks, setRequestRemarks] = useState('');

  const clearDeepLinkParam = useCallback(
    (param: DeepLinkParam) => {
      // The unfinalize notification injects ?status=published with ?request=.
      // Both must go together, or the status-follow effect resets the tab after
      // the request param is cleared.
      const next =
        param === 'request'
          ? clearRequestDeepLinkParams(searchParams)
          : new URLSearchParams(searchParams);
      if (param === 'publishRequest') next.delete('publishRequest');
      if (param === 'changeRequest') next.delete('changeRequest');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const closeDrawer = useCallback(() => {
    setDrawerTarget(null);
    if (!drawerTarget || drawerTarget.kind === 'schedule') return;
    if (drawerTarget.kind === 'publish') clearDeepLinkParam('publishRequest');
    else if (drawerTarget.kind === 'unfinalize') clearDeepLinkParam('request');
    else clearDeepLinkParam('changeRequest');
  }, [drawerTarget, clearDeepLinkParam]);

  const handleTabChange = useCallback(
    (next: ApprovalTab) => {
      if (next === activeTab) return;
      closeDrawer();
      setActiveTab(next);
      setSelectedIds(new Set());
    },
    [activeTab, closeDrawer],
  );

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
  const hasRequestDeepLink = !!(
    deepLinkRequestId ||
    deepLinkPublishRequestId ||
    deepLinkChangeRequestId
  );
  useEffect(() => {
    if (!statusParam) return;
    if (!STATUS_VALUES.includes(statusParam as StatusFilter)) return;
    // A request deep link wins over ?status= so the drawer lands on its tab.
    if (hasRequestDeepLink) return;
    const nextStatus = statusParam as StatusFilter;
    setStatusFilter(nextStatus);
    if (nextStatus === 'finalized' || nextStatus === 'published') {
      setActiveTab('finalized');
    } else if (nextStatus === 'review') {
      setActiveTab('review');
    }
  }, [statusParam, hasRequestDeepLink]);

  // Clear selection when switching tabs — request rows are never selectable.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
  });

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
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
    isLoading: unfinalizeRequestsLoading,
  } = useQuery({
    queryKey: ['schedule-unfinalize-requests'],
    queryFn: () => fetchUnfinalizeRequests(),
    staleTime: 15_000,
  });

  const {
    data: publishRequests = [],
    isLoading: publishRequestsLoading,
  } = useQuery({
    queryKey: ['schedule-publish-requests'],
    queryFn: () => fetchPublishRequests(),
    staleTime: 15_000,
  });

  const { data: changeRequests = [], isLoading: changeRequestsLoading } =
    useQuery({
      queryKey: ['schedule-change-requests'],
      queryFn: () => fetchChangeRequests(),
      staleTime: 15_000,
    });

  // `?request=<id>` selects the unfinalize-request tab and opens the drawer.
  useEffect(() => {
    if (!deepLinkRequestId) {
      unfinalizeDeepLinkHandledRef.current = null;
      return;
    }
    if (unfinalizeDeepLinkHandledRef.current === deepLinkRequestId) return;
    const match = unfinalizeRequests.find(
      (r) => String(r.requestId) === deepLinkRequestId,
    );
    if (!match) return;
    unfinalizeDeepLinkHandledRef.current = deepLinkRequestId;
    if (match.status === 'pending') {
      setActiveTab('unfinalize');
      setDrawerTarget({ kind: 'unfinalize', request: match });
    } else {
      feedback.error(`That unfinalize request is already ${match.status}.`);
      clearDeepLinkParam('request');
    }
  }, [deepLinkRequestId, unfinalizeRequests, feedback, clearDeepLinkParam]);

  // `?publishRequest=<id>` has its own param and never touches `?request=`.
  useEffect(() => {
    if (!deepLinkPublishRequestId) {
      publishDeepLinkHandledRef.current = null;
      return;
    }
    if (publishDeepLinkHandledRef.current === deepLinkPublishRequestId) return;
    const match = publishRequests.find(
      (r) => String(r.requestId) === deepLinkPublishRequestId,
    );
    if (!match) return;
    publishDeepLinkHandledRef.current = deepLinkPublishRequestId;
    if (match.status === 'pending') {
      setActiveTab('publish');
      setDrawerTarget({ kind: 'publish', request: match });
    } else {
      feedback.error(`That publish request is already ${match.status}.`);
      clearDeepLinkParam('publishRequest');
    }
  }, [deepLinkPublishRequestId, publishRequests, feedback, clearDeepLinkParam]);

  // `?changeRequest=<id>` selects the change-request tab and opens the drawer.
  useEffect(() => {
    if (!deepLinkChangeRequestId) {
      changeDeepLinkHandledRef.current = null;
      return;
    }
    if (changeDeepLinkHandledRef.current === deepLinkChangeRequestId) return;
    const match = changeRequests.find(
      (r) => String(r.requestId) === deepLinkChangeRequestId,
    );
    if (!match) return;
    changeDeepLinkHandledRef.current = deepLinkChangeRequestId;
    if (match.status === 'pending') {
      setActiveTab('change');
      setDrawerTarget({ kind: 'change', request: match });
    } else {
      feedback.error(`That change request is already ${match.status}.`);
      clearDeepLinkParam('changeRequest');
    }
  }, [deepLinkChangeRequestId, changeRequests, feedback, clearDeepLinkParam]);

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: EditableScheduleStatus;
    }) => updateScheduleStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      qc.invalidateQueries({ queryKey: ['schedule-unfinalize-requests'] });
      qc.invalidateQueries({ queryKey: ['schedule-publish-requests'] });
      qc.invalidateQueries({ queryKey: ['schedule-change-requests'] });
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Action failed. Please try again.'));
    },
  });

  // ── Dept lookup (subject → dept) ──
  const deptById = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const d of departments) {
      m.set(String(d.deptId), { code: d.deptCode, name: d.deptName });
    }
    return m;
  }, [departments]);

  const getDeptOfSchedule = (s: RawSchedule) => {
    const deptId = getScheduleDeptId(s);
    return deptId ? deptById.get(deptId) : null;
  };

  const getRequestDeptCode = (row: RequestRow) => {
    const deptId = row.request.deptId ?? row.request.schedule?.deptId;
    return deptId ? deptById.get(String(deptId))?.code ?? null : null;
  };

  // ── Tab filtering ──
  const isRequestTab =
    activeTab === 'publish' || activeTab === 'unfinalize' || activeTab === 'change';

  const tabFiltered = useMemo(() => {
    if (activeTab === 'review') return schedules.filter((s) => s.status === 'review');
    if (activeTab === 'finalized')
      return schedules.filter(
        (s) => s.status === 'finalized' || s.status === 'published',
      );
    return schedules;
  }, [schedules, activeTab]);

  const requestRowsByTab = useMemo<RequestRow[]>(() => {
    if (activeTab === 'publish') {
      return publishRequests.map((request) => ({ kind: 'publish' as const, request }));
    }
    if (activeTab === 'unfinalize') {
      return unfinalizeRequests.map((request) => ({
        kind: 'unfinalize' as const,
        request,
      }));
    }
    if (activeTab === 'change') {
      return changeRequests.map((request) => ({ kind: 'change' as const, request }));
    }
    return [];
  }, [activeTab, publishRequests, unfinalizeRequests, changeRequests]);

  const filteredRequests = useMemo(
    () => filterRequestRows(requestRowsByTab, requestStatusFilter, searchQuery, deptFilter),
    [requestRowsByTab, requestStatusFilter, searchQuery, deptFilter],
  );

  const requestsLoadingForTab =
    activeTab === 'publish'
      ? publishRequestsLoading
      : activeTab === 'unfinalize'
      ? unfinalizeRequestsLoading
      : changeRequestsLoading;

  // ── Secondary filters (schedule tabs) ──
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tabFiltered.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (deptFilter && getScheduleDeptId(s) !== deptFilter) {
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

  // Only keep selected ids that are still visible in `filtered`.
  const effectiveSelectedIds = useMemo(() => {
    const visibleIds = new Set(filtered.map((s) => s.scheduleId));
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visibleIds.has(id)) next.add(id);
    }
    return next;
  }, [filtered, selectedIds]);

  const effectiveSelectedRequestRows = useMemo(
    () =>
      filteredRequests.filter((row) => selectedIds.has(requestSelectionKey(row))),
    [filteredRequests, selectedIds],
  );

  const effectiveSelectedRequestKeys = useMemo(
    () => new Set(effectiveSelectedRequestRows.map(requestSelectionKey)),
    [effectiveSelectedRequestRows],
  );

  // ── Selected rows breakdown ──
  const selectedRows = useMemo(
    () => filtered.filter((s) => effectiveSelectedIds.has(s.scheduleId)),
    [filtered, effectiveSelectedIds],
  );

  const selectedPendingCount = selectedRows.filter(
    (s) => s.status === 'review',
  ).length;
  const selectedPublishedCount = selectedRows.filter(
    (s) => s.status === 'published',
  ).length;

  const publishPendingCount = publishRequests.filter(
    (r) => r.status === 'pending',
  ).length;
  const unfinalizePendingCount = unfinalizeRequests.filter(
    (r) => r.status === 'pending',
  ).length;
  const changePendingCount = changeRequests.filter(
    (r) => r.status === 'pending',
  ).length;
  const reviewCount = schedules.filter((s) => s.status === 'review').length;
  const finalizedCount = schedules.filter(
    (s) => s.status === 'finalized' || s.status === 'published',
  ).length;

  const hasAnyFilter =
    !!searchQuery ||
    (isRequestTab
      ? requestStatusFilter !== 'pending'
      : statusFilter !== 'all' ||
        !!deptFilter ||
        !!sectionFilter ||
        !!facultyFilter);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setRequestStatusFilter('pending');
    setDeptFilter('');
    setSectionFilter('');
    setFacultyFilter('');
  };

  const sendActiveTermToIdp = async () => {
    if (!activeTerm?.semester) {
      feedback.error(
        'The active term has no semester configured, so the IDP schedule could not be queued.',
      );
      return;
    }

    setIdpPublishPending(true);
    try {
      const result = await publishIdpSchedule(
        `${activeTerm.schoolYear}-${activeTerm.semester}`,
      );
      feedback.success(
        `Term schedule queued for IDP (${result.entryCount} entries).`,
      );
    } catch (err: unknown) {
      feedback.error(extractApiError(err, 'The IDP schedule could not be queued.'));
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

  const closeConfirm = () => {
    setPendingConfirm(null);
    setRequestRemarks('');
  };

  const performAction = useCallback(
    async (action: BatchAction | 'return-to-draft', ids: string[]) => {
      if (ids.length === 0) return;
      const nextStatus: 'draft' | 'finalized' =
        action === 'finalize' ? 'finalized' : 'draft';

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
      qc.invalidateQueries({ queryKey: ['schedule-publish-requests'] });
      qc.invalidateQueries({ queryKey: ['schedule-change-requests'] });
      qc.invalidateQueries({ queryKey: ['flagged'] });
      qc.invalidateQueries({ queryKey: ['coverage'] });

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
            : action === 'unfinalize-published'
            ? 'Unfinalized'
            : 'Returned to draft';
        feedback.success(
          `${verb} ${succeeded.length} schedule${
            succeeded.length === 1 ? '' : 's'
          }.`,
        );
      } else {
        feedback.failed(
          `${succeeded.length} succeeded, ${failures.length} failed. ${extractApiError(
            failures[0].reason,
            '',
          )}`.trim(),
        );
      }
    },
    [qc, feedback],
  );

  const openRequestConfirm = (decision: RequestDecision) => {
    if (effectiveSelectedRequestRows.length === 0 || requestDecisionPending) return;
    setRequestRemarks('');
    setPendingConfirm({
      action: 'request-decision',
      decision,
      rows: effectiveSelectedRequestRows,
      itemCount: effectiveSelectedRequestRows.length,
    });
  };

  const performRequestDecision = useCallback(
    async (
      decision: RequestDecision,
      rows: RequestRow[],
      remarks?: string,
    ): Promise<void> => {
      if (rows.length === 0) return;
      setRequestDecisionPending(true);
      try {
        const results = await Promise.allSettled(
          rows.map((row) => {
            const requestId = row.request.requestId;
            if (row.kind === 'publish') {
              return respondToPublishRequest(requestId, decision, remarks).then(() =>
                requestSelectionKey(row),
              );
            }
            if (row.kind === 'unfinalize') {
              return respondToUnfinalizeRequest(requestId, decision, remarks).then(
                () => requestSelectionKey(row),
              );
            }
            return respondToChangeRequest(requestId, decision, remarks).then(() =>
              requestSelectionKey(row),
            );
          }),
        );

        const succeededKeys = results
          .filter(
            (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled',
          )
          .map((r) => r.value);
        const failures = results.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );

        qc.invalidateQueries({ queryKey: ['schedule-publish-requests'] });
        qc.invalidateQueries({ queryKey: ['schedule-unfinalize-requests'] });
        qc.invalidateQueries({ queryKey: ['schedule-change-requests'] });

        if (succeededKeys.length > 0) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const key of succeededKeys) next.delete(key);
            return next;
          });
        }

        const message = requestDecisionResultMessage(
          decision,
          succeededKeys.length,
          failures.length,
          failures.length > 0
            ? extractApiError(failures[0].reason, 'Request decision failed.')
            : undefined,
        );
        if (failures.length === 0) {
          feedback.success(message);
        } else {
          feedback.failed(message);
        }
      } finally {
        setRequestDecisionPending(false);
      }
    },
    [feedback, qc],
  );

  const handleConfirm = useCallback(async () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.action === 'request-decision') {
      const { decision, rows } = pendingConfirm;
      const remarks = requestRemarks.trim();
      closeConfirm();
      await performRequestDecision(decision, rows, remarks || undefined);
      return;
    }
    const { action, ids } = pendingConfirm;
    closeConfirm();
    await performAction(action, ids);
  }, [
    pendingConfirm,
    performAction,
    performRequestDecision,
    requestRemarks,
  ]);

  const handleBatch = (action: BatchAction | 'return-to-draft') => {
    openConfirm(action, Array.from(effectiveSelectedIds));
  };

  // ── Columns (schedule tabs) ──
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

  const requestColumns: Column<RequestRow>[] = [
    {
      key: 'subject',
      header: 'Subject',
      cardVariant: 'title',
      cellClassName: 'font-semibold text-slate-900',
      render: (row) => requestLabel(row),
    },
    {
      key: 'kind',
      header: 'Type',
      cardVariant: 'badge',
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
          {REQUEST_KIND_LABELS[row.kind]}
        </span>
      ),
    },
    {
      key: 'dept',
      header: 'Dept',
      cardVariant: 'meta',
      render: (row) => {
        const code = getRequestDeptCode(row);
        return code ? (
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-700">
            {code}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">—</span>
        );
      },
    },
    {
      key: 'requester',
      header: 'Requested by',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-slate-600',
      render: (row) => requestRequester(row),
    },
    {
      key: 'filed',
      header: 'Filed',
      cardVariant: 'mono',
      hideOnMobile: true,
      cellClassName: 'text-xs text-slate-500',
      render: (row) => new Date(row.request.createdAt).toLocaleString(),
    },
    {
      key: 'detail',
      header: rowDetailHeader(activeTab),
      cardVariant: 'subtitle',
      hideOnMobile: true,
      cellClassName: 'text-xs text-slate-500 truncate max-w-[220px]',
      render: (row) => requestDetail(row),
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (row) => {
        const status = row.request.status;
        return (
          <StatusBadge tone={REQUEST_STATUS_TONES[status] ?? 'neutral'}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </StatusBadge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      // ResponsiveTable builds action cells from getActions, not render.
      render: () => null,
    },
  ];

  const getRequestActions = (row: RequestRow): RowAction[] =>
    reviewRowAction(row, setDrawerTarget);

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
  const getConfirmCopy = (confirmation: PendingConfirmation) => {
    const { action, itemCount: count } = confirmation;
    if (action === 'request-decision') {
      const verb = confirmation.decision === 'approve' ? 'Approve' : 'Reject';
      const noun = count === 1 ? 'request' : 'requests';
      return {
        title: `${verb} ${count} ${noun}?`,
        body: `Selected: ${requestKindBreakdown(confirmation.rows)}. ${
          confirmation.decision === 'reject'
            ? 'Remarks are required and will be recorded with each rejection.'
            : 'This will approve every selected pending request.'
        }`,
        confirmLabel: `${verb} ${count}`,
        tone:
          confirmation.decision === 'reject'
            ? ('danger' as const)
            : ('primary' as const),
      };
    }
    const noun = count === 1 ? 'schedule' : 'schedules';
    switch (action) {
      case 'finalize':
        return {
          title: `Finalize ${count} ${noun}?`,
          body: `This will move ${count} ${noun} to Finalized status. They'll be locked from further edits until unfinalized.`,
          confirmLabel: count === 1 ? 'Finalize' : `Finalize ${count}`,
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

  const confirmCopy = pendingConfirm ? getConfirmCopy(pendingConfirm) : null;

  const tabs: { id: ApprovalTab; label: string }[] = [
    { id: 'publish', label: `Publish requests (${publishPendingCount})` },
    { id: 'unfinalize', label: `Unfinalize requests (${unfinalizePendingCount})` },
    { id: 'change', label: `Change requests (${changePendingCount})` },
    { id: 'review', label: `Pending review (${reviewCount})` },
    { id: 'finalized', label: `Finalized & published (${finalizedCount})` },
    { id: 'all', label: `All schedules (${schedules.length})` },
  ];

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5 flex items-start justify-between gap-3 flex-wrap" data-tour="dean-approvals-header">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Schedule Approvals
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review requests and finalize department schedules.
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

      {/* ── Six-tab workspace ── */}
      <div className="flex gap-0 border-b border-slate-200 overflow-x-auto" data-tour="dean-approvals-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
              activeTab === t.id
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

            {isRequestTab ? (
              <div className="min-w-[160px]">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Request status
                </label>
                <select
                  value={requestStatusFilter}
                  onChange={(e) =>
                    setRequestStatusFilter(e.target.value as RequestStatusFilter)
                  }
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  {REQUEST_STATUS_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value.charAt(0).toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
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
                    {STATUS_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {value === 'all'
                          ? 'All'
                          : value === 'review'
                          ? 'In Review'
                          : value.charAt(0).toUpperCase() + value.slice(1)}
                      </option>
                    ))}
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
              </>
            )}

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
              <strong className="text-on-surface">
                {isRequestTab ? filteredRequests.length : filtered.length}
              </strong>{' '}
              of{' '}
              {isRequestTab ? requestRowsByTab.length : tabFiltered.length}
            </div>
          </div>
        </div>
      )}

      {isRequestTab ? (
        <div data-tour="dean-approvals-table">
          <ResponsiveTable<RequestRow>
            columns={requestColumns}
            rows={filteredRequests}
            rowKey={(row) => requestSelectionKey(row)}
            rowTitle={(row) => requestLabel(row)}
            rowSubtitle={(row) =>
              row.request.schedule?.subject?.title ?? 'Schedule entry'
            }
            isLoading={requestsLoadingForTab}
            hasSourceRows={requestRowsByTab.length > 0}
            emptyMessage={`No ${activeTab} requests yet.`}
            noMatchMessage="No requests match your filters."
            getActions={getRequestActions}
            selectable
            selectedKeys={effectiveSelectedRequestKeys}
            onSelectionChange={setSelectedIds}
            isRowSelectable={isPendingRequest}
            onRowClick={(row) => setDrawerTarget(row)}
          />
        </div>
      ) : !activeTerm ? (
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
            isLoading={schedulesLoading}
            hasSourceRows={schedules.length > 0}
            emptyMessage={
              activeTab === 'review'
                ? 'No pending approvals — all schedules are up to date.'
                : 'No schedules yet.'
            }
            noMatchMessage="No schedules match your filters."
            getActions={getActions}
            selectable
            selectedKeys={effectiveSelectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={(s) =>
              setDrawerTarget({ kind: 'schedule', schedule: toApprovalScheduleEntry(s) })
            }
          />
        </div>
      )}

      {/* ── Floating request decision bar — request tabs only ── */}
      {isRequestTab && effectiveSelectedRequestKeys.size > 0 && (
        <div className="fixed above-bottom-nav left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4">
          <div
            role="toolbar"
            aria-label="Bulk request actions"
            className="bg-slate-900 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 font-bold text-sm tabular-nums">
                {effectiveSelectedRequestKeys.size}
              </span>
              <span className="text-sm font-semibold whitespace-nowrap">
                selected
              </span>
            </div>

            <div className="flex-1 flex items-center gap-2 ml-2 flex-wrap">
              <button
                type="button"
                onClick={() => openRequestConfirm('approve')}
                disabled={requestDecisionPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition"
              >
                <Icon name="check_circle" size={14} />
                Approve {effectiveSelectedRequestKeys.size}
              </button>
              <button
                type="button"
                onClick={() => openRequestConfirm('reject')}
                disabled={requestDecisionPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition"
              >
                <Icon name="close" size={14} />
                Reject {effectiveSelectedRequestKeys.size}
              </button>
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

      {/* ── Floating BulkActionBar — schedule tabs only, never requests ── */}
      {!(activeTab !== 'review' && activeTab !== 'finalized' && activeTab !== 'all') && effectiveSelectedIds.size > 0 && (
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

      {/* ── Confirmation Modal (bulk schedule and request actions) ── */}
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
              disabled={requestDecisionPending}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={
                requestDecisionPending ||
                (pendingConfirm?.action === 'request-decision' &&
                  pendingConfirm.decision === 'reject' &&
                  requestRemarks.trim().length === 0)
              }
              className={`px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition ${
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
        {pendingConfirm?.action === 'request-decision' &&
          pendingConfirm.decision === 'reject' && (
            <div className="mt-4">
              <label
                htmlFor="bulk-reject-remarks"
                className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
              >
                Remarks (required)
              </label>
              <textarea
                id="bulk-reject-remarks"
                value={requestRemarks}
                onChange={(e) => setRequestRemarks(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Explain why these requests are being rejected"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          )}
      </Modal>

      {/* One drawer for every tab; the drawer owns all decisions and feedback. */}
      <ApprovalDetailDrawer
        target={drawerTarget}
        onClose={closeDrawer}
        onDecided={closeDrawer}
      />
    </div>
  );
}

function rowDetailHeader(tab: ApprovalTab): string {
  if (tab === 'publish') return 'Note';
  if (tab === 'change') return 'Reason';
  return 'Reason';
}
