import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchFacultyRequests,
  approveFacultyRequest,
  rejectFacultyRequest,
  cancelFacultyRequest,
  type FacultyRequest,
  type FacultyRequestStatus,
} from '../../api/faculty-requests.api';
import { fetchDepartments } from '../../api/departments.api';
import { fetchActiveTerm } from '../../api/schedule.api';
import { fetchSubjects } from '../../api/subjects.api';
import { fetchPrograms } from '../../api/programs.api';
import { fetchAllProspectus } from '../../api/prospectus.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, {
  type Column,
} from '../../components/ui/ResponsiveTable';
import StatusBadge from '../../components/ui/StatusBadge';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { fetchFaculty } from '../../api/faculty.api';
import RequestFormModal from './components/RequestFormModal';

type FilterTab = 'all' | FacultyRequestStatus;
type ScopeFilter = 'all' | 'waiting-on-me' | 'waiting-on-them';
type TermScope = 'current' | 'all';

const STATUS_TONE: Record<
  FacultyRequestStatus,
  'warning' | 'success' | 'danger' | 'neutral'
> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

// ─────────────────────────────────────────────────────────────
// Local helpers (no API impact)
// ─────────────────────────────────────────────────────────────

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
  const yr = Math.floor(day / 365);
  return `${yr} yr ago`;
}

const TOAST_DURATION_MS = 4000;

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const myDeptId = profile?.dept_id ? String(profile.dept_id) : '';

  // ── Filters / view state ────────────────────────────────
  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [termScope, setTermScope] = useState<TermScope>('current');

  // ── Modals ──────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [detailTarget, setDetailTarget] = useState<FacultyRequest | null>(null);
  const [respondTarget, setRespondTarget] = useState<{
    request: FacultyRequest;
    action: 'approve' | 'reject';
  } | null>(null);
  const [respondRemarks, setRespondRemarks] = useState('');
  const [cancelTarget, setCancelTarget] = useState<FacultyRequest | null>(null);

  // ── Feedback ────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // In-flight row mutation (for disabling per-row actions)
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  // Deep-link receiver: /approvals?request=<id> or /dean/requests?request=<id>
  const [searchParams, setSearchParams] = useSearchParams();
  const lastRequestParam = useRef<string | null>(null);

  // Auto-dismiss toasts
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [error]);

  // ── Clipboard helper ────────────────────────────────────
  const copyToClipboard = useCallback(
    async (text: string, key: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(key);
        setTimeout(() => setCopiedId((k) => (k === key ? null : k)), 1500);
      } catch {
        /* clipboard may be blocked */
      }
    },
    [],
  );

  // ─────────────────────────────────────────────────────────
  // Queries — all lookups always enabled so table renders labels
  // ─────────────────────────────────────────────────────────
  const {
    data: requests = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['faculty-requests'],
    queryFn: fetchFacultyRequests,
    enabled: !!user,
  });

  // Open the exact request referenced by a notification deep link.
  useEffect(() => {
    const requestId = searchParams.get('request');
    if (!requestId || requestId === lastRequestParam.current) return;
    if (isLoading) return;

    const match = requests.find((r) => String(r.requestId) === requestId);
    lastRequestParam.current = requestId;
    if (match) {
      setDetailTarget(match);
    } else {
      setError(`Request #${requestId} is not visible to you.`);
    }

    const next = new URLSearchParams(searchParams);
    next.delete('request');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, requests, isLoading]);

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
    enabled: !!user,
  });

  const { data: facultyList = [] } = useQuery({
    queryKey: ['faculty'],
    queryFn: () => fetchFaculty(false),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => fetchSubjects(false),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Program/prospectus only needed while the form is open
  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: fetchPrograms,
    enabled: !!user && showForm,
    staleTime: 5 * 60 * 1000,
  });

  const { data: prospectus = [] } = useQuery({
    queryKey: ['prospectus-all'],
    queryFn: fetchAllProspectus,
    enabled: !!user && showForm,
    staleTime: 5 * 60 * 1000,
  });

  // ─────────────────────────────────────────────────────────
  // Lookup maps
  // ─────────────────────────────────────────────────────────
  const deptById = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const d of departments) {
      map.set(String(d.deptId), { code: d.deptCode, name: d.deptName });
    }
    return map;
  }, [departments]);

  const facultyById = useMemo(() => {
    const map = new Map<
      string,
      { firstName: string; lastName: string; wmsuId: string | null }
    >();
    for (const f of facultyList) {
      map.set(String(f.facultyId), {
        firstName: f.firstName,
        lastName: f.lastName,
        wmsuId: f.wmsuId,
      });
    }
    return map;
  }, [facultyList]);

  const subjectById = useMemo(() => {
    const map = new Map<string, { code: string; title: string }>();
    for (const s of subjects) {
      map.set(String(s.subjectId), { code: s.subjectCode, title: s.title });
    }
    return map;
  }, [subjects]);

  const deptName = useCallback(
    (id: string) => deptById.get(String(id))?.code ?? `#${id}`,
    [deptById],
  );
  const deptFullName = useCallback(
    (id: string) => deptById.get(String(id))?.name ?? `#${id}`,
    [deptById],
  );
  const facultyLabel = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const f = facultyById.get(String(id));
      return f ? `${f.lastName}, ${f.firstName}` : `#${id}`;
    },
    [facultyById],
  );
  const subjectLabel = useCallback(
    (id: string) => {
      const s = subjectById.get(String(id));
      return s ? `[${s.code}] ${s.title}` : `#${id}`;
    },
    [subjectById],
  );

  // ─────────────────────────────────────────────────────────
  // Mutations (create is now in RequestFormModal)
  // ─────────────────────────────────────────────────────────
  const invalidateAfterMutation = () => {
    qc.invalidateQueries({ queryKey: ['faculty-requests'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
    qc.invalidateQueries({ queryKey: ['flagged'] });
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks?: string }) =>
      approveFacultyRequest(id, remarks),
    onMutate: ({ id }) => setMutatingId(id),
    onSuccess: () => {
      setSuccess('Request approved.');
      setRespondTarget(null);
      setRespondRemarks('');
      invalidateAfterMutation();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Approve failed'),
    onSettled: () => setMutatingId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks: string }) =>
      rejectFacultyRequest(id, remarks),
    onMutate: ({ id }) => setMutatingId(id),
    onSuccess: () => {
      setSuccess('Request rejected.');
      setRespondTarget(null);
      setRespondRemarks('');
      invalidateAfterMutation();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Reject failed'),
    onSettled: () => setMutatingId(null),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelFacultyRequest,
    onMutate: (id: string) => setMutatingId(id),
    onSuccess: () => {
      setSuccess('Request cancelled.');
      setCancelTarget(null);
      invalidateAfterMutation();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Cancel failed'),
    onSettled: () => setMutatingId(null),
  });

  // ── Called by RequestFormModal after a successful submit ──
  const handleCreateSuccess = (message: string) => {
    setSuccess(message);
    setShowForm(false);
    invalidateAfterMutation();
  };

  const isAdminOrDean =
    profile?.role === 'administrator' || profile?.role === 'college_dean';

  const canRespondTo = useCallback(
    (r: FacultyRequest) => {
      if (r.status !== 'pending') return false;
      if (isAdminOrDean) return true;
      return String(profile?.dept_id) === String(r.targetDeptId);
    },
    [isAdminOrDean, profile?.dept_id],
  );

  const canCancel = useCallback(
    (r: FacultyRequest) => {
      if (r.status !== 'pending') return false;
      if (isAdminOrDean) return true;
      return String(profile?.dept_id) === String(r.requestingDeptId);
    },
    [isAdminOrDean, profile?.dept_id],
  );

  // ─────────────────────────────────────────────────────────
  // Filtered + sorted list
  // ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = requests.filter((r) => {
      if (
        termScope === 'current' &&
        activeTerm &&
        String(r.termId) !== String(activeTerm.termId)
      ) {
        return false;
      }
      if (filter !== 'all' && r.status !== filter) return false;
      if (scopeFilter === 'waiting-on-me' && !canRespondTo(r)) return false;
      if (scopeFilter === 'waiting-on-them' && !canCancel(r)) return false;
      if (q) {
        const haystack = [
          r.requestId,
          facultyLabel(r.facultyId) ?? 'any',
          subjectLabel(r.subjectId),
          deptName(r.requestingDeptId),
          deptFullName(r.requestingDeptId),
          deptName(r.targetDeptId),
          deptFullName(r.targetDeptId),
          r.reason,
          r.responseRemarks ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return [...rows].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [
    requests,
    filter,
    searchQuery,
    scopeFilter,
    termScope,
    activeTerm,
    canRespondTo,
    canCancel,
    facultyLabel,
    subjectLabel,
    deptName,
    deptFullName,
  ]);

  const counts = useMemo(() => {
    const inTerm = activeTerm
      ? requests.filter((r) => String(r.termId) === String(activeTerm.termId))
      : requests;
    const pending = inTerm.filter((r) => r.status === 'pending');
    return {
      total: inTerm.length,
      pending: pending.length,
      waitingOnMe: pending.filter(canRespondTo).length,
      waitingOnThem: pending.filter(canCancel).length,
      approved: inTerm.filter((r) => r.status === 'approved').length,
      rejected: inTerm.filter((r) => r.status === 'rejected').length,
      cancelled: inTerm.filter((r) => r.status === 'cancelled').length,
    };
  }, [requests, activeTerm, canRespondTo, canCancel]);

  const distinctTermCount = useMemo(() => {
    return new Set(requests.map((r) => String(r.termId))).size;
  }, [requests]);

  const clearAllFilters = () => {
    setFilter('all');
    setSearchQuery('');
    setScopeFilter('all');
    setTermScope('current');
  };

  // ─────────────────────────────────────────────────────────
  // Table columns
  // ─────────────────────────────────────────────────────────
  const columns: Column<FacultyRequest>[] = [
    {
      key: 'request',
      header: 'Request',
      cardVariant: 'title',
      cellClassName: 'text-on-surface',
      render: (r) => (
        <div className="flex flex-col">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono text-primary font-bold">
              {deptName(r.requestingDeptId)}
            </span>
            <Icon
              name="arrow_forward"
              size={14}
              className="text-on-surface-variant"
            />
            <span className="font-mono font-bold">
              {deptName(r.targetDeptId)}
            </span>
          </span>
          <span className="text-[11px] text-on-surface-variant truncate max-w-[220px]">
            {deptFullName(r.requestingDeptId)} → {deptFullName(r.targetDeptId)}
          </span>
          {termScope === 'all' && r.termId && (
            <span className="text-[10px] text-on-surface-variant mt-0.5 inline-flex items-center gap-1">
              <Icon name="calendar_month" size={10} />
              {activeTerm && String(activeTerm.termId) === String(r.termId)
                ? `${activeTerm.termName}${
                    activeTerm.schoolYear ? ` ${activeTerm.schoolYear}` : ''
                  }`
                : `Term #${r.termId}`}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface',
      render: (r) => (
        <span className="font-mono text-xs">{subjectLabel(r.subjectId)}</span>
      ),
    },
    {
      key: 'faculty',
      header: 'Faculty',
      hideOnMobile: true,
      cardVariant: 'meta',
      cellClassName: 'text-on-surface',
      render: (r) => {
        if (!r.facultyId) {
          return (
            <span className="text-on-surface-variant text-xs italic">
              Any qualified
            </span>
          );
        }
        const f = facultyById.get(String(r.facultyId));
        return (
          <div className="flex flex-col">
            <span className="text-xs">{facultyLabel(r.facultyId)}</span>
            {f?.wmsuId && (
              <span className="text-[10px] text-on-surface-variant font-mono">
                {f.wmsuId}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'created',
      header: 'Created',
      hideOnMobile: true,
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface-variant whitespace-nowrap',
      render: (r) => (
        <span title={new Date(r.createdAt).toLocaleString()}>
          {relativeTime(r.createdAt)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface-variant max-w-md',
      render: (r) => (
        <div>
          <p className="line-clamp-2">{r.reason}</p>
          {r.responseRemarks && (
            <p className="text-xs italic mt-1 text-on-surface-variant/70">
              Response: {r.responseRemarks}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status]}>
          <span className="capitalize">{r.status}</span>
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (r: FacultyRequest): RowAction[] => {
    const actions: RowAction[] = [
      {
        label: 'View details',
        icon: 'visibility',
        onClick: () => setDetailTarget(r),
      },
    ];
    if (canRespondTo(r)) {
      actions.push({
        label: 'Approve',
        icon: 'check_circle',
        onClick: () => setRespondTarget({ request: r, action: 'approve' }),
      });
      actions.push({
        label: 'Reject',
        icon: 'cancel',
        danger: true,
        onClick: () => setRespondTarget({ request: r, action: 'reject' }),
      });
    }
    if (canCancel(r) && !canRespondTo(r)) {
      actions.push({
        label: 'Cancel Request',
        icon: 'undo',
        danger: true,
        onClick: () => setCancelTarget(r),
      });
    }
    return actions;
  };

  const termLabel = activeTerm
    ? `${activeTerm.termName}${
        activeTerm.schoolYear ? ` ${activeTerm.schoolYear}` : ''
      }`
    : null;

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 flex-wrap"
        data-tour="approvals-header"
      >
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            Faculty Requests
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Cross-department faculty assignment requests
            {termLabel && (
              <>
                {' · '}
                <span className="font-semibold text-on-surface">
                  {termLabel}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching || !!mutatingId}
            aria-label="Refresh requests"
            title="Refresh"
            className="flex items-center justify-center w-10 h-10 rounded-lg border border-surface-variant bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:border-primary/40 transition disabled:opacity-50"
          >
            <Icon
              name="refresh"
              size={18}
              className={isFetching ? 'animate-spin' : ''}
            />
          </button>
          <button
            onClick={() => {
              setShowForm(true);
              setError(null);
              setSuccess(null);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="add" size={18} />
            New Request
          </button>
        </div>
      </div>

      {/* Toasts */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm"
        >
          <Icon name="error" size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="text-red-500 hover:text-red-700"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {success && (
        <div
          role="status"
          className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-300 text-green-700 text-sm"
        >
          <Icon name="check_circle" size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1">{success}</span>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            aria-label="Dismiss"
                     >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* Consolidated toolbar */}
      <div
        className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-3"
        data-tour="approvals-filters"
      >
        {/* Scope chips */}
        <div className="flex flex-wrap gap-2" data-tour="approvals-scope">
          <ScopeChip
            active={scopeFilter === 'all'}
            tone="neutral"
            icon="list_alt"
            label="All"
            count={counts.total}
            onClick={() => setScopeFilter('all')}
          />
          <ScopeChip
            active={scopeFilter === 'waiting-on-me'}
            tone="amber"
            icon="pending_actions"
            label="Needs My Action"
            count={counts.waitingOnMe}
            onClick={() => setScopeFilter('waiting-on-me')}
          />
          <ScopeChip
            active={scopeFilter === 'waiting-on-them'}
            tone="blue"
            icon="hourglass_top"
            label="Awaiting Their Reply"
            count={counts.waitingOnThem}
            onClick={() => setScopeFilter('waiting-on-them')}
          />
        </div>

        {/* Search + term + counter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
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
                placeholder="Subject, faculty, department, reason, or request ID…"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          </div>

          {distinctTermCount > 1 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="term-scope"
                className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider"
              >
                Term
              </label>
              <select
                id="term-scope"
                value={termScope}
                onChange={(e) => setTermScope(e.target.value as TermScope)}
                className="bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="current">Current</option>
                <option value="all">All terms</option>
              </select>
            </div>
          )}

          <div className="ml-auto text-xs text-on-surface-variant whitespace-nowrap">
            Showing <strong className="text-on-surface">{filtered.length}</strong>{' '}
            of {requests.length}
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 border-b border-surface-variant overflow-x-auto">
          {(
            ['all', 'pending', 'approved', 'rejected', 'cancelled'] as FilterTab[]
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px whitespace-nowrap ${
                filter === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab !== 'all' && (
                <span className="ml-1.5 text-xs opacity-60">
                  ({counts[tab as keyof typeof counts]})
                </span>
              )}
              {tab === 'all' && (
                <span className="ml-1.5 text-xs opacity-60">
                  ({counts.total})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div data-tour="approvals-table">
        <ResponsiveTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.requestId}
          rowTitle={(r) =>
            `${deptName(r.requestingDeptId)} → ${deptName(r.targetDeptId)}`
          }
          rowSubtitle={(r) => r.reason}
          isLoading={isLoading}
          hasSourceRows={requests.length > 0}
          emptyMessage="No requests yet."
          noMatchMessage="No requests match your filters."
          getActions={getActions}
          onRowClick={(r) => setDetailTarget(r)}
        />

        {/* Empty state helpers */}
        {!isLoading && requests.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 mt-6 p-6 text-center">
            <Icon
              name="inbox"
              size={40}
              className="text-on-surface-variant/60"
            />
            <p className="text-sm text-on-surface-variant">
              Cross-department requests will appear here.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
            >
              Create first request
            </button>
          </div>
        )}

        {!isLoading && requests.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 mt-6 p-6 text-center">
            <Icon
              name="filter_alt_off"
              size={40}
              className="text-on-surface-variant/60"
            />
            <p className="text-sm text-on-surface-variant">
              No requests match your filters.
            </p>
            <button
              onClick={clearAllFilters}
              className="px-4 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* ───────────────────────────── Detail modal ───────────────────────────── */}
      <Modal
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={
          detailTarget ? `Request #${detailTarget.requestId}` : 'Request'
        }
        description={
          detailTarget
            ? `${deptName(detailTarget.requestingDeptId)} → ${deptName(
                detailTarget.targetDeptId,
              )}`
            : undefined
        }
        size="md"
        footer={
          detailTarget && (
            <>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
              >
                Close
              </button>
              {canRespondTo(detailTarget) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRespondTarget({
                        request: detailTarget,
                        action: 'reject',
                      });
                      setDetailTarget(null);
                    }}
                    className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition inline-flex items-center gap-1.5"
                  >
                    <Icon name="cancel" size={16} />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRespondTarget({
                        request: detailTarget,
                        action: 'approve',
                      });
                      setDetailTarget(null);
                    }}
                    className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition inline-flex items-center gap-1.5"
                  >
                    <Icon name="check_circle" size={16} />
                    Approve
                  </button>
                </>
              )}
              {canCancel(detailTarget) && !canRespondTo(detailTarget) && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelTarget(detailTarget);
                    setDetailTarget(null);
                  }}
                  className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition inline-flex items-center gap-1.5"
                >
                  <Icon name="undo" size={16} />
                  Cancel request
                </button>
              )}
            </>
          )
        }
      >
        {detailTarget && (
          <div className="space-y-5">
            {/* Status row + request ID copy */}
            <div className="flex items-center justify-between gap-2">
              <StatusBadge tone={STATUS_TONE[detailTarget.status]}>
                <span className="capitalize">{detailTarget.status}</span>
              </StatusBadge>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(detailTarget.requestId, 'requestId')
                }
                className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-md hover:bg-surface-container-high transition"
                aria-label="Copy request ID"
                title="Copy request ID"
              >
                <span className="font-mono">#{detailTarget.requestId}</span>
                <Icon
                  name={copiedId === 'requestId' ? 'check' : 'content_copy'}
                  size={12}
                />
              </button>
            </div>

            {/* From → To visual flow */}
            <div className="rounded-xl border border-surface-variant bg-gradient-to-r from-primary/[0.04] via-transparent to-primary/[0.04] p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    From
                  </p>
                  <p className="text-base font-bold font-mono text-primary mt-0.5">
                    {deptName(detailTarget.requestingDeptId)}
                  </p>
                  <p className="text-[11px] text-on-surface-variant truncate">
                    {deptFullName(detailTarget.requestingDeptId)}
                  </p>
                </div>
                <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-primary/10">
                  <Icon
                    name="arrow_forward"
                    size={18}
                    className="text-primary"
                  />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    To
                  </p>
                  <p className="text-base font-bold font-mono text-primary mt-0.5">
                    {deptName(detailTarget.targetDeptId)}
                  </p>
                  <p className="text-[11px] text-on-surface-variant truncate">
                    {deptFullName(detailTarget.targetDeptId)}
                  </p>
                </div>
              </div>
            </div>

            {/* Subject */}
            <div className="rounded-lg border border-surface-variant p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon
                  name="menu_book"
                  size={12}
                  className="text-on-surface-variant"
                />
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Subject
                </p>
              </div>
              <p className="text-sm font-mono text-on-surface">
                {subjectLabel(detailTarget.subjectId)}
              </p>
            </div>

            {/* Faculty + Term */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-surface-variant p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon
                    name="person"
                    size={12}
                    className="text-on-surface-variant"
                  />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Faculty
                  </p>
                </div>
                {detailTarget.facultyId ? (
                  <>
                    <p className="text-sm text-on-surface">
                      {facultyLabel(detailTarget.facultyId)}
                    </p>
                    {(() => {
                      const f = facultyById.get(
                        String(detailTarget.facultyId),
                      );
                      return f?.wmsuId ? (
                        <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">
                          WMSU ID: {f.wmsuId}
                        </p>
                      ) : null;
                    })()}
                  </>
                ) : (
                  <p className="text-sm italic text-on-surface-variant">
                    Any qualified faculty
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-surface-variant p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon
                    name="calendar_month"
                    size={12}
                    className="text-on-surface-variant"
                  />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Term
                  </p>
                </div>
                <p className="text-sm text-on-surface">
                  {activeTerm &&
                  String(activeTerm.termId) === String(detailTarget.termId)
                    ? termLabel ?? `Term #${detailTarget.termId}`
                    : `Term #${detailTarget.termId}`}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="rounded-lg border border-surface-variant p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Timeline
              </p>
              <div className="flex items-center gap-2 text-xs">
                <Icon
                  name="add_circle"
                  size={13}
                  className="text-primary shrink-0"
                />
                <span className="text-on-surface-variant">Created</span>
                <span
                  className="ml-auto text-on-surface"
                  title={new Date(detailTarget.createdAt).toLocaleString()}
                >
                  {relativeTime(detailTarget.createdAt)}
                </span>
              </div>
              {detailTarget.respondedAt && (
                <div className="flex items-center gap-2 text-xs">
                  <Icon
                    name={
                      detailTarget.status === 'approved'
                        ? 'check_circle'
                        : detailTarget.status === 'rejected'
                        ? 'cancel'
                        : 'info'
                    }
                    size={13}
                    className={
                      detailTarget.status === 'approved'
                        ? 'text-green-600 shrink-0'
                        : detailTarget.status === 'rejected'
                        ? 'text-red-600 shrink-0'
                        : 'text-on-surface-variant shrink-0'
                    }
                  />
                  <span className="text-on-surface-variant capitalize">
                    {detailTarget.status}
                  </span>
                  <span
                    className="ml-auto text-on-surface"
                    title={new Date(
                      detailTarget.respondedAt,
                    ).toLocaleString()}
                  >
                    {relativeTime(detailTarget.respondedAt)}
                  </span>
                </div>
              )}
              {detailTarget.status === 'cancelled' &&
                !detailTarget.respondedAt && (
                  <div className="flex items-center gap-2 text-xs">
                    <Icon
                      name="undo"
                      size={13}
                      className="text-on-surface-variant shrink-0"
                    />
                    <span className="text-on-surface-variant">Cancelled</span>
                  </div>
                )}
            </div>

            {/* Reason */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                  Reason
                </p>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(detailTarget.reason, 'reason')
                  }
                  className="text-[10px] text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-container-high transition"
                  aria-label="Copy reason"
                >
                  <Icon
                    name={copiedId === 'reason' ? 'check' : 'content_copy'}
                    size={10}
                  />
                  Copy
                </button>
              </div>
              <p className="text-sm text-on-surface whitespace-pre-wrap p-3 rounded-lg bg-surface-container-low border border-surface-variant">
                {detailTarget.reason}
              </p>
            </div>

            {/* Response */}
            {detailTarget.responseRemarks && (
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Response
                  {detailTarget.respondedAt && (
                    <span className="ml-2 normal-case font-normal text-on-surface-variant/70">
                      · {relativeTime(detailTarget.respondedAt)}
                    </span>
                  )}
                </p>
                <p
                  className={`text-sm text-on-surface whitespace-pre-wrap italic p-3 rounded-lg bg-surface-container-low border-l-2 ${
                    detailTarget.status === 'rejected'
                      ? 'border-red-400'
                      : 'border-green-400'
                  }`}
                >
                  {detailTarget.responseRemarks}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ───────────────────────────── Respond modal ───────────────────────────── */}
      <Modal
        open={!!respondTarget}
        onClose={() => {
          setRespondTarget(null);
          setRespondRemarks('');
        }}
        title={
          respondTarget?.action === 'approve'
            ? 'Approve Request'
            : 'Reject Request'
        }
        description={
          respondTarget?.action === 'approve'
            ? 'Optionally add a note explaining the approval.'
            : 'A rejection requires an explanation.'
        }
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setRespondTarget(null);
                setRespondRemarks('');
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                approveMutation.isPending ||
                rejectMutation.isPending ||
                (respondTarget?.action === 'reject' && !respondRemarks.trim())
              }
              onClick={() => {
                if (!respondTarget) return;
                const { request, action } = respondTarget;
                if (action === 'approve') {
                  approveMutation.mutate({
                    id: request.requestId,
                    remarks: respondRemarks || undefined,
                  });
                } else {
                  rejectMutation.mutate({
                    id: request.requestId,
                    remarks: respondRemarks,
                  });
                }
              }}
              className={`px-6 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50 ${
                respondTarget?.action === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {respondTarget?.action === 'approve'
                ? 'Approve request'
                : 'Reject request'}
            </button>
          </>
        }
      >
        {respondTarget && (
          <div className="space-y-4">
            <RequestSummary request={respondTarget.request} />

            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                {respondTarget.action === 'approve'
                  ? 'Remarks (optional)'
                  : 'Reason for rejection *'}
              </label>
              <textarea
                rows={3}
                value={respondRemarks}
                onChange={(e) => setRespondRemarks(e.target.value)}
                maxLength={500}
                placeholder={
                  respondTarget.action === 'approve'
                    ? 'Optional remarks…'
                    : 'Reason for rejection (required)…'
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
              />
              <div className="flex justify-between items-center mt-1">
                <p className="text-[11px] text-red-600">
                  {respondTarget.action === 'reject' && !respondRemarks.trim()
                    ? 'A rejection requires an explanation.'
                    : ''}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  {respondRemarks.length}/500
                </p>
              </div>
            </div>

            <p className="text-[11px] text-on-surface-variant italic">
              The requesting department will be notified.
            </p>
          </div>
        )}
      </Modal>

      {/* ───────────────────────────── Cancel modal ───────────────────────────── */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel request?"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Keep request
            </button>
            <button
              type="button"
              onClick={() =>
                cancelTarget && cancelMutation.mutate(cancelTarget.requestId)
              }
              disabled={cancelMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel request'}
            </button>
          </>
        }
      >
        {cancelTarget && (
          <div className="space-y-4">
            <RequestSummary request={cancelTarget} />
            <p className="text-sm text-on-surface-variant">
              This will withdraw the request. It cannot be undone.
            </p>
          </div>
        )}
      </Modal>

      {/* ───────────────────────────── Create Request wizard ───────────────────────────── */}
      <RequestFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={handleCreateSuccess}
        departments={departments}
        facultyList={facultyList}
        subjects={subjects}
        programs={programs}
        prospectus={prospectus}
        requests={requests}
        activeTerm={activeTerm ?? null}
        myDeptId={myDeptId}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Small presentational helpers (local)
// ─────────────────────────────────────────────────────────

function ScopeChip({
  active,
  tone,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  tone: 'neutral' | 'amber' | 'blue';
  icon: string;
  label: string;
  count: number;
  onClick: () => void;
}) {
  const toneActive =
    tone === 'amber'
      ? 'border-amber-400 bg-amber-50 text-amber-800'
      : tone === 'blue'
        ? 'border-blue-400 bg-blue-50 text-blue-800'
        : 'border-primary bg-primary/5 text-on-surface';
  const toneIdle =
    tone === 'amber'
      ? 'border-surface-variant bg-surface-container-lowest text-amber-700 hover:border-amber-300'
      : tone === 'blue'
        ? 'border-surface-variant bg-surface-container-lowest text-blue-700 hover:border-blue-300'
        : 'border-surface-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary/40';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-semibold transition ${
        active ? toneActive : toneIdle
      }`}
    >
      <Icon name={icon} size={16} />
      <span>{label}</span>
      <span
        className={`ml-1 inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
          active ? 'bg-white/60' : 'bg-surface-container-high'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function RequestSummary({ request }: { request: FacultyRequest }) {
  return (
    <div className="rounded-lg border border-surface-variant bg-surface-container-low p-3 space-y-1.5 text-xs">
      <div className="flex justify-between gap-3">
        <span className="text-on-surface-variant">Request</span>
        <span className="font-mono font-bold text-on-surface">
          #{request.requestId}
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-on-surface-variant">Subject</span>
        <span className="font-mono text-on-surface text-right">
          #{request.subjectId}
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-on-surface-variant">Requested</span>
        <span
          className="text-on-surface text-right"
          title={new Date(request.createdAt).toLocaleString()}
        >
          {relativeTime(request.createdAt)}
        </span>
      </div>
    </div>
  );
}